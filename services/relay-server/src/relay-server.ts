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
import {
  createRelayPushRegistrationStore,
  type RelayPushRegistrationStore,
} from "./push-registration-store.js";
import {
  createRelayPushNotifier,
  type RelayPushNotifier,
} from "./push-notifier.js";
import {
  createRedisRelayClusterClient,
  RelayClaimConflictError,
  type RelayClusterAppBinding,
  type RelayClusterCallbacks,
  type RelayClusterClient,
} from "./relay-cluster.js";
import {
  createRelaySessionStore,
  type RelaySessionRecord,
  type RelaySessionStore,
} from "./session-store.js";

const HEARTBEAT_INTERVAL_MS = 15_000;
const PUSH_WAKE_COOLDOWN_MS = 5_000;

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

interface AppSessionBinding extends RelayClusterAppBinding {
  sessionId: string;
  appId: string;
  groupMode: boolean;
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
  if (error instanceof RelayClaimConflictError) {
    return new RelayProtocolError("session_in_use", error.message);
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

function isSocketActive(socket: WebSocket): boolean {
  return (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  );
}

interface SessionHubParams {
  defaultTtlMs: number;
  frameCache: EncryptedFrameCache;
  sessionStore: RelaySessionStore;
  pushRegistrationStore: RelayPushRegistrationStore;
  pushNotifier: RelayPushNotifier;
  now?: () => number;
}

class SessionHub {
  private readonly providerSockets = new Map<string, WebSocket>();
  private readonly socketProviders = new Map<WebSocket, string>();
  private readonly providerSessions = new Map<string, Set<string>>();
  private readonly sessionProviders = new Map<string, string>();
  private readonly sessionApps = new Map<string, Map<string, WebSocket>>();
  private readonly appSessions = new Map<WebSocket, AppSessionBinding>();
  private readonly recentWakeSentAt = new Map<string, number>();
  private cluster: RelayClusterClient | undefined;

  constructor(private readonly params: SessionHubParams) {}

  setCluster(cluster: RelayClusterClient | undefined): void {
    this.cluster = cluster;
  }

  private now(): number {
    return this.params.now?.() ?? Date.now();
  }

  private wakeKey(sessionId: string, appId: string): string {
    return `${sessionId}:${appId}`;
  }

  private clearWakeState(sessionId: string, appId?: string): void {
    if (appId) {
      this.recentWakeSentAt.delete(this.wakeKey(sessionId, appId));
      return;
    }
    const prefix = `${sessionId}:`;
    for (const key of this.recentWakeSentAt.keys()) {
      if (key.startsWith(prefix)) {
        this.recentWakeSentAt.delete(key);
      }
    }
  }

  get usesPersistentSessions(): boolean {
    return this.params.sessionStore.persistent;
  }

  get localSessionCount(): number {
    return new Set<string>([
      ...this.sessionProviders.keys(),
      ...this.sessionApps.keys(),
    ]).size;
  }

  async countSessions(): Promise<number> {
    return this.params.sessionStore.countSessions(this.now());
  }

  private async rememberLocalProviderSession(
    providerId: string,
    sessionId: string,
  ): Promise<void> {
    const previousProviderId = this.sessionProviders.get(sessionId);
    if (previousProviderId === providerId) {
      return;
    }
    if (previousProviderId) {
      await this.forgetLocalProviderSession(previousProviderId, sessionId);
    }

    const sessionIds = this.providerSessions.get(providerId) ?? new Set<string>();
    const added = !sessionIds.has(sessionId);
    sessionIds.add(sessionId);
    this.providerSessions.set(providerId, sessionIds);
    this.sessionProviders.set(sessionId, providerId);
    if (added && this.cluster) {
      await this.cluster.subscribeProvider(providerId, sessionId);
    }
  }

  private async forgetLocalProviderSession(
    providerId: string,
    sessionId: string,
  ): Promise<void> {
    if (this.sessionProviders.get(sessionId) !== providerId) {
      return;
    }

    this.sessionProviders.delete(sessionId);
    const sessionIds = this.providerSessions.get(providerId);
    sessionIds?.delete(sessionId);
    if (sessionIds?.size === 0) {
      this.providerSessions.delete(providerId);
    }
    if (this.cluster) {
      await this.cluster.unsubscribeProvider(providerId, sessionId);
    }
  }

  private async rememberLocalAppBinding(
    binding: AppSessionBinding,
    appSocket: WebSocket,
  ): Promise<void> {
    const appSockets = this.sessionApps.get(binding.sessionId) ?? new Map<string, WebSocket>();
    appSockets.set(binding.appId, appSocket);
    this.sessionApps.set(binding.sessionId, appSockets);
    this.appSessions.set(appSocket, binding);
    if (this.cluster) {
      await this.cluster.subscribeApp(binding.sessionId, binding.appId);
    }
  }

  private async forgetLocalAppBinding(
    appSocket: WebSocket,
    binding: AppSessionBinding,
  ): Promise<boolean> {
    const appSockets = this.sessionApps.get(binding.sessionId);
    if (!appSockets || appSockets.get(binding.appId) !== appSocket) {
      this.appSessions.delete(appSocket);
      return false;
    }

    appSockets.delete(binding.appId);
    if (appSockets.size === 0) {
      this.sessionApps.delete(binding.sessionId);
    }
    this.appSessions.delete(appSocket);
    if (this.cluster) {
      await this.cluster.unsubscribeApp(binding.sessionId, binding.appId);
      await this.cluster.releaseApp(binding);
    }
    return true;
  }

  async attachProvider(
    providerId: string,
    providerSocket: WebSocket,
  ): Promise<void> {
    const previousSocket = this.providerSockets.get(providerId);
    if (
      previousSocket &&
      previousSocket !== providerSocket &&
      isSocketActive(previousSocket)
    ) {
      await this.closeLocalProvider(providerId, "provider_reconnected");
    }

    this.providerSockets.set(providerId, providerSocket);
    this.socketProviders.set(providerSocket, providerId);

    if (this.cluster) {
      const claim = await this.cluster.claimProvider(providerId);
      if (claim.previousNodeId) {
        await this.cluster.publishProviderReconnected(
          providerId,
          claim.previousNodeId,
        );
      }
    }

    const sessionIds = await this.params.sessionStore.listProviderSessions(
      providerId,
      this.now(),
    );
    for (const sessionId of sessionIds) {
      await this.rememberLocalProviderSession(providerId, sessionId);
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

  async createSession(
    providerSocket: WebSocket,
    params?: { ttlMs?: number; groupMode?: boolean },
  ): Promise<RelaySessionRecord> {
    const providerId = this.requireProviderId(providerSocket);
    const session: RelaySessionRecord = {
      sessionId: randomUUID(),
      expiresAt: this.now() + (params?.ttlMs ?? this.params.defaultTtlMs),
      providerId,
      groupMode: params?.groupMode === true,
    };
    await this.params.sessionStore.saveSession(session);
    await this.rememberLocalProviderSession(providerId, session.sessionId);
    return session;
  }

  private async requireSession(sessionId: string): Promise<RelaySessionRecord> {
    const session = await this.params.sessionStore.getSession(sessionId);
    if (!session) {
      throw new RelayProtocolError(
        "unknown_session",
        "PrivateClaw session not found. Generate a fresh QR code.",
      );
    }

    if (session.expiresAt <= this.now()) {
      await this.closeSession(sessionId, "session_expired");
      throw new RelayProtocolError(
        "session_expired",
        "PrivateClaw session expired. Generate a fresh QR code.",
      );
    }

    return session;
  }

  private async assertProviderOwnsSession(
    providerSocket: WebSocket,
    sessionId: string,
  ): Promise<RelaySessionRecord> {
    const providerId = this.requireProviderId(providerSocket);
    const session = await this.requireSession(sessionId);
    if (session.providerId !== providerId) {
      throw new RelayProtocolError(
        "provider_session_mismatch",
        "Provider does not own this PrivateClaw session.",
      );
    }
    return session;
  }

  private hasLocalProviderSession(sessionId: string, providerId: string): boolean {
    if (this.sessionProviders.get(sessionId) !== providerId) {
      return false;
    }
    const providerSocket = this.providerSockets.get(providerId);
    return !!providerSocket && providerSocket.readyState === WebSocket.OPEN;
  }

  private async assertSessionHasLiveProvider(session: RelaySessionRecord): Promise<void> {
    if (this.hasLocalProviderSession(session.sessionId, session.providerId)) {
      return;
    }
    if (this.cluster) {
      const hasRemoteSubscriber = await this.cluster.hasProviderSessionSubscriber(
        session.sessionId,
      );
      if (hasRemoteSubscriber) {
        return;
      }
    }
    throw new RelayProtocolError(
      "provider_unavailable",
      "PrivateClaw session host is currently offline. Ask the host to reopen the session.",
    );
  }

  async renewSession(
    providerSocket: WebSocket,
    sessionId: string,
    ttlMs: number,
  ): Promise<RelaySessionRecord> {
    const session = await this.assertProviderOwnsSession(providerSocket, sessionId);
    const renewedSession: RelaySessionRecord = {
      ...session,
      expiresAt: this.now() + ttlMs,
    };
    await this.params.sessionStore.saveSession(renewedSession);
    await this.params.pushRegistrationStore.touchSession(
      sessionId,
      renewedSession.expiresAt,
    );
    return renewedSession;
  }

  async registerAppPushToken(
    sessionId: string,
    appId: string,
    token: string,
  ): Promise<void> {
    const session = await this.requireSession(sessionId);
    const normalizedToken = token.trim();
    if (normalizedToken === "") {
      throw new RelayProtocolError(
        "invalid_push_token",
        "app:register_push requires a non-empty token.",
      );
    }
    await this.params.pushRegistrationStore.saveRegistration(
      {
        sessionId,
        appId,
        token: normalizedToken,
        updatedAt: this.now(),
      },
      session.expiresAt,
    );
    console.info(
      `[privateclaw-relay] registered push token session=${sessionId} appId=${appId} tokenLength=${normalizedToken.length}`,
    );
  }

  private async bufferAppFrameForReplay(params: {
    sessionId: string;
    envelope: EncryptedEnvelope;
    appId?: string;
  }): Promise<void> {
    await this.params.frameCache.push({
      sessionId: params.sessionId,
      target: "app",
      envelope: params.envelope,
      ...(params.appId ? { appId: params.appId } : {}),
    });
    await this.notifyBufferedAppFrames(params.sessionId, params.appId);
  }

  private async bufferOfflineGroupAppFrames(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<number> {
    const registrations = await this.params.pushRegistrationStore.listRegistrations(
      sessionId,
    );
    const activeLocalAppIds = new Set(this.listActiveLocalAppIds(sessionId));
    let bufferedCount = 0;

    for (const registration of registrations) {
      if (activeLocalAppIds.has(registration.appId)) {
        continue;
      }
      if (this.cluster && (await this.cluster.hasAppBinding(sessionId, registration.appId))) {
        continue;
      }
      await this.bufferAppFrameForReplay({
        sessionId,
        envelope,
        appId: registration.appId,
      });
      bufferedCount += 1;
    }

    return bufferedCount;
  }

  async unregisterAppPushToken(sessionId: string, appId: string): Promise<void> {
    await this.params.pushRegistrationStore.deleteRegistration(sessionId, appId);
    this.clearWakeState(sessionId, appId);
    console.info(
      `[privateclaw-relay] unregistered push token session=${sessionId} appId=${appId}`,
    );
  }

  private async notifyBufferedAppFrames(
    sessionId: string,
    targetAppId?: string,
  ): Promise<void> {
    if (!this.params.pushNotifier.enabled) {
      console.info(
        `[privateclaw-relay] wake skipped: notifier disabled session=${sessionId} targetAppId=${targetAppId ?? "all"}`,
      );
      return;
    }

    const registrations = await this.params.pushRegistrationStore.listRegistrations(
      sessionId,
    );
    const matchingRegistrations = registrations.filter(
      (registration) => !targetAppId || registration.appId === targetAppId,
    );
    if (matchingRegistrations.length === 0) {
      console.info(
        `[privateclaw-relay] wake skipped: no push registrations session=${sessionId} targetAppId=${targetAppId ?? "all"}`,
      );
      return;
    }
    for (const registration of matchingRegistrations) {
      const wakeKey = this.wakeKey(registration.sessionId, registration.appId);
      const now = this.now();
      const lastWakeSentAt = this.recentWakeSentAt.get(wakeKey);
      if (
        lastWakeSentAt !== undefined &&
        now - lastWakeSentAt < PUSH_WAKE_COOLDOWN_MS
      ) {
        console.info(
          `[privateclaw-relay] wake skipped: cooldown session=${registration.sessionId} appId=${registration.appId} sinceMs=${now - lastWakeSentAt}`,
        );
        continue;
      }
      this.recentWakeSentAt.set(wakeKey, now);
      try {
        const result = await this.params.pushNotifier.sendWake(registration);
        console.info(
          `[privateclaw-relay] wake sent session=${registration.sessionId} appId=${registration.appId} unregisterToken=${result.unregisterToken}`,
        );
        if (result.unregisterToken) {
          await this.params.pushRegistrationStore.deleteRegistration(
            registration.sessionId,
            registration.appId,
          );
          this.clearWakeState(registration.sessionId, registration.appId);
        }
      } catch (error) {
        this.clearWakeState(registration.sessionId, registration.appId);
        console.error(
          "[privateclaw-relay] failed to send wake notification",
          error,
        );
      }
    }
  }

  private listActiveLocalAppIds(sessionId: string): string[] {
    const appSockets = this.sessionApps.get(sessionId);
    if (!appSockets) {
      return [];
    }
    return [...appSockets.entries()]
      .filter(([, socket]) => isSocketActive(socket))
      .map(([appId]) => appId);
  }

  async attachApp(
    sessionId: string,
    appId: string,
    appSocket: WebSocket,
  ): Promise<RelaySessionRecord> {
    const session = await this.requireSession(sessionId);
    await this.assertSessionHasLiveProvider(session);
    const normalizedAppId = appId.trim() || "legacy-app";
    const previousSocket = this.sessionApps.get(sessionId)?.get(normalizedAppId);
    if (
      previousSocket &&
      previousSocket !== appSocket &&
      isSocketActive(previousSocket)
    ) {
      await this.closeLocalApp(sessionId, normalizedAppId, "app_reconnected");
    }

    const binding: AppSessionBinding = {
      sessionId,
      appId: normalizedAppId,
      groupMode: session.groupMode,
    };

    if (this.cluster) {
      const claim = await this.cluster.claimApp(binding);
      if (claim.previousNodeId) {
        await this.cluster.publishAppReconnected(
          sessionId,
          normalizedAppId,
          claim.previousNodeId,
        );
      }
    } else if (!session.groupMode) {
      const activeLocalAppIds = this.listActiveLocalAppIds(sessionId);
      if (activeLocalAppIds.some((entryAppId) => entryAppId !== normalizedAppId)) {
        throw new RelayProtocolError(
          "session_in_use",
          "This PrivateClaw session is already attached to another app.",
        );
      }
    }

    await this.rememberLocalAppBinding(binding, appSocket);
    return session;
  }

  deliverLocalToApp(
    sessionId: string,
    envelope: EncryptedEnvelope,
    targetAppId?: string,
  ): number {
    const appSockets = this.sessionApps.get(sessionId);
    if (!appSockets) {
      return 0;
    }

    if (targetAppId) {
      const socket = appSockets.get(targetAppId);
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return 0;
      }
      sendJson(socket, { type: "relay:frame", sessionId, envelope });
      return 1;
    }

    let delivered = 0;
    for (const socket of appSockets.values()) {
      if (socket.readyState !== WebSocket.OPEN) {
        continue;
      }
      delivered += 1;
      sendJson(socket, { type: "relay:frame", sessionId, envelope });
    }
    return delivered;
  }

  deliverLocalToProvider(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): number {
    const providerId = this.sessionProviders.get(sessionId);
    if (!providerId) {
      return 0;
    }
    const providerSocket = this.providerSockets.get(providerId);
    if (!providerSocket || providerSocket.readyState !== WebSocket.OPEN) {
      return 0;
    }
    sendJson(providerSocket, { type: "relay:frame", sessionId, envelope });
    return 1;
  }

  async forwardToApp(
    providerSocket: WebSocket,
    sessionId: string,
    envelope: EncryptedEnvelope,
    targetAppId?: string,
  ): Promise<void> {
    const session = await this.assertProviderOwnsSession(providerSocket, sessionId);
    const localDelivered = this.deliverLocalToApp(sessionId, envelope, targetAppId);
    const remoteDelivered = this.cluster
      ? await this.cluster.publishFrameToApp(sessionId, envelope, targetAppId)
      : 0;
    if (targetAppId) {
      if (localDelivered > 0 || remoteDelivered > 0) {
        return;
      }
      await this.bufferAppFrameForReplay({ sessionId, envelope, appId: targetAppId });
      return;
    }

    if (!session.groupMode) {
      if (localDelivered > 0 || remoteDelivered > 0) {
        return;
      }
      await this.bufferAppFrameForReplay({ sessionId, envelope });
      return;
    }

    const bufferedGroupRecipients = await this.bufferOfflineGroupAppFrames(
      sessionId,
      envelope,
    );
    if (localDelivered === 0 && remoteDelivered === 0 && bufferedGroupRecipients === 0) {
      await this.bufferAppFrameForReplay({ sessionId, envelope });
    }
  }

  async forwardToProvider(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<void> {
    const session = await this.requireSession(sessionId);
    await this.assertSessionHasLiveProvider(session);
    const localDelivered = this.deliverLocalToProvider(sessionId, envelope);
    const remoteDelivered = this.cluster
      ? await this.cluster.publishFrameToProvider(sessionId, envelope)
      : 0;
    if (localDelivered > 0 || remoteDelivered > 0) {
      return;
    }

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
    appId?: string,
  ): Promise<void> {
    const frames = await this.params.frameCache.drain({
      sessionId,
      target,
      ...(appId ? { appId } : {}),
    });
    for (const envelope of frames) {
      sendJson(socket, { type: "relay:frame", sessionId, envelope });
    }
  }

  async replayBufferedFramesForProvider(
    providerId: string,
    socket: WebSocket,
  ): Promise<void> {
    const sessionIds = await this.params.sessionStore.listProviderSessions(
      providerId,
      this.now(),
    );
    for (const sessionId of sessionIds) {
      await this.replayBufferedFrames(sessionId, "provider", socket);
    }
  }

  private hasLocalSession(sessionId: string): boolean {
    return this.sessionProviders.has(sessionId) || this.sessionApps.has(sessionId);
  }

  async closeLocalSession(
    sessionId: string,
    reason: string,
  ): Promise<void> {
    const appSockets = [...(this.sessionApps.get(sessionId)?.entries() ?? [])];
    for (const [appId, appSocket] of appSockets) {
      const binding = this.appSessions.get(appSocket);
      if (!binding || binding.appId !== appId) {
        continue;
      }
      await this.forgetLocalAppBinding(appSocket, binding);
      sendJson(appSocket, {
        type: "relay:session_closed",
        sessionId,
        reason,
      });
      if (isSocketActive(appSocket)) {
        appSocket.close(1000, reason);
      }
    }

    const providerId = this.sessionProviders.get(sessionId);
    if (!providerId) {
      return;
    }

    const providerSocket = this.providerSockets.get(providerId);
    await this.forgetLocalProviderSession(providerId, sessionId);
    if (providerSocket) {
      sendJson(providerSocket, {
        type: "relay:session_closed",
        sessionId,
        reason,
      });
    }
  }

  async closeSession(sessionId: string, reason: string): Promise<void> {
    await this.params.sessionStore.deleteSession(sessionId);
    await this.params.pushRegistrationStore.clearSession(sessionId);
    this.clearWakeState(sessionId);
    if (!this.hasLocalSession(sessionId) && !this.cluster) {
      await this.params.frameCache.clear(sessionId);
      return;
    }

    await this.closeLocalSession(sessionId, reason);
    if (this.cluster) {
      await this.cluster.publishSessionClosed(sessionId, reason);
    }
    await this.params.frameCache.clear(sessionId);
  }

  async closeSessionForProvider(
    providerSocket: WebSocket,
    sessionId: string,
    reason: string,
  ): Promise<void> {
    await this.assertProviderOwnsSession(providerSocket, sessionId);
    await this.closeSession(sessionId, reason);
  }

  async closeApp(
    sessionId: string,
    appId: string,
    reason: string,
  ): Promise<void> {
    await this.params.pushRegistrationStore.deleteRegistration(sessionId, appId);
    this.clearWakeState(sessionId, appId);
    await this.params.frameCache.clearApp(sessionId, appId);
    await this.closeLocalApp(sessionId, appId, reason);
    if (this.cluster) {
      await this.cluster.publishAppClosed(sessionId, appId, reason);
    }
  }

  async closeAppForProvider(
    providerSocket: WebSocket,
    sessionId: string,
    appId: string,
    reason: string,
  ): Promise<void> {
    await this.assertProviderOwnsSession(providerSocket, sessionId);
    await this.closeApp(sessionId, appId, reason);
  }

  async detachProvider(providerSocket: WebSocket): Promise<void> {
    const providerId = this.socketProviders.get(providerSocket);
    if (!providerId) {
      return;
    }

    this.socketProviders.delete(providerSocket);
    if (this.providerSockets.get(providerId) !== providerSocket) {
      return;
    }

    this.providerSockets.delete(providerId);
    const sessionIds = [...(this.providerSessions.get(providerId) ?? [])];
    for (const sessionId of sessionIds) {
      await this.forgetLocalProviderSession(providerId, sessionId);
    }
    if (this.cluster) {
      await this.cluster.releaseProvider(providerId);
    }
  }

  async detachApp(appSocket: WebSocket): Promise<void> {
    const binding = this.appSessions.get(appSocket);
    if (!binding) {
      return;
    }
    await this.forgetLocalAppBinding(appSocket, binding);
  }

  async closeLocalApp(
    sessionId: string,
    appId: string,
    reason: string,
  ): Promise<void> {
    const appSocket = this.sessionApps.get(sessionId)?.get(appId);
    if (!appSocket) {
      return;
    }
    const binding = this.appSessions.get(appSocket);
    if (!binding) {
      return;
    }
    await this.forgetLocalAppBinding(appSocket, binding);
    sendJson(appSocket, {
      type: "relay:session_closed",
      sessionId,
      reason,
    });
    if (isSocketActive(appSocket)) {
      appSocket.close(1012, reason);
    }
  }

  async closeLocalProvider(providerId: string, reason: string): Promise<void> {
    const providerSocket = this.providerSockets.get(providerId);
    if (!providerSocket) {
      return;
    }

    this.providerSockets.delete(providerId);
    this.socketProviders.delete(providerSocket);
    const sessionIds = [...(this.providerSessions.get(providerId) ?? [])];
    for (const sessionId of sessionIds) {
      await this.forgetLocalProviderSession(providerId, sessionId);
    }
    if (this.cluster) {
      await this.cluster.releaseProvider(providerId);
    }
    if (isSocketActive(providerSocket)) {
      providerSocket.close(1012, reason);
    }
  }

  async purgeExpiredSessions(): Promise<void> {
    const sessionIds = new Set<string>([
      ...this.sessionProviders.keys(),
      ...this.sessionApps.keys(),
    ]);
    for (const sessionId of sessionIds) {
      const session = await this.params.sessionStore.getSession(sessionId);
      if (!session) {
        await this.params.pushRegistrationStore.clearSession(sessionId);
        await this.closeLocalSession(sessionId, "session_expired");
        continue;
      }
      if (session.expiresAt <= this.now()) {
        await this.closeSession(sessionId, "session_expired");
      }
    }
  }

  async refreshClusterPresence(): Promise<void> {
    if (!this.cluster) {
      return;
    }

    const providerIds = [...this.providerSockets.keys()];
    const appBindings: AppSessionBinding[] = [];
    for (const [appSocket, binding] of this.appSessions.entries()) {
      const currentSocket = this.sessionApps.get(binding.sessionId)?.get(binding.appId);
      if (currentSocket === appSocket) {
        appBindings.push(binding);
      }
    }

    await this.cluster.refreshPresence({
      providerIds,
      appBindings,
    });
  }

  async closeAll(reason: string): Promise<void> {
    const sessionIds = new Set<string>([
      ...this.sessionProviders.keys(),
      ...this.sessionApps.keys(),
    ]);
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

export interface RelayServerDependencies {
  frameCache?: EncryptedFrameCache;
  sessionStore?: RelaySessionStore;
  pushRegistrationStore?: RelayPushRegistrationStore;
  pushNotifier?: RelayPushNotifier;
  cluster?: RelayClusterClient;
  clusterFactory?: (callbacks: RelayClusterCallbacks) => RelayClusterClient;
  now?: () => number;
}

export function createRelayServer(
  config: RelayServerConfig,
  deps: RelayServerDependencies = {},
): RelayServerInstance {
  const ownsFrameCache = !deps.frameCache;
  const frameCache =
    deps.frameCache ??
    createEncryptedFrameCache({
      maxFrames: config.frameCacheSize,
      ...(config.redisUrl ? { redisUrl: config.redisUrl } : {}),
    });

  const ownsSessionStore = !deps.sessionStore;
  const sessionStore =
    deps.sessionStore ??
    createRelaySessionStore({
      ...(config.redisUrl ? { redisUrl: config.redisUrl } : {}),
    });

  const ownsPushRegistrationStore = !deps.pushRegistrationStore;
  const pushRegistrationStore =
    deps.pushRegistrationStore ??
    createRelayPushRegistrationStore({
      ...(config.redisUrl ? { redisUrl: config.redisUrl } : {}),
    });

  const ownsPushNotifier = !deps.pushNotifier;
  const pushNotifier =
    deps.pushNotifier ??
    createRelayPushNotifier({
      fcmServiceAccountJson: config.fcmServiceAccountJson,
      fcmProjectId: config.fcmProjectId,
      fcmClientEmail: config.fcmClientEmail,
      fcmPrivateKey: config.fcmPrivateKey,
    });

  const sessionHub = new SessionHub({
    defaultTtlMs: config.sessionTtlMs,
    frameCache,
    sessionStore,
    pushRegistrationStore,
    pushNotifier,
    ...(deps.now ? { now: deps.now } : {}),
  });

  const clusterCallbacks: RelayClusterCallbacks = {
    onRemoteAppFrame: async (sessionId, envelope, targetAppId) => {
      sessionHub.deliverLocalToApp(sessionId, envelope, targetAppId);
    },
    onRemoteProviderFrame: async (sessionId, envelope) => {
      sessionHub.deliverLocalToProvider(sessionId, envelope);
    },
    onRemoteSessionClosed: async (sessionId, reason) => {
      await sessionHub.closeLocalSession(sessionId, reason);
    },
    onRemoteAppClosed: async (sessionId, appId, reason) => {
      await sessionHub.closeLocalApp(sessionId, appId, reason);
    },
    onRemoteAppReconnected: async (sessionId, appId) => {
      await sessionHub.closeLocalApp(sessionId, appId, "app_reconnected");
    },
    onRemoteProviderReconnected: async (providerId) => {
      await sessionHub.closeLocalProvider(providerId, "provider_reconnected");
    },
  };

  const clusterNodeId = config.instanceId?.trim() || randomUUID();
  const ownsCluster =
    !deps.cluster && !deps.clusterFactory && !!config.redisUrl;
  const cluster =
    deps.cluster ??
    deps.clusterFactory?.(clusterCallbacks) ??
    (config.redisUrl
      ? createRedisRelayClusterClient({
          redisUrl: config.redisUrl,
          nodeId: clusterNodeId,
          callbacks: clusterCallbacks,
        })
      : undefined);
  sessionHub.setCluster(cluster);

  let startedPort = config.port;
  let startedUrl = "";
  let started = false;

  const server = createServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${config.host}:${startedPort}`}`,
    );

    if (
      request.method === "GET" &&
      (url.pathname === "/healthz" || url.pathname === "/api/health")
    ) {
      void sessionHub
        .countSessions()
        .then((sessions) => {
          response.writeHead(200, { "content-type": "application/json" });
          response.end(
            JSON.stringify({ ok: true, sessions, instanceId: clusterNodeId }),
          );
        })
        .catch((error) => {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(
            JSON.stringify({
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        });
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });

  const providerWss = new WebSocketServer({ noServer: true });
  const appWss = new WebSocketServer({ noServer: true });

  const expiryTimer = setInterval(() => {
    void sessionHub.purgeExpiredSessions().catch((error) => {
      console.error("[privateclaw-relay] failed to purge expired sessions", error);
    });
  }, 5_000);
  const heartbeatTimer = setInterval(() => {
    pingServerClients(providerWss);
    pingServerClients(appWss);
    void sessionHub.refreshClusterPresence().catch((error) => {
      console.error("[privateclaw-relay] failed to refresh relay presence", error);
    });
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
          const groupModeValue = message.groupMode;

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
          if (
            groupModeValue !== undefined &&
            typeof groupModeValue !== "boolean"
          ) {
            throw new RelayProtocolError(
              "invalid_group_mode",
              "provider:create_session groupMode must be a boolean when provided.",
            );
          }

          const session = await sessionHub.createSession(socket, {
            ...(typeof ttlMsValue === "number" ? { ttlMs: ttlMsValue } : {}),
            ...(typeof groupModeValue === "boolean"
              ? { groupMode: groupModeValue }
              : {}),
          });
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

          const session = await sessionHub.renewSession(
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
          if (
            message.targetAppId !== undefined &&
            typeof message.targetAppId !== "string"
          ) {
            throw new RelayProtocolError(
              "invalid_target_app_id",
              "provider:frame targetAppId must be a string when provided.",
            );
          }
          await sessionHub.forwardToApp(
            socket,
            message.sessionId,
            message.envelope,
            message.targetAppId,
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
        case "provider:close_app": {
          if (
            typeof message.sessionId !== "string" ||
            typeof message.appId !== "string" ||
            message.appId.trim() === ""
          ) {
            throw new RelayProtocolError(
              "invalid_close_request",
              "provider:close_app requires a sessionId and appId.",
            );
          }
          await sessionHub.closeAppForProvider(
            socket,
            message.sessionId,
            message.appId,
            typeof message.reason === "string"
              ? message.reason
              : "provider_closed_app",
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
    appId: string,
    raw: string,
  ): Promise<void> {
    try {
      const message = parseJson(raw) as AppToRelayMessage | unknown;
      if (!isObject(message) || typeof message.type !== "string") {
        throw new RelayProtocolError(
          "invalid_message",
          "App message is missing a type field.",
        );
      }

      switch (message.type) {
        case "app:frame":
          if (!isEncryptedEnvelope(message.envelope)) {
            throw new RelayProtocolError(
              "invalid_frame",
              "app:frame must include a valid encrypted envelope.",
            );
          }
          await sessionHub.forwardToProvider(sessionId, message.envelope);
          return;
        case "app:register_push":
          if (typeof message.token !== "string") {
            throw new RelayProtocolError(
              "invalid_push_token",
              "app:register_push requires a string token.",
            );
          }
          await sessionHub.registerAppPushToken(sessionId, appId, message.token);
          return;
        case "app:unregister_push":
          await sessionHub.unregisterAppPushToken(sessionId, appId);
          return;
        default:
          throw new RelayProtocolError(
            "unsupported_message",
            `Unsupported app message type: ${String(message.type)}`,
          );
      }
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

    void (async () => {
      try {
        await sessionHub.attachProvider(providerId, socket);
      } catch (error) {
        const relayError = toRelayProtocolError(error);
        sendJson(socket, {
          type: "relay:error",
          code: relayError.code,
          message: relayError.message,
        });
        socket.close(1011, relayError.code);
        return;
      }

      sendJson(socket, { type: "relay:provider_ready" });
      void sessionHub.replayBufferedFramesForProvider(providerId, socket).catch(
        (error) => {
          console.error(
            "[privateclaw-relay] failed to replay buffered provider frames",
            error,
          );
        },
      );

      socket.on("message", (data) => {
        void handleProviderMessage(socket, data.toString());
      });

      socket.on("close", () => {
        void sessionHub.detachProvider(socket).catch((error) => {
          console.error(
            "[privateclaw-relay] failed to detach provider socket",
            error,
          );
        });
      });
    })();
  });

  appWss.on("connection", (rawSocket, request) => {
    const socket = rawSocket as RelaySocket;
    setupHeartbeat(socket);

    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${config.host}:${startedPort}`}`,
    );
    const sessionId = url.searchParams.get("sessionId");
    const appId = url.searchParams.get("appId")?.trim() || "legacy-app";

    if (!sessionId) {
      sendJson(socket, {
        type: "relay:error",
        code: "missing_session_id",
        message: "App connections must include a sessionId query parameter.",
      });
      socket.close(1008, "missing_session_id");
      return;
    }

    void (async () => {
      let session: RelaySessionRecord;
      try {
        session = await sessionHub.attachApp(sessionId, appId, socket);
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

      sendJson(socket, {
        type: "relay:attached",
        sessionId,
        expiresAt: new Date(session.expiresAt).toISOString(),
      });
      void sessionHub.replayBufferedFrames(sessionId, "app", socket, appId).catch(
        (error) => {
          console.error(
            "[privateclaw-relay] failed to replay buffered app frames",
            error,
          );
        },
      );

      socket.on("message", (data) => {
        void handleAppMessage(socket, sessionId, appId, data.toString());
      });

      socket.on("close", () => {
        void sessionHub.detachApp(socket).catch((error) => {
          console.error(
            "[privateclaw-relay] failed to detach app socket",
            error,
          );
        });
      });
    })();
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

  async function closeOwnedResources(): Promise<void> {
    const closes: Promise<void>[] = [];
    if (ownsCluster && cluster) {
      closes.push(cluster.close());
    }
    if (ownsSessionStore) {
      closes.push(sessionStore.close());
    }
    if (ownsPushRegistrationStore) {
      closes.push(pushRegistrationStore.close());
    }
    if (ownsPushNotifier) {
      closes.push(pushNotifier.close());
    }
    if (ownsFrameCache) {
      closes.push(frameCache.close());
    }
    await Promise.all(closes);
  }

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
        await closeOwnedResources();
        return;
      }

      if (!sessionHub.usesPersistentSessions) {
        await sessionHub.closeAll("relay_shutdown");
      }

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
      await closeOwnedResources();
      started = false;
      startedUrl = "";
    },
  };
}
