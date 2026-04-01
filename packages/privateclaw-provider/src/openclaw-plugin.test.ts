import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeInviteString, decryptPayload, encryptPayload } from "@privateclaw/protocol";
import WebSocket from "ws";
import { createRelayServer } from "../../../services/relay-server/src/relay-server.js";
import { EchoBridge } from "./bridges/echo-bridge.js";
import { privateClawConfigSchema } from "./compat/openclaw.js";
import { DEFAULT_SESSION_TTL_MS } from "./provider.js";
import { DEFAULT_RELAY_BASE_URL } from "./relay-defaults.js";
import type {
  OpenClawChannelPluginCompat,
  OpenClawPluginCliRegistrarCompat,
  OpenClawPluginApiCompat,
  OpenClawPluginCommandDefinitionCompat,
  OpenClawPluginServiceCompat,
  OpenClawPluginRuntimeCompat,
} from "./compat/openclaw.js";
import { createOpenClawCompatiblePlugin } from "./openclaw-plugin.js";
import { listManagedSessionsFromStateDir } from "./session-control.js";

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

function nextMessages(
  socket: WebSocket,
  count: number,
): Promise<Record<string, unknown>[]> {
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

function createMockApi(
  runtime: OpenClawPluginRuntimeCompat | unknown = {},
): {
  api: OpenClawPluginApiCompat;
  getChannel(): OpenClawChannelPluginCompat;
  getCli(): { registrar: OpenClawPluginCliRegistrarCompat; commands: string[] };
  getCommand(): OpenClawPluginCommandDefinitionCompat;
  getService(): OpenClawPluginServiceCompat;
} {
  let channel: OpenClawChannelPluginCompat | undefined;
  let command: OpenClawPluginCommandDefinitionCompat | undefined;
  let cli:
    | {
        registrar: OpenClawPluginCliRegistrarCompat;
        commands: string[];
      }
    | undefined;
  let service: OpenClawPluginServiceCompat | undefined;
  const logger = {
    info: (_message: string) => undefined,
    warn: (_message: string) => undefined,
    error: (_message: string) => undefined,
  };

  return {
    api: {
      runtime,
      logger,
      registerChannel(params) {
        channel = params.plugin as OpenClawChannelPluginCompat;
      },
      registerCommand(registeredCommand) {
        command = registeredCommand;
      },
      registerCli(registrar, opts) {
        cli = {
          registrar,
          commands: opts?.commands ?? [],
        };
      },
      registerService(registeredService) {
        service = registeredService;
      },
    },
    getCli() {
      assert.ok(cli, "plugin should register the local privateclaw CLI");
      return cli;
    },
    getChannel() {
      assert.ok(channel, "plugin should register the privateclaw channel plugin");
      return channel;
    },
    getCommand() {
      assert.ok(command, "plugin should register the /privateclaw command");
      return command;
    },
    getService() {
      assert.ok(service, "plugin should register the provider lifecycle service");
      return service;
    },
  };
}

class FakeCliCommand {
  readonly children = new Map<string, FakeCliCommand>();
  readonly options: string[] = [];
  actionHandler: ((...args: unknown[]) => void | Promise<void>) | undefined;

  constructor(readonly name: string) {}

  command(name: string): FakeCliCommand {
    const child = new FakeCliCommand(name);
    this.children.set(name, child);
    return child;
  }

  description(_text: string): FakeCliCommand {
    return this;
  }

  argument(_spec: string): FakeCliCommand {
    return this;
  }

  option(_flags: string, _description?: string, _defaultValue?: string | boolean): FakeCliCommand {
    this.options.push(_flags);
    return this;
  }

  action(handler: (...args: unknown[]) => void | Promise<void>): FakeCliCommand {
    this.actionHandler = handler;
    return this;
  }
}

test("privateclaw schema advertises the public relay default", () => {
  assert.equal(
    privateClawConfigSchema.properties.relayBaseUrl.default,
    DEFAULT_RELAY_BASE_URL,
  );
  assert.equal(
    privateClawConfigSchema.properties.openclawAgentChannel.default,
    "privateclaw",
  );
  assert.equal(privateClawConfigSchema.properties.botMode.type, "boolean");
  assert.equal(privateClawConfigSchema.properties.botModeSilentJoinDelayMs.minimum, 0);
  assert.equal(privateClawConfigSchema.properties.botModeIdleDelayMs.minimum, 0);
});

test("plugin registers the privateclaw channel plugin", () => {
  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: "ws://127.0.0.1:8787/ws/provider",
    appWsUrl: "ws://127.0.0.1:8787/ws/app",
    bridge: new EchoBridge("OpenClaw bridge"),
  });
  const { api, getChannel } = createMockApi();
  plugin.register(api);
  const channel = getChannel();
  assert.equal(channel.id, "privateclaw");
  assert.equal(channel.meta.id, "privateclaw");
  assert.equal(channel.outbound?.deliveryMode, "direct");
  assert.deepEqual(channel.capabilities.chatTypes, ["direct", "group"]);
});

test("plugin service startup eagerly starts the plugin-service control host", async (t) => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-service-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: "ws://127.0.0.1:8787/ws/provider",
    appWsUrl: "ws://127.0.0.1:8787/ws/app",
    bridge: new EchoBridge("OpenClaw bridge"),
  });
  const { api, getService } = createMockApi();
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const listings = await listManagedSessionsFromStateDir(stateDir);
  assert.equal(listings.length, 1);
  assert.equal(listings[0]?.host.kind, "plugin-service");
  assert.deepEqual(listings[0]?.sessions, []);
});

test("plugin routes paired app text through OpenClaw runtime helpers with the real session-store signatures", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  const resolvedStorePaths: Array<{
    store?: string;
    opts?: { agentId?: string };
  }> = [];
  const recordedSessions: Array<Record<string, unknown>> = [];
  const fakeRuntime = {
    channel: {
      reply: {
        finalizeInboundContext: <T extends Record<string, unknown>>(ctx: T) =>
          ({
            ...ctx,
            CommandAuthorized: true,
          }) as T & { CommandAuthorized: true },
        dispatchReplyWithBufferedBlockDispatcher: async ({
          ctx,
          dispatcherOptions,
        }: {
          ctx: Record<string, unknown>;
          dispatcherOptions: {
            deliver(
              payload: {
                text?: string;
                replyToId?: string | null;
              },
              info: { kind: "tool" | "block" | "final" },
            ): Promise<void>;
          };
        }) => {
          const commandBody = String(ctx.CommandBody ?? "");
          await dispatcherOptions.deliver(
            {
              text: `Runtime reply: ${commandBody}`,
            },
            { kind: "final" },
          );
          return {};
        },
      },
      routing: {
        resolveAgentRoute: ({ ctx }: { ctx: Record<string, unknown> }) => ({
          agentId: "runtime-agent",
          sessionKey: `runtime-${String(ctx.To ?? "session")}`,
          mainSessionKey: `runtime-${String(ctx.To ?? "session")}`,
          lastRoutePolicy: "current" as const,
        }),
      },
      session: {
        resolveStorePath: (store?: string, opts?: { agentId?: string }) => {
          resolvedStorePaths.push({ store, opts });
          return path.join(stateDir, "memory", `${opts?.agentId ?? "agent"}.sqlite`);
        },
        recordInboundSession: async (params: Record<string, unknown>) => {
          recordedSessions.push(params);
        },
      },
    },
  } satisfies OpenClawPluginRuntimeCompat;

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: {
      async handleUserMessage() {
        throw new Error("bridge should not be used when runtime routing is available");
      },
    },
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getCommand, getService } = createMockApi(fakeRuntime);
  plugin.register(api);

  const config = {
    session: {
      store: "~/privateclaw-runtime-{agentId}.sqlite",
    },
  };
  const service = getService();
  await service.start({
    config,
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config,
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const reply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config,
  });
  const inviteUri = reply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");
  const invite = decodeInviteString(inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "runtime-router-app");
  const appSocket = new WebSocket(appUrl.toString());
  t.after(() => {
    appSocket.terminate();
  });
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
          appId: "runtime-router-app",
          displayName: "Runtime Router",
          appVersion: "plugin-test",
          deviceLabel: "Runtime Router Device",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await initialFrames;

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "runtime-router-app",
          text: "hello runtime",
          clientMessageId: "runtime-msg-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const replyFrame = await nextMessage(appSocket);
  const replyPayload = decryptPayload({
    sessionId: invite.sessionId,
    sessionKey: invite.sessionKey,
    envelope: replyFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(replyPayload.kind, "assistant_message");
  assert.equal(replyPayload.text, "Runtime reply: hello runtime");
  assert.equal(replyPayload.replyTo, "runtime-msg-1");
  assert.equal(resolvedStorePaths[0]?.store, "~/privateclaw-runtime-{agentId}.sqlite");
  assert.equal(resolvedStorePaths[0]?.opts?.agentId, "runtime-agent");
  assert.equal(recordedSessions[0]?.storePath, path.join(stateDir, "memory", "runtime-agent.sqlite"));
  assert.equal(recordedSessions[0]?.createIfMissing, true);
  assert.deepEqual(recordedSessions[0]?.updateLastRoute, {
    sessionKey: `runtime-${invite.sessionId}`,
    channel: "privateclaw",
    to: invite.sessionId,
    accountId: "default",
  });
});

test("plugin falls back to the bridge when runtime session recording reports an error", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  let dispatchCalled = false;
  const fakeRuntime = {
    channel: {
      reply: {
        finalizeInboundContext: <T extends Record<string, unknown>>(ctx: T) =>
          ({
            ...ctx,
            CommandAuthorized: true,
          }) as T & { CommandAuthorized: true },
        dispatchReplyWithBufferedBlockDispatcher: async () => {
          dispatchCalled = true;
          return {};
        },
      },
      routing: {
        resolveAgentRoute: ({ ctx }: { ctx: Record<string, unknown> }) => ({
          agentId: "runtime-agent",
          sessionKey: `runtime-${String(ctx.To ?? "session")}`,
          mainSessionKey: `runtime-${String(ctx.To ?? "session")}`,
          lastRoutePolicy: "current" as const,
        }),
      },
      session: {
        resolveStorePath: () => path.join(stateDir, "memory", "runtime-agent.sqlite"),
        recordInboundSession: async (params: { onRecordError(error: unknown): void }) => {
          params.onRecordError(new Error("simulated session-store failure"));
        },
      },
    },
  } satisfies OpenClawPluginRuntimeCompat;

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("Runtime fallback"),
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getCommand, getService } = createMockApi(fakeRuntime);
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const reply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config: {},
  });
  const inviteUri = reply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");
  const invite = decodeInviteString(inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "runtime-record-error-app");
  const appSocket = new WebSocket(appUrl.toString());
  t.after(() => {
    appSocket.terminate();
  });
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
          appId: "runtime-record-error-app",
          displayName: "Runtime Record Error",
          appVersion: "plugin-test",
          deviceLabel: "Runtime Record Error Device",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await initialFrames;

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "runtime-record-error-app",
          text: "hello fallback",
          clientMessageId: "runtime-record-error-msg-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const replyFrame = await nextMessage(appSocket);
  const replyPayload = decryptPayload({
    sessionId: invite.sessionId,
    sessionKey: invite.sessionKey,
    envelope: replyFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(replyPayload.kind, "assistant_message");
  assert.equal(replyPayload.text, "Runtime fallback: hello fallback");
  assert.equal(dispatchCalled, false);
});

test("plugin falls back to the bridge when runtime reply dispatch reports an error", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  const fakeRuntime = {
    channel: {
      reply: {
        finalizeInboundContext: <T extends Record<string, unknown>>(ctx: T) =>
          ({
            ...ctx,
            CommandAuthorized: true,
          }) as T & { CommandAuthorized: true },
        dispatchReplyWithBufferedBlockDispatcher: async ({
          dispatcherOptions,
        }: {
          dispatcherOptions: {
            onError?(error: unknown, info: { kind: "tool" | "block" | "final" }): void;
          };
        }) => {
          dispatcherOptions.onError?.(
            new Error("simulated runtime dispatch failure"),
            { kind: "final" },
          );
          return {};
        },
      },
      routing: {
        resolveAgentRoute: ({ ctx }: { ctx: Record<string, unknown> }) => ({
          agentId: "runtime-agent",
          sessionKey: `runtime-${String(ctx.To ?? "session")}`,
          mainSessionKey: `runtime-${String(ctx.To ?? "session")}`,
          lastRoutePolicy: "current" as const,
        }),
      },
      session: {
        resolveStorePath: () => path.join(stateDir, "memory", "runtime-agent.sqlite"),
        recordInboundSession: async () => undefined,
      },
    },
  } satisfies OpenClawPluginRuntimeCompat;

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("Runtime fallback"),
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getCommand, getService } = createMockApi(fakeRuntime);
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const reply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config: {},
  });
  const inviteUri = reply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");
  const invite = decodeInviteString(inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "runtime-dispatch-error-app");
  const appSocket = new WebSocket(appUrl.toString());
  t.after(() => {
    appSocket.terminate();
  });
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
          appId: "runtime-dispatch-error-app",
          displayName: "Runtime Dispatch Error",
          appVersion: "plugin-test",
          deviceLabel: "Runtime Dispatch Error Device",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await initialFrames;

  appSocket.send(
    JSON.stringify({
      type: "app:frame",
      envelope: encryptPayload({
        sessionId: invite.sessionId,
        sessionKey: invite.sessionKey,
        payload: {
          kind: "user_message",
          appId: "runtime-dispatch-error-app",
          text: "hello dispatch fallback",
          clientMessageId: "runtime-dispatch-error-msg-1",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );

  const replyFrame = await nextMessage(appSocket);
  const replyPayload = decryptPayload({
    sessionId: invite.sessionId,
    sessionKey: invite.sessionKey,
    envelope: replyFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(replyPayload.kind, "assistant_message");
  assert.equal(replyPayload.text, "Runtime fallback: hello dispatch fallback");
});

test("privateclaw channel outbound delivers replies into managed sessions", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getChannel, getCommand, getService } = createMockApi();
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const reply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config: {},
  });
  const inviteUri = reply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");
  const invite = decodeInviteString(inviteUri);

  const appUrl = new URL(invite.appWsUrl);
  appUrl.searchParams.set("appId", "plugin-test-app");
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
          appId: "plugin-test-app",
          displayName: "Plugin Tester",
          appVersion: "plugin-test",
          deviceLabel: "Plugin Tester Device",
          sentAt: new Date().toISOString(),
        },
      }),
    }),
  );
  await initialFrames;

  const channel = getChannel();
  await channel.outbound?.sendText?.({
    cfg: {},
    to: invite.sessionId,
    text: "scheduled hello from channel",
    replyToId: "user-msg-1",
  });

  const outboundFrame = await nextMessage(appSocket);
  const outboundPayload = decryptPayload({
    sessionId: invite.sessionId,
    sessionKey: invite.sessionKey,
    envelope: outboundFrame.envelope as Parameters<typeof decryptPayload>[0]["envelope"],
  });
  assert.equal(outboundPayload.kind, "assistant_message");
  assert.equal(outboundPayload.text, "scheduled hello from channel");
  assert.equal(outboundPayload.replyTo, "user-msg-1");
  appSocket.close();
});

test("privateclaw command writes QR media into the OpenClaw state media directory", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getCommand, getService } = createMockApi();
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const reply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config: {},
  });

  assert.equal(reply.isError, undefined);
  assert.ok(reply.text);
  assert.ok(reply.mediaUrl);
  assert.ok(!reply.text.includes("<qqimg>"));
  assert.match(reply.text, /邀请链接 \/ Invite URI/);
  assert.match(reply.text, /PrivateClaw 会话|PrivateClaw session/);
  assert.match(reply.text, /App Store/i);
  assert.match(reply.text, /Google Play/i);
  assert.match(reply.text, /Google Group/i);
  assert.match(reply.text, /GitHub Releases/i);

  const inviteUri = reply.text.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");

  const invite = decodeInviteString(inviteUri);
  const remainingMs = new Date(invite.expiresAt).getTime() - Date.now();
  assert.ok(
    remainingMs > DEFAULT_SESSION_TTL_MS - 60_000,
    "new sessions should default to roughly 24 hours even when relay default TTL is shorter",
  );
  const expectedMediaDir = path.join(stateDir, "media", "privateclaw");
  const mediaPath =
    process.platform === "win32" ? fileURLToPath(reply.mediaUrl) : reply.mediaUrl;
  assert.equal(path.dirname(mediaPath), expectedMediaDir);
  assert.equal(path.basename(mediaPath), `privateclaw-${invite.sessionId}.png`);

  const qrPng = await readFile(mediaPath);
  assert.deepEqual(qrPng.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
});

test("privateclaw command embeds qqimg tags for QQ channel replies", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getCommand, getService } = createMockApi();
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const reply = await command.handler({
    channel: "qqbot",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config: {},
  });

  assert.equal(reply.isError, undefined);
  assert.ok(reply.text);
  assert.equal(reply.mediaUrl, undefined);
  assert.match(reply.text, /<qqimg>[^<]+<\/qqimg>/);
  assert.match(reply.text, /App Store/i);
  assert.match(reply.text, /Google Play/i);
  assert.match(reply.text, /Google Group/i);
  assert.match(reply.text, /GitHub Releases/i);

  const inviteUri = reply.text.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");
  const invite = decodeInviteString(inviteUri);

  const qqImagePath = reply.text.match(/<qqimg>([^<]+)<\/qqimg>/)?.[1];
  assert.ok(qqImagePath, "QQ reply should embed the QR path inside <qqimg> tags");

  const expectedMediaDir = path.join(stateDir, "media", "privateclaw");
  assert.equal(path.dirname(qqImagePath), expectedMediaDir);
  assert.equal(path.basename(qqImagePath), `privateclaw-${invite.sessionId}.png`);

  const qrPng = await readFile(qqImagePath);
  assert.deepEqual(qrPng.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
});

test("privateclaw command can override the relay per invocation", async (t) => {
  const defaultRelay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const overrideRelay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const [{ port: defaultPort }, { port: overridePort }] = await Promise.all([
    defaultRelay.start(),
    overrideRelay.start(),
  ]);

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await Promise.all([defaultRelay.stop(), overrideRelay.stop()]);
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${defaultPort}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${defaultPort}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
    welcomeMessage: "Welcome to PrivateClaw",
  });
  const { api, getCli, getCommand, getService } = createMockApi();
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const command = getCommand();
  const defaultReply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw",
    config: {},
  });
  const defaultInviteUri =
    defaultReply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(defaultInviteUri, "default command should print a PrivateClaw invite URI");
  const defaultInvite = decodeInviteString(defaultInviteUri);
  assert.match(defaultInvite.appWsUrl, new RegExp(`:${defaultPort}/ws/app`));

  const overrideReply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: `/privateclaw relay=ws://127.0.0.1:${overridePort}`,
    args: `relay=ws://127.0.0.1:${overridePort}`,
    config: {},
  });
  const overrideInviteUri =
    overrideReply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(
    overrideInviteUri,
    "override command should print a PrivateClaw invite URI",
  );
  const overrideInvite = decodeInviteString(overrideInviteUri);
  assert.match(overrideInvite.appWsUrl, new RegExp(`:${overridePort}/ws/app`));
  assert.equal(overrideInvite.relayLabel, `127.0.0.1:${overridePort}`);

  const cli = getCli();
  const root = new FakeCliCommand("root");
  await cli.registrar({
    program: root,
    config: {},
    logger: api.logger,
  });
  const sessions = root.children.get("privateclaw")?.children.get("sessions");
  assert.ok(
    sessions?.actionHandler,
    "plugin should register the privateclaw sessions subcommand",
  );
  assert.ok(
    sessions?.children.get("follow")?.actionHandler,
    "plugin should register the privateclaw sessions follow subcommand",
  );
  assert.ok(
    sessions?.children.get("qr")?.actionHandler,
    "plugin should register the privateclaw sessions qr subcommand",
  );
  assert.ok(
    sessions?.children.get("kill")?.actionHandler,
    "plugin should register the privateclaw sessions kill subcommand",
  );

  const printed: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown, ...optionalParams: unknown[]) => {
    printed.push([message, ...optionalParams].map(String).join(" "));
  };
  t.after(() => {
    console.log = originalLog;
  });

  await sessions.actionHandler?.();

  assert.ok(
    printed.some((line) => line.includes(defaultInvite.sessionId)),
    "sessions should include the default-relay session",
  );
  assert.ok(
    printed.some((line) => line.includes(overrideInvite.sessionId)),
    "sessions should include the override-relay session",
  );
});

test("privateclaw plugin local pair CLI defaults to the long session TTL", async (t) => {
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

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
  });
  const { api, getCli } = createMockApi();
  plugin.register(api);

  const cli = getCli();
  assert.deepEqual(cli.commands, ["privateclaw"]);

  const root = new FakeCliCommand("root");
  await cli.registrar({
    program: root,
    config: {},
    logger: api.logger,
  });

  const privateclaw = root.children.get("privateclaw");
  assert.ok(privateclaw, "plugin should register a top-level privateclaw command");

  const pair = privateclaw.children.get("pair");
  assert.ok(pair?.actionHandler, "plugin should register the privateclaw pair subcommand");
  assert.ok(
    pair.options.includes("--verbose"),
    "plugin should expose a --verbose flag on the privateclaw pair subcommand",
  );

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-cli-state-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  t.after(async () => {
    if (previousStateDir == null) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    await rm(stateDir, { recursive: true, force: true });
  });

  const printed: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown, ...optionalParams: unknown[]) => {
    printed.push([message, ...optionalParams].map(String).join(" "));
  };
  t.after(() => {
    console.log = originalLog;
  });

  await pair.actionHandler({
    label: "CLI pairing session",
    printOnly: true,
  });

  assert.ok(
    printed.some(
      (line) =>
        line.includes("PrivateClaw 会话") || line.includes("PrivateClaw session"),
    ),
    "pair command should print the invite announcement",
  );
  assert.ok(
    printed.some((line) =>
      line.startsWith("邀请链接 / Invite URI: privateclaw://connect?payload="),
    ),
    "pair command should print the invite URI",
  );
  const inviteUri = printed.find((line) =>
    line.startsWith("邀请链接 / Invite URI: privateclaw://connect?payload="),
  );
  assert.ok(inviteUri, "pair command should print a PrivateClaw invite URI");
  const qrPathLine = printed.find((line) =>
    line.startsWith("二维码 PNG 路径 / QR PNG path: "),
  );
  assert.ok(qrPathLine, "pair command should print the saved QR PNG path");
  const invite = decodeInviteString(
    inviteUri.replace("邀请链接 / Invite URI: ", ""),
  );
  const remainingMs = new Date(invite.expiresAt).getTime() - Date.now();
  assert.ok(
    remainingMs > DEFAULT_SESSION_TTL_MS - 60_000,
    "local pair sessions should default to roughly 24 hours even when relay default TTL is shorter",
  );
  const qrPath = qrPathLine.replace("二维码 PNG 路径 / QR PNG path: ", "");
  const qrPng = await readFile(qrPath);
  assert.deepEqual(qrPng.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
});

test("privateclaw plugin local pair CLI can override the relay per command", async (t) => {
  const defaultRelay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const overrideRelay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const [{ port: defaultPort }, { port: overridePort }] = await Promise.all([
    defaultRelay.start(),
    overrideRelay.start(),
  ]);

  t.after(async () => {
    await Promise.all([defaultRelay.stop(), overrideRelay.stop()]);
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${defaultPort}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${defaultPort}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
  });
  const { api, getCli } = createMockApi();
  plugin.register(api);

  const cli = getCli();
  const root = new FakeCliCommand("root");
  await cli.registrar({
    program: root,
    config: {},
    logger: api.logger,
  });

  const pair = root.children.get("privateclaw")?.children.get("pair");
  assert.ok(pair?.actionHandler, "plugin should register the privateclaw pair subcommand");

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-cli-state-"));
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;
  t.after(async () => {
    if (previousStateDir == null) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousStateDir;
    }
    await rm(stateDir, { recursive: true, force: true });
  });

  const printed: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown, ...optionalParams: unknown[]) => {
    printed.push([message, ...optionalParams].map(String).join(" "));
  };
  t.after(() => {
    console.log = originalLog;
  });

  await pair.actionHandler({
    label: "CLI pairing session",
    relay: `ws://127.0.0.1:${overridePort}`,
    printOnly: true,
  });

  const inviteUri = printed.find((line) =>
    line.startsWith("邀请链接 / Invite URI: privateclaw://connect?payload="),
  );
  assert.ok(inviteUri, "pair command should print a PrivateClaw invite URI");
  const invite = decodeInviteString(
    inviteUri.replace("邀请链接 / Invite URI: ", ""),
  );
  assert.match(invite.appWsUrl, new RegExp(`:${overridePort}/ws/app`));
  assert.equal(invite.relayLabel, `127.0.0.1:${overridePort}`);
});

test("privateclaw CLI can list and remove active group-session participants", async (t) => {
  const relay = createRelayServer({
    host: "127.0.0.1",
    port: 0,
    sessionTtlMs: 60_000,
    frameCacheSize: 8,
  });
  const { port } = await relay.start();

  const stateDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-cli-state-"));
  t.after(async () => {
    await rm(stateDir, { recursive: true, force: true });
    await relay.stop();
  });

  const plugin = createOpenClawCompatiblePlugin({
    providerWsUrl: `ws://127.0.0.1:${port}/ws/provider`,
    appWsUrl: `ws://127.0.0.1:${port}/ws/app`,
    bridge: new EchoBridge("OpenClaw bridge"),
  });
  const { api, getCli, getCommand, getService } = createMockApi();
  plugin.register(api);

  const service = getService();
  await service.start({
    config: {},
    stateDir,
    logger: api.logger,
  });
  t.after(async () => {
    await service.stop?.({
      config: {},
      stateDir,
      logger: api.logger,
    });
  });

  const cli = getCli();
  const root = new FakeCliCommand("root");
  await cli.registrar({
    program: root,
    config: {},
    logger: api.logger,
  });

  const privateclaw = root.children.get("privateclaw");
  assert.ok(privateclaw, "plugin should register a top-level privateclaw command");
  const sessions = privateclaw.children.get("sessions");
  const kick = privateclaw.children.get("kick");
  assert.ok(sessions?.actionHandler, "plugin should register the privateclaw sessions subcommand");
  assert.ok(kick?.actionHandler, "plugin should register the privateclaw kick subcommand");

  const command = getCommand();
  const reply = await command.handler({
    channel: "telegram",
    senderId: "tester",
    isAuthorizedSender: true,
    commandBody: "/privateclaw group",
    args: "group",
    config: {},
  });
  const inviteUri = reply.text?.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");
  const invite = decodeInviteString(inviteUri);

  const appOneUrl = new URL(invite.appWsUrl);
  appOneUrl.searchParams.set("appId", "app-one");
  const appOne = new WebSocket(appOneUrl.toString());
  const appOneAttached = new Promise<Record<string, unknown>>((resolve, reject) => {
    appOne.once("message", (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    appOne.once("error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    appOne.once("open", () => resolve());
    appOne.once("error", reject);
  });
  assert.equal((await appOneAttached).type, "relay:attached");
  const appOneInitialFrames = new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    const onMessage = (data: unknown) => {
      messages.push(JSON.parse(String(data)) as Record<string, unknown>);
      if (messages.length === 3) {
        appOne.off("message", onMessage);
        resolve(messages);
      }
    };
    appOne.on("message", onMessage);
    appOne.once("error", reject);
  });
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
  const appTwoAttached = new Promise<Record<string, unknown>>((resolve, reject) => {
    appTwo.once("message", (data) => resolve(JSON.parse(data.toString()) as Record<string, unknown>));
    appTwo.once("error", reject);
  });
  await new Promise<void>((resolve, reject) => {
    appTwo.once("open", () => resolve());
    appTwo.once("error", reject);
  });
  assert.equal((await appTwoAttached).type, "relay:attached");
  const appTwoInitialFrames = new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    const onMessage = (data: unknown) => {
      messages.push(JSON.parse(String(data)) as Record<string, unknown>);
      if (messages.length === 3) {
        appTwo.off("message", onMessage);
        resolve(messages);
      }
    };
    appTwo.on("message", onMessage);
    appTwo.once("error", reject);
  });
  const appOneJoinFrames = new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const messages: Record<string, unknown>[] = [];
    const onMessage = (data: unknown) => {
      messages.push(JSON.parse(String(data)) as Record<string, unknown>);
      if (messages.length === 2) {
        appOne.off("message", onMessage);
        resolve(messages);
      }
    };
    appOne.on("message", onMessage);
    appOne.once("error", reject);
  });
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

  const printed: string[] = [];
  const originalLog = console.log;
  console.log = (message?: unknown, ...optionalParams: unknown[]) => {
    printed.push([message, ...optionalParams].map(String).join(" "));
  };
  t.after(() => {
    console.log = originalLog;
  });

  await sessions.actionHandler?.();
  assert.ok(printed.some((line) => line.includes(invite.sessionId)));
  assert.ok(printed.some((line) => line.includes("type=group")));
  assert.ok(printed.some((line) => line.includes("participants=2")));
  assert.ok(printed.some((line) => line.includes("SolarFox (app-one)")));
  assert.ok(printed.some((line) => line.includes("RiverCat (app-two)")));
  printed.length = 0;

  const appTwoClosed = new Promise<Record<string, unknown>>((resolve, reject) => {
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
  });
  await kick.actionHandler?.(invite.sessionId, "app-two");
  assert.ok(printed.some((line) => line.includes("RiverCat (app-two)")));
  const closed = await appTwoClosed;
  assert.equal(closed.type, "relay:session_closed");
  assert.equal(closed.reason, "participant_removed");

  appOne.close();
  appTwo.close();
});
