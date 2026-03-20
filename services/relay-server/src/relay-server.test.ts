import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { tmpdir } from "node:os";
import path from "node:path";
import { decryptPayload, encryptPayload, generateSessionKey } from "@privateclaw/protocol";
import WebSocket from "ws";
import {
  createInMemoryRelayClusterClient,
  createInMemoryRelayClusterSharedState,
  type RelayClusterClient,
  type RelayClusterCallbacks,
} from "./relay-cluster.js";
import { createInMemoryEncryptedFrameCache } from "./frame-cache.js";
import { InMemoryRelayPushRegistrationStore } from "./push-registration-store.js";
import type {
  RelayPushNotifier,
  RelayPushSendResult,
} from "./push-notifier.js";
import { createRelayServer, WakeCooldownTracker } from "./relay-server.js";
import { InMemoryRelaySessionStore } from "./session-store.js";

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function nextMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
    socket.once("error", reject);
  });
}

function nextMessages(socket: WebSocket, count: number): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];

    const handleMessage = (data: WebSocket.RawData) => {
      messages.push(JSON.parse(data.toString()) as Record<string, unknown>);
      if (messages.length === count) {
        cleanup();
        resolve(messages);
      }
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      socket.off("message", handleMessage);
      socket.off("error", handleError);
    };

    socket.on("message", handleMessage);
    socket.on("error", handleError);
  });
}

function waitForClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
  });
}

function waitForCondition(
  predicate: () => boolean,
  timeoutMs: number = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const check = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error("Timed out waiting for condition."));
        return;
      }
      setTimeout(check, 10);
    };
    check();
  });
}

class TestPushNotifier implements RelayPushNotifier {
  readonly enabled = true;
  readonly sent: Array<{ sessionId: string; appId: string; token: string }> = [];

  async sendWake(registration: {
    sessionId: string;
    appId: string;
    token: string;
  }): Promise<RelayPushSendResult> {
    this.sent.push({
      sessionId: registration.sessionId,
      appId: registration.appId,
      token: registration.token,
    });
    return { unregisterToken: false };
  }

  async close(): Promise<void> {}
}

test("WakeCooldownTracker prunes stale entries while keeping active cooldowns", () => {
  let now = 1_000;
  const tracker = new WakeCooldownTracker({
    cooldownMs: 5_000,
    now: () => now,
  });

  tracker.recordSent("session-a:app-a");
  tracker.recordSent("session-a:app-b");
  assert.equal(tracker.entryCount(), 2);

  now += 6_000;
  tracker.recordSent("session-b:app-a");

  assert.equal(tracker.getLastSentAt("session-a:app-a"), undefined);
  assert.equal(tracker.getLastSentAt("session-a:app-b"), undefined);
  assert.equal(tracker.entryCount(), 1);

  tracker.clearSession("session-b");
  assert.equal(tracker.entryCount(), 0);
});

test("relay exposes health endpoints for container platforms", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const [legacyResponse, railwayResponse] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/healthz`),
    fetch(`http://127.0.0.1:${port}/api/health`),
  ]);

  assert.equal(legacyResponse.status, 200);
  assert.equal(legacyResponse.headers.get("content-type"), "application/json");
  assert.equal(railwayResponse.status, 200);
  assert.equal(railwayResponse.headers.get("content-type"), "application/json");

  const railwayHealth = (await railwayResponse.json()) as {
    ok?: unknown;
    sessions?: unknown;
  };
  assert.equal(railwayHealth.ok, true);
  assert.equal(railwayHealth.sessions, 0);
});

test("relay optionally serves the bundled website without breaking websocket endpoints", async (t) => {
  const webRootDir = await mkdtemp(path.join(tmpdir(), "privateclaw-relay-web-"));
  t.after(async () => {
    await rm(webRootDir, { recursive: true, force: true });
  });

  await mkdir(path.join(webRootDir, "chat"), { recursive: true });
  await mkdir(path.join(webRootDir, "assets"), { recursive: true });
  await writeFile(
    path.join(webRootDir, "index.html"),
    "<!doctype html><title>PrivateClaw Home</title><a href=\"./chat/\">chat</a>",
  );
  await writeFile(
    path.join(webRootDir, "chat", "index.html"),
    "<!doctype html><title>PrivateClaw Chat</title>",
  );
  await writeFile(
    path.join(webRootDir, "styles.css"),
    "body { color: rgb(0, 0, 0); }",
  );

  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
    webRootDir,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const [homeResponse, chatRedirectResponse, chatResponse, stylesResponse] =
    await Promise.all([
      fetch(`http://127.0.0.1:${port}/`),
      fetch(`http://127.0.0.1:${port}/chat`, { redirect: "manual" }),
      fetch(`http://127.0.0.1:${port}/chat/`),
      fetch(`http://127.0.0.1:${port}/styles.css`),
    ]);

  assert.equal(homeResponse.status, 200);
  assert.match(
    homeResponse.headers.get("content-type") ?? "",
    /^text\/html\b/,
  );
  assert.match(await homeResponse.text(), /PrivateClaw Home/);

  assert.equal(chatRedirectResponse.status, 301);
  assert.equal(chatRedirectResponse.headers.get("location"), "/chat/");

  assert.equal(chatResponse.status, 200);
  assert.match(await chatResponse.text(), /PrivateClaw Chat/);

  assert.equal(stylesResponse.status, 200);
  assert.match(
    stylesResponse.headers.get("content-type") ?? "",
    /^text\/css\b/,
  );

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  const ready = await readyPromise;
  assert.equal(ready.type, "relay:provider_ready");
  providerSocket.close();
  await waitForClose(providerSocket);
});

test("relay server creates a session and forwards encrypted frames", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  const ready = await readyPromise;
  assert.equal(ready.type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const appSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const attached = await attachedPromise;
  assert.equal(attached.type, "relay:attached");

  const sessionKey = generateSessionKey();
  const welcomeEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "server_welcome",
      message: "hello from provider",
      sentAt: new Date().toISOString(),
    },
  });

  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: welcomeEnvelope }),
  );

  const forwardedWelcome = await nextMessage(appSocket);
  assert.equal(forwardedWelcome.type, "relay:frame");
  const decryptedWelcome = decryptPayload({
    sessionId,
    sessionKey,
    envelope: forwardedWelcome.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(decryptedWelcome.kind, "server_welcome");

  const userEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "ping",
      clientMessageId: "client-1",
      sentAt: new Date().toISOString(),
    },
  });

  appSocket.send(JSON.stringify({ type: "app:frame", envelope: userEnvelope }));
  const forwardedUser = await nextMessage(providerSocket);
  assert.equal(forwardedUser.type, "relay:frame");
  const decryptedUser = decryptPayload({
    sessionId,
    sessionKey,
    envelope: forwardedUser.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(decryptedUser.kind, "user_message");
  assert.equal(decryptedUser.text, "ping");

  appSocket.close();
  providerSocket.close();
  await Promise.all([waitForClose(appSocket), waitForClose(providerSocket)]);
});

test("relay rate limits repeated app messages from the same app session", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
    appMessagesPerMinute: 3,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const appSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attachedPromise).type, "relay:attached");

  const errorPromise = nextMessage(appSocket);
  for (let index = 0; index < 4; index += 1) {
    appSocket.send(JSON.stringify({ type: "app:unregister_push" }));
  }

  const error = await errorPromise;
  assert.equal(error.type, "relay:error");
  assert.equal(error.code, "rate_limit_exceeded");
  assert.equal(error.sessionId, sessionId);

  appSocket.close();
  providerSocket.close();
  await Promise.all([waitForClose(appSocket), waitForClose(providerSocket)]);
});

test("relay rate limits repeated provider messages from the same provider", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
    providerMessagesPerMinute: 2,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/provider?providerId=provider-rate-limited`,
  );
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-2", ttlMs: 60_000 }),
  );
  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-3", ttlMs: 60_000 }),
  );

  const responses = await nextMessages(providerSocket, 3);
  const created = responses.filter(
    (response) => response.type === "relay:session_created",
  );
  const errors = responses.filter((response) => response.type === "relay:error");

  assert.equal(created.length, 2);
  assert.equal(errors.length, 1);
  const [error] = errors;
  assert.equal(error.type, "relay:error");
  assert.equal(error.code, "rate_limit_exceeded");
  assert.equal(error.requestId, "req-3");

  providerSocket.close();
  await waitForClose(providerSocket);
});

test("relay rejects oversized app messages with a protocol error", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
    maxMessageBytes: 256,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const appSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attachedPromise).type, "relay:attached");

  const errorPromise = nextMessage(appSocket);
  appSocket.send(
    JSON.stringify({
      type: "app:register_push",
      token: "x".repeat(512),
    }),
  );
  const error = await errorPromise;
  assert.equal(error.type, "relay:error");
  assert.equal(error.code, "message_too_large");
  assert.equal(error.sessionId, sessionId);

  appSocket.close();
  providerSocket.close();
  await Promise.all([waitForClose(appSocket), waitForClose(providerSocket)]);
});

test("relay preserves a session after app disconnect and replays buffered frames on reattach", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  const ready = await readyPromise;
  assert.equal(ready.type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const sessionKey = generateSessionKey();
  const appSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const attached = await attachedPromise;
  assert.equal(attached.type, "relay:attached");

  appSocket.close();
  await waitForClose(appSocket);

  const bufferedEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      text: "buffered while app was away",
      sentAt: new Date().toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: bufferedEnvelope }),
  );

  const reattachedAppSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const reattachedMessagesPromise = nextMessages(reattachedAppSocket, 2);
  await waitForOpen(reattachedAppSocket);
  const [reattached, replayed] = await reattachedMessagesPromise;
  assert.ok(reattached);
  assert.equal(reattached.type, "relay:attached");
  assert.ok(replayed);
  assert.equal(replayed.type, "relay:frame");
  const decryptedReplay = decryptPayload({
    sessionId,
    sessionKey,
    envelope: replayed.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(decryptedReplay.kind, "assistant_message");
  assert.equal(decryptedReplay.text, "buffered while app was away");

  reattachedAppSocket.close();
  providerSocket.close();
  await Promise.all([waitForClose(reattachedAppSocket), waitForClose(providerSocket)]);
});

test("relay sends a wake push when a provider frame is buffered for an offline app", async (t) => {
  const pushRegistrationStore = new InMemoryRelayPushRegistrationStore();
  const pushNotifier = new TestPushNotifier();
  const relay = createRelayServer(
    {
      host: "127.0.0.1",
      port: 0,
      sessionTtlMs: 60_000,
      frameCacheSize: 8,
    },
    {
      pushRegistrationStore,
      pushNotifier,
    },
  );
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const sessionKey = generateSessionKey();
  const appSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-one`,
  );
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attachedPromise).type, "relay:attached");

  appSocket.send(
    JSON.stringify({
      type: "app:register_push",
      token: "push-token-one",
    }),
  );
  appSocket.close();
  await waitForClose(appSocket);

  const bufferedEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-1",
      text: "wake the offline app",
      sentAt: new Date().toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: bufferedEnvelope }),
  );

  await waitForCondition(() => pushNotifier.sent.length === 1);
  assert.deepEqual(pushNotifier.sent, [
    {
      sessionId,
      appId: "app-one",
      token: "push-token-one",
    },
  ]);

  const reattachedAppSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-one`,
  );
  const messagesPromise = nextMessages(reattachedAppSocket, 2);
  await waitForOpen(reattachedAppSocket);
  const [attached, replayed] = await messagesPromise;
  assert.equal(attached.type, "relay:attached");
  assert.equal(replayed.type, "relay:frame");
  const decryptedReplay = decryptPayload({
    sessionId,
    sessionKey,
    envelope: replayed.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(decryptedReplay.kind, "assistant_message");
  assert.equal(decryptedReplay.text, "wake the offline app");

  reattachedAppSocket.close();
  providerSocket.close();
  await Promise.all([waitForClose(reattachedAppSocket), waitForClose(providerSocket)]);
});

test("relay coalesces repeated wake pushes for the same offline app within the cooldown window", async (t) => {
  const pushRegistrationStore = new InMemoryRelayPushRegistrationStore();
  const pushNotifier = new TestPushNotifier();
  let currentTime = Date.now();
  const relay = createRelayServer(
    {
      host: "127.0.0.1",
      port: 0,
      sessionTtlMs: 60_000,
      frameCacheSize: 8,
    },
    {
      pushRegistrationStore,
      pushNotifier,
      now: () => currentTime,
    },
  );
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({
      type: "provider:create_session",
      requestId: "req-cooldown",
      ttlMs: 60_000,
    }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const sessionKey = generateSessionKey();
  const appSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-one`,
  );
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attachedPromise).type, "relay:attached");

  appSocket.send(
    JSON.stringify({
      type: "app:register_push",
      token: "push-token-one",
    }),
  );
  appSocket.close();
  await waitForClose(appSocket);

  const firstEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-cooldown-1",
      text: "first buffered frame",
      sentAt: new Date(currentTime).toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: firstEnvelope }),
  );
  await waitForCondition(() => pushNotifier.sent.length === 1);

  const secondEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-cooldown-2",
      text: "second buffered frame",
      sentAt: new Date(currentTime + 1_000).toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: secondEnvelope }),
  );
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(pushNotifier.sent.length, 1);

  currentTime += 6_000;
  const thirdEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-cooldown-3",
      text: "third buffered frame",
      sentAt: new Date(currentTime).toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: thirdEnvelope }),
  );
  await waitForCondition(() => pushNotifier.sent.length === 2);

  assert.deepEqual(pushNotifier.sent, [
    {
      sessionId,
      appId: "app-one",
      token: "push-token-one",
    },
    {
      sessionId,
      appId: "app-one",
      token: "push-token-one",
    },
  ]);

  providerSocket.close();
  await waitForClose(providerSocket);
});

test("relay rejects app frames while the provider is disconnected and resumes after reattach", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerId = "provider-reconnect";
  const providerSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/provider?providerId=${providerId}`,
  );
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  const ready = await readyPromise;
  assert.equal(ready.type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const sessionKey = generateSessionKey();
  const appSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const attached = await attachedPromise;
  assert.equal(attached.type, "relay:attached");

  providerSocket.close();
  await waitForClose(providerSocket);

  const unavailableEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "should fail while provider is away",
      clientMessageId: "client-1",
      sentAt: new Date().toISOString(),
    },
  });
  const appUnavailablePromise = nextMessage(appSocket);
  appSocket.send(JSON.stringify({ type: "app:frame", envelope: unavailableEnvelope }));
  const appUnavailable = await appUnavailablePromise;
  assert.equal(appUnavailable.type, "relay:error");
  assert.equal(appUnavailable.code, "provider_unavailable");
  assert.equal(appUnavailable.sessionId, sessionId);

  const reattachedProviderSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/provider?providerId=${providerId}`,
  );
  const readyAgainPromise = nextMessage(reattachedProviderSocket);
  await waitForOpen(reattachedProviderSocket);
  const readyAgain = await readyAgainPromise;
  assert.equal(readyAgain.type, "relay:provider_ready");

  const resumedEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "delivered after provider reconnect",
      clientMessageId: "client-2",
      sentAt: new Date().toISOString(),
    },
  });
  const replayedPromise = nextMessage(reattachedProviderSocket);
  appSocket.send(JSON.stringify({ type: "app:frame", envelope: resumedEnvelope }));
  const replayed = await replayedPromise;
  assert.equal(replayed.type, "relay:frame");
  const decryptedReplay = decryptPayload({
    sessionId,
    sessionKey,
    envelope: replayed.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(decryptedReplay.kind, "user_message");
  assert.equal(decryptedReplay.text, "delivered after provider reconnect");

  appSocket.close();
  reattachedProviderSocket.close();
  await Promise.all([waitForClose(appSocket), waitForClose(reattachedProviderSocket)]);
});

test("relay renews the session expiry for the owning provider", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  const ready = await readyPromise;
  assert.equal(ready.type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({ type: "provider:create_session", requestId: "req-1", ttlMs: 60_000 }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);
  const initialExpiry = Date.parse(String(created.expiresAt));

  providerSocket.send(
    JSON.stringify({
      type: "provider:renew_session",
      requestId: "renew-1",
      sessionId,
      ttlMs: 120_000,
    }),
  );
  const renewed = await nextMessage(providerSocket);
  assert.equal(renewed.type, "relay:session_renewed");
  assert.equal(renewed.sessionId, sessionId);
  assert.ok(Date.parse(String(renewed.expiresAt)) > initialExpiry);

  const appSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}`);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const attached = await attachedPromise;
  assert.equal(attached.type, "relay:attached");
  assert.equal(attached.expiresAt, renewed.expiresAt);

  appSocket.close();
  providerSocket.close();
  await Promise.all([waitForClose(appSocket), waitForClose(providerSocket)]);
});

test("relay group sessions allow multiple app clients and broadcast provider frames", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  const ready = await readyPromise;
  assert.equal(ready.type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({
      type: "provider:create_session",
      requestId: "group-req-1",
      ttlMs: 60_000,
      groupMode: true,
    }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const appOne = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-one`,
  );
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");

  const appTwo = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-two`,
  );
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");

  const sessionKey = generateSessionKey();
  const envelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-1",
      text: "hello group",
      sentAt: new Date().toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope }),
  );

  const [frameOne, frameTwo] = await Promise.all([
    nextMessage(appOne),
    nextMessage(appTwo),
  ]);
  assert.equal(frameOne.type, "relay:frame");
  assert.equal(frameTwo.type, "relay:frame");

  const payloadOne = decryptPayload({
    sessionId,
    sessionKey,
    envelope: frameOne.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  const payloadTwo = decryptPayload({
    sessionId,
    sessionKey,
    envelope: frameTwo.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(payloadOne.kind, "assistant_message");
  assert.equal(payloadTwo.kind, "assistant_message");
  assert.equal(payloadOne.text, "hello group");
  assert.equal(payloadTwo.text, "hello group");

  appOne.close();
  appTwo.close();
  providerSocket.close();
  await Promise.all([
    waitForClose(appOne),
    waitForClose(appTwo),
    waitForClose(providerSocket),
  ]);
});

test("relay group sessions replay missed broadcast frames to offline registered apps", async (t) => {
  const pushRegistrationStore = new InMemoryRelayPushRegistrationStore();
  const pushNotifier = new TestPushNotifier();
  const relay = createRelayServer(
    {
      host: "127.0.0.1",
      port: 0,
      sessionTtlMs: 60_000,
      frameCacheSize: 8,
    },
    {
      pushRegistrationStore,
      pushNotifier,
    },
  );
  const { port } = await relay.start();
  t.after(async () => {
    await relay.stop();
  });

  const providerSocket = new WebSocket(`ws://127.0.0.1:${port}/ws/provider`);
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({
      type: "provider:create_session",
      requestId: "group-offline-req-1",
      ttlMs: 60_000,
      groupMode: true,
    }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const appOne = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-one`,
  );
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");

  const appTwo = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-two`,
  );
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");

  appTwo.send(
    JSON.stringify({
      type: "app:register_push",
      token: "push-token-two",
    }),
  );
  appTwo.close();
  await waitForClose(appTwo);

  const sessionKey = generateSessionKey();
  const envelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-offline-1",
      text: "offline group replay",
      sentAt: new Date().toISOString(),
    },
  });
  const liveFramePromise = nextMessage(appOne);
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope }),
  );

  const liveFrame = await liveFramePromise;
  assert.equal(liveFrame.type, "relay:frame");
  assert.equal(
    decryptPayload({
      sessionId,
      sessionKey,
      envelope: liveFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
    }).text,
    "offline group replay",
  );

  await waitForCondition(() => pushNotifier.sent.length === 1);
  assert.deepEqual(pushNotifier.sent, [
    {
      sessionId,
      appId: "app-two",
      token: "push-token-two",
    },
  ]);

  const reattachedAppTwo = new WebSocket(
    `ws://127.0.0.1:${port}/ws/app?sessionId=${sessionId}&appId=app-two`,
  );
  const replayedMessagesPromise = nextMessages(reattachedAppTwo, 2);
  await waitForOpen(reattachedAppTwo);
  const [attached, replayed] = await replayedMessagesPromise;
  assert.equal(attached.type, "relay:attached");
  assert.equal(replayed.type, "relay:frame");
  assert.equal(
    decryptPayload({
      sessionId,
      sessionKey,
      envelope: replayed.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
    }).text,
    "offline group replay",
  );

  appOne.close();
  reattachedAppTwo.close();
  providerSocket.close();
  await Promise.all([
    waitForClose(appOne),
    waitForClose(reattachedAppTwo),
    waitForClose(providerSocket),
  ]);
});

test("relay cluster routes provider and app frames across relay instances", async (t) => {
  const sharedFrameCache = createInMemoryEncryptedFrameCache(8);
  const sharedSessionStore = new InMemoryRelaySessionStore();
  const sharedCluster = createInMemoryRelayClusterSharedState();
  const clusters: RelayClusterClient[] = [];

  const relayOne = createRelayServer(
    {
      host: "127.0.0.1",
      port: 0,
      sessionTtlMs: 60_000,
      frameCacheSize: 8,
    },
    {
      frameCache: sharedFrameCache,
      sessionStore: sharedSessionStore,
      clusterFactory: (callbacks: RelayClusterCallbacks) => {
        const cluster = createInMemoryRelayClusterClient({
          shared: sharedCluster,
          nodeId: "relay-one",
          callbacks,
        });
        clusters.push(cluster);
        return cluster;
      },
    },
  );
  const relayTwo = createRelayServer(
    {
      host: "127.0.0.1",
      port: 0,
      sessionTtlMs: 60_000,
      frameCacheSize: 8,
    },
    {
      frameCache: sharedFrameCache,
      sessionStore: sharedSessionStore,
      clusterFactory: (callbacks: RelayClusterCallbacks) => {
        const cluster = createInMemoryRelayClusterClient({
          shared: sharedCluster,
          nodeId: "relay-two",
          callbacks,
        });
        clusters.push(cluster);
        return cluster;
      },
    },
  );

  const [{ port: portOne }, { port: portTwo }] = await Promise.all([
    relayOne.start(),
    relayTwo.start(),
  ]);
  t.after(async () => {
    await relayOne.stop();
    await relayTwo.stop();
    await Promise.all(clusters.map((cluster) => cluster.close()));
    await sharedFrameCache.close();
    await sharedSessionStore.close();
  });

  const providerSocket = new WebSocket(
    `ws://127.0.0.1:${portOne}/ws/provider?providerId=provider-cluster`,
  );
  const readyPromise = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await readyPromise).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({
      type: "provider:create_session",
      requestId: "cluster-req-1",
      ttlMs: 60_000,
      groupMode: true,
    }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);

  const appOne = new WebSocket(
    `ws://127.0.0.1:${portOne}/ws/app?sessionId=${sessionId}&appId=app-one`,
  );
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");

  const appTwo = new WebSocket(
    `ws://127.0.0.1:${portTwo}/ws/app?sessionId=${sessionId}&appId=app-two`,
  );
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");

  const sessionKey = generateSessionKey();
  const providerEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      messageId: "assistant-1",
      text: "hello from clustered relay",
      sentAt: new Date().toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: providerEnvelope }),
  );

  const [appOneFrame, appTwoFrame] = await Promise.all([
    nextMessage(appOne),
    nextMessage(appTwo),
  ]);
  assert.equal(appOneFrame.type, "relay:frame");
  assert.equal(appTwoFrame.type, "relay:frame");
  assert.equal(
    decryptPayload({
      sessionId,
      sessionKey,
      envelope: appTwoFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
    }).text,
    "hello from clustered relay",
  );

  const appTwoEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "hello provider from relay two",
      clientMessageId: "client-2",
      sentAt: new Date().toISOString(),
    },
  });
  appTwo.send(JSON.stringify({ type: "app:frame", envelope: appTwoEnvelope }));
  const forwardedUser = await nextMessage(providerSocket);
  assert.equal(forwardedUser.type, "relay:frame");
  assert.equal(
    decryptPayload({
      sessionId,
      sessionKey,
      envelope: forwardedUser.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
    }).text,
    "hello provider from relay two",
  );

  appOne.close();
  appTwo.close();
  providerSocket.close();
  await Promise.all([
    waitForClose(appOne),
    waitForClose(appTwo),
    waitForClose(providerSocket),
  ]);
});

test("relay blocks Redis-style shared sessions until the provider reconnects after a relay restart", async (t) => {
  const sharedFrameCache = createInMemoryEncryptedFrameCache(8);
  const sharedSessionStore = new (class extends InMemoryRelaySessionStore {
    readonly persistent = true;
  })();
  const sharedCluster = createInMemoryRelayClusterSharedState();
  const clusters: RelayClusterClient[] = [];

  const buildRelay = (nodeId: string) =>
    createRelayServer(
      {
        host: "127.0.0.1",
        port: 0,
        sessionTtlMs: 60_000,
        frameCacheSize: 8,
      },
      {
        frameCache: sharedFrameCache,
        sessionStore: sharedSessionStore,
        clusterFactory: (callbacks: RelayClusterCallbacks) => {
          const cluster = createInMemoryRelayClusterClient({
            shared: sharedCluster,
            nodeId,
            callbacks,
          });
          clusters.push(cluster);
          return cluster;
        },
      },
    );

  const relayOne = buildRelay("relay-restart-one");
  const { port: portOne } = await relayOne.start();

  let providerSocket = new WebSocket(
    `ws://127.0.0.1:${portOne}/ws/provider?providerId=provider-restart`,
  );
  let providerReady = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await providerReady).type, "relay:provider_ready");

  providerSocket.send(
    JSON.stringify({
      type: "provider:create_session",
      requestId: "restart-req-1",
      ttlMs: 60_000,
    }),
  );
  const created = await nextMessage(providerSocket);
  assert.equal(created.type, "relay:session_created");
  const sessionId = String(created.sessionId);
  const sessionKey = generateSessionKey();

  await relayOne.stop();
  await waitForClose(providerSocket);

  const relayTwo = buildRelay("relay-restart-two");
  const { port: portTwo } = await relayTwo.start();
  t.after(async () => {
    await relayTwo.stop();
    await Promise.all(clusters.map((cluster) => cluster.close()));
    await sharedFrameCache.close();
    await sharedSessionStore.close();
  });

  const appSocket = new WebSocket(
    `ws://127.0.0.1:${portTwo}/ws/app?sessionId=${sessionId}&appId=restarted-app`,
  );
  const appUnavailablePromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const appUnavailable = await appUnavailablePromise;
  assert.equal(appUnavailable.type, "relay:error");
  assert.equal(appUnavailable.code, "provider_unavailable");
  assert.equal(appUnavailable.sessionId, sessionId);
  await waitForClose(appSocket);

  providerSocket = new WebSocket(
    `ws://127.0.0.1:${portTwo}/ws/provider?providerId=provider-restart`,
  );
  providerReady = nextMessage(providerSocket);
  await waitForOpen(providerSocket);
  assert.equal((await providerReady).type, "relay:provider_ready");

  const recoveredAppSocket = new WebSocket(
    `ws://127.0.0.1:${portTwo}/ws/app?sessionId=${sessionId}&appId=restarted-app`,
  );
  const recoveredAppAttached = nextMessage(recoveredAppSocket);
  await waitForOpen(recoveredAppSocket);
  assert.equal((await recoveredAppAttached).type, "relay:attached");

  const liveEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "still here after restart",
      clientMessageId: "client-restart-1",
      sentAt: new Date().toISOString(),
    },
  });
  const replayedFramePromise = nextMessage(providerSocket);
  recoveredAppSocket.send(JSON.stringify({ type: "app:frame", envelope: liveEnvelope }));
  const replayedFrame = await replayedFramePromise;
  assert.equal(replayedFrame.type, "relay:frame");
  assert.equal(
    decryptPayload({
      sessionId,
      sessionKey,
      envelope: replayedFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
    }).text,
    "still here after restart",
  );

  const providerReply = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "assistant_message",
      text: "same QR still works",
      sentAt: new Date().toISOString(),
    },
  });
  providerSocket.send(
    JSON.stringify({ type: "provider:frame", sessionId, envelope: providerReply }),
  );
  const appFrame = await nextMessage(recoveredAppSocket);
  assert.equal(appFrame.type, "relay:frame");
  assert.equal(
    decryptPayload({
      sessionId,
      sessionKey,
      envelope: appFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
    }).text,
    "same QR still works",
  );

  recoveredAppSocket.close();
  providerSocket.close();
  await Promise.all([
    waitForClose(recoveredAppSocket),
    waitForClose(providerSocket),
  ]);
});
