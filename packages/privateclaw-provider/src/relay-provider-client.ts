import { randomUUID } from "node:crypto";
import type {
  EncryptedEnvelope,
  ProviderToRelayMessage,
  RelayToProviderMessage,
} from "@privateclaw/protocol";
import WebSocket from "ws";

const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;

interface RelayProviderClientOptions {
  providerWsUrl: string;
  onFrame?: (sessionId: string, envelope: EncryptedEnvelope) => Promise<void> | void;
  onSessionClosed?: (sessionId: string, reason: string) => Promise<void> | void;
  onError?: (message: string) => void;
}

interface PendingSessionCreation {
  resolve: (value: { sessionId: string; expiresAt: string }) => void;
  reject: (error: Error) => void;
}

interface PendingSessionRenewal {
  resolve: (value: { sessionId: string; expiresAt: string }) => void;
  reject: (error: Error) => void;
}

function parseRelayMessage(raw: string): RelayToProviderMessage {
  return JSON.parse(raw) as RelayToProviderMessage;
}

export class RelayProviderClient {
  private socket: WebSocket | undefined;
  private readyPromise: Promise<void> | undefined;
  private readonly pendingSessionCreations = new Map<string, PendingSessionCreation>();
  private readonly pendingSessionRenewals = new Map<string, PendingSessionRenewal>();
  private readonly providerId = randomUUID();
  private reconnectTimer: NodeJS.Timeout | undefined;
  private heartbeatTimer: NodeJS.Timeout | undefined;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private lastPongAt = 0;
  private disposed = false;

  constructor(private readonly options: RelayProviderClientOptions) {}

  private buildProviderUrl(): string {
    const url = new URL(this.options.providerWsUrl);
    url.searchParams.set("providerId", this.providerId);
    return url.toString();
  }

  async connect(): Promise<void> {
    if (this.disposed) {
      throw new Error("Relay provider client has been disposed.");
    }

    if (this.socket?.readyState === WebSocket.OPEN) {
      return;
    }
    if (this.readyPromise) {
      return this.readyPromise;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(this.buildProviderUrl());
      let settled = false;
      let ready = false;

      const rejectIfUnsettled = (error: Error): void => {
        if (!settled) {
          settled = true;
          this.readyPromise = undefined;
          reject(error);
          return;
        }
        this.options.onError?.(error.message);
      };

      socket.on("open", () => {
        this.lastPongAt = Date.now();
        this.startHeartbeat(socket);
      });

      socket.on("pong", () => {
        this.lastPongAt = Date.now();
      });

      socket.on("message", (data) => {
        void this.handleMessage(data.toString(), {
          markReady: () => {
            ready = true;
            this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
            if (!settled) {
              settled = true;
              resolve();
            }
          },
        });
      });

      socket.on("error", (error) => {
        const normalized = error instanceof Error ? error : new Error(String(error));
        if (!ready) {
          rejectIfUnsettled(normalized);
          return;
        }
        this.options.onError?.(normalized.message);
      });

      socket.on("close", () => {
        this.stopHeartbeat();
        this.rejectPending(new Error("Relay provider socket closed."));
        this.socket = undefined;
        this.readyPromise = undefined;
        if (!ready) {
          rejectIfUnsettled(new Error("Relay provider socket closed before ready."));
        }
        if (!this.disposed) {
          this.scheduleReconnect();
        }
      });

      this.socket = socket;
    });

    return this.readyPromise;
  }

  private startHeartbeat(socket: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      if (Date.now() - this.lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        this.options.onError?.("Relay heartbeat timed out; reconnecting provider socket.");
        socket.terminate();
        return;
      }
      socket.ping();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (!this.heartbeatTimer) {
      return;
    }
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.disposed) {
      return;
    }
    const delayMs = this.reconnectDelayMs;
    this.options.onError?.(`Relay provider socket disconnected. Retrying in ${delayMs}ms.`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect().catch((error) => {
        this.options.onError?.(
          error instanceof Error ? error.message : `Relay reconnect failed: ${String(error)}`,
        );
      });
    }, delayMs);
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingSessionCreations.values()) {
      pending.reject(error);
    }
    for (const pending of this.pendingSessionRenewals.values()) {
      pending.reject(error);
    }
    this.pendingSessionCreations.clear();
    this.pendingSessionRenewals.clear();
  }

  private async handleMessage(
    raw: string,
    hooks?: { markReady?: () => void },
  ): Promise<void> {
    try {
      const message = parseRelayMessage(raw);
      switch (message.type) {
        case "relay:provider_ready":
          hooks?.markReady?.();
          return;
        case "relay:session_created": {
          const pending = this.pendingSessionCreations.get(message.requestId);
          if (!pending) {
            this.options.onError?.(
              `Received relay:session_created for unknown request ${message.requestId}.`,
            );
            return;
          }
          this.pendingSessionCreations.delete(message.requestId);
          pending.resolve({ sessionId: message.sessionId, expiresAt: message.expiresAt });
          return;
        }
        case "relay:session_renewed": {
          const pending = this.pendingSessionRenewals.get(message.requestId);
          if (!pending) {
            this.options.onError?.(
              `Received relay:session_renewed for unknown request ${message.requestId}.`,
            );
            return;
          }
          this.pendingSessionRenewals.delete(message.requestId);
          pending.resolve({ sessionId: message.sessionId, expiresAt: message.expiresAt });
          return;
        }
        case "relay:frame":
          await this.options.onFrame?.(message.sessionId, message.envelope);
          return;
        case "relay:session_closed":
          await this.options.onSessionClosed?.(message.sessionId, message.reason);
          return;
        case "relay:error": {
          if (message.requestId) {
            const creation = this.pendingSessionCreations.get(message.requestId);
            if (creation) {
              this.pendingSessionCreations.delete(message.requestId);
              creation.reject(new Error(`[${message.code}] ${message.message}`));
              return;
            }
            const renewal = this.pendingSessionRenewals.get(message.requestId);
            if (renewal) {
              this.pendingSessionRenewals.delete(message.requestId);
              renewal.reject(new Error(`[${message.code}] ${message.message}`));
              return;
            }
          }
          this.options.onError?.(`[${message.code}] ${message.message}`);
          return;
        }
        default:
          this.options.onError?.(`Unsupported relay message type: ${String(message)}`);
      }
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error.message : `Failed to process relay message: ${String(error)}`,
      );
    }
  }

  private send(message: ProviderToRelayMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Relay provider socket is not connected.");
    }
    this.socket.send(JSON.stringify(message));
  }

  async createSession(
    ttlMs?: number,
    label?: string,
  ): Promise<{ sessionId: string; expiresAt: string }> {
    await this.connect();

    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      this.pendingSessionCreations.set(requestId, { resolve, reject });
      this.send({
        type: "provider:create_session",
        requestId,
        ...(ttlMs ? { ttlMs } : {}),
        ...(label ? { label } : {}),
      });
    });
  }

  async renewSession(
    sessionId: string,
    ttlMs: number,
  ): Promise<{ sessionId: string; expiresAt: string }> {
    await this.connect();

    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      this.pendingSessionRenewals.set(requestId, { resolve, reject });
      this.send({
        type: "provider:renew_session",
        requestId,
        sessionId,
        ttlMs,
      });
    });
  }

  async sendFrame(sessionId: string, envelope: EncryptedEnvelope): Promise<void> {
    await this.connect();
    this.send({ type: "provider:frame", sessionId, envelope });
  }

  async closeSession(sessionId: string, reason?: string): Promise<void> {
    await this.connect();
    this.send({
      type: "provider:close_session",
      sessionId,
      ...(reason ? { reason } : {}),
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.rejectPending(new Error("Relay provider client disposed."));
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (!this.socket) {
      this.readyPromise = undefined;
      return;
    }

    const socket = this.socket;
    this.socket = undefined;
    this.readyPromise = undefined;

    if (socket.readyState === WebSocket.CLOSED) {
      return;
    }

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.close(1000, "provider_shutdown");
    });
  }
}
