import { Redis } from "ioredis";
import type { CachedRelayFrameTarget, EncryptedEnvelope } from "@privateclaw/protocol";

export interface EncryptedFrameCache {
  push(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    envelope: EncryptedEnvelope;
  }): Promise<void>;
  drain(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
  }): Promise<EncryptedEnvelope[]>;
  clear(sessionId: string): Promise<void>;
  close(): Promise<void>;
}

class InMemoryEncryptedFrameCache implements EncryptedFrameCache {
  private readonly frames = new Map<string, EncryptedEnvelope[]>();

  constructor(private readonly maxFrames: number) {}

  private key(sessionId: string, target: CachedRelayFrameTarget): string {
    return `${sessionId}:${target}`;
  }

  async push(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    envelope: EncryptedEnvelope;
  }): Promise<void> {
    const key = this.key(params.sessionId, params.target);
    const next = [...(this.frames.get(key) ?? []), params.envelope];
    const bounded = next.slice(-this.maxFrames);
    this.frames.set(key, bounded);
  }

  async drain(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
  }): Promise<EncryptedEnvelope[]> {
    const key = this.key(params.sessionId, params.target);
    const frames = this.frames.get(key) ?? [];
    this.frames.delete(key);
    return frames;
  }

  async clear(sessionId: string): Promise<void> {
    this.frames.delete(this.key(sessionId, "app"));
    this.frames.delete(this.key(sessionId, "provider"));
  }

  async close(): Promise<void> {
    this.frames.clear();
  }
}

class RedisEncryptedFrameCache implements EncryptedFrameCache {
  private readonly redis: Redis;

  constructor(redisUrl: string, private readonly maxFrames: number) {
    this.redis = new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 1 });
  }

  private key(sessionId: string, target: CachedRelayFrameTarget): string {
    return `privateclaw:frames:${sessionId}:${target}`;
  }

  async push(params: {
    sessionId: string;
    target: CachedRelayFrameTarget;
    envelope: EncryptedEnvelope;
  }): Promise<void> {
    const key = this.key(params.sessionId, params.target);
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
  }): Promise<EncryptedEnvelope[]> {
    const key = this.key(params.sessionId, params.target);
    const values = await this.redis.lrange(key, 0, -1);
    await this.redis.del(key);
    return values
      .reverse()
      .map((value: string) => JSON.parse(value) as EncryptedEnvelope);
  }

  async clear(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId, "app"), this.key(sessionId, "provider"));
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
