import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeInviteString,
  decryptPayload,
  encryptPayload,
  type PrivateClawPayload,
} from "@privateclaw/protocol";
import WebSocket from "ws";
import { createRelayServer } from "../../../services/relay-server/src/relay-server.js";
import { EchoBridge } from "./bridges/echo-bridge.js";
import { PrivateClawProvider } from "./provider.js";

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

async function nextRelayFrame(socket: WebSocket): Promise<Record<string, unknown>> {
  while (true) {
    const message = await nextMessage(socket);
    if (message.type === "relay:frame") {
      return message;
    }
  }
}

async function nextRelayPayload(
  socket: WebSocket,
  params: { sessionId: string; sessionKey: string },
): Promise<PrivateClawPayload> {
  const frame = await nextRelayFrame(socket);
  return decryptPayload({
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    envelope: frame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
}

function decryptRelayPayload(
  frame: Record<string, unknown>,
  params: { sessionId: string; sessionKey: string },
): PrivateClawPayload {
  return decryptPayload({
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    envelope: frame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
}

test("provider creates one-time invites and replies through the encrypted relay", async (t) => {
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

  const provider = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    welcomeMessage: "欢迎来到 PrivateClaw",
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle();
  const invite = decodeInviteString(inviteBundle.inviteUri);
  assert.equal(invite.sessionId, inviteBundle.invite.sessionId);

  const appSocket = new WebSocket(invite.appWsUrl);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const attached = await attachedPromise;
  assert.equal(attached.type, "relay:attached");

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appVersion: "flutter-test",
          deviceLabel: "Simulator",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const initialFrames = await nextMessages(appSocket, 2);
  const [welcomeFrame, capabilitiesFrame] = initialFrames;
  assert.ok(welcomeFrame);
  assert.ok(capabilitiesFrame);
  const welcome = decryptRelayPayload(welcomeFrame, invite);
  assert.equal(welcome.kind, "server_welcome");
  assert.equal(welcome.message, "欢迎来到 PrivateClaw");
  const capabilities = decryptRelayPayload(capabilitiesFrame, invite);
  assert.equal(capabilities.kind, "provider_capabilities");
  assert.match(
    JSON.stringify(capabilities.commands),
    /renew-session/,
  );

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          text: "你好",
          clientMessageId: "client-message-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const assistant = await nextRelayPayload(appSocket, invite);
  assert.equal(assistant.kind, "assistant_message");
  assert.match(assistant.text, /你好/);

  appSocket.close();
  await waitForClose(appSocket);
});

test("provider renews the session key and keeps the chat usable after re-handshake", async (t) => {
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

  const provider = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle();
  let invite = decodeInviteString(inviteBundle.inviteUri);

  const appSocket = new WebSocket(invite.appWsUrl);
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  const attached = await attachedPromise;
  assert.equal(attached.type, "relay:attached");

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appVersion: "flutter-test",
          deviceLabel: "Simulator",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const initialFrames = await nextMessages(appSocket, 2);
  const [initialWelcomeFrame, initialCapabilitiesFrame] = initialFrames;
  assert.ok(initialWelcomeFrame);
  assert.ok(initialCapabilitiesFrame);
  const initialWelcome = decryptRelayPayload(initialWelcomeFrame, invite);
  assert.equal(initialWelcome.kind, "server_welcome");
  const initialCapabilities = decryptRelayPayload(initialCapabilitiesFrame, invite);
  assert.equal(initialCapabilities.kind, "provider_capabilities");

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          text: "/renew-session",
          clientMessageId: "renew-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const renewed = await nextRelayPayload(appSocket, invite);
  assert.equal(renewed.kind, "session_renewed");
  assert.equal(renewed.replyTo, "renew-1");
  assert.ok(typeof renewed.newSessionKey === "string" && renewed.newSessionKey.length > 10);

  invite = {
    ...invite,
    sessionKey: renewed.newSessionKey,
    expiresAt: renewed.expiresAt,
  };

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appVersion: "flutter-test",
          deviceLabel: "Simulator",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const renewedCapabilities = await nextRelayPayload(appSocket, invite);
  assert.equal(renewedCapabilities.kind, "provider_capabilities");
  assert.equal(renewedCapabilities.expiresAt, renewed.expiresAt);

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          text: "still there?",
          clientMessageId: "client-message-2",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const assistant = await nextRelayPayload(appSocket, invite);
  assert.equal(assistant.kind, "assistant_message");
  assert.match(assistant.text, /still there\?/);

  appSocket.close();
  await waitForClose(appSocket);
});
