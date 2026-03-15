import { Redis } from "ioredis";

const PUSH_REGISTRATION_KEY_PREFIX = "privateclaw:push-registrations:v1";

export interface RelayPushRegistrationRecord {
  sessionId: string;
  appId: string;
  token: string;
  updatedAt: number;
}

export interface RelayPushRegistrationStore {
  readonly persistent: boolean;
  saveRegistration(
    registration: RelayPushRegistrationRecord,
    expiresAt: number,
  ): Promise<void>;
  deleteRegistration(sessionId: string, appId: string): Promise<void>;
  listRegistrations(sessionId: string): Promise<RelayPushRegistrationRecord[]>;
  clearSession(sessionId: string): Promise<void>;
  touchSession(sessionId: string, expiresAt: number): Promise<void>;
  close(): Promise<void>;
}

function pushRegistrationsKey(sessionId: string): string {
  return `${PUSH_REGISTRATION_KEY_PREFIX}:${sessionId}`;
}

export class InMemoryRelayPushRegistrationStore
  implements RelayPushRegistrationStore
{
  readonly persistent = false;

  private readonly registrations = new Map<
    string,
    Map<string, RelayPushRegistrationRecord>
  >();

  async saveRegistration(
    registration: RelayPushRegistrationRecord,
    _expiresAt: number,
  ): Promise<void> {
    const sessionRegistrations =
      this.registrations.get(registration.sessionId) ??
      new Map<string, RelayPushRegistrationRecord>();
    sessionRegistrations.set(registration.appId, { ...registration });
    this.registrations.set(registration.sessionId, sessionRegistrations);
  }

  async deleteRegistration(sessionId: string, appId: string): Promise<void> {
    const sessionRegistrations = this.registrations.get(sessionId);
    if (!sessionRegistrations) {
      return;
    }
    sessionRegistrations.delete(appId);
    if (sessionRegistrations.size === 0) {
      this.registrations.delete(sessionId);
    }
  }

  async listRegistrations(
    sessionId: string,
  ): Promise<RelayPushRegistrationRecord[]> {
    const sessionRegistrations = this.registrations.get(sessionId);
    if (!sessionRegistrations) {
      return [];
    }
    return [...sessionRegistrations.values()].map((registration) => ({
      ...registration,
    }));
  }

  async clearSession(sessionId: string): Promise<void> {
    this.registrations.delete(sessionId);
  }

  async touchSession(_sessionId: string, _expiresAt: number): Promise<void> {}

  async close(): Promise<void> {
    this.registrations.clear();
  }
}

export class RedisRelayPushRegistrationStore
  implements RelayPushRegistrationStore
{
  readonly persistent = true;

  private readonly redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
    });
  }

  async saveRegistration(
    registration: RelayPushRegistrationRecord,
    expiresAt: number,
  ): Promise<void> {
    const ttlMs = Math.max(expiresAt - Date.now(), 1);
    await this.redis
      .multi()
      .hset(
        pushRegistrationsKey(registration.sessionId),
        registration.appId,
        JSON.stringify(registration),
      )
      .pexpire(pushRegistrationsKey(registration.sessionId), ttlMs)
      .exec();
  }

  async deleteRegistration(sessionId: string, appId: string): Promise<void> {
    await this.redis.hdel(pushRegistrationsKey(sessionId), appId);
  }

  async listRegistrations(
    sessionId: string,
  ): Promise<RelayPushRegistrationRecord[]> {
    const values = await this.redis.hvals(pushRegistrationsKey(sessionId));
    const registrations: RelayPushRegistrationRecord[] = [];
    for (const rawValue of values) {
      try {
        const registration = JSON.parse(rawValue) as RelayPushRegistrationRecord;
        if (
          typeof registration.sessionId === "string" &&
          typeof registration.appId === "string" &&
          typeof registration.token === "string" &&
          typeof registration.updatedAt === "number"
        ) {
          registrations.push(registration);
        }
      } catch {
        continue;
      }
    }
    return registrations;
  }

  async clearSession(sessionId: string): Promise<void> {
    await this.redis.del(pushRegistrationsKey(sessionId));
  }

  async touchSession(sessionId: string, expiresAt: number): Promise<void> {
    const ttlMs = Math.max(expiresAt - Date.now(), 1);
    await this.redis.pexpire(pushRegistrationsKey(sessionId), ttlMs);
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createRelayPushRegistrationStore(params: {
  redisUrl?: string;
}): RelayPushRegistrationStore {
  if (params.redisUrl) {
    return new RedisRelayPushRegistrationStore(params.redisUrl);
  }
  return new InMemoryRelayPushRegistrationStore();
}
