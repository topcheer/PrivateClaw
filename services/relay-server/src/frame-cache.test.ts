import assert from "node:assert/strict";
import test from "node:test";
import type { EncryptedEnvelope } from "@privateclaw/protocol";
import {
  RedisEncryptedFrameCache,
  type RedisFrameCacheClientLike,
  type RedisFrameCacheMultiLike,
} from "./frame-cache.js";

class FakeRedisMulti implements RedisFrameCacheMultiLike {
  private readonly operations: Array<() => void> = [];

  constructor(private readonly lists: Map<string, string[]>) {}

  lpush(key: string, value: string): RedisFrameCacheMultiLike {
    this.operations.push(() => {
      const existing = this.lists.get(key) ?? [];
      this.lists.set(key, [value, ...existing]);
    });
    return this;
  }

  ltrim(key: string, start: number, stop: number): RedisFrameCacheMultiLike {
    this.operations.push(() => {
      const existing = this.lists.get(key) ?? [];
      const normalizedStop = stop >= 0 ? stop : existing.length + stop;
      this.lists.set(key, existing.slice(start, normalizedStop + 1));
    });
    return this;
  }

  expire(_key: string, _seconds: number): RedisFrameCacheMultiLike {
    return this;
  }

  async exec(): Promise<unknown> {
    for (const operation of this.operations) {
      operation();
    }
    return [];
  }
}

class FakeRedisClient implements RedisFrameCacheClientLike {
  private readonly lists = new Map<string, string[]>();

  multi(): RedisFrameCacheMultiLike {
    return new FakeRedisMulti(this.lists);
  }

  async eval(
    _script: string,
    numKeys: number,
    ...keysAndArgs: string[]
  ): Promise<unknown> {
    assert.equal(numKeys, 1);
    const [key] = keysAndArgs;
    const values = [...(this.lists.get(key) ?? [])];
    this.lists.delete(key);
    return values;
  }

  async scan(
    cursor: string,
    _matchToken: string,
    pattern: string,
    _countToken: string,
    _count: number,
  ): Promise<[string, string[]]> {
    assert.equal(cursor, "0");
    const prefix = pattern.replace("*", "");
    const keys = [...this.lists.keys()].filter((key) => key.startsWith(prefix));
    return ["0", keys];
  }

  async del(...keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (this.lists.delete(key)) {
        deleted += 1;
      }
    }
    return deleted;
  }

  async quit(): Promise<void> {}
}

function createEnvelope(messageId: string): EncryptedEnvelope {
  return {
    version: 1,
    messageId,
    iv: `iv-${messageId}`,
    ciphertext: `ciphertext-${messageId}`,
    tag: `tag-${messageId}`,
    sentAt: `2026-03-15T00:00:0${messageId.length}Z`,
  };
}

test("RedisEncryptedFrameCache drains global and targeted app frames in order", async () => {
  const cache = new RedisEncryptedFrameCache("redis://unused", 8, new FakeRedisClient());
  const sessionId = "session-redis-replay";
  const globalFirst = createEnvelope("global-first");
  const globalSecond = createEnvelope("global-second");
  const targetedFirst = createEnvelope("targeted-first");
  const targetedSecond = createEnvelope("targeted-second");

  await cache.push({ sessionId, target: "app", envelope: globalFirst });
  await cache.push({ sessionId, target: "app", envelope: globalSecond });
  await cache.push({
    sessionId,
    target: "app",
    appId: "app-1",
    envelope: targetedFirst,
  });
  await cache.push({
    sessionId,
    target: "app",
    appId: "app-1",
    envelope: targetedSecond,
  });

  const drained = await cache.drain({
    sessionId,
    target: "app",
    appId: "app-1",
  });

  assert.deepEqual(drained, [
    globalFirst,
    globalSecond,
    targetedFirst,
    targetedSecond,
  ]);
  assert.deepEqual(
    await cache.drain({ sessionId, target: "app", appId: "app-1" }),
    [],
  );

  await cache.close();
});
