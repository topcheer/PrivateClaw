import assert from "node:assert/strict";
import test from "node:test";
import { decryptPayload, encryptPayload, generateSessionKey } from "@privateclaw/protocol";
import WebSocket from "ws";
import { createRelayServer } from "./relay-server.js";

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

test("relay preserves a session after provider disconnect and replays buffered frames on reattach", async (t) => {
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

  const bufferedEnvelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "buffered while provider was away",
      clientMessageId: "client-1",
      sentAt: new Date().toISOString(),
    },
  });
  appSocket.send(JSON.stringify({ type: "app:frame", envelope: bufferedEnvelope }));

  const reattachedProviderSocket = new WebSocket(
    `ws://127.0.0.1:${port}/ws/provider?providerId=${providerId}`,
  );
  const providerMessagesPromise = nextMessages(reattachedProviderSocket, 2);
  await waitForOpen(reattachedProviderSocket);
  const [readyAgain, replayed] = await providerMessagesPromise;
  assert.equal(readyAgain.type, "relay:provider_ready");
  assert.equal(replayed.type, "relay:frame");
  const decryptedReplay = decryptPayload({
    sessionId,
    sessionKey,
    envelope: replayed.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(decryptedReplay.kind, "user_message");
  assert.equal(decryptedReplay.text, "buffered while provider was away");

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
