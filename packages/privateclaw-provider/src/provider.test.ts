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
import { DEFAULT_SESSION_TTL_MS, PrivateClawProvider } from "./provider.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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

function waitForNoMessage(socket: WebSocket, delayMs = 60): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);

    const handleMessage = (data: WebSocket.RawData) => {
      cleanup();
      reject(new Error(`unexpected message: ${data.toString()}`));
    };

    const handleError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", handleMessage);
      socket.off("error", handleError);
    };

    socket.on("message", handleMessage);
    socket.on("error", handleError);
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

class GroupBridge {
  readonly conversationMessages: string[] = [];

  async handleUserMessage(params: {
    sessionId: string;
    message: string;
  }): Promise<string> {
    this.conversationMessages.push(params.message);
    return `OpenClaw bridge: ${params.message}`;
  }
}

class VoiceTranscribingBridge {
  readonly conversationMessages: string[] = [];
  readonly transcriptionRequests: Array<{ sessionId: string; requestId: string }> = [];

  async transcribeAudioAttachments(params: {
    sessionId: string;
    requestId: string;
  }): Promise<string> {
    this.transcriptionRequests.push({
      sessionId: params.sessionId,
      requestId: params.requestId,
    });
    return "你好世界";
  }

  async handleUserMessage(params: {
    message: string;
  }): Promise<string> {
    this.conversationMessages.push(params.message);
    return `OpenClaw bridge: ${params.message}`;
  }
}

function buildVoiceAttachment() {
  return {
    id: "voice-attachment-1",
    name: "voice.m4a",
    mimeType: "audio/mp4",
    sizeBytes: 16,
    dataBase64: Buffer.from("voice-bytes").toString("base64"),
  };
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
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
    welcomeMessage: "欢迎来到 PrivateClaw",
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle();
  const invite = decodeInviteString(inviteBundle.inviteUri);
  assert.equal(invite.sessionId, inviteBundle.invite.sessionId);
  assert.equal(invite.relayLabel, `127.0.0.1:${port}`);

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
  assert.match(
    JSON.stringify(capabilities.commands),
    /session-qr/,
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

  appSocket.terminate();
});

test("provider can hand off an active session to a successor provider", async (t) => {
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

  const providerOne = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
    welcomeMessage: "欢迎来到 PrivateClaw",
  });
  await providerOne.connect();
  let providerOneDisposed = false;
  t.after(async () => {
    if (!providerOneDisposed) {
      await providerOne.dispose();
    }
  });

  const inviteBundle = await providerOne.createInviteBundle();
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "handoff-app");
  const appSocket = new WebSocket(appUrl.toString());
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attachedPromise).type, "relay:attached");

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "handoff-app",
          displayName: "Handoff Tester",
          appVersion: "flutter-test",
          deviceLabel: "Simulator",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await nextMessages(appSocket, 2);

  providerOne.suppressReconnectsForHandoff();
  const handoffState = providerOne.exportHandoffState();
  assert.equal(handoffState.sessions.length, 1);
  assert.equal(handoffState.sessions[0]?.participants.length, 1);

  const providerTwo = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    providerId: handoffState.providerId,
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
    welcomeMessage: "欢迎来到 PrivateClaw",
  });
  providerTwo.importHandoffState(handoffState);
  await providerTwo.connect();
  t.after(async () => {
    await providerTwo.dispose();
  });

  await providerOne.dispose({ closeSessions: false });
  providerOneDisposed = true;

  const resumedSession = providerTwo.listManagedSessions()[0];
  assert.ok(resumedSession);
  assert.equal(resumedSession?.participantCount, 1);

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          text: "after handoff",
          clientMessageId: "client-message-handoff",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const assistant = await nextRelayPayload(appSocket, invite);
  assert.equal(assistant.kind, "assistant_message");
  assert.match(assistant.text, /after handoff/);

  appSocket.close();
  await waitForClose(appSocket);
});

test("provider acknowledges voice uploads before forwarding transcript-derived replies", async (t) => {
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

  const bridge = new VoiceTranscribingBridge();
  const provider = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge,
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
    welcomeMessage: "欢迎来到 PrivateClaw",
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle();
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "voice-app");
  const appSocket = new WebSocket(appUrl.toString());
  const attachedPromise = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attachedPromise).type, "relay:attached");

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "voice-app",
          displayName: "小明",
          appVersion: "flutter-test",
          deviceLabel: "Simulator",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await nextMessages(appSocket, 2);

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "voice-app",
          displayName: "小明",
          text: "",
          attachments: [buildVoiceAttachment()],
          clientMessageId: "voice-message-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const voiceFrames = await nextMessages(appSocket, 3);
  const voiceReceipt = decryptRelayPayload(voiceFrames[0]!, invite);
  assert.equal(voiceReceipt.kind, "system_message");
  assert.match(voiceReceipt.message, /已经收到你的语音/u);
  assert.match(voiceReceipt.message, /working on understanding/i);
  assert.equal(voiceReceipt.replyTo, undefined);

  const pendingReply = decryptRelayPayload(voiceFrames[1]!, invite);
  assert.equal(pendingReply.kind, "assistant_message");
  assert.equal(pendingReply.replyTo, "voice-message-1");
  assert.equal(pendingReply.pending, true);
  assert.equal(pendingReply.messageId, "pending-voice-message-1");
  assert.equal(pendingReply.text, "");

  const assistant = decryptRelayPayload(voiceFrames[2]!, invite);
  assert.equal(assistant.kind, "assistant_message");
  assert.notEqual(assistant.pending, true);
  assert.match(assistant.text, /小明说：你好世界/u);
  assert.deepEqual(bridge.transcriptionRequests, [
    {
      sessionId: invite.sessionId,
      requestId: "voice-message-1",
    },
  ]);
  assert.equal(bridge.conversationMessages.length, 1);
  assert.match(
    bridge.conversationMessages[0] ?? "",
    /speech-to-text transcript of a user's voice message/u,
  );
  assert.match(bridge.conversationMessages[0] ?? "", /小明说：你好世界/u);

  appSocket.terminate();
});

test("provider returns the current session QR only to the requesting participant", async (t) => {
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
    bridge: new GroupBridge(),
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFrames = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          displayName: "SolarFox",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await appOneInitialFrames;

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoInitialFrames = nextMessages(appTwo, 3);
  const appOneJoinFrames = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "RiverCat",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await Promise.all([appTwoInitialFrames, appOneJoinFrames]);

  const appOneQrFramesPromise = nextMessages(appOne, 1);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-one",
          text: "/session-qr",
          clientMessageId: "session-qr-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [appOneQrFrames] = await Promise.all([
    appOneQrFramesPromise,
    waitForNoMessage(appTwo),
  ]);
  const qrPayload = decryptRelayPayload(appOneQrFrames[0]!, invite);
  assert.equal(qrPayload.kind, "assistant_message");
  assert.equal(qrPayload.replyTo, "session-qr-1");
  assert.match(qrPayload.text, /二维码|QR/i);
  assert.equal(qrPayload.attachments?.length, 1);
  const qrAttachment = qrPayload.attachments?.[0];
  assert.ok(qrAttachment);
  assert.equal(qrAttachment.mimeType, "image/png");
  assert.equal(qrAttachment.name, `privateclaw-${invite.sessionId}.png`);
  assert.ok(qrAttachment.dataBase64);
  assert.deepEqual(
    Buffer.from(qrAttachment.dataBase64, "base64").subarray(
      0,
      PNG_SIGNATURE.length,
    ),
    PNG_SIGNATURE,
  );

  appOne.terminate();
  appTwo.terminate();
});

test("provider can remove a group participant and reject the same app id on rejoin", async (t) => {
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
    bridge: new GroupBridge(),
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFrames = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          displayName: "SolarFox",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await appOneInitialFrames;

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoInitialFrames = nextMessages(appTwo, 3);
  const appOneJoinFrames = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "RiverCat",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await Promise.all([appTwoInitialFrames, appOneJoinFrames]);

  const appOneKickFrames = nextMessages(appOne, 2);
  const appTwoClosedMessage = new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const onMessage = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type !== "relay:session_closed") {
          return;
        }
        cleanup();
        resolve(message);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        appTwo.off("message", onMessage);
        appTwo.off("error", onError);
      };
      appTwo.on("message", onMessage);
      appTwo.on("error", onError);
    },
  );
  const kicked = await provider.kickGroupParticipant(invite.sessionId, "app-two");
  assert.equal(kicked.appId, "app-two");
  assert.equal(kicked.displayName, "RiverCat");

  const closed = await appTwoClosedMessage;
  assert.equal(closed.type, "relay:session_closed");
  assert.equal(closed.reason, "participant_removed");
  appTwo.close();
  await waitForClose(appTwo);

  const [kickNoticeFrame, capabilitiesFrame] = await appOneKickFrames;
  const kickNotice = decryptRelayPayload(kickNoticeFrame!, invite);
  assert.equal(kickNotice.kind, "system_message");
  assert.match(kickNotice.message, /移出群聊|removed from the group chat/i);
  const capabilities = decryptRelayPayload(capabilitiesFrame!, invite);
  assert.equal(capabilities.kind, "provider_capabilities");
  assert.equal(capabilities.participants?.length, 1);
  assert.equal(capabilities.participants?.[0]?.appId, "app-one");

  const appTwoReconnect = new WebSocket(appTwoUrl.toString());
  const appTwoReconnectAttached = nextMessage(appTwoReconnect);
  await waitForOpen(appTwoReconnect);
  assert.equal((await appTwoReconnectAttached).type, "relay:attached");
  const appTwoReconnectClosed = new Promise<Record<string, unknown>>(
    (resolve, reject) => {
      const onMessage = (data: WebSocket.RawData) => {
        const message = JSON.parse(data.toString()) as Record<string, unknown>;
        if (message.type !== "relay:session_closed") {
          return;
        }
        cleanup();
        resolve(message);
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        appTwoReconnect.off("message", onMessage);
        appTwoReconnect.off("error", onError);
      };
      appTwoReconnect.on("message", onMessage);
      appTwoReconnect.on("error", onError);
    },
  );
  appTwoReconnect.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "RiverCat",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  const reconnectClosed = await appTwoReconnectClosed;
  assert.equal(reconnectClosed.type, "relay:session_closed");
  assert.equal(reconnectClosed.reason, "participant_removed");
  await waitForClose(appTwoReconnect);

  appOne.close();
  await waitForClose(appOne);
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
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
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

test("provider group sessions broadcast participant messages and assign unique local participant labels", async (t) => {
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

  const bridge = new GroupBridge();
  const provider = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge,
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const firstFramesPromise = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const firstFrames = await firstFramesPromise;
  const firstCapabilities = decryptRelayPayload(firstFrames[1]!, invite);
  assert.equal(firstCapabilities.kind, "provider_capabilities");
  assert.equal(firstCapabilities.groupMode, true);
  assert.equal(typeof firstCapabilities.currentDisplayName, "string");
  assert.notEqual(firstCapabilities.currentDisplayName, "");
  const firstDisplayName = firstCapabilities.currentDisplayName;

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoFramesPromise = nextMessages(appTwo, 3);
  const appOneJoinFramesPromise = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [appTwoFrames, appOneJoinFrames] = await Promise.all([
    appTwoFramesPromise,
    appOneJoinFramesPromise,
  ]);
  const appOneJoinNotice = decryptRelayPayload(appOneJoinFrames[0]!, invite);
  assert.equal(appOneJoinNotice.kind, "system_message");
  assert.match(appOneJoinNotice.message, /joined the group chat/i);

  const appTwoCapabilities = decryptRelayPayload(appTwoFrames[1]!, invite);
  assert.equal(appTwoCapabilities.kind, "provider_capabilities");
  assert.equal(appTwoCapabilities.groupMode, true);
  assert.equal(typeof appTwoCapabilities.currentDisplayName, "string");
  assert.notEqual(appTwoCapabilities.currentDisplayName, "");
  assert.notEqual(appTwoCapabilities.currentDisplayName, firstDisplayName);
  const secondDisplayName = appTwoCapabilities.currentDisplayName;
  const participantLabels =
    appTwoCapabilities.participants?.map((participant) => participant.displayName) ?? [];
  assert.equal(new Set(participantLabels).size, participantLabels.length);
  assert.ok(participantLabels.includes(firstDisplayName));
  assert.ok(participantLabels.includes(secondDisplayName));

  const appOnePayloadFramesPromise = nextMessages(appOne, 2);
  const appTwoPayloadFramesPromise = nextMessages(appTwo, 2);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-one",
          text: "hello team",
          clientMessageId: "group-message-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [appOnePayloadFrames, appTwoPayloadFrames] = await Promise.all([
    appOnePayloadFramesPromise,
    appTwoPayloadFramesPromise,
  ]);
  const appOneParticipantFrame = decryptRelayPayload(
    appOnePayloadFrames[0]!,
    invite,
  );
  const appTwoParticipantFrame = decryptRelayPayload(
    appTwoPayloadFrames[0]!,
    invite,
  );
  assert.equal(appOneParticipantFrame.kind, "participant_message");
  assert.equal(appTwoParticipantFrame.kind, "participant_message");
  assert.equal(appTwoParticipantFrame.senderDisplayName, firstDisplayName);
  assert.equal(appTwoParticipantFrame.text, "hello team");

  const appOneAssistant = decryptRelayPayload(appOnePayloadFrames[1]!, invite);
  const appTwoAssistant = decryptRelayPayload(appTwoPayloadFrames[1]!, invite);
  assert.equal(appOneAssistant.kind, "assistant_message");
  assert.equal(appTwoAssistant.kind, "assistant_message");
  assert.match(appTwoAssistant.text, new RegExp(`${firstDisplayName}: hello team`, "u"));

  appOne.close();
  appTwo.close();
  await Promise.all([waitForClose(appOne), waitForClose(appTwo)]);
});

test("provider group sessions broadcast raw voice first and only reply with the final assistant answer", async (t) => {
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

  const bridge = new VoiceTranscribingBridge();
  const provider = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge,
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFramesPromise = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          displayName: "小明",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await appOneInitialFramesPromise;

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoFramesPromise = nextMessages(appTwo, 3);
  const appOneJoinFramesPromise = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "小红",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await Promise.all([appTwoFramesPromise, appOneJoinFramesPromise]);

  const appOnePayloadFramesPromise = nextMessages(appOne, 3);
  const appTwoPayloadFramesPromise = nextMessages(appTwo, 2);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-one",
          displayName: "小明",
          text: "",
          attachments: [buildVoiceAttachment()],
          clientMessageId: "group-voice-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [appOnePayloadFrames, appTwoPayloadFrames] = await Promise.all([
    appOnePayloadFramesPromise,
    appTwoPayloadFramesPromise,
  ]);
  const appOneParticipantFrame = decryptRelayPayload(
    appOnePayloadFrames[0]!,
    invite,
  );
  const appTwoParticipantFrame = decryptRelayPayload(
    appTwoPayloadFrames[0]!,
    invite,
  );
  assert.equal(appOneParticipantFrame.kind, "system_message");
  assert.match(appOneParticipantFrame.message, /已经收到你的语音/u);
  assert.match(appOneParticipantFrame.message, /working on understanding/i);
  assert.equal(appOneParticipantFrame.replyTo, undefined);

  const appOnePendingFrame = decryptRelayPayload(appOnePayloadFrames[1]!, invite);
  assert.equal(appOnePendingFrame.kind, "assistant_message");
  assert.equal(appOnePendingFrame.pending, true);
  assert.equal(appOnePendingFrame.replyTo, "group-voice-1");
  assert.equal(appOnePendingFrame.messageId, "pending-group-voice-1");
  assert.equal(appOnePendingFrame.text, "");

  assert.equal(appTwoParticipantFrame.kind, "participant_message");
  assert.equal(appTwoParticipantFrame.text, "");
  assert.equal(appTwoParticipantFrame.attachments?.length, 1);
  assert.equal(appTwoParticipantFrame.attachments?.[0]?.mimeType, "audio/mp4");

  const appOneAssistant = decryptRelayPayload(appOnePayloadFrames[2]!, invite);
  assert.equal(appOneAssistant.kind, "assistant_message");
  assert.notEqual(appOneAssistant.pending, true);
  const appTwoAssistant = decryptRelayPayload(appTwoPayloadFrames[1]!, invite);
  assert.equal(appTwoAssistant.kind, "assistant_message");
  assert.notEqual(appTwoAssistant.pending, true);
  assert.match(appTwoAssistant.text, /小明说：你好世界/u);
  assert.equal(appOneAssistant.text, appTwoAssistant.text);
  assert.equal(bridge.conversationMessages.length, 1);
  assert.match(
    bridge.conversationMessages[0] ?? "",
    /speech-to-text transcript of a user's voice message/u,
  );
  assert.match(bridge.conversationMessages[0] ?? "", /小明说：你好世界/u);

  appOne.close();
  appTwo.close();
  await Promise.all([waitForClose(appOne), waitForClose(appTwo)]);
});

test("provider keeps generated participant labels stable across reconnects", async (t) => {
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
    bridge: new GroupBridge(),
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFramesPromise = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  const appOneInitialCapabilities = decryptRelayPayload(
    (await appOneInitialFramesPromise)[1]!,
    invite,
  );
  assert.equal(appOneInitialCapabilities.kind, "provider_capabilities");
  const firstDisplayName = appOneInitialCapabilities.currentDisplayName;
  assert.equal(typeof firstDisplayName, "string");

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoInitialFramesPromise = nextMessages(appTwo, 3);
  const appOneJoinFramesPromise = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  const [appTwoInitialFrames, appOneJoinFrames] = await Promise.all([
    appTwoInitialFramesPromise,
    appOneJoinFramesPromise,
  ]);
  const initialJoinNotice = decryptRelayPayload(appOneJoinFrames[0]!, invite);
  assert.equal(initialJoinNotice.kind, "system_message");
  const appTwoInitialCapabilities = decryptRelayPayload(appTwoInitialFrames[1]!, invite);
  assert.equal(appTwoInitialCapabilities.kind, "provider_capabilities");
  const secondDisplayName = appTwoInitialCapabilities.currentDisplayName;
  assert.equal(typeof secondDisplayName, "string");
  assert.notEqual(secondDisplayName, firstDisplayName);
  assert.match(initialJoinNotice.message, new RegExp(`${secondDisplayName} joined the group chat`, "u"));

  const appOneLeaveFramesPromise = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "session_close",
          reason: "user_disconnect",
          appId: "app-two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  const appOneLeaveFrames = await appOneLeaveFramesPromise;
  const leaveNotice = decryptRelayPayload(appOneLeaveFrames[0]!, invite);
  assert.equal(leaveNotice.kind, "system_message");
  assert.match(leaveNotice.message, new RegExp(`${secondDisplayName} left the group chat`, "u"));

  appTwo.close();
  await waitForClose(appTwo);

  const appTwoReconnect = new WebSocket(appTwoUrl.toString());
  const appTwoReconnectAttached = nextMessage(appTwoReconnect);
  await waitForOpen(appTwoReconnect);
  assert.equal((await appTwoReconnectAttached).type, "relay:attached");
  const appTwoReconnectFramesPromise = nextMessages(appTwoReconnect, 5);
  const appOneRejoinFramesPromise = nextMessages(appOne, 2);
  appTwoReconnect.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  const [appTwoReconnectFrames, appOneRejoinFrames] = await Promise.all([
    appTwoReconnectFramesPromise,
    appOneRejoinFramesPromise,
  ]);
  const rejoinNotice = decryptRelayPayload(appOneRejoinFrames[0]!, invite);
  assert.equal(rejoinNotice.kind, "system_message");
  assert.match(rejoinNotice.message, new RegExp(`${secondDisplayName} joined the group chat`, "u"));
  const reconnectPayloads = appTwoReconnectFrames.map((frame) =>
    decryptRelayPayload(frame, invite),
  );
  const reconnectCapabilities = reconnectPayloads.find(
    (payload) =>
      payload.kind === "provider_capabilities" &&
      payload.currentAppId === "app-two",
  );
  assert.ok(reconnectCapabilities);
  assert.equal(reconnectCapabilities.currentDisplayName, secondDisplayName);

  appOne.close();
  appTwoReconnect.close();
  await Promise.all([waitForClose(appOne), waitForClose(appTwoReconnect)]);
});

test("group sessions can mute and unmute bot replies without stopping participant chat", async (t) => {
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

  const bridge = new GroupBridge();
  const provider = new PrivateClawProvider({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge,
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFrames = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          displayName: "SolarFox",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await appOneInitialFrames;

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoInitialFrames = nextMessages(appTwo, 3);
  const appOneJoinFrames = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "RiverCat",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await Promise.all([appTwoInitialFrames, appOneJoinFrames]);

  const muteAppOneFramesPromise = nextMessages(appOne, 2);
  const muteAppTwoFramesPromise = nextMessages(appTwo, 2);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-one",
          text: "/mute-bot",
          clientMessageId: "mute-bot-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [muteAppOneFrames, muteAppTwoFrames] = await Promise.all([
    muteAppOneFramesPromise,
    muteAppTwoFramesPromise,
  ]);
  const muteNotice = decryptRelayPayload(muteAppOneFrames[0]!, invite);
  assert.equal(muteNotice.kind, "system_message");
  assert.equal(muteNotice.replyTo, "mute-bot-1");
  assert.match(muteNotice.message, /暂停机器人|pause(?:d)? bot replies/i);
  const peerMuteNotice = decryptRelayPayload(muteAppTwoFrames[0]!, invite);
  assert.equal(peerMuteNotice.kind, "system_message");
  assert.equal(peerMuteNotice.replyTo, undefined);
  assert.equal(peerMuteNotice.messageId, muteNotice.messageId);
  const muteCapabilities = decryptRelayPayload(muteAppOneFrames[1]!, invite);
  assert.equal(muteCapabilities.kind, "provider_capabilities");
  assert.equal(muteCapabilities.botMuted, true);
  assert.ok(
    muteCapabilities.commands.some((command) => command.slash === "/unmute-bot"),
  );
  assert.ok(
    muteCapabilities.commands.every((command) => command.slash !== "/mute-bot"),
  );
  const peerMuteCapabilities = decryptRelayPayload(muteAppTwoFrames[1]!, invite);
  assert.equal(peerMuteCapabilities.kind, "provider_capabilities");
  assert.equal(peerMuteCapabilities.botMuted, true);

  const bridgeCallsBeforeMutedMessage = bridge.conversationMessages.length;
  const mutedAppOneFramesPromise = nextMessages(appOne, 1);
  const mutedAppTwoFramesPromise = nextMessages(appTwo, 1);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-two",
          text: "please stay quiet",
          clientMessageId: "muted-message-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [mutedAppOneFrames, mutedAppTwoFrames] = await Promise.all([
    mutedAppOneFramesPromise,
    mutedAppTwoFramesPromise,
  ]);
  const mutedParticipantForAppOne = decryptRelayPayload(
    mutedAppOneFrames[0]!,
    invite,
  );
  const mutedParticipantForAppTwo = decryptRelayPayload(
    mutedAppTwoFrames[0]!,
    invite,
  );
  assert.equal(mutedParticipantForAppOne.kind, "participant_message");
  assert.equal(mutedParticipantForAppTwo.kind, "participant_message");
  assert.equal(bridge.conversationMessages.length, bridgeCallsBeforeMutedMessage);
  await Promise.all([waitForNoMessage(appOne), waitForNoMessage(appTwo)]);

  const unmuteAppOneFramesPromise = nextMessages(appOne, 2);
  const unmuteAppTwoFramesPromise = nextMessages(appTwo, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-two",
          text: "/unmute-bot",
          clientMessageId: "unmute-bot-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [unmuteAppOneFrames, unmuteAppTwoFrames] = await Promise.all([
    unmuteAppOneFramesPromise,
    unmuteAppTwoFramesPromise,
  ]);
  const peerUnmuteNotice = decryptRelayPayload(unmuteAppOneFrames[0]!, invite);
  assert.equal(peerUnmuteNotice.kind, "system_message");
  assert.equal(peerUnmuteNotice.replyTo, undefined);
  const unmuteNotice = decryptRelayPayload(unmuteAppTwoFrames[0]!, invite);
  assert.equal(unmuteNotice.kind, "system_message");
  assert.equal(unmuteNotice.replyTo, "unmute-bot-1");
  assert.equal(unmuteNotice.messageId, peerUnmuteNotice.messageId);
  assert.match(unmuteNotice.message, /恢复机器人|resume(?:d)? bot replies/i);
  const unmuteCapabilities = decryptRelayPayload(unmuteAppOneFrames[1]!, invite);
  assert.equal(unmuteCapabilities.kind, "provider_capabilities");
  assert.equal(unmuteCapabilities.botMuted, false);
  assert.ok(
    unmuteCapabilities.commands.some((command) => command.slash === "/mute-bot"),
  );
  assert.ok(
    unmuteCapabilities.commands.every((command) => command.slash !== "/unmute-bot"),
  );

  const bridgeCallsBeforeResumedMessage = bridge.conversationMessages.length;
  const resumedAppOneFramesPromise = nextMessages(appOne, 2);
  const resumedAppTwoFramesPromise = nextMessages(appTwo, 2);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-one",
          text: "bot come back",
          clientMessageId: "resumed-message-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [resumedAppOneFrames, resumedAppTwoFrames] = await Promise.all([
    resumedAppOneFramesPromise,
    resumedAppTwoFramesPromise,
  ]);
  const resumedAssistantForAppOne = decryptRelayPayload(
    resumedAppOneFrames[1]!,
    invite,
  );
  const resumedAssistantForAppTwo = decryptRelayPayload(
    resumedAppTwoFrames[1]!,
    invite,
  );
  assert.equal(resumedAssistantForAppOne.kind, "assistant_message");
  assert.equal(resumedAssistantForAppTwo.kind, "assistant_message");
  assert.match(resumedAssistantForAppTwo.text, /SolarFox: bot come back/);
  assert.equal(
    bridge.conversationMessages.length,
    bridgeCallsBeforeResumedMessage + 1,
  );

  appOne.close();
  appTwo.close();
  await Promise.all([waitForClose(appOne), waitForClose(appTwo)]);
});

test("group sessions keep running when one participant leaves and later rejoins", async (t) => {
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
    bridge: new GroupBridge(),
    defaultTtlMs: DEFAULT_SESSION_TTL_MS,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = nextMessage(appOne);
  await waitForOpen(appOne);
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFrames = nextMessages(appOne, 3);
  appOne.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-one",
          displayName: "SolarFox",
          appVersion: "flutter-test",
          deviceLabel: "Tester One",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await appOneInitialFrames;

  const appTwoUrl = new URL(invite.appWsUrl);
  appTwoUrl.searchParams.set("appId", "app-two");
  const appTwo = new WebSocket(appTwoUrl.toString());
  const appTwoAttached = nextMessage(appTwo);
  await waitForOpen(appTwo);
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoInitialFrames = nextMessages(appTwo, 3);
  const appOneJoinFrames = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "RiverCat",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await appTwoInitialFrames;
  const initialJoinNotice = decryptRelayPayload((await appOneJoinFrames)[0]!, invite);
  assert.equal(initialJoinNotice.kind, "system_message");
  assert.match(initialJoinNotice.message, /RiverCat joined the group chat/i);

  const appOneLeaveFramesPromise = nextMessages(appOne, 2);
  appTwo.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "session_close",
          reason: "user_disconnect",
          appId: "app-two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const appOneLeaveFrames = await appOneLeaveFramesPromise;
  const leaveNotice = decryptRelayPayload(appOneLeaveFrames[0]!, invite);
  assert.equal(leaveNotice.kind, "system_message");
  assert.match(leaveNotice.message, /RiverCat left the group chat/i);
  const leaveCapabilities = decryptRelayPayload(appOneLeaveFrames[1]!, invite);
  assert.equal(leaveCapabilities.kind, "provider_capabilities");
  assert.deepEqual(
    leaveCapabilities.participants?.map((participant) => participant.displayName),
    ["SolarFox"],
  );

  appTwo.close();
  await waitForClose(appTwo);

  const appTwoReconnect = new WebSocket(appTwoUrl.toString());
  const appTwoReconnectAttached = nextMessage(appTwoReconnect);
  await waitForOpen(appTwoReconnect);
  assert.equal((await appTwoReconnectAttached).type, "relay:attached");
  const appTwoReconnectFramesPromise = nextMessages(appTwoReconnect, 5);
  const appOneRejoinFramesPromise = nextMessages(appOne, 2);
  appTwoReconnect.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "app-two",
          displayName: "RiverCat",
          appVersion: "flutter-test",
          deviceLabel: "Tester Two",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [appTwoReconnectFrames, appOneRejoinFrames] = await Promise.all([
    appTwoReconnectFramesPromise,
    appOneRejoinFramesPromise,
  ]);
  const rejoinNotice = decryptRelayPayload(appOneRejoinFrames[0]!, invite);
  assert.equal(rejoinNotice.kind, "system_message");
  assert.match(rejoinNotice.message, /RiverCat joined the group chat/i);

  const reconnectPayloads = appTwoReconnectFrames.map((frame) =>
    decryptRelayPayload(frame, invite),
  );
  const reconnectCapabilities = reconnectPayloads.find(
    (payload) =>
      payload.kind === "provider_capabilities" &&
      payload.currentAppId === "app-two",
  );
  assert.ok(reconnectCapabilities);
  assert.equal(reconnectCapabilities.kind, "provider_capabilities");
  assert.equal(reconnectCapabilities.currentDisplayName, "RiverCat");

  const appOnePayloadFramesPromise = nextMessages(appOne, 2);
  const appTwoPayloadFramesPromise = nextMessages(appTwoReconnect, 2);
  appTwoReconnect.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "app-two",
          text: "back again",
          clientMessageId: "group-rejoin-message",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const [appOnePayloadFrames, appTwoPayloadFrames] = await Promise.all([
    appOnePayloadFramesPromise,
    appTwoPayloadFramesPromise,
  ]);
  const appOneParticipantFrame = decryptRelayPayload(
    appOnePayloadFrames[0]!,
    invite,
  );
  const appTwoParticipantFrame = decryptRelayPayload(
    appTwoPayloadFrames[0]!,
    invite,
  );
  assert.equal(appOneParticipantFrame.kind, "participant_message");
  assert.equal(appTwoParticipantFrame.kind, "participant_message");
  assert.equal(appOneParticipantFrame.senderDisplayName, "RiverCat");
  assert.equal(appTwoParticipantFrame.senderDisplayName, "RiverCat");

  const appOneAssistant = decryptRelayPayload(appOnePayloadFrames[1]!, invite);
  const appTwoAssistant = decryptRelayPayload(appTwoPayloadFrames[1]!, invite);
  assert.equal(appOneAssistant.kind, "assistant_message");
  assert.equal(appTwoAssistant.kind, "assistant_message");
  assert.match(appOneAssistant.text, /RiverCat: back again/);

  appOne.close();
  appTwoReconnect.close();
  await Promise.all([waitForClose(appOne), waitForClose(appTwoReconnect)]);
});

test("provider reminds users to renew when a session has less than 30 minutes left", async (t) => {
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
    defaultTtlMs: 10 * 60 * 1000,
  });
  await provider.connect();
  t.after(async () => {
    await provider.dispose();
  });

  const inviteBundle = await provider.createInviteBundle();
  const invite = decodeInviteString(inviteBundle.inviteUri);
  await new Promise((resolve) => setTimeout(resolve, 20));

  const appSocket = new WebSocket(invite.appWsUrl);
  const incomingPromise = nextMessages(appSocket, 4);
  await waitForOpen(appSocket);
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

  const incoming = await incomingPromise;
  assert.equal(incoming[0]?.type, "relay:attached");
  const framePayloads = incoming
    .slice(1)
    .map((frame) => decryptRelayPayload(frame, invite));
  assert.ok(
    framePayloads.some(
      (payload) =>
        payload.kind === "system_message" &&
        /less than 30 minutes/i.test(payload.message) &&
        /renew-session/i.test(payload.message),
    ),
  );
  assert.ok(
    framePayloads.some((payload) => payload.kind === "provider_capabilities"),
  );

  appSocket.close();
  await waitForClose(appSocket);
});
