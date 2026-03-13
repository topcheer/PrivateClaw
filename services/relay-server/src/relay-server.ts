import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type {
  AppToRelayMessage,
  EncryptedEnvelope,
  ProviderToRelayMessage,
  RelayToAppMessage,
  RelayToProviderMessage,
} from "@privateclaw/protocol";
import { WebSocket, WebSocketServer } from "ws";
import type { RelayServerConfig } from "./config.js";
import {
  createEncryptedFrameCache,
  type EncryptedFrameCache,
} from "./frame-cache.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

class RelayProtocolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RelayProtocolError";
  }
}

interface RelaySocket extends WebSocket {
  isAlive?: boolean;
}

interface SessionRecord {
  sessionId: string;
  expiresAt: number;
  providerId: string;
  providerSocket?: WebSocket;
  appSocket?: WebSocket;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (!isObject(value)) {
    return false;
  }

  return (
    value.version === 1 &&
    typeof value.messageId === "string" &&
    typeof value.iv === "string" &&
    typeof value.ciphertext === "string" &&
    typeof value.tag === "string" &&
    typeof value.sentAt === "string"
  );
}

function sendJson(
  socket: WebSocket,
  message: RelayToProviderMessage | RelayToAppMessage,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new RelayProtocolError(
      "invalid_json",
      "Relay messages must be valid JSON.",
    );
  }
}

function toRelayProtocolError(error: unknown): RelayProtocolError {
  if (error instanceof RelayProtocolError) {
    return error;
  }
  if (error instanceof Error) {
    return new RelayProtocolError("internal_error", error.message);
  }
  return new RelayProtocolError("internal_error", String(error));
}

function setupHeartbeat(socket: RelaySocket): void {
  socket.isAlive = true;
  socket.on("pong", () => {
    socket.isAlive = true;
  });
}

function pingServerClients(server: WebSocketServer): void {
  for (const rawSocket of server.clients) {
    const socket = rawSocket as RelaySocket;
    if (socket.isAlive === false) {
      socket.terminate();
      continue;
    }
    socket.isAlive = false;
    if (socket.readyState === WebSocket.OPEN) {
      socket.ping();
    }
  }
}

class SessionHub {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly providerSessions = new Map<string, Set<string>>();
  private readonly providerSockets = new Map<string, WebSocket>();
  private readonly socketProviders = new Map<WebSocket, string>();
  private readonly appSessions = new Map<WebSocket, string>();

  constructor(
    private readonly params: {
      defaultTtlMs: number;
      frameCache: EncryptedFrameCache;
      now?: () => number;
    },
  ) {}

  private now(): number {
    return this.params.now?.() ?? Date.now();
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  attachProvider(providerId: string, providerSocket: WebSocket): void {
    const previousSocket = this.providerSockets.get(providerId);
    if (
      previousSocket &&
      previousSocket !== providerSocket &&
      (previousSocket.readyState === WebSocket.OPEN ||
        previousSocket.readyState === WebSocket.CONNECTING)
    ) {
      previousSocket.close(1012, "provider_reconnected");
    }

    this.providerSockets.set(providerId, providerSocket);
    this.socketProviders.set(providerSocket, providerId);

    for (const sessionId of this.providerSessions.get(providerId) ?? []) {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.providerSocket = providerSocket;
      }
    }
  }

  private requireProviderId(providerSocket: WebSocket): string {
    const providerId = this.socketProviders.get(providerSocket);
    if (!providerId) {
      throw new RelayProtocolError(
        "provider_not_ready",
        "Provider connection is not registered with the relay yet.",
      );
    }
    return providerId;
  }

  createSession(providerSocket: WebSocket, ttlMs?: number): SessionRecord {
    const providerId = this.requireProviderId(providerSocket);
    const sessionId = randomUUID();
    const expiresAt = this.now() + (ttlMs ?? this.params.defaultTtlMs);
    const session: SessionRecord = {
      sessionId,
      expiresAt,
      providerId,
      providerSocket,
    };
    this.sessions.set(sessionId, session);

    const ownedSessions =
      this.providerSessions.get(providerId) ?? new Set<string>();
    ownedSessions.add(sessionId);
    this.providerSessions.set(providerId, ownedSessions);

    return session;
  }

  private getSession(sessionId: string): SessionRecord {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new RelayProtocolError(
        "unknown_session",
        "PrivateClaw session not found. Generate a fresh QR code.",
      );
    }

    if (session.expiresAt <= this.now()) {
      void this.closeSession(sessionId, "session_expired");
      throw new RelayProtocolError(
        "session_expired",
        "PrivateClaw session expired. Generate a fresh QR code.",
      );
    }

    return session;
  }

  private assertProviderOwnsSession(
    providerSocket: WebSocket,
    sessionId: string,
  ): SessionRecord {
    const providerId = this.requireProviderId(providerSocket);
    const session = this.getSession(sessionId);
    if (session.providerId !== providerId) {
      throw new RelayProtocolError(
        "provider_session_mismatch",
        "Provider does not own this PrivateClaw session.",
      );
    }
    return session;
  }

  renewSession(
    providerSocket: WebSocket,
    sessionId: string,
    ttlMs: number,
  ): SessionRecord {
    const session = this.assertProviderOwnsSession(providerSocket, sessionId);
    session.expiresAt = this.now() + ttlMs;
    return session;
  }

  attachApp(sessionId: string, appSocket: WebSocket): SessionRecord {
    const session = this.getSession(sessionId);

    if (
      session.appSocket &&
      session.appSocket.readyState === WebSocket.OPEN
    ) {
      throw new RelayProtocolError(
        "session_in_use",
        "This PrivateClaw session is already attached to another app.",
      );
    }

    session.appSocket = appSocket;
    this.appSessions.set(appSocket, sessionId);
    return session;
  }

  async forwardToApp(
    providerSocket: WebSocket,
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<void> {
    const session = this.assertProviderOwnsSession(providerSocket, sessionId);
    if (
      session.appSocket &&
      session.appSocket.readyState === WebSocket.OPEN
    ) {
      sendJson(session.appSocket, { type: "relay:frame", sessionId, envelope });
      return;
    }

    await this.params.frameCache.push({ sessionId, target: "app", envelope });
  }

  async forwardToProvider(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<void> {
    const session = this.getSession(sessionId);
    const providerSocket =
      this.providerSockets.get(session.providerId) ?? session.providerSocket;
    if (providerSocket && providerSocket.readyState === WebSocket.OPEN) {
      session.providerSocket = providerSocket;
      sendJson(providerSocket, { type: "relay:frame", sessionId, envelope });
      return;
    }

    delete session.providerSocket;
    await this.params.frameCache.push({
      sessionId,
      target: "provider",
      envelope,
    });
  }

  async replayBufferedFrames(
    sessionId: string,
    target: "app" | "provider",
    socket: WebSocket,
  ): Promise<void> {
    const frames = await this.params.frameCache.drain({ sessionId, target });
    for (const envelope of frames) {
      sendJson(socket, { type: "relay:frame", sessionId, envelope });
    }
  }

  async replayBufferedFramesForProvider(
    providerId: string,
    socket: WebSocket,
  ): Promise<void> {
    for (const sessionId of this.providerSessions.get(providerId) ?? []) {
      await this.replayBufferedFrames(sessionId, "provider", socket);
    }
  }

  async closeSession(sessionId: string, reason: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);

    const ownedSessions = this.providerSessions.get(session.providerId);
    ownedSessions?.delete(sessionId);
    if (ownedSessions?.size === 0) {
      this.providerSessions.delete(session.providerId);
    }

    if (session.appSocket) {
      this.appSessions.delete(session.appSocket);
      sendJson(session.appSocket, {
        type: "relay:session_closed",
        sessionId,
        reason,
      });
      if (
        session.appSocket.readyState === WebSocket.OPEN ||
        session.appSocket.readyState === WebSocket.CONNECTING
      ) {
        session.appSocket.close(1000, reason);
      }
    }

    const providerSocket =
      this.providerSockets.get(session.providerId) ?? session.providerSocket;
    if (providerSocket) {
      sendJson(providerSocket, {
        type: "relay:session_closed",
        sessionId,
        reason,
      });
    }
    await this.params.frameCache.clear(sessionId);
  }

  async closeSessionForProvider(
    providerSocket: WebSocket,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    this.assertProviderOwnsSession(providerSocket, sessionId);
    await this.closeSession(sessionId, reason);
  }

  async detachProvider(providerSocket: WebSocket): Promise<void> {
    const providerId = this.socketProviders.get(providerSocket);
    if (!providerId) {
      return;
    }

    this.socketProviders.delete(providerSocket);
    if (this.providerSockets.get(providerId) === providerSocket) {
      this.providerSockets.delete(providerId);
    }

    for (const sessionId of this.providerSessions.get(providerId) ?? []) {
      const session = this.sessions.get(sessionId);
      if (session?.providerSocket === providerSocket) {
        delete session.providerSocket;
      }
    }
  }

  async detachApp(appSocket: WebSocket): Promise<void> {
    const sessionId = this.appSessions.get(appSocket);
    if (!sessionId) {
      return;
    }

    this.appSessions.delete(appSocket);
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.appSocket === appSocket) {
      delete session.appSocket;
    }
  }

  async purgeExpiredSessions(): Promise<void> {
    const expired = [...this.sessions.values()].filter(
      (session) => session.expiresAt <= this.now(),
    );
    for (const session of expired) {
      await this.closeSession(session.sessionId, "session_expired");
    }
  }

  async closeAll(reason: string): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    for (const sessionId of sessionIds) {
      await this.closeSession(sessionId, reason);
    }
  }
}

export interface RelayServerInstance {
  readonly port: number;
  readonly url: string;
  start(): Promise<{ port: number; url: string }>;
  stop(): Promise<void>;
}

export function createRelayServer(
  config: RelayServerConfig,
): RelayServerInstance {
  const frameCache = createEncryptedFrameCache({
    maxFrames: config.frameCacheSize,
    ...(config.redisUrl ? { redisUrl: config.redisUrl } : {}),
  });
  const sessionHub = new SessionHub({
    defaultTtlMs: config.sessionTtlMs,
    frameCache,
  });

  let startedPort = config.port;
  let startedUrl = "";
  let started = false;

  const server = createServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${config.host}:${startedPort}`}`,
    );

    if (request.method === "GET" && url.pathname === "/healthz") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ ok: true, sessions: sessionHub.sessionCount }),
      );
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const providerWss = new WebSocketServer({ noServer: true });
  const appWss = new WebSocketServer({ noServer: true });

  const expiryTimer = setInterval(() => {
    void sessionHub.purgeExpiredSessions();
  }, 5_000);
  const heartbeatTimer = setInterval(() => {
    pingServerClients(providerWss);
    pingServerClients(appWss);
  }, HEARTBEAT_INTERVAL_MS);

  function terminateSockets(server: WebSocketServer): void {
    for (const socket of server.clients) {
      socket.terminate();
    }
  }

  async function closeWebSocketServer(server: WebSocketServer): Promise<void> {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  async function handleProviderMessage(
    socket: WebSocket,
    raw: string,
  ): Promise<void> {
    let requestId: string | undefined;

    try {
      const message = parseJson(raw) as ProviderToRelayMessage | unknown;
      if (!isObject(message) || typeof message.type !== "string") {
        throw new RelayProtocolError(
          "invalid_message",
          "Provider message is missing a type field.",
        );
      }

      switch (message.type) {
        case "provider:create_session": {
          const requestIdValue = message.requestId;
          const ttlMsValue = message.ttlMs;

          if (typeof requestIdValue !== "string" || requestIdValue === "") {
            throw new RelayProtocolError(
              "invalid_request_id",
              "provider:create_session requires a requestId.",
            );
          }
          requestId = requestIdValue;
          if (
            ttlMsValue !== undefined &&
            (typeof ttlMsValue !== "number" ||
              !Number.isInteger(ttlMsValue) ||
              ttlMsValue <= 0)
          ) {
            throw new RelayProtocolError(
              "invalid_ttl",
              "provider:create_session ttlMs must be a positive integer.",
            );
          }

          const session = sessionHub.createSession(
            socket,
            typeof ttlMsValue === "number" ? ttlMsValue : undefined,
          );
          sendJson(socket, {
            type: "relay:session_created",
            requestId: requestIdValue,
            sessionId: session.sessionId,
            expiresAt: new Date(session.expiresAt).toISOString(),
          });
          return;
        }
        case "provider:renew_session": {
          const requestIdValue = message.requestId;
          if (typeof requestIdValue !== "string" || requestIdValue === "") {
            throw new RelayProtocolError(
              "invalid_request_id",
              "provider:renew_session requires a requestId.",
            );
          }
          requestId = requestIdValue;
          if (typeof message.sessionId !== "string") {
            throw new RelayProtocolError(
              "invalid_renew_request",
              "provider:renew_session requires a sessionId.",
            );
          }
          if (
            typeof message.ttlMs !== "number" ||
            !Number.isInteger(message.ttlMs) ||
            message.ttlMs <= 0
          ) {
            throw new RelayProtocolError(
              "invalid_ttl",
              "provider:renew_session ttlMs must be a positive integer.",
            );
          }

          const session = sessionHub.renewSession(
            socket,
            message.sessionId,
            message.ttlMs,
          );
          sendJson(socket, {
            type: "relay:session_renewed",
            requestId: requestIdValue,
            sessionId: session.sessionId,
            expiresAt: new Date(session.expiresAt).toISOString(),
          });
          return;
        }
        case "provider:frame": {
          if (
            typeof message.sessionId !== "string" ||
            !isEncryptedEnvelope(message.envelope)
          ) {
            throw new RelayProtocolError(
              "invalid_frame",
              "provider:frame must include a valid sessionId and encrypted envelope.",
            );
          }
          await sessionHub.forwardToApp(
            socket,
            message.sessionId,
            message.envelope,
          );
          return;
        }
        case "provider:close_session": {
          if (typeof message.sessionId !== "string") {
            throw new RelayProtocolError(
              "invalid_close_request",
              "provider:close_session requires a sessionId.",
            );
          }
          await sessionHub.closeSessionForProvider(
            socket,
            message.sessionId,
            typeof message.reason === "string"
              ? message.reason
              : "provider_closed",
          );
          return;
        }
        default:
          throw new RelayProtocolError(
            "unsupported_message",
            `Unsupported provider message type: ${String(message.type)}`,
          );
      }
    } catch (error) {
      const relayError = toRelayProtocolError(error);
      sendJson(socket, {
        type: "relay:error",
        code: relayError.code,
        message: relayError.message,
        ...(requestId ? { requestId } : {}),
      });
    }
  }

  async function handleAppMessage(
    socket: WebSocket,
    sessionId: string,
    raw: string,
  ): Promise<void> {
    try {
      const message = parseJson(raw) as AppToRelayMessage | unknown;
      if (
        !isObject(message) ||
        message.type !== "app:frame" ||
        !isEncryptedEnvelope(message.envelope)
      ) {
        throw new RelayProtocolError(
          "invalid_frame",
          "app:frame must include a valid encrypted envelope.",
        );
      }
      await sessionHub.forwardToProvider(sessionId, message.envelope);
    } catch (error) {
      const relayError = toRelayProtocolError(error);
      sendJson(socket, {
        type: "relay:error",
        code: relayError.code,
        message: relayError.message,
        sessionId,
      });
    }
  }

  providerWss.on("connection", (rawSocket, request) => {
    const socket = rawSocket as RelaySocket;
    setupHeartbeat(socket);

    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${config.host}:${startedPort}`}`,
    );
    const providerId = url.searchParams.get("providerId")?.trim() || randomUUID();

    sessionHub.attachProvider(providerId, socket);
    sendJson(socket, { type: "relay:provider_ready" });
    void sessionHub.replayBufferedFramesForProvider(providerId, socket);

    socket.on("message", (data) => {
      void handleProviderMessage(socket, data.toString());
    });

    socket.on("close", () => {
      void sessionHub.detachProvider(socket);
    });
  });

  appWss.on("connection", (rawSocket, request) => {
    const socket = rawSocket as RelaySocket;
    setupHeartbeat(socket);

    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${config.host}:${startedPort}`}`,
    );
    const sessionId = url.searchParams.get("sessionId");

    if (!sessionId) {
      sendJson(socket, {
        type: "relay:error",
        code: "missing_session_id",
        message: "App connections must include a sessionId query parameter.",
      });
      socket.close(1008, "missing_session_id");
      return;
    }

    try {
      const session = sessionHub.attachApp(sessionId, socket);
      sendJson(socket, {
        type: "relay:attached",
        sessionId,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
      void sessionHub.replayBufferedFrames(sessionId, "app", socket);
    } catch (error) {
      const relayError = toRelayProtocolError(error);
      sendJson(socket, {
        type: "relay:error",
        code: relayError.code,
        message: relayError.message,
        sessionId,
      });
      socket.close(1008, relayError.code);
      return;
    }

    socket.on("message", (data) => {
      void handleAppMessage(socket, sessionId, data.toString());
    });

    socket.on("close", () => {
      void sessionHub.detachApp(socket);
    });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${config.host}:${startedPort}`}`,
    );

    if (url.pathname === "/ws/provider") {
      providerWss.handleUpgrade(request, socket, head, (websocket) => {
        providerWss.emit("connection", websocket, request);
      });
      return;
    }

    if (url.pathname === "/ws/app") {
      appWss.handleUpgrade(request, socket, head, (websocket) => {
        appWss.emit("connection", websocket, request);
      });
      return;
    }

    socket.destroy();
  });

  return {
    get port(): number {
      return startedPort;
    },
    get url(): string {
      return startedUrl;
    },
    async start(): Promise<{ port: number; url: string }> {
      if (started) {
        return { port: startedPort, url: startedUrl };
      }

      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(config.port, config.host, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Relay server failed to acquire a TCP port.");
      }

      startedPort = (address as AddressInfo).port;
      startedUrl = `http://${config.host}:${startedPort}`;
      started = true;
      return { port: startedPort, url: startedUrl };
    },
    async stop(): Promise<void> {
      clearInterval(expiryTimer);
      clearInterval(heartbeatTimer);

      if (!started) {
        await frameCache.close();
        return;
      }

      await sessionHub.closeAll("relay_shutdown");
      terminateSockets(providerWss);
      terminateSockets(appWss);
      await Promise.all([
        closeWebSocketServer(providerWss),
        closeWebSocketServer(appWss),
      ]);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await frameCache.close();
      started = false;
      startedUrl = "";
    },
  };
}
