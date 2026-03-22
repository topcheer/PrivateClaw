import { Redis } from "ioredis";
import type { RelaySessionRecord } from "./session-store.js";

const ADMIN_PREFIX = "privateclaw:admin:v1";
const SESSION_INDEX_KEY = `${ADMIN_PREFIX}:sessions:index`;
const INSTANCE_INDEX_KEY = `${ADMIN_PREFIX}:instances:index`;
const GLOBAL_STATS_KEY = `${ADMIN_PREFIX}:stats:global`;
const ERROR_CODE_COUNTS_KEY = `${ADMIN_PREFIX}:stats:error-codes`;
const REQUEST_TYPE_COUNTS_KEY_PREFIX = `${ADMIN_PREFIX}:stats:request-types`;
const INSTANCE_TTL_MS = 60_000;

export type RelayAdminSessionStatus = "active" | "closed" | "expired";
export type RelayAdminRequestActor = "app" | "provider";

export interface RelayAdminRequestTypeCount {
  actor: RelayAdminRequestActor;
  type: string;
  ok: number;
  error: number;
}

export interface RelayAdminErrorCodeCount {
  code: string;
  count: number;
}

export interface RelayAdminRequestStats {
  appRequests: number;
  providerRequests: number;
  appSuccesses: number;
  providerSuccesses: number;
  appErrors: number;
  providerErrors: number;
  appFrames: number;
  providerFrames: number;
  errorCodes: RelayAdminErrorCodeCount[];
  requestTypes: RelayAdminRequestTypeCount[];
}

export interface RelayAdminOverviewTotals {
  sessions: number;
  activeSessions: number;
  closedSessions: number;
  expiredSessions: number;
  knownParticipants: number;
  activeParticipants: number;
  instances: number;
}

export interface RelayAdminOverview {
  generatedAt: number;
  totals: RelayAdminOverviewTotals;
  requestStats: RelayAdminRequestStats;
}

export interface RelayAdminSessionSummary {
  sessionId: string;
  providerId: string;
  groupMode: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  closedAt?: number;
  closeReason?: string;
  status: RelayAdminSessionStatus;
  appMessageCount: number;
  providerMessageCount: number;
  distinctParticipantCount: number;
  activeParticipantCount: number;
  providerOnline: boolean;
  lastAppMessageAt?: number;
  lastProviderMessageAt?: number;
}

export interface RelayAdminSessionParticipant {
  appId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastDisconnectReason?: string;
  connectionCount: number;
  messageCount: number;
  totalConnectedMs: number;
  currentConnectedMs: number;
  isOnline: boolean;
}

export interface RelayAdminSessionDetail {
  session: RelayAdminSessionSummary;
  participants: RelayAdminSessionParticipant[];
}

export interface RelayAdminSessionListOptions {
  status?: RelayAdminSessionStatus | "all";
  page?: number;
  pageSize?: number;
  query?: string;
  now?: number;
}

export interface RelayAdminSessionListResult {
  total: number;
  page: number;
  pageSize: number;
  sessions: RelayAdminSessionSummary[];
}

export interface RelayAdminInstanceBinding {
  sessionId: string;
  appId: string;
}

export interface RelayAdminInstanceStatus {
  instanceId: string;
  startedAt: number;
  lastSeenAt: number;
  activeProviders: number;
  activeApps: number;
  localSessions: number;
  providerIds: string[];
  sessionIds: string[];
  participantBindings: RelayAdminInstanceBinding[];
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
}

export interface RelayAdminLocalSnapshot {
  activeProviders: number;
  activeApps: number;
  localSessions: number;
  providerIds: string[];
  sessionIds: string[];
  participantBindings: RelayAdminInstanceBinding[];
  memoryUsage: NodeJS.MemoryUsage;
}

export interface RelayAdminInstanceHeartbeat {
  instanceId: string;
  startedAt: number;
  recordedAt: number;
  snapshot: RelayAdminLocalSnapshot;
}

export interface RelayAdminMetricsStore {
  readonly persistent: boolean;
  recordSessionCreated(session: RelaySessionRecord, recordedAt: number): Promise<void>;
  recordSessionRenewed(session: RelaySessionRecord, recordedAt: number): Promise<void>;
  recordSessionClosed(sessionId: string, reason: string, recordedAt: number): Promise<void>;
  recordAppAttached(session: RelaySessionRecord, appId: string, recordedAt: number): Promise<void>;
  recordAppDetached(
    sessionId: string,
    appId: string,
    recordedAt: number,
    reason: string,
  ): Promise<void>;
  recordAppFrame(sessionId: string, appId: string, recordedAt: number): Promise<void>;
  recordProviderFrame(sessionId: string, recordedAt: number): Promise<void>;
  recordRequest(params: {
    actor: RelayAdminRequestActor;
    type: string;
    ok: boolean;
    errorCode?: string;
  }): Promise<void>;
  recordInstanceHeartbeat(heartbeat: RelayAdminInstanceHeartbeat): Promise<void>;
  unregisterInstance(instanceId: string): Promise<void>;
  listSessions(options?: RelayAdminSessionListOptions): Promise<RelayAdminSessionListResult>;
  getSessionDetail(
    sessionId: string,
    now?: number,
  ): Promise<RelayAdminSessionDetail | undefined>;
  getOverview(now?: number): Promise<RelayAdminOverview>;
  listInstances(now?: number): Promise<RelayAdminInstanceStatus[]>;
  close(): Promise<void>;
}

interface MutableRelayAdminSessionRecord {
  sessionId: string;
  providerId: string;
  groupMode: boolean;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  closedAt?: number;
  closeReason?: string;
  appMessageCount: number;
  providerMessageCount: number;
  distinctParticipantCount: number;
  lastAppMessageAt?: number;
  lastProviderMessageAt?: number;
}

interface MutableRelayAdminParticipantRecord {
  appId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastConnectedAt?: number;
  lastDisconnectedAt?: number;
  lastDisconnectReason?: string;
  connectionCount: number;
  messageCount: number;
  totalConnectedMs: number;
}

interface RelayAdminLiveState {
  providerIds: Set<string>;
  participantKeys: Set<string>;
  activeParticipantCountBySession: Map<string, number>;
}

function sessionKey(sessionId: string): string {
  return `${ADMIN_PREFIX}:session:${sessionId}`;
}

function sessionParticipantsKey(sessionId: string): string {
  return `${ADMIN_PREFIX}:session:${sessionId}:participants`;
}

function sessionParticipantKey(sessionId: string, appId: string): string {
  return `${ADMIN_PREFIX}:session:${sessionId}:participant:${appId}`;
}

function instanceKey(instanceId: string): string {
  return `${ADMIN_PREFIX}:instance:${instanceId}`;
}

function requestTypeCountsKey(actor: RelayAdminRequestActor): string {
  return `${REQUEST_TYPE_COUNTS_KEY_PREFIX}:${actor}`;
}

function parseInteger(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBooleanFlag(value: string | undefined): boolean {
  return value === "1";
}

function normalizeSessionStatus(
  session: Pick<
    MutableRelayAdminSessionRecord,
    "expiresAt" | "closedAt"
  >,
  now: number,
): RelayAdminSessionStatus {
  if (typeof session.closedAt === "number") {
    return "closed";
  }
  if (session.expiresAt <= now) {
    return "expired";
  }
  return "active";
}

function dedupeStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim() !== ""))].sort();
}

function dedupeBindings(
  bindings: readonly RelayAdminInstanceBinding[],
): RelayAdminInstanceBinding[] {
  const seen = new Set<string>();
  const normalized: RelayAdminInstanceBinding[] = [];
  for (const binding of bindings) {
    const sessionId = binding.sessionId.trim();
    const appId = binding.appId.trim();
    if (!sessionId || !appId) {
      continue;
    }
    const key = `${sessionId}:${appId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push({ sessionId, appId });
  }
  normalized.sort(
    (left, right) =>
      left.sessionId.localeCompare(right.sessionId) || left.appId.localeCompare(right.appId),
  );
  return normalized;
}

function toSerializableMemoryUsage(
  usage: NodeJS.MemoryUsage,
): RelayAdminInstanceStatus["memoryUsage"] {
  return {
    rss: usage.rss,
    heapTotal: usage.heapTotal,
    heapUsed: usage.heapUsed,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers,
  };
}

function createEmptyRequestStats(): RelayAdminRequestStats {
  return {
    appRequests: 0,
    providerRequests: 0,
    appSuccesses: 0,
    providerSuccesses: 0,
    appErrors: 0,
    providerErrors: 0,
    appFrames: 0,
    providerFrames: 0,
    errorCodes: [],
    requestTypes: [],
  };
}

function createLiveState(instances: readonly RelayAdminInstanceStatus[]): RelayAdminLiveState {
  const providerIds = new Set<string>();
  const participantKeys = new Set<string>();
  const activeParticipantCountBySession = new Map<string, number>();

  for (const instance of instances) {
    for (const providerId of instance.providerIds) {
      providerIds.add(providerId);
    }
    for (const binding of instance.participantBindings) {
      const key = `${binding.sessionId}:${binding.appId}`;
      if (participantKeys.has(key)) {
        continue;
      }
      participantKeys.add(key);
      activeParticipantCountBySession.set(
        binding.sessionId,
        (activeParticipantCountBySession.get(binding.sessionId) ?? 0) + 1,
      );
    }
  }

  return {
    providerIds,
    participantKeys,
    activeParticipantCountBySession,
  };
}

function toSessionSummary(params: {
  session: MutableRelayAdminSessionRecord;
  liveState: RelayAdminLiveState;
  now: number;
}): RelayAdminSessionSummary {
  const { session, liveState, now } = params;
  return {
    sessionId: session.sessionId,
    providerId: session.providerId,
    groupMode: session.groupMode,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ...(typeof session.closedAt === "number" ? { closedAt: session.closedAt } : {}),
    ...(session.closeReason ? { closeReason: session.closeReason } : {}),
    status: normalizeSessionStatus(session, now),
    appMessageCount: session.appMessageCount,
    providerMessageCount: session.providerMessageCount,
    distinctParticipantCount: session.distinctParticipantCount,
    activeParticipantCount:
      liveState.activeParticipantCountBySession.get(session.sessionId) ?? 0,
    providerOnline: liveState.providerIds.has(session.providerId),
    ...(typeof session.lastAppMessageAt === "number"
      ? { lastAppMessageAt: session.lastAppMessageAt }
      : {}),
    ...(typeof session.lastProviderMessageAt === "number"
      ? { lastProviderMessageAt: session.lastProviderMessageAt }
      : {}),
  };
}

function toParticipantSummary(params: {
  sessionId: string;
  participant: MutableRelayAdminParticipantRecord;
  liveState: RelayAdminLiveState;
  now: number;
}): RelayAdminSessionParticipant {
  const { sessionId, participant, liveState, now } = params;
  const participantKeyValue = `${sessionId}:${participant.appId}`;
  const isOnline = liveState.participantKeys.has(participantKeyValue);
  const currentlyConnectedSince = participant.lastConnectedAt;
  const disconnectedAt = participant.lastDisconnectedAt;
  let currentConnectedMs = participant.totalConnectedMs;

  if (typeof currentlyConnectedSince === "number") {
    if (isOnline) {
      currentConnectedMs += Math.max(now - currentlyConnectedSince, 0);
    } else if (
      typeof disconnectedAt !== "number" ||
      disconnectedAt < currentlyConnectedSince
    ) {
      currentConnectedMs += Math.max(
        Math.max(participant.lastSeenAt, currentlyConnectedSince) - currentlyConnectedSince,
        0,
      );
    }
  }

  return {
    appId: participant.appId,
    firstSeenAt: participant.firstSeenAt,
    lastSeenAt: participant.lastSeenAt,
    ...(typeof participant.lastConnectedAt === "number"
      ? { lastConnectedAt: participant.lastConnectedAt }
      : {}),
    ...(typeof participant.lastDisconnectedAt === "number"
      ? { lastDisconnectedAt: participant.lastDisconnectedAt }
      : {}),
    ...(participant.lastDisconnectReason
      ? { lastDisconnectReason: participant.lastDisconnectReason }
      : {}),
    connectionCount: participant.connectionCount,
    messageCount: participant.messageCount,
    totalConnectedMs: participant.totalConnectedMs,
    currentConnectedMs,
    isOnline,
  };
}

function sortParticipants(
  left: RelayAdminSessionParticipant,
  right: RelayAdminSessionParticipant,
): number {
  if (left.isOnline !== right.isOnline) {
    return left.isOnline ? -1 : 1;
  }
  return right.lastSeenAt - left.lastSeenAt || left.appId.localeCompare(right.appId);
}

function normalizePage(page: number | undefined): number {
  return Number.isInteger(page) && page && page > 0 ? page : 1;
}

function normalizePageSize(pageSize: number | undefined): number {
  if (!Number.isInteger(pageSize) || !pageSize || pageSize <= 0) {
    return 50;
  }
  return Math.min(pageSize, 200);
}

function matchesSessionQuery(
  session: RelayAdminSessionSummary,
  query: string | undefined,
): boolean {
  if (!query) {
    return true;
  }
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return (
    session.sessionId.toLowerCase().includes(normalizedQuery) ||
    session.providerId.toLowerCase().includes(normalizedQuery)
  );
}

function collectOverviewTotals(
  sessions: readonly RelayAdminSessionSummary[],
  instances: readonly RelayAdminInstanceStatus[],
): RelayAdminOverviewTotals {
  let activeSessions = 0;
  let closedSessions = 0;
  let expiredSessions = 0;
  let knownParticipants = 0;
  let activeParticipants = 0;

  for (const session of sessions) {
    if (session.status === "active") {
      activeSessions += 1;
    } else if (session.status === "closed") {
      closedSessions += 1;
    } else {
      expiredSessions += 1;
    }
    knownParticipants += session.distinctParticipantCount;
    activeParticipants += session.activeParticipantCount;
  }

  return {
    sessions: sessions.length,
    activeSessions,
    closedSessions,
    expiredSessions,
    knownParticipants,
    activeParticipants,
    instances: instances.length,
  };
}

function decodeRequestTypeCounts(
  actor: RelayAdminRequestActor,
  raw: Record<string, string>,
): RelayAdminRequestTypeCount[] {
  const counts = new Map<string, RelayAdminRequestTypeCount>();
  for (const [field, value] of Object.entries(raw)) {
    const separatorIndex = field.lastIndexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const type = field.slice(0, separatorIndex);
    const status = field.slice(separatorIndex + 1);
    const entry = counts.get(type) ?? { actor, type, ok: 0, error: 0 };
    if (status === "ok") {
      entry.ok = parseInteger(value);
    } else if (status === "error") {
      entry.error = parseInteger(value);
    }
    counts.set(type, entry);
  }
  return [...counts.values()].sort(
    (left, right) =>
      right.ok + right.error - (left.ok + left.error) || left.type.localeCompare(right.type),
  );
}

function decodeErrorCodeCounts(raw: Record<string, string>): RelayAdminErrorCodeCount[] {
  return Object.entries(raw)
    .map(([code, value]) => ({ code, count: parseInteger(value) }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function decodeSessionHash(
  sessionId: string,
  hash: Record<string, string>,
): MutableRelayAdminSessionRecord | undefined {
  if (Object.keys(hash).length === 0) {
    return undefined;
  }
  return {
    sessionId,
    providerId: hash.providerId ?? "unknown-provider",
    groupMode: parseBooleanFlag(hash.groupMode),
    createdAt: parseInteger(hash.createdAt),
    updatedAt: parseInteger(hash.updatedAt),
    expiresAt: parseInteger(hash.expiresAt),
    ...(hash.closedAt ? { closedAt: parseInteger(hash.closedAt) } : {}),
    ...(hash.closeReason ? { closeReason: hash.closeReason } : {}),
    appMessageCount: parseInteger(hash.appMessageCount),
    providerMessageCount: parseInteger(hash.providerMessageCount),
    distinctParticipantCount: parseInteger(hash.distinctParticipantCount),
    ...(hash.lastAppMessageAt
      ? { lastAppMessageAt: parseInteger(hash.lastAppMessageAt) }
      : {}),
    ...(hash.lastProviderMessageAt
      ? { lastProviderMessageAt: parseInteger(hash.lastProviderMessageAt) }
      : {}),
  };
}

function decodeParticipantHash(
  appId: string,
  hash: Record<string, string>,
): MutableRelayAdminParticipantRecord | undefined {
  if (Object.keys(hash).length === 0) {
    return undefined;
  }
  return {
    appId,
    firstSeenAt: parseInteger(hash.firstSeenAt),
    lastSeenAt: parseInteger(hash.lastSeenAt),
    ...(hash.lastConnectedAt
      ? { lastConnectedAt: parseInteger(hash.lastConnectedAt) }
      : {}),
    ...(hash.lastDisconnectedAt
      ? { lastDisconnectedAt: parseInteger(hash.lastDisconnectedAt) }
      : {}),
    ...(hash.lastDisconnectReason
      ? { lastDisconnectReason: hash.lastDisconnectReason }
      : {}),
    connectionCount: parseInteger(hash.connectionCount),
    messageCount: parseInteger(hash.messageCount),
    totalConnectedMs: parseInteger(hash.totalConnectedMs),
  };
}

function decodeInstanceHash(
  instanceId: string,
  hash: Record<string, string>,
): RelayAdminInstanceStatus | undefined {
  if (Object.keys(hash).length === 0) {
    return undefined;
  }
  return {
    instanceId,
    startedAt: parseInteger(hash.startedAt),
    lastSeenAt: parseInteger(hash.lastSeenAt),
    activeProviders: parseInteger(hash.activeProviders),
    activeApps: parseInteger(hash.activeApps),
    localSessions: parseInteger(hash.localSessions),
    providerIds: hash.providerIdsJson
      ? (JSON.parse(hash.providerIdsJson) as string[])
      : [],
    sessionIds: hash.sessionIdsJson
      ? (JSON.parse(hash.sessionIdsJson) as string[])
      : [],
    participantBindings: hash.participantBindingsJson
      ? (JSON.parse(hash.participantBindingsJson) as RelayAdminInstanceBinding[])
      : [],
    memoryUsage: hash.memoryUsageJson
      ? (JSON.parse(hash.memoryUsageJson) as RelayAdminInstanceStatus["memoryUsage"])
      : {
          rss: 0,
          heapTotal: 0,
          heapUsed: 0,
          external: 0,
          arrayBuffers: 0,
        },
  };
}

abstract class BaseRelayAdminMetricsStore implements RelayAdminMetricsStore {
  abstract readonly persistent: boolean;

  protected buildOverview(params: {
    sessions: RelayAdminSessionSummary[];
    instances: RelayAdminInstanceStatus[];
    requestStats: RelayAdminRequestStats;
    generatedAt: number;
  }): RelayAdminOverview {
    return {
      generatedAt: params.generatedAt,
      totals: collectOverviewTotals(params.sessions, params.instances),
      requestStats: params.requestStats,
    };
  }

  abstract recordSessionCreated(session: RelaySessionRecord, recordedAt: number): Promise<void>;
  abstract recordSessionRenewed(session: RelaySessionRecord, recordedAt: number): Promise<void>;
  abstract recordSessionClosed(sessionId: string, reason: string, recordedAt: number): Promise<void>;
  abstract recordAppAttached(
    session: RelaySessionRecord,
    appId: string,
    recordedAt: number,
  ): Promise<void>;
  abstract recordAppDetached(
    sessionId: string,
    appId: string,
    recordedAt: number,
    reason: string,
  ): Promise<void>;
  abstract recordAppFrame(sessionId: string, appId: string, recordedAt: number): Promise<void>;
  abstract recordProviderFrame(sessionId: string, recordedAt: number): Promise<void>;
  abstract recordRequest(params: {
    actor: RelayAdminRequestActor;
    type: string;
    ok: boolean;
    errorCode?: string;
  }): Promise<void>;
  abstract recordInstanceHeartbeat(heartbeat: RelayAdminInstanceHeartbeat): Promise<void>;
  abstract unregisterInstance(instanceId: string): Promise<void>;
  abstract listSessions(options?: RelayAdminSessionListOptions): Promise<RelayAdminSessionListResult>;
  abstract getSessionDetail(
    sessionId: string,
    now?: number,
  ): Promise<RelayAdminSessionDetail | undefined>;
  abstract getOverview(now?: number): Promise<RelayAdminOverview>;
  abstract listInstances(now?: number): Promise<RelayAdminInstanceStatus[]>;
  abstract close(): Promise<void>;
}

export class InMemoryRelayAdminMetricsStore extends BaseRelayAdminMetricsStore {
  readonly persistent = false;

  private readonly sessions = new Map<string, MutableRelayAdminSessionRecord>();
  private readonly participants = new Map<
    string,
    Map<string, MutableRelayAdminParticipantRecord>
  >();
  private readonly instances = new Map<string, RelayAdminInstanceStatus>();
  private readonly errorCodeCounts = new Map<string, number>();
  private readonly requestTypeCounts = {
    app: new Map<string, RelayAdminRequestTypeCount>(),
    provider: new Map<string, RelayAdminRequestTypeCount>(),
  };
  private readonly globalStats = {
    appRequests: 0,
    providerRequests: 0,
    appSuccesses: 0,
    providerSuccesses: 0,
    appErrors: 0,
    providerErrors: 0,
    appFrames: 0,
    providerFrames: 0,
  };

  private ensureSession(
    session: RelaySessionRecord,
    recordedAt: number,
  ): MutableRelayAdminSessionRecord {
    const existing = this.sessions.get(session.sessionId);
    if (existing) {
      existing.providerId = session.providerId;
      existing.groupMode = session.groupMode;
      existing.expiresAt = session.expiresAt;
      existing.updatedAt = Math.max(existing.updatedAt, recordedAt);
      return existing;
    }
    const created: MutableRelayAdminSessionRecord = {
      sessionId: session.sessionId,
      providerId: session.providerId,
      groupMode: session.groupMode,
      createdAt: recordedAt,
      updatedAt: recordedAt,
      expiresAt: session.expiresAt,
      appMessageCount: 0,
      providerMessageCount: 0,
      distinctParticipantCount: 0,
    };
    this.sessions.set(session.sessionId, created);
    return created;
  }

  private ensureParticipant(
    sessionId: string,
    appId: string,
    recordedAt: number,
  ): { participant: MutableRelayAdminParticipantRecord; isNew: boolean } {
    const sessionParticipants =
      this.participants.get(sessionId) ?? new Map<string, MutableRelayAdminParticipantRecord>();
    this.participants.set(sessionId, sessionParticipants);
    const existing = sessionParticipants.get(appId);
    if (existing) {
      return { participant: existing, isNew: false };
    }
    const created: MutableRelayAdminParticipantRecord = {
      appId,
      firstSeenAt: recordedAt,
      lastSeenAt: recordedAt,
      connectionCount: 0,
      messageCount: 0,
      totalConnectedMs: 0,
    };
    sessionParticipants.set(appId, created);
    return { participant: created, isNew: true };
  }

  private activeInstances(now: number): RelayAdminInstanceStatus[] {
    const cutoff = now - INSTANCE_TTL_MS;
    for (const [instanceId, instance] of this.instances.entries()) {
      if (instance.lastSeenAt <= cutoff) {
        this.instances.delete(instanceId);
      }
    }
    return [...this.instances.values()].sort(
      (left, right) => right.lastSeenAt - left.lastSeenAt || left.instanceId.localeCompare(right.instanceId),
    );
  }

  private liveState(now: number): RelayAdminLiveState {
    return createLiveState(this.activeInstances(now));
  }

  private requestStats(): RelayAdminRequestStats {
    return {
      ...this.globalStats,
      errorCodes: [...this.errorCodeCounts.entries()]
        .map(([code, count]) => ({ code, count }))
        .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code)),
      requestTypes: [
        ...this.requestTypeCounts.app.values(),
        ...this.requestTypeCounts.provider.values(),
      ].sort(
        (left, right) =>
          right.ok + right.error - (left.ok + left.error) || left.type.localeCompare(right.type),
      ),
    };
  }

  async recordSessionCreated(session: RelaySessionRecord, recordedAt: number): Promise<void> {
    this.ensureSession(session, recordedAt);
  }

  async recordSessionRenewed(session: RelaySessionRecord, recordedAt: number): Promise<void> {
    this.ensureSession(session, recordedAt);
  }

  async recordSessionClosed(
    sessionId: string,
    reason: string,
    recordedAt: number,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.closedAt = recordedAt;
    session.closeReason = reason;
    session.updatedAt = recordedAt;
  }

  async recordAppAttached(
    session: RelaySessionRecord,
    appId: string,
    recordedAt: number,
  ): Promise<void> {
    const sessionRecord = this.ensureSession(session, recordedAt);
    const { participant, isNew } = this.ensureParticipant(session.sessionId, appId, recordedAt);
    participant.lastSeenAt = recordedAt;
    if (
      typeof participant.lastConnectedAt !== "number" ||
      (typeof participant.lastDisconnectedAt === "number" &&
        participant.lastDisconnectedAt >= participant.lastConnectedAt)
    ) {
      participant.connectionCount += 1;
      participant.lastConnectedAt = recordedAt;
    }
    if (isNew) {
      sessionRecord.distinctParticipantCount += 1;
    }
    sessionRecord.updatedAt = recordedAt;
  }

  async recordAppDetached(
    sessionId: string,
    appId: string,
    recordedAt: number,
    reason: string,
  ): Promise<void> {
    const participant = this.participants.get(sessionId)?.get(appId);
    if (!participant) {
      return;
    }
    if (
      typeof participant.lastConnectedAt === "number" &&
      (typeof participant.lastDisconnectedAt !== "number" ||
        participant.lastDisconnectedAt < participant.lastConnectedAt)
    ) {
      participant.totalConnectedMs += Math.max(
        recordedAt - participant.lastConnectedAt,
        0,
      );
    }
    participant.lastDisconnectedAt = recordedAt;
    participant.lastDisconnectReason = reason;
    participant.lastSeenAt = recordedAt;
    const session = this.sessions.get(sessionId);
    if (session) {
      session.updatedAt = recordedAt;
    }
  }

  async recordAppFrame(sessionId: string, appId: string, recordedAt: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.appMessageCount += 1;
      session.lastAppMessageAt = recordedAt;
      session.updatedAt = recordedAt;
    }
    const participant = this.participants.get(sessionId)?.get(appId);
    if (participant) {
      participant.messageCount += 1;
      participant.lastSeenAt = recordedAt;
    }
    this.globalStats.appFrames += 1;
  }

  async recordProviderFrame(sessionId: string, recordedAt: number): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    session.providerMessageCount += 1;
    session.lastProviderMessageAt = recordedAt;
    session.updatedAt = recordedAt;
    this.globalStats.providerFrames += 1;
  }

  async recordRequest(params: {
    actor: RelayAdminRequestActor;
    type: string;
    ok: boolean;
    errorCode?: string;
  }): Promise<void> {
    const actorStatsField = params.actor === "app" ? "app" : "provider";
    this.globalStats[`${actorStatsField}Requests` as const] += 1;
    if (params.ok) {
      this.globalStats[`${actorStatsField}Successes` as const] += 1;
    } else {
      this.globalStats[`${actorStatsField}Errors` as const] += 1;
      if (params.errorCode) {
        this.errorCodeCounts.set(
          params.errorCode,
          (this.errorCodeCounts.get(params.errorCode) ?? 0) + 1,
        );
      }
    }
    const requestTypeCounts = this.requestTypeCounts[params.actor];
    const entry = requestTypeCounts.get(params.type) ?? {
      actor: params.actor,
      type: params.type,
      ok: 0,
      error: 0,
    };
    if (params.ok) {
      entry.ok += 1;
    } else {
      entry.error += 1;
    }
    requestTypeCounts.set(params.type, entry);
  }

  async recordInstanceHeartbeat(
    heartbeat: RelayAdminInstanceHeartbeat,
  ): Promise<void> {
    for (const binding of heartbeat.snapshot.participantBindings) {
      const participant = this.participants.get(binding.sessionId)?.get(binding.appId);
      if (participant) {
        participant.lastSeenAt = heartbeat.recordedAt;
      }
    }
    this.instances.set(heartbeat.instanceId, {
      instanceId: heartbeat.instanceId,
      startedAt: heartbeat.startedAt,
      lastSeenAt: heartbeat.recordedAt,
      activeProviders: heartbeat.snapshot.activeProviders,
      activeApps: heartbeat.snapshot.activeApps,
      localSessions: heartbeat.snapshot.localSessions,
      providerIds: dedupeStrings(heartbeat.snapshot.providerIds),
      sessionIds: dedupeStrings(heartbeat.snapshot.sessionIds),
      participantBindings: dedupeBindings(heartbeat.snapshot.participantBindings),
      memoryUsage: toSerializableMemoryUsage(heartbeat.snapshot.memoryUsage),
    });
  }

  async unregisterInstance(instanceId: string): Promise<void> {
    this.instances.delete(instanceId);
  }

  async listSessions(
    options: RelayAdminSessionListOptions = {},
  ): Promise<RelayAdminSessionListResult> {
    const now = options.now ?? Date.now();
    const liveState = this.liveState(now);
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const allSessions = [...this.sessions.values()]
      .map((session) => toSessionSummary({ session, liveState, now }))
      .filter((session) =>
        options.status && options.status !== "all"
          ? session.status === options.status
          : true,
      )
      .filter((session) => matchesSessionQuery(session, options.query))
      .sort((left, right) => right.createdAt - left.createdAt || left.sessionId.localeCompare(right.sessionId));
    const startIndex = (page - 1) * pageSize;
    return {
      total: allSessions.length,
      page,
      pageSize,
      sessions: allSessions.slice(startIndex, startIndex + pageSize),
    };
  }

  async getSessionDetail(
    sessionId: string,
    now: number = Date.now(),
  ): Promise<RelayAdminSessionDetail | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    const liveState = this.liveState(now);
    const sessionSummary = toSessionSummary({ session, liveState, now });
    const participants = [
      ...(this.participants.get(sessionId)?.values() ?? []),
    ]
      .map((participant) =>
        toParticipantSummary({
          sessionId,
          participant,
          liveState,
          now,
        }),
      )
      .sort(sortParticipants);
    return {
      session: sessionSummary,
      participants,
    };
  }

  async getOverview(now: number = Date.now()): Promise<RelayAdminOverview> {
    const instances = this.activeInstances(now);
    const liveState = createLiveState(instances);
    const sessions = [...this.sessions.values()]
      .map((session) => toSessionSummary({ session, liveState, now }))
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt || left.sessionId.localeCompare(right.sessionId),
      );
    return this.buildOverview({
      sessions,
      instances,
      requestStats: this.requestStats(),
      generatedAt: now,
    });
  }

  async listInstances(now: number = Date.now()): Promise<RelayAdminInstanceStatus[]> {
    return this.activeInstances(now);
  }

  async close(): Promise<void> {
    this.sessions.clear();
    this.participants.clear();
    this.instances.clear();
    this.errorCodeCounts.clear();
    this.requestTypeCounts.app.clear();
    this.requestTypeCounts.provider.clear();
  }
}

export class RedisRelayAdminMetricsStore extends BaseRelayAdminMetricsStore {
  readonly persistent = true;

  private readonly redis: Redis;

  constructor(redisUrl: string) {
    super();
    this.redis = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
  }

  private async ensureSession(
    session: RelaySessionRecord,
    recordedAt: number,
  ): Promise<void> {
    const key = sessionKey(session.sessionId);
    const existingCreatedAt = await this.redis.hget(key, "createdAt");
    await this.redis
      .multi()
      .hset(key, {
        sessionId: session.sessionId,
        providerId: session.providerId,
        groupMode: session.groupMode ? "1" : "0",
        createdAt: existingCreatedAt ?? String(recordedAt),
        updatedAt: String(recordedAt),
        expiresAt: String(session.expiresAt),
      })
      .hsetnx(key, "appMessageCount", "0")
      .hsetnx(key, "providerMessageCount", "0")
      .hsetnx(key, "distinctParticipantCount", "0")
      .zadd(SESSION_INDEX_KEY, String(existingCreatedAt ?? recordedAt), session.sessionId)
      .exec();
  }

  private async loadSession(
    sessionId: string,
  ): Promise<MutableRelayAdminSessionRecord | undefined> {
    return decodeSessionHash(sessionId, await this.redis.hgetall(sessionKey(sessionId)));
  }

  private async loadParticipant(
    sessionId: string,
    appId: string,
  ): Promise<MutableRelayAdminParticipantRecord | undefined> {
    return decodeParticipantHash(
      appId,
      await this.redis.hgetall(sessionParticipantKey(sessionId, appId)),
    );
  }

  private async pruneStaleInstances(now: number): Promise<void> {
    const cutoff = now - INSTANCE_TTL_MS;
    const staleIds = await this.redis.zrangebyscore(INSTANCE_INDEX_KEY, 0, cutoff);
    if (staleIds.length === 0) {
      return;
    }
    const pipeline = this.redis.multi();
    pipeline.zrem(INSTANCE_INDEX_KEY, ...staleIds);
    for (const staleId of staleIds) {
      pipeline.del(instanceKey(staleId));
    }
    await pipeline.exec();
  }

  private async loadLiveState(now: number): Promise<RelayAdminLiveState> {
    return createLiveState(await this.listInstances(now));
  }

  private async loadRequestStats(): Promise<RelayAdminRequestStats> {
    const [globalRaw, errorCodeRaw, appRequestTypesRaw, providerRequestTypesRaw] =
      await Promise.all([
        this.redis.hgetall(GLOBAL_STATS_KEY),
        this.redis.hgetall(ERROR_CODE_COUNTS_KEY),
        this.redis.hgetall(requestTypeCountsKey("app")),
        this.redis.hgetall(requestTypeCountsKey("provider")),
      ]);

    return {
      appRequests: parseInteger(globalRaw.appRequests),
      providerRequests: parseInteger(globalRaw.providerRequests),
      appSuccesses: parseInteger(globalRaw.appSuccesses),
      providerSuccesses: parseInteger(globalRaw.providerSuccesses),
      appErrors: parseInteger(globalRaw.appErrors),
      providerErrors: parseInteger(globalRaw.providerErrors),
      appFrames: parseInteger(globalRaw.appFrames),
      providerFrames: parseInteger(globalRaw.providerFrames),
      errorCodes: decodeErrorCodeCounts(errorCodeRaw),
      requestTypes: [
        ...decodeRequestTypeCounts("app", appRequestTypesRaw),
        ...decodeRequestTypeCounts("provider", providerRequestTypesRaw),
      ],
    };
  }

  async recordSessionCreated(session: RelaySessionRecord, recordedAt: number): Promise<void> {
    await this.ensureSession(session, recordedAt);
  }

  async recordSessionRenewed(session: RelaySessionRecord, recordedAt: number): Promise<void> {
    await this.ensureSession(session, recordedAt);
  }

  async recordSessionClosed(
    sessionId: string,
    reason: string,
    recordedAt: number,
  ): Promise<void> {
    await this.redis.hset(sessionKey(sessionId), {
      updatedAt: String(recordedAt),
      closedAt: String(recordedAt),
      closeReason: reason,
    });
  }

  async recordAppAttached(
    session: RelaySessionRecord,
    appId: string,
    recordedAt: number,
  ): Promise<void> {
    await this.ensureSession(session, recordedAt);
    const participantKey = sessionParticipantKey(session.sessionId, appId);
    const participant = await this.loadParticipant(session.sessionId, appId);
    const isNewParticipant =
      (await this.redis.sadd(sessionParticipantsKey(session.sessionId), appId)) === 1;
    const pipeline = this.redis.multi();
    pipeline.hset(participantKey, {
      appId,
      firstSeenAt:
        participant?.firstSeenAt !== undefined
          ? String(participant.firstSeenAt)
          : String(recordedAt),
      lastSeenAt: String(recordedAt),
      connectionCount:
        typeof participant?.lastConnectedAt === "number" &&
        (typeof participant.lastDisconnectedAt !== "number" ||
          participant.lastDisconnectedAt < participant.lastConnectedAt)
          ? String(participant.connectionCount)
          : String((participant?.connectionCount ?? 0) + 1),
      lastConnectedAt:
        typeof participant?.lastConnectedAt === "number" &&
        (typeof participant.lastDisconnectedAt !== "number" ||
          participant.lastDisconnectedAt < participant.lastConnectedAt)
          ? String(participant.lastConnectedAt)
          : String(recordedAt),
      totalConnectedMs: String(participant?.totalConnectedMs ?? 0),
      messageCount: String(participant?.messageCount ?? 0),
      ...(participant?.lastDisconnectedAt !== undefined
        ? { lastDisconnectedAt: String(participant.lastDisconnectedAt) }
        : {}),
      ...(participant?.lastDisconnectReason
        ? { lastDisconnectReason: participant.lastDisconnectReason }
        : {}),
    });
    pipeline.hset(sessionKey(session.sessionId), { updatedAt: String(recordedAt) });
    if (isNewParticipant) {
      pipeline.hincrby(sessionKey(session.sessionId), "distinctParticipantCount", 1);
    }
    await pipeline.exec();
  }

  async recordAppDetached(
    sessionId: string,
    appId: string,
    recordedAt: number,
    reason: string,
  ): Promise<void> {
    const participant = await this.loadParticipant(sessionId, appId);
    if (!participant) {
      return;
    }
    let totalConnectedMs = participant.totalConnectedMs;
    if (
      typeof participant.lastConnectedAt === "number" &&
      (typeof participant.lastDisconnectedAt !== "number" ||
        participant.lastDisconnectedAt < participant.lastConnectedAt)
    ) {
      totalConnectedMs += Math.max(recordedAt - participant.lastConnectedAt, 0);
    }
    await this.redis
      .multi()
      .hset(sessionParticipantKey(sessionId, appId), {
        lastSeenAt: String(recordedAt),
        lastDisconnectedAt: String(recordedAt),
        lastDisconnectReason: reason,
        totalConnectedMs: String(totalConnectedMs),
      })
      .hset(sessionKey(sessionId), { updatedAt: String(recordedAt) })
      .exec();
  }

  async recordAppFrame(sessionId: string, appId: string, recordedAt: number): Promise<void> {
    await this.redis
      .multi()
      .hincrby(sessionKey(sessionId), "appMessageCount", 1)
      .hset(sessionKey(sessionId), {
        updatedAt: String(recordedAt),
        lastAppMessageAt: String(recordedAt),
      })
      .hincrby(sessionParticipantKey(sessionId, appId), "messageCount", 1)
      .hset(sessionParticipantKey(sessionId, appId), {
        appId,
        lastSeenAt: String(recordedAt),
      })
      .hincrby(GLOBAL_STATS_KEY, "appFrames", 1)
      .exec();
  }

  async recordProviderFrame(sessionId: string, recordedAt: number): Promise<void> {
    await this.redis
      .multi()
      .hincrby(sessionKey(sessionId), "providerMessageCount", 1)
      .hset(sessionKey(sessionId), {
        updatedAt: String(recordedAt),
        lastProviderMessageAt: String(recordedAt),
      })
      .hincrby(GLOBAL_STATS_KEY, "providerFrames", 1)
      .exec();
  }

  async recordRequest(params: {
    actor: RelayAdminRequestActor;
    type: string;
    ok: boolean;
    errorCode?: string;
  }): Promise<void> {
    const pipeline = this.redis.multi();
    pipeline.hincrby(
      GLOBAL_STATS_KEY,
      params.actor === "app" ? "appRequests" : "providerRequests",
      1,
    );
    pipeline.hincrby(
      GLOBAL_STATS_KEY,
      params.actor === "app"
        ? params.ok
          ? "appSuccesses"
          : "appErrors"
        : params.ok
          ? "providerSuccesses"
          : "providerErrors",
      1,
    );
    pipeline.hincrby(
      requestTypeCountsKey(params.actor),
      `${params.type}:${params.ok ? "ok" : "error"}`,
      1,
    );
    if (!params.ok && params.errorCode) {
      pipeline.hincrby(ERROR_CODE_COUNTS_KEY, params.errorCode, 1);
    }
    await pipeline.exec();
  }

  async recordInstanceHeartbeat(
    heartbeat: RelayAdminInstanceHeartbeat,
  ): Promise<void> {
    const key = instanceKey(heartbeat.instanceId);
    const providerIds = dedupeStrings(heartbeat.snapshot.providerIds);
    const sessionIds = dedupeStrings(heartbeat.snapshot.sessionIds);
    const participantBindings = dedupeBindings(heartbeat.snapshot.participantBindings);
    const pipeline = this.redis.multi();
    pipeline.hset(key, {
      instanceId: heartbeat.instanceId,
      startedAt: String(heartbeat.startedAt),
      lastSeenAt: String(heartbeat.recordedAt),
      activeProviders: String(heartbeat.snapshot.activeProviders),
      activeApps: String(heartbeat.snapshot.activeApps),
      localSessions: String(heartbeat.snapshot.localSessions),
      providerIdsJson: JSON.stringify(providerIds),
      sessionIdsJson: JSON.stringify(sessionIds),
      participantBindingsJson: JSON.stringify(participantBindings),
      memoryUsageJson: JSON.stringify(
        toSerializableMemoryUsage(heartbeat.snapshot.memoryUsage),
      ),
    });
    pipeline.zadd(INSTANCE_INDEX_KEY, String(heartbeat.recordedAt), heartbeat.instanceId);
    pipeline.pexpire(key, INSTANCE_TTL_MS * 2);
    for (const binding of participantBindings) {
      pipeline.hset(sessionParticipantKey(binding.sessionId, binding.appId), {
        appId: binding.appId,
        lastSeenAt: String(heartbeat.recordedAt),
      });
    }
    await pipeline.exec();
  }

  async unregisterInstance(instanceId: string): Promise<void> {
    await this.redis.multi().zrem(INSTANCE_INDEX_KEY, instanceId).del(instanceKey(instanceId)).exec();
  }

  async listSessions(
    options: RelayAdminSessionListOptions = {},
  ): Promise<RelayAdminSessionListResult> {
    const now = options.now ?? Date.now();
    await this.pruneStaleInstances(now);
    const sessionIds = await this.redis.zrevrange(SESSION_INDEX_KEY, 0, -1);
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    if (sessionIds.length === 0) {
      return {
        total: 0,
        page,
        pageSize,
        sessions: [],
      };
    }

    const pipeline = this.redis.multi();
    for (const sessionId of sessionIds) {
      pipeline.hgetall(sessionKey(sessionId));
    }
    const results = await pipeline.exec();
    const liveState = await this.loadLiveState(now);
    const sessions = sessionIds
      .map((sessionId, index) =>
        decodeSessionHash(
          sessionId,
          (results?.[index]?.[1] as Record<string, string> | undefined) ?? {},
        ),
      )
      .filter((session): session is MutableRelayAdminSessionRecord => !!session)
      .map((session) => toSessionSummary({ session, liveState, now }))
      .filter((session) =>
        options.status && options.status !== "all"
          ? session.status === options.status
          : true,
      )
      .filter((session) => matchesSessionQuery(session, options.query));

    const startIndex = (page - 1) * pageSize;
    return {
      total: sessions.length,
      page,
      pageSize,
      sessions: sessions.slice(startIndex, startIndex + pageSize),
    };
  }

  async getSessionDetail(
    sessionId: string,
    now: number = Date.now(),
  ): Promise<RelayAdminSessionDetail | undefined> {
    await this.pruneStaleInstances(now);
    const session = await this.loadSession(sessionId);
    if (!session) {
      return undefined;
    }
    const participantIds = await this.redis.smembers(sessionParticipantsKey(sessionId));
    const pipeline = this.redis.multi();
    for (const appId of participantIds) {
      pipeline.hgetall(sessionParticipantKey(sessionId, appId));
    }
    const participantHashes = await pipeline.exec();
    const liveState = await this.loadLiveState(now);
    const participants = participantIds
      .map((appId, index) =>
        decodeParticipantHash(
          appId,
          (participantHashes?.[index]?.[1] as Record<string, string> | undefined) ?? {},
        ),
      )
      .filter((participant): participant is MutableRelayAdminParticipantRecord => !!participant)
      .map((participant) =>
        toParticipantSummary({ sessionId, participant, liveState, now }),
      )
      .sort(sortParticipants);

    return {
      session: toSessionSummary({ session, liveState, now }),
      participants,
    };
  }

  async getOverview(now: number = Date.now()): Promise<RelayAdminOverview> {
    await this.pruneStaleInstances(now);
    const [sessionIds, instances, requestStats] = await Promise.all([
      this.redis.zrevrange(SESSION_INDEX_KEY, 0, -1),
      this.listInstances(now),
      this.loadRequestStats(),
    ]);
    let sessions: RelayAdminSessionSummary[] = [];
    if (sessionIds.length > 0) {
      const pipeline = this.redis.multi();
      for (const sessionId of sessionIds) {
        pipeline.hgetall(sessionKey(sessionId));
      }
      const results = await pipeline.exec();
      const liveState = createLiveState(instances);
      sessions = sessionIds
        .map((sessionId, index) =>
          decodeSessionHash(
            sessionId,
            (results?.[index]?.[1] as Record<string, string> | undefined) ?? {},
          ),
        )
        .filter((session): session is MutableRelayAdminSessionRecord => !!session)
        .map((session) => toSessionSummary({ session, liveState, now }));
    }
    return this.buildOverview({
      sessions,
      instances,
      requestStats,
      generatedAt: now,
    });
  }

  async listInstances(now: number = Date.now()): Promise<RelayAdminInstanceStatus[]> {
    await this.pruneStaleInstances(now);
    const instanceIds = await this.redis.zrevrange(INSTANCE_INDEX_KEY, 0, -1);
    if (instanceIds.length === 0) {
      return [];
    }
    const pipeline = this.redis.multi();
    for (const instanceId of instanceIds) {
      pipeline.hgetall(instanceKey(instanceId));
    }
    const results = await pipeline.exec();
    return instanceIds
      .map((instanceId, index) =>
        decodeInstanceHash(
          instanceId,
          (results?.[index]?.[1] as Record<string, string> | undefined) ?? {},
        ),
      )
      .filter((instance): instance is RelayAdminInstanceStatus => !!instance)
      .sort(
        (left, right) => right.lastSeenAt - left.lastSeenAt || left.instanceId.localeCompare(right.instanceId),
      );
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createRelayAdminMetricsStore(params: {
  redisUrl?: string;
}): RelayAdminMetricsStore {
  if (params.redisUrl) {
    return new RedisRelayAdminMetricsStore(params.redisUrl);
  }
  return new InMemoryRelayAdminMetricsStore();
}
