import { Redis } from "ioredis";
import type { EncryptedEnvelope } from "@privateclaw/protocol";

const BUS_PREFIX = "privateclaw:bus:v1";
const PRESENCE_PREFIX = "privateclaw:presence:v1";
const LEASE_MS = 45_000;

interface RelayBusFrameMessage {
  originNodeId: string;
  sessionId: string;
  envelope: EncryptedEnvelope;
}

interface RelayBusSessionClosedMessage {
  kind: "session_closed";
  originNodeId: string;
  sessionId: string;
  reason: string;
}

interface RelayBusAppClosedMessage {
  kind: "app_closed";
  originNodeId: string;
  sessionId: string;
  appId: string;
  reason: string;
}

interface RelayBusAppReconnectMessage {
  kind: "app_reconnected";
  originNodeId: string;
  targetNodeId: string;
  sessionId: string;
  appId: string;
}

interface RelayBusProviderReconnectMessage {
  kind: "provider_reconnected";
  originNodeId: string;
  targetNodeId: string;
  providerId: string;
}

type RelayBusSessionControlMessage =
  | RelayBusSessionClosedMessage
  | RelayBusAppClosedMessage
  | RelayBusAppReconnectMessage;

function appBroadcastChannel(sessionId: string): string {
  return `${BUS_PREFIX}:session:${sessionId}:app:broadcast`;
}

function appTargetChannel(sessionId: string, appId: string): string {
  return `${BUS_PREFIX}:session:${sessionId}:app:${appId}`;
}

function providerChannel(sessionId: string): string {
  return `${BUS_PREFIX}:session:${sessionId}:provider`;
}

function sessionControlChannel(sessionId: string): string {
  return `${BUS_PREFIX}:session:${sessionId}:control`;
}

function providerControlChannel(providerId: string): string {
  return `${BUS_PREFIX}:provider:${providerId}:control`;
}

function providerPresenceKey(providerId: string): string {
  return `${PRESENCE_PREFIX}:provider:${providerId}`;
}

function appPresenceKey(sessionId: string, appId: string): string {
  return `${PRESENCE_PREFIX}:session:${sessionId}:app:${appId}`;
}

function occupantKey(sessionId: string): string {
  return `${PRESENCE_PREFIX}:session:${sessionId}:occupant`;
}

function occupantValue(nodeId: string, appId: string): string {
  return JSON.stringify({ nodeId, appId });
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

function parseJsonObject(
  raw: string,
  label: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!isObject(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed;
}

function parseRequiredString(
  value: unknown,
  field: string,
  label: string,
): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} is missing a valid ${field}.`);
  }
  return value;
}

function parseOccupant(
  raw: string,
): {
  nodeId: string;
  appId: string;
} {
  const parsed = parseJsonObject(raw, "Relay cluster occupant payload");
  return {
    nodeId: parseRequiredString(
      parsed.nodeId,
      "nodeId",
      "Relay cluster occupant payload",
    ),
    appId: parseRequiredString(
      parsed.appId,
      "appId",
      "Relay cluster occupant payload",
    ),
  };
}

function parseFrameMessage(
  raw: string,
  label: string,
): RelayBusFrameMessage {
  const parsed = parseJsonObject(raw, label);
  if (!isEncryptedEnvelope(parsed.envelope)) {
    throw new Error(`${label} is missing a valid encrypted envelope.`);
  }
  return {
    originNodeId: parseRequiredString(parsed.originNodeId, "originNodeId", label),
    sessionId: parseRequiredString(parsed.sessionId, "sessionId", label),
    envelope: parsed.envelope,
  };
}

function parseProviderReconnectMessage(
  raw: string,
): RelayBusProviderReconnectMessage {
  const label = "Relay provider reconnect payload";
  const parsed = parseJsonObject(raw, label);
  const kind = parseRequiredString(parsed.kind, "kind", label);
  if (kind !== "provider_reconnected") {
    throw new Error(`${label} has unsupported kind ${kind}.`);
  }
  return {
    kind,
    originNodeId: parseRequiredString(parsed.originNodeId, "originNodeId", label),
    targetNodeId: parseRequiredString(parsed.targetNodeId, "targetNodeId", label),
    providerId: parseRequiredString(parsed.providerId, "providerId", label),
  };
}

function parseSessionControlMessage(
  raw: string,
): RelayBusSessionControlMessage {
  const label = "Relay session control payload";
  const parsed = parseJsonObject(raw, label);
  const kind = parseRequiredString(parsed.kind, "kind", label);
  const originNodeId = parseRequiredString(
    parsed.originNodeId,
    "originNodeId",
    label,
  );
  const sessionId = parseRequiredString(parsed.sessionId, "sessionId", label);

  if (kind === "session_closed") {
    return {
      kind,
      originNodeId,
      sessionId,
      reason: parseRequiredString(parsed.reason, "reason", label),
    };
  }
  if (kind === "app_closed") {
    return {
      kind,
      originNodeId,
      sessionId,
      appId: parseRequiredString(parsed.appId, "appId", label),
      reason: parseRequiredString(parsed.reason, "reason", label),
    };
  }
  if (kind === "app_reconnected") {
    return {
      kind,
      originNodeId,
      sessionId,
      appId: parseRequiredString(parsed.appId, "appId", label),
      targetNodeId: parseRequiredString(
        parsed.targetNodeId,
        "targetNodeId",
        label,
      ),
    };
  }
  throw new Error(`${label} has unsupported kind ${kind}.`);
}

async function compareAndDelete(
  redis: Redis,
  key: string,
  expectedValue: string,
): Promise<void> {
  await redis.eval(
    `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      end
      return 0
    `,
    1,
    key,
    expectedValue,
  );
}

export interface RelayClusterAppBinding {
  sessionId: string;
  appId: string;
  groupMode: boolean;
}

export interface RelayClusterPresenceRefresh {
  providerIds: string[];
  appBindings: RelayClusterAppBinding[];
}

export interface RelayClusterCallbacks {
  onRemoteAppFrame(
    sessionId: string,
    envelope: EncryptedEnvelope,
    targetAppId?: string,
  ): Promise<void> | void;
  onRemoteProviderFrame(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<void> | void;
  onRemoteSessionClosed(
    sessionId: string,
    reason: string,
  ): Promise<void> | void;
  onRemoteAppClosed(
    sessionId: string,
    appId: string,
    reason: string,
  ): Promise<void> | void;
  onRemoteAppReconnected(
    sessionId: string,
    appId: string,
  ): Promise<void> | void;
  onRemoteProviderReconnected(providerId: string): Promise<void> | void;
}

export interface RelayClusterClient {
  readonly persistent: boolean;
  claimProvider(
    providerId: string,
  ): Promise<{ previousNodeId?: string }>;
  releaseProvider(providerId: string): Promise<void>;
  claimApp(
    binding: RelayClusterAppBinding,
  ): Promise<{ previousNodeId?: string }>;
  releaseApp(binding: RelayClusterAppBinding): Promise<void>;
  refreshPresence(params: RelayClusterPresenceRefresh): Promise<void>;
  subscribeProvider(providerId: string, sessionId: string): Promise<void>;
  unsubscribeProvider(providerId: string, sessionId: string): Promise<void>;
  subscribeApp(sessionId: string, appId: string): Promise<void>;
  unsubscribeApp(sessionId: string, appId: string): Promise<void>;
  publishFrameToApp(
    sessionId: string,
    envelope: EncryptedEnvelope,
    targetAppId?: string,
  ): Promise<number>;
  publishFrameToProvider(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<number>;
  publishSessionClosed(sessionId: string, reason: string): Promise<void>;
  publishAppClosed(sessionId: string, appId: string, reason: string): Promise<void>;
  publishAppReconnected(
    sessionId: string,
    appId: string,
    targetNodeId: string,
  ): Promise<void>;
  publishProviderReconnected(
    providerId: string,
    targetNodeId: string,
  ): Promise<void>;
  hasProviderSessionSubscriber(sessionId: string): Promise<boolean>;
  hasAppBinding(sessionId: string, appId: string): Promise<boolean>;
  close(): Promise<void>;
}

export class RelayClaimConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayClaimConflictError";
  }
}

abstract class BaseRelayClusterClient implements RelayClusterClient {
  readonly persistent = true;
  private readonly channelRefs = new Map<string, number>();

  protected constructor(
    protected readonly nodeId: string,
    protected readonly callbacks: RelayClusterCallbacks,
  ) {}

  async subscribeProvider(
    providerId: string,
    sessionId: string,
  ): Promise<void> {
    await this.retainChannel(providerChannel(sessionId));
    await this.retainChannel(sessionControlChannel(sessionId));
    await this.retainChannel(providerControlChannel(providerId));
  }

  async unsubscribeProvider(
    providerId: string,
    sessionId: string,
  ): Promise<void> {
    await this.releaseChannel(providerChannel(sessionId));
    await this.releaseChannel(sessionControlChannel(sessionId));
    await this.releaseChannel(providerControlChannel(providerId));
  }

  async subscribeApp(sessionId: string, appId: string): Promise<void> {
    await this.retainChannel(appBroadcastChannel(sessionId));
    await this.retainChannel(appTargetChannel(sessionId, appId));
    await this.retainChannel(sessionControlChannel(sessionId));
  }

  async unsubscribeApp(sessionId: string, appId: string): Promise<void> {
    await this.releaseChannel(appBroadcastChannel(sessionId));
    await this.releaseChannel(appTargetChannel(sessionId, appId));
    await this.releaseChannel(sessionControlChannel(sessionId));
  }

  async publishFrameToApp(
    sessionId: string,
    envelope: EncryptedEnvelope,
    targetAppId?: string,
  ): Promise<number> {
    return this.publish(
      targetAppId
        ? appTargetChannel(sessionId, targetAppId)
        : appBroadcastChannel(sessionId),
      JSON.stringify({
        originNodeId: this.nodeId,
        sessionId,
        envelope,
      } satisfies RelayBusFrameMessage),
    );
  }

  async publishFrameToProvider(
    sessionId: string,
    envelope: EncryptedEnvelope,
  ): Promise<number> {
    return this.publish(
      providerChannel(sessionId),
      JSON.stringify({
        originNodeId: this.nodeId,
        sessionId,
        envelope,
      } satisfies RelayBusFrameMessage),
    );
  }

  async publishSessionClosed(sessionId: string, reason: string): Promise<void> {
    await this.publish(
      sessionControlChannel(sessionId),
      JSON.stringify({
        kind: "session_closed",
        originNodeId: this.nodeId,
        sessionId,
        reason,
      } satisfies RelayBusSessionClosedMessage),
    );
  }

  async publishAppClosed(
    sessionId: string,
    appId: string,
    reason: string,
  ): Promise<void> {
    await this.publish(
      sessionControlChannel(sessionId),
      JSON.stringify({
        kind: "app_closed",
        originNodeId: this.nodeId,
        sessionId,
        appId,
        reason,
      } satisfies RelayBusAppClosedMessage),
    );
  }

  async publishAppReconnected(
    sessionId: string,
    appId: string,
    targetNodeId: string,
  ): Promise<void> {
    await this.publish(
      sessionControlChannel(sessionId),
      JSON.stringify({
        kind: "app_reconnected",
        originNodeId: this.nodeId,
        targetNodeId,
        sessionId,
        appId,
      } satisfies RelayBusAppReconnectMessage),
    );
  }

  async publishProviderReconnected(
    providerId: string,
    targetNodeId: string,
  ): Promise<void> {
    await this.publish(
      providerControlChannel(providerId),
      JSON.stringify({
        kind: "provider_reconnected",
        originNodeId: this.nodeId,
        targetNodeId,
        providerId,
      } satisfies RelayBusProviderReconnectMessage),
    );
  }

  protected async handleChannelMessage(
    channel: string,
    payload: string,
  ): Promise<void> {
    if (channel.startsWith(`${BUS_PREFIX}:provider:`)) {
      const providerMatch = channel.match(
        /^privateclaw:bus:v1:provider:([^:]+):control$/,
      );
      if (!providerMatch) {
        return;
      }
      const message = parseProviderReconnectMessage(payload);
      if (
        message.originNodeId === this.nodeId ||
        message.targetNodeId !== this.nodeId
      ) {
        return;
      }
      await this.callbacks.onRemoteProviderReconnected(message.providerId);
      return;
    }

    const broadcastMatch = channel.match(
      /^privateclaw:bus:v1:session:([^:]+):app:broadcast$/,
    );
    if (broadcastMatch) {
      const message = parseFrameMessage(payload, "Relay app broadcast payload");
      if (message.originNodeId === this.nodeId) {
        return;
      }
      await this.callbacks.onRemoteAppFrame(message.sessionId, message.envelope);
      return;
    }

    const targetedAppMatch = channel.match(
      /^privateclaw:bus:v1:session:([^:]+):app:([^:]+)$/,
    );
    if (targetedAppMatch) {
      const message = parseFrameMessage(payload, "Relay targeted app payload");
      if (message.originNodeId === this.nodeId) {
        return;
      }
      await this.callbacks.onRemoteAppFrame(
        message.sessionId,
        message.envelope,
        targetedAppMatch[2],
      );
      return;
    }

    const providerFrameMatch = channel.match(
      /^privateclaw:bus:v1:session:([^:]+):provider$/,
    );
    if (providerFrameMatch) {
      const message = parseFrameMessage(payload, "Relay provider frame payload");
      if (message.originNodeId === this.nodeId) {
        return;
      }
      await this.callbacks.onRemoteProviderFrame(
        message.sessionId,
        message.envelope,
      );
      return;
    }

    const controlMatch = channel.match(
      /^privateclaw:bus:v1:session:([^:]+):control$/,
    );
    if (!controlMatch) {
      return;
    }

    const message = parseSessionControlMessage(payload);
    if (message.originNodeId === this.nodeId) {
      return;
    }
    if (message.kind === "session_closed") {
      await this.callbacks.onRemoteSessionClosed(message.sessionId, message.reason);
      return;
    }
    if (message.kind === "app_closed") {
      await this.callbacks.onRemoteAppClosed(
        message.sessionId,
        message.appId,
        message.reason,
      );
      return;
    }
    if (message.targetNodeId !== this.nodeId) {
      return;
    }
    await this.callbacks.onRemoteAppReconnected(message.sessionId, message.appId);
  }

  private async retainChannel(channel: string): Promise<void> {
    const current = this.channelRefs.get(channel) ?? 0;
    this.channelRefs.set(channel, current + 1);
    if (current > 0) {
      return;
    }
    await this.subscribeChannel(channel);
  }

  private async releaseChannel(channel: string): Promise<void> {
    const current = this.channelRefs.get(channel);
    if (!current) {
      return;
    }
    if (current > 1) {
      this.channelRefs.set(channel, current - 1);
      return;
    }
    this.channelRefs.delete(channel);
    await this.unsubscribeChannel(channel);
  }

  protected abstract subscribeChannel(channel: string): Promise<void>;
  protected abstract unsubscribeChannel(channel: string): Promise<void>;
  protected abstract publish(channel: string, payload: string): Promise<number>;
  abstract hasProviderSessionSubscriber(sessionId: string): Promise<boolean>;
  abstract hasAppBinding(sessionId: string, appId: string): Promise<boolean>;

  abstract claimProvider(
    providerId: string,
  ): Promise<{ previousNodeId?: string }>;
  abstract releaseProvider(providerId: string): Promise<void>;
  abstract claimApp(
    binding: RelayClusterAppBinding,
  ): Promise<{ previousNodeId?: string }>;
  abstract releaseApp(binding: RelayClusterAppBinding): Promise<void>;
  abstract refreshPresence(params: RelayClusterPresenceRefresh): Promise<void>;
  abstract close(): Promise<void>;
}

interface InMemoryRelayClusterSharedState {
  channelSubscribers: Map<string, Set<InMemoryRelayClusterClient>>;
  providerPresence: Map<string, string>;
  appPresence: Map<string, string>;
  singleSessionOccupants: Map<string, string>;
}

export function createInMemoryRelayClusterSharedState(): InMemoryRelayClusterSharedState {
  return {
    channelSubscribers: new Map<string, Set<InMemoryRelayClusterClient>>(),
    providerPresence: new Map<string, string>(),
    appPresence: new Map<string, string>(),
    singleSessionOccupants: new Map<string, string>(),
  };
}

export class InMemoryRelayClusterClient extends BaseRelayClusterClient {
  constructor(
    private readonly shared: InMemoryRelayClusterSharedState,
    params: { nodeId: string; callbacks: RelayClusterCallbacks },
  ) {
    super(params.nodeId, params.callbacks);
  }

  async claimProvider(
    providerId: string,
  ): Promise<{ previousNodeId?: string }> {
    const previousNodeId = this.shared.providerPresence.get(providerId);
    this.shared.providerPresence.set(providerId, this.nodeId);
    return previousNodeId && previousNodeId !== this.nodeId
      ? { previousNodeId }
      : {};
  }

  async releaseProvider(providerId: string): Promise<void> {
    if (this.shared.providerPresence.get(providerId) === this.nodeId) {
      this.shared.providerPresence.delete(providerId);
    }
  }

  async claimApp(
    binding: RelayClusterAppBinding,
  ): Promise<{ previousNodeId?: string }> {
    if (!binding.groupMode) {
      const currentOccupant = this.shared.singleSessionOccupants.get(binding.sessionId);
      if (currentOccupant) {
        const current = parseOccupant(currentOccupant);
        if (current.appId !== binding.appId) {
          throw new RelayClaimConflictError(
            "This PrivateClaw session is already attached to another app.",
          );
        }
      }
      this.shared.singleSessionOccupants.set(
        binding.sessionId,
        occupantValue(this.nodeId, binding.appId),
      );
    }

    const key = `${binding.sessionId}:${binding.appId}`;
    const previousNodeId = this.shared.appPresence.get(key);
    this.shared.appPresence.set(key, this.nodeId);
    return previousNodeId && previousNodeId !== this.nodeId
      ? { previousNodeId }
      : {};
  }

  async releaseApp(binding: RelayClusterAppBinding): Promise<void> {
    const key = `${binding.sessionId}:${binding.appId}`;
    if (this.shared.appPresence.get(key) === this.nodeId) {
      this.shared.appPresence.delete(key);
    }
    if (!binding.groupMode) {
      const currentOccupant = this.shared.singleSessionOccupants.get(binding.sessionId);
      if (currentOccupant === occupantValue(this.nodeId, binding.appId)) {
        this.shared.singleSessionOccupants.delete(binding.sessionId);
      }
    }
  }

  async refreshPresence(params: RelayClusterPresenceRefresh): Promise<void> {
    for (const providerId of params.providerIds) {
      this.shared.providerPresence.set(providerId, this.nodeId);
    }
    for (const binding of params.appBindings) {
      this.shared.appPresence.set(`${binding.sessionId}:${binding.appId}`, this.nodeId);
      if (!binding.groupMode) {
        this.shared.singleSessionOccupants.set(
          binding.sessionId,
          occupantValue(this.nodeId, binding.appId),
        );
      }
    }
  }

  protected async subscribeChannel(channel: string): Promise<void> {
    const subscribers =
      this.shared.channelSubscribers.get(channel) ??
      new Set<InMemoryRelayClusterClient>();
    subscribers.add(this);
    this.shared.channelSubscribers.set(channel, subscribers);
  }

  protected async unsubscribeChannel(channel: string): Promise<void> {
    const subscribers = this.shared.channelSubscribers.get(channel);
    if (!subscribers) {
      return;
    }
    subscribers.delete(this);
    if (subscribers.size === 0) {
      this.shared.channelSubscribers.delete(channel);
    }
  }

  protected async publish(channel: string, payload: string): Promise<number> {
    const subscribers = [...(this.shared.channelSubscribers.get(channel) ?? [])];
    await Promise.all(
      subscribers.map((subscriber) =>
        subscriber.handleChannelMessage(channel, payload),
      ),
    );
    return subscribers.length;
  }

  async close(): Promise<void> {
    for (const [channel, subscribers] of this.shared.channelSubscribers.entries()) {
      if (!subscribers.delete(this)) {
        continue;
      }
      if (subscribers.size === 0) {
        this.shared.channelSubscribers.delete(channel);
      }
    }
  }

  async hasAppBinding(sessionId: string, appId: string): Promise<boolean> {
    return this.shared.appPresence.has(`${sessionId}:${appId}`);
  }

  async hasProviderSessionSubscriber(sessionId: string): Promise<boolean> {
    return (this.shared.channelSubscribers.get(providerChannel(sessionId))?.size ?? 0) > 0;
  }
}

export class RedisRelayClusterClient extends BaseRelayClusterClient {
  private readonly redis: Redis;
  private readonly subscriber: Redis;

  constructor(
    redisUrl: string,
    params: { nodeId: string; callbacks: RelayClusterCallbacks },
  ) {
    super(params.nodeId, params.callbacks);
    this.redis = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
    this.subscriber = this.redis.duplicate({
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
    this.redis.on("error", (error) => {
      console.error("[privateclaw-relay] relay cluster Redis error", error);
    });
    this.subscriber.on("error", (error) => {
      console.error("[privateclaw-relay] relay cluster subscriber error", error);
    });
    this.subscriber.on("message", (channel, payload) => {
      void this.handleChannelMessage(channel, payload).catch((error) => {
        console.error("[privateclaw-relay] failed to process cluster message", error);
      });
    });
  }

  async claimProvider(
    providerId: string,
  ): Promise<{ previousNodeId?: string }> {
    const key = providerPresenceKey(providerId);
    const previousNodeId = await this.redis.get(key);
    await this.redis.set(key, this.nodeId, "PX", LEASE_MS);
    return previousNodeId && previousNodeId !== this.nodeId
      ? { previousNodeId }
      : {};
  }

  async releaseProvider(providerId: string): Promise<void> {
    await compareAndDelete(
      this.redis,
      providerPresenceKey(providerId),
      this.nodeId,
    );
  }

  async claimApp(
    binding: RelayClusterAppBinding,
  ): Promise<{ previousNodeId?: string }> {
    const presenceKey = appPresenceKey(binding.sessionId, binding.appId);
    const previousNodeId = await this.redis.get(presenceKey);
    if (!binding.groupMode) {
      const occupancyKey = occupantKey(binding.sessionId);
      const expectedOccupantValue = occupantValue(this.nodeId, binding.appId);
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const created = await this.redis.set(
          occupancyKey,
          expectedOccupantValue,
          "PX",
          LEASE_MS,
          "NX",
        );
        if (created !== null) {
          break;
        }

        const currentOccupant = await this.redis.get(occupancyKey);
        if (!currentOccupant) {
          continue;
        }
        const parsed = parseOccupant(currentOccupant);
        if (parsed.appId !== binding.appId) {
          throw new RelayClaimConflictError(
            "This PrivateClaw session is already attached to another app.",
          );
        }
        await this.redis.set(
          occupancyKey,
          expectedOccupantValue,
          "PX",
          LEASE_MS,
          "XX",
        );
        break;
      }
    }

    await this.redis.set(presenceKey, this.nodeId, "PX", LEASE_MS);
    return previousNodeId && previousNodeId !== this.nodeId
      ? { previousNodeId }
      : {};
  }

  async releaseApp(binding: RelayClusterAppBinding): Promise<void> {
    await compareAndDelete(
      this.redis,
      appPresenceKey(binding.sessionId, binding.appId),
      this.nodeId,
    );
    if (!binding.groupMode) {
      await compareAndDelete(
        this.redis,
        occupantKey(binding.sessionId),
        occupantValue(this.nodeId, binding.appId),
      );
    }
  }

  async refreshPresence(params: RelayClusterPresenceRefresh): Promise<void> {
    const pipeline = this.redis.multi();
    for (const providerId of params.providerIds) {
      pipeline.set(providerPresenceKey(providerId), this.nodeId, "PX", LEASE_MS);
    }
    for (const binding of params.appBindings) {
      pipeline.set(
        appPresenceKey(binding.sessionId, binding.appId),
        this.nodeId,
        "PX",
        LEASE_MS,
      );
      if (!binding.groupMode) {
        pipeline.set(
          occupantKey(binding.sessionId),
          occupantValue(this.nodeId, binding.appId),
          "PX",
          LEASE_MS,
        );
      }
    }
    await pipeline.exec();
  }

  protected async subscribeChannel(channel: string): Promise<void> {
    await this.subscriber.subscribe(channel);
  }

  protected async unsubscribeChannel(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
  }

  protected async publish(channel: string, payload: string): Promise<number> {
    return this.redis.publish(channel, payload);
  }

  async close(): Promise<void> {
    await this.subscriber.quit();
    await this.redis.quit();
  }

  async hasAppBinding(sessionId: string, appId: string): Promise<boolean> {
    return (await this.redis.exists(appPresenceKey(sessionId, appId))) === 1;
  }

  async hasProviderSessionSubscriber(sessionId: string): Promise<boolean> {
    const result = await this.redis.call(
      "PUBSUB",
      "NUMSUB",
      providerChannel(sessionId),
    );
    if (!Array.isArray(result)) {
      return false;
    }
    const subscriberCount = Number.parseInt(String(result[1] ?? "0"), 10);
    return Number.isFinite(subscriberCount) && subscriberCount > 0;
  }
}

export function createRedisRelayClusterClient(params: {
  redisUrl: string;
  nodeId: string;
  callbacks: RelayClusterCallbacks;
}): RelayClusterClient {
  return new RedisRelayClusterClient(params.redisUrl, {
    nodeId: params.nodeId,
    callbacks: params.callbacks,
  });
}

export function createInMemoryRelayClusterClient(params: {
  shared: InMemoryRelayClusterSharedState;
  nodeId: string;
  callbacks: RelayClusterCallbacks;
}): RelayClusterClient {
  return new InMemoryRelayClusterClient(params.shared, {
    nodeId: params.nodeId,
    callbacks: params.callbacks,
  });
}
