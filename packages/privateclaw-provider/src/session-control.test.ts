import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
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
import { resolvePrivateClawMediaDir } from "./invite-qr-files.js";
import { DEFAULT_SESSION_TTL_MS, PrivateClawProvider } from "./provider.js";
import {
  buildManagedSessionQrLegacyLines,
  buildManagedSessionsReportLines,
  closeManagedSessionsFromStateDir,
  closeManagedSessionFromStateDir,
  deliverManagedSessionOutboundFromStateDir,
  followManagedSessionLogFromStateDir,
  getManagedSessionQrBundleFromStateDir,
  isManagedSessionQrLegacyResult,
  listManagedSessionsFromStateDir,
  PrivateClawSessionControlServer,
  type PrivateClawControlHostKind,
  resolvePrivateClawControlDir,
} from "./session-control.js";

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

function findUnusedPid(start = 999_999): number {
  let candidate = start;
  for (;;) {
    try {
      process.kill(candidate, 0);
      candidate += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code === "ESRCH") {
        return candidate;
      }
      candidate += 1;
    }
  }
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

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error("Timed out waiting for test condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function spawnLegacyManagedSessionHost(params: {
  stateDir: string;
  sessionId: string;
  kind?: PrivateClawControlHostKind;
  closeStatusCode?: number;
}) {
  const child = spawn(
    process.execPath,
    [
      "-e",
      `
const { createServer } = require('node:http');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const stateDir = process.env.STATE_DIR;
const sessionId = process.env.SESSION_ID;
const token = process.env.CONTROL_TOKEN;
const controlId = process.env.CONTROL_ID;
const hostKind = process.env.HOST_KIND;
const closeStatusCode = Number.parseInt(process.env.CLOSE_STATUS_CODE || '404', 10);
const startedAt = new Date().toISOString();
const controlDir = path.join(stateDir, 'privateclaw', 'control');
const server = createServer((request, response) => {
  if (request.headers.authorization !== \`Bearer \${token}\`) {
    response.statusCode = 401;
    response.end(JSON.stringify({ error: 'unauthorized' }));
    return;
  }
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/sessions') {
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      host: {
        controlId,
        kind: hostKind,
        pid: process.pid,
        startedAt,
      },
      sessions: [{
        sessionId,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        groupMode: false,
        participantCount: 0,
        participants: [],
        state: 'awaiting_hello',
      }],
    }));
    return;
  }
  if (request.method === 'POST' && url.pathname === \`/sessions/\${encodeURIComponent(sessionId)}/close\`) {
    response.statusCode = closeStatusCode;
    response.end(JSON.stringify({ error: closeStatusCode === 200 ? undefined : 'not found' }));
    return;
  }
  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'missing' }));
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  mkdirSync(controlDir, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(controlDir, \`\${hostKind}-\${process.pid}-\${controlId}.json\`), JSON.stringify({
    version: 1,
    controlId,
    kind: hostKind,
    pid: process.pid,
    host: '127.0.0.1',
    port: address.port,
    token,
    startedAt,
  }, null, 2), 'utf8');
  process.stdout.write('ready\\n');
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
setInterval(() => {}, 1000);
      `,
    ],
    {
      env: {
        ...process.env,
        STATE_DIR: params.stateDir,
        SESSION_ID: params.sessionId,
        HOST_KIND: params.kind ?? "pair-daemon",
        CONTROL_ID: `${params.kind ?? "pair-daemon"}-${params.sessionId}-control`,
        CONTROL_TOKEN: `${params.sessionId}-token`,
        CLOSE_STATUS_CODE: String(params.closeStatusCode ?? 404),
      },
      stdio: ["ignore", "pipe", "inherit"],
    },
  );

  await new Promise<void>((resolve, reject) => {
    child.once("error", reject);
    child.stdout?.once("data", () => resolve());
  });

  return child;
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

test("session control can print and notify a managed session QR", async (t) => {
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

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
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

  const controlServer = new PrivateClawSessionControlServer({
    provider,
    stateDir,
    kind: "pair-foreground",
  });
  await controlServer.start();
  t.after(async () => {
    await controlServer.stop();
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

  const appOneQrFrame = nextMessages(appOne, 1);
  const appTwoQrFrame = nextMessages(appTwo, 1);
  const result = await getManagedSessionQrBundleFromStateDir({
    stateDir,
    sessionId: invite.sessionId,
    notifyParticipants: true,
  });

  assert.equal(result.host.kind, "pair-foreground");
  assert.equal(result.session.sessionId, invite.sessionId);
  assert.equal(result.bundle.inviteUri, inviteBundle.inviteUri);

  const [appOneFrames, appTwoFrames] = await Promise.all([
    appOneQrFrame,
    appTwoQrFrame,
  ]);
  for (const frame of [appOneFrames[0], appTwoFrames[0]]) {
    assert.ok(frame);
    const qrPayload = decryptRelayPayload(frame!, invite);
    assert.equal(qrPayload.kind, "assistant_message");
    assert.match(qrPayload.text, /二维码|QR/i);
    assert.equal(qrPayload.attachments?.length, 1);
    const qrAttachment = qrPayload.attachments?.[0];
    assert.ok(qrAttachment);
    assert.equal(qrAttachment.mimeType, "image/png");
    assert.equal(qrAttachment.name, `privateclaw-${invite.sessionId}.png`);
    assert.ok(qrAttachment.dataBase64);
    assert.deepEqual(
      Buffer.from(qrAttachment.dataBase64, "base64").subarray(0, PNG_SIGNATURE.length),
      PNG_SIGNATURE,
    );
  }

  appOne.close();
  appTwo.close();
  await Promise.all([waitForClose(appOne), waitForClose(appTwo)]);
});

test("session control outbound delivery accepts group-prefixed session targets", async (t) => {
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

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
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

  const controlServer = new PrivateClawSessionControlServer({
    provider,
    stateDir,
    kind: "pair-foreground",
  });
  await controlServer.start();
  t.after(async () => {
    await controlServer.stop();
  });

  const inviteBundle = await provider.createInviteBundle({ groupMode: true });
  const invite = decodeInviteString(inviteBundle.inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "group-target-app");
  const appSocket = new WebSocket(appUrl.toString());
  const attached = nextMessage(appSocket);
  await waitForOpen(appSocket);
  assert.equal((await attached).type, "relay:attached");
  const initialFrames = nextMessages(appSocket, 2);
  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "client_hello",
          appId: "group-target-app",
          displayName: "Group Target Tester",
          appVersion: "flutter-test",
          deviceLabel: "Group Target Device",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await initialFrames;

  await deliverManagedSessionOutboundFromStateDir({
    stateDir,
    sessionId: `group:${invite.sessionId}`,
    payload: {
      text: "scheduled hello from group target",
      replyToId: "scheduled-user-msg-1",
    },
  });

  const outboundFrame = await nextMessage(appSocket);
  const outboundPayload = decryptRelayPayload(outboundFrame, invite);
  assert.equal(outboundPayload.kind, "assistant_message");
  assert.equal(outboundPayload.text, "scheduled hello from group target");
  assert.equal(outboundPayload.replyTo, "scheduled-user-msg-1");

  appSocket.close();
  await waitForClose(appSocket);
});

test("session control can follow a managed OpenClaw session log", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-follow-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  const sessionId = "follow-session";
  const child = await spawnLegacyManagedSessionHost({
    stateDir,
    sessionId,
  });
  t.after(async () => {
    if (!child.killed && child.exitCode == null) {
      child.kill("SIGTERM");
    }
    if (child.exitCode == null) {
      await new Promise<void>((resolve) => {
        child.once("exit", () => resolve());
      });
    }
  });

  const printed: string[] = [];
  const controller = new AbortController();
  const followPromise = followManagedSessionLogFromStateDir({
    stateDir,
    sessionId,
    pollMs: 10,
    signal: controller.signal,
    writeLine: (line) => {
      printed.push(line);
    },
  });

  const logPath = path.join(stateDir, "agents", "main", "sessions", `${sessionId}.jsonl`);
  await mkdir(path.dirname(logPath), { recursive: true });
  const firstLine = JSON.stringify({
    type: "message",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "hello from follow test" }],
    },
  });
  await writeFile(logPath, `${firstLine}\n`, "utf8");
  await waitForCondition(() => printed.includes(firstLine));

  const secondLine = JSON.stringify({
    type: "message",
    message: {
      role: "toolResult",
      content: [{ type: "text", text: "tool output" }],
    },
  });
  await writeFile(logPath, `${firstLine}\n${secondLine}\n`, "utf8");
  await waitForCondition(() => printed.includes(secondLine));

  controller.abort();
  await followPromise;

  assert.ok(
    printed.some((line) => line.includes(`Following the OpenClaw session log for session ${sessionId}`)),
  );
  assert.ok(printed.includes(firstLine));
  assert.ok(printed.includes(secondLine));
});

test("session control reports append app install footer", () => {
  const lines = buildManagedSessionsReportLines([
    {
      host: {
        controlId: "control-1",
        kind: "pair-daemon",
        pid: 12345,
        startedAt: "2026-03-22T08:00:00.000Z",
      },
      sessions: [
        {
          sessionId: "session-1",
          expiresAt: "2026-03-23T08:00:00.000Z",
          groupMode: false,
          participantCount: 1,
          participants: [
            {
              appId: "app-1",
              displayName: "RiverCat",
            },
          ],
          state: "awaiting_hello",
        },
      ],
    },
  ]);
  const report = lines.join("\n");
  assert.match(report, /App Store/i);
  assert.match(report, /Google Play/i);
  assert.match(report, /Google Group/i);
});

test("session control can terminate a managed session", async (t) => {
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

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-close-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
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

  const controlServer = new PrivateClawSessionControlServer({
    provider,
    stateDir,
    kind: "pair-foreground",
  });
  await controlServer.start();
  t.after(async () => {
    await controlServer.stop();
  });

  const inviteBundle = await provider.createInviteBundle();
  const invite = decodeInviteString(inviteBundle.inviteUri);
  assert.equal(provider.listManagedSessions().length, 1);

  const result = await closeManagedSessionFromStateDir({
    stateDir,
    sessionId: invite.sessionId,
    reason: "operator_terminated",
  });

  assert.equal(result.terminatedHost, false);
  assert.equal(result.session.sessionId, invite.sessionId);
  assert.equal(provider.listManagedSessions().length, 0);
});

test("session control can terminate a legacy daemon host when close endpoint is unavailable", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-legacy-close-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  const sessionId = "legacy-close-session";
  const child = await spawnLegacyManagedSessionHost({
    stateDir,
    sessionId,
  });
  t.after(async () => {
    if (!child.killed && child.exitCode == null) {
      child.kill("SIGTERM");
    }
  });

  const result = await closeManagedSessionFromStateDir({
    stateDir,
    sessionId,
    reason: "operator_terminated",
  });

  assert.equal(result.terminatedHost, true);
  assert.equal(result.session.sessionId, sessionId);
  if (child.exitCode == null) {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });
  }
});

test("session control killall only terminates background daemon sessions", async (t) => {
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

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-killall-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
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

  const controlServer = new PrivateClawSessionControlServer({
    provider,
    stateDir,
    kind: "pair-foreground",
  });
  await controlServer.start();
  t.after(async () => {
    await controlServer.stop();
  });

  const foregroundInviteBundle = await provider.createInviteBundle();
  const foregroundInvite = decodeInviteString(foregroundInviteBundle.inviteUri);
  const daemonSessionId = "legacy-daemon-session";
  const child = await spawnLegacyManagedSessionHost({
    stateDir,
    sessionId: daemonSessionId,
  });
  t.after(async () => {
    if (!child.killed && child.exitCode == null) {
      child.kill("SIGTERM");
    }
  });

  const result = await closeManagedSessionsFromStateDir({
    stateDir,
    hostKinds: ["pair-daemon"],
    reason: "operator_terminated_all",
  });

  assert.deepEqual(result.failed, []);
  assert.equal(result.closed.length, 1);
  assert.equal(result.closed[0]?.session.sessionId, daemonSessionId);
  assert.equal(result.closed[0]?.host.kind, "pair-daemon");
  assert.equal(result.closed[0]?.terminatedHost, true);
  assert.equal(provider.listManagedSessions().length, 1);

  const remainingListings = await listManagedSessionsFromStateDir(stateDir);
  assert.deepEqual(
    remainingListings.flatMap((listing) =>
      listing.sessions.map((session) => session.sessionId),
    ),
    [foregroundInvite.sessionId],
  );

  if (child.exitCode == null) {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
    });
  }
});

test("session control falls back to the saved QR PNG when an older host lacks the qr endpoint", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-legacy-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  const sessionId = "legacy-session-qr";
  const token = "legacy-control-token";
  const controlId = "legacy-control-id";
  const startedAt = new Date().toISOString();
  const descriptorDir = resolvePrivateClawControlDir(stateDir);
  await mkdir(descriptorDir, { recursive: true, mode: 0o700 });
  const mediaDir = resolvePrivateClawMediaDir(stateDir);
  await mkdir(mediaDir, { recursive: true });
  const legacyPngPath = path.join(mediaDir, `privateclaw-${sessionId}.png`);
  await writeFile(legacyPngPath, Buffer.concat([PNG_SIGNATURE, Buffer.from("legacy")]));

  const server = createServer((request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.statusCode = 401;
      response.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/sessions") {
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          host: {
            controlId,
            kind: "pair-daemon",
            pid: process.pid,
            startedAt,
          },
          sessions: [
            {
              sessionId,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              groupMode: true,
              participantCount: 1,
              participants: [
                {
                  appId: "legacy-app",
                  displayName: "Legacy Fox",
                  platform: "PrivateClaw",
                },
              ],
              state: "active",
            },
          ],
        }),
      );
      return;
    }
    if (
      request.method === "POST" &&
      url.pathname === `/sessions/${encodeURIComponent(sessionId)}/qr`
    ) {
      response.statusCode = 404;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "not found" }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "missing" }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  const address = server.address() as AddressInfo;
  await writeFile(
    path.join(descriptorDir, `${controlId}.json`),
    JSON.stringify(
      {
        version: 1,
        controlId,
        kind: "pair-daemon",
        pid: process.pid,
        host: "127.0.0.1",
        port: address.port,
        token,
        startedAt,
      },
      null,
      2,
    ),
    "utf8",
  );

  const result = await getManagedSessionQrBundleFromStateDir({
    stateDir,
    sessionId,
    notifyParticipants: true,
  });

  assert.equal(isManagedSessionQrLegacyResult(result), true);
  if (!isManagedSessionQrLegacyResult(result)) {
    throw new Error("expected a legacy QR fallback result");
  }
  assert.equal(result.notifyParticipantsSupported, false);
  assert.equal(result.legacyPngPath, legacyPngPath);
  assert.equal(result.session.sessionId, sessionId);
  assert.match(
    buildManagedSessionQrLegacyLines({
      result,
      notifyParticipants: true,
    }).join("\n"),
    /notified|推送/u,
  );
  assert.match(
    buildManagedSessionQrLegacyLines({
      result,
      notifyParticipants: true,
    }).join("\n"),
    /App Store|Google Play|Google Group/u,
  );
});

test("session listings keep a live descriptor when one sessions probe fails", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-live-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  const descriptorDir = resolvePrivateClawControlDir(stateDir);
  await mkdir(descriptorDir, { recursive: true, mode: 0o700 });
  const descriptorPath = path.join(descriptorDir, "pair-daemon-live.json");
  await writeFile(
    descriptorPath,
    JSON.stringify(
      {
        version: 1,
        controlId: "live-control-id",
        kind: "pair-daemon",
        pid: process.pid,
        host: "127.0.0.1",
        port: 1,
        token: "live-token",
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  const listings = await listManagedSessionsFromStateDir(stateDir);
  assert.deepEqual(listings, []);
  await access(descriptorPath);
});

test("session listings prune a stale descriptor after a failed sessions probe", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-session-control-stale-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  const descriptorDir = resolvePrivateClawControlDir(stateDir);
  await mkdir(descriptorDir, { recursive: true, mode: 0o700 });
  const descriptorPath = path.join(descriptorDir, "pair-daemon-stale.json");
  await writeFile(
    descriptorPath,
    JSON.stringify(
      {
        version: 1,
        controlId: "stale-control-id",
        kind: "pair-daemon",
        pid: findUnusedPid(),
        host: "127.0.0.1",
        port: 1,
        token: "stale-token",
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  const listings = await listManagedSessionsFromStateDir(stateDir);
  assert.deepEqual(listings, []);
  await assert.rejects(access(descriptorPath));
});
