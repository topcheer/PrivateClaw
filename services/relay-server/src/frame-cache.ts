import { Redis } from "ioredis";
import type { CachedRelayFrameTarget, EncryptedEnvelope } from "@privateclaw/protocol";

export interface EncryptedFrameCache {
  push(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    envelope: EncryptedEnvelope;
    appId?: string;
  }): Promise<void>;
  drain(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    appId?: string;
  }): Promise<EncryptedEnvelope[]>;
  clear(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

export class InMemoryEncryptedFrameCache implements EncryptedFrameCache {
  private readonly frames = new Map<string, EncryptedEnvelope[]>();

  constructor(private readonly maxFrames: number) {}

  private key(
    sessionId: string,
    target: CachedRelayFrameTarget,
    appId?: string,
  ): string {
    return `${sessionId}:${target}:${appId ?? "*"}`;
  }

  async push(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    envelope: EncryptedEnvelope;
    appId?: string;
  }): Promise<void> {
    const key = this.key(params.sessionId, params.target, params.appId);
    const next = [...(this.frames.get(key) ?? []), params.envelope];
    const bounded = next.slice(-this.maxFrames);
    this.frames.set(key, bounded);
  }

  async drain(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    appId?: string;
  }): Promise<EncryptedEnvelope[]> {
    const globalKey = this.key(params.sessionId, params.target);
    if (params.target !== "app" || !params.appId) {
      const frames = this.frames.get(globalKey) ?? [];
      this.frames.delete(globalKey);
      return frames;
    }

    const targetedKey = this.key(params.sessionId, params.target, params.appId);
    const globalFrames = this.frames.get(globalKey) ?? [];
    const targetedFrames = this.frames.get(targetedKey) ?? [];
    this.frames.delete(globalKey);
    this.frames.delete(targetedKey);
    return [...globalFrames, ...targetedFrames];
  }

  async clear(sessionId: string): Promise<void> {
    const prefix = `${sessionId}:`;
    for (const key of this.frames.keys()) {
      if (key.startsWith(prefix)) {
        this.frames.delete(key);
      }
    }
  }

  async close(): Promise<void> {
    this.frames.clear();
  }
}

export class RedisEncryptedFrameCache implements EncryptedFrameCache {
  private readonly redis: Redis;

  constructor(redisUrl: string, private readonly maxFrames: number) {
    this.redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 1 });
  }

  private key(
    sessionId: string,
    target: CachedRelayFrameTarget,
    appId?: string,
  ): string {
    return `privateclaw:frames:${sessionId}:${target}:${appId ?? "*"}`;
  }

  async push(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    envelope: EncryptedEnvelope;
    appId?: string;
  }): Promise<void> {
    const key = this.key(params.sessionId, params.target, params.appId);
    await this.redis
      .multi()
      .lpush(key, JSON.stringify(params.envelope))
      .ltrim(key, 0, this.maxFrames - 1)
      .expire(key, 3600)
      .exec();
  }

  async drain(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    appId?: string;
  }): Promise<EncryptedEnvelope[]> {
    const globalKey = this.key(params.sessionId, params.target);
    if (params.target !== "app" || !params.appId) {
      const values = (await this.redis.eval(
        `
          local values = redis.call("lrange", KEYS[1], 0, -1)
          redis.call("del", KEYS[1])
          return values
        `,
        1,
        globalKey,
      )) as string[];
      return values
        .reverse()
        .map((value: string) => JSON.parse(value) as EncryptedEnvelope);
    }

    const targetedKey = this.key(params.sessionId, params.target, params.appId);
    const [globalValuesJson, targetedValuesJson] = (await this.redis.eval(
      `
        local globalValues = redis.call("lrange", KEYS[1], 0, -1)
        local targetedValues = redis.call("lrange", KEYS[2], 0, -1)
        redis.call("del", KEYS[1], KEYS[2])
        return { cjson.encode(globalValues), cjson.encode(targetedValues) }
      `,
      2,
      globalKey,
      targetedKey,
    )) as [string, string];

    const globalValues = (JSON.parse(globalValuesJson) as string[]).reverse();
    const targetedValues = (JSON.parse(targetedValuesJson) as string[]).reverse();
    return [...globalValues, ...targetedValues].map(
      (value: string) => JSON.parse(value) as EncryptedEnvelope,
    );
  }

  async clear(sessionId: string): Promise<void> {
    const match = `privateclaw:frames:${sessionId}:*`;
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, "MATCH", match, "COUNT", 100);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
      cursor = nextCursor;
    } while (cursor !== "0");
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}

export function createEncryptedFrameCache(params: {
  redisUrl?: string;
  maxFrames: number;
}): EncryptedFrameCache {
  if (params.redisUrl) {
    return new RedisEncryptedFrameCache(params.redisUrl, params.maxFrames);
  }
  return new InMemoryEncryptedFrameCache(params.maxFrames);
}

export function createInMemoryEncryptedFrameCache(maxFrames: number): EncryptedFrameCache {
  return new InMemoryEncryptedFrameCache(maxFrames);
}
