import { Redis } from "ioredis";

const SESSION_KEY_PREFIX = "privateclaw:sessions:v1";
const SESSION_INDEX_KEY = `${SESSION_KEY_PREFIX}:index`;
const PROVIDER_SESSION_KEY_PREFIX = "privateclaw:provider-sessions:v1";

export interface RelaySessionRecord {
  sessionId: string;
  expiresAt: number;
  providerId: string;
  groupMode: boolean;
}

export interface RelaySessionStore {
  readonly persistent: boolean;
  saveSession(session: RelaySessionRecord): Promise<void>;
  getSession(sessionId: string): Promise<RelaySessionRecord | undefined>;
  deleteSession(sessionId: string): Promise<RelaySessionRecord | undefined>;
  listProviderSessions(providerId: string, now?: number): Promise<string[]>;
  countSessions(now?: number): Promise<number>;
  close(): Promise<void>;
}

function sessionKey(sessionId: string): string {
  return `${SESSION_KEY_PREFIX}:${sessionId}`;
}

function providerSessionsKey(providerId: string): string {
  return `${PROVIDER_SESSION_KEY_PREFIX}:${providerId}`;
}

export class InMemoryRelaySessionStore implements RelaySessionStore {
  readonly persistent = false;

  private readonly sessions = new Map<string, RelaySessionRecord>();
  private readonly providerSessions = new Map<string, Set<string>>();

  async saveSession(session: RelaySessionRecord): Promise<void> {
    this.sessions.set(session.sessionId, { ...session });
    const sessionIds = this.providerSessions.get(session.providerId) ?? new Set<string>();
    sessionIds.add(session.sessionId);
    this.providerSessions.set(session.providerId, sessionIds);
  }

  async getSession(sessionId: string): Promise<RelaySessionRecord | undefined> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : undefined;
  }

  async deleteSession(sessionId: string): Promise<RelaySessionRecord | undefined> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }

    this.sessions.delete(sessionId);
    const sessionIds = this.providerSessions.get(session.providerId);
    sessionIds?.delete(sessionId);
    if (sessionIds?.size === 0) {
      this.providerSessions.delete(session.providerId);
    }
    return { ...session };
  }

  async listProviderSessions(
    providerId: string,
    now: number = Date.now(),
  ): Promise<string[]> {
    const sessionIds = this.providerSessions.get(providerId);
    if (!sessionIds) {
      return [];
    }

    const activeIds: string[] = [];
    for (const sessionId of sessionIds) {
      const session = this.sessions.get(sessionId);
      if (!session || session.expiresAt <= now) {
        sessionIds.delete(sessionId);
        if (session) {
          this.sessions.delete(sessionId);
        }
        continue;
      }
      activeIds.push(sessionId);
    }

    if (sessionIds.size === 0) {
      this.providerSessions.delete(providerId);
    }
    return activeIds;
  }

  async countSessions(now: number = Date.now()): Promise<number> {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.expiresAt > now) {
        count += 1;
      }
    }
    return count;
  }

  async close(): Promise<void> {
    this.sessions.clear();
    this.providerSessions.clear();
  }
}

export class RedisRelaySessionStore implements RelaySessionStore {
  readonly persistent = true;

  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
  }

  async saveSession(session: RelaySessionRecord): Promise<void> {
    const ttlMs = Math.max(session.expiresAt - Date.now(), 1);
    await this.redis
      .multi()
      .set(sessionKey(session.sessionId), JSON.stringify(session), "PX", ttlMs)
      .zadd(SESSION_INDEX_KEY, String(session.expiresAt), session.sessionId)
      .zadd(
        providerSessionsKey(session.providerId),
        String(session.expiresAt),
        session.sessionId,
      )
      .exec();
  }

  async getSession(sessionId: string): Promise<RelaySessionRecord | undefined> {
    const raw = await this.redis.get(sessionKey(sessionId));
    return raw ? (JSON.parse(raw) as RelaySessionRecord) : undefined;
  }

  async deleteSession(sessionId: string): Promise<RelaySessionRecord | undefined> {
    const existing = await this.getSession(sessionId);
    if (!existing) {
      return undefined;
    }

    await this.redis
      .multi()
      .del(sessionKey(sessionId))
      .zrem(SESSION_INDEX_KEY, sessionId)
      .zrem(providerSessionsKey(existing.providerId), sessionId)
      .exec();
    return existing;
  }

  async listProviderSessions(
    providerId: string,
    now: number = Date.now(),
  ): Promise<string[]> {
    const providerKey = providerSessionsKey(providerId);
    await this.redis.zremrangebyscore(providerKey, 0, now);
    const sessionIds = await this.redis.zrangebyscore(providerKey, now + 1, "+inf");
    if (sessionIds.length === 0) {
      return [];
    }

    const existenceChecks = this.redis.multi();
    for (const sessionId of sessionIds) {
      existenceChecks.exists(sessionKey(sessionId));
    }
    const results = await existenceChecks.exec();
    const activeSessionIds: string[] = [];
    const staleSessionIds: string[] = [];

    for (let index = 0; index < sessionIds.length; index += 1) {
      const existsResult = results?.[index]?.[1];
      const sessionId = sessionIds[index];
      if (!sessionId) {
        continue;
      }
      if (existsResult === 1) {
        activeSessionIds.push(sessionId);
      } else {
        staleSessionIds.push(sessionId);
      }
    }

    if (staleSessionIds.length > 0) {
      await this.redis
        .multi()
        .zrem(providerKey, ...staleSessionIds)
        .zrem(SESSION_INDEX_KEY, ...staleSessionIds)
        .exec();
    }

    return activeSessionIds;
  }

  async countSessions(now: number = Date.now()): Promise<number> {
    await this.redis.zremrangebyscore(SESSION_INDEX_KEY, 0, now);
    return this.redis.zcount(SESSION_INDEX_KEY, now + 1, "+inf");
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createRelaySessionStore(params: {
  redisUrl?: string;
}): RelaySessionStore {
  if (params.redisUrl) {
    return new RedisRelaySessionStore(params.redisUrl);
  }
  return new InMemoryRelaySessionStore();
}
