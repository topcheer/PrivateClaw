import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { decodeInviteString } from "@privateclaw/protocol";
import { createRelayServer } from "../../../services/relay-server/src/relay-server.js";
import { EchoBridge } from "./bridges/echo-bridge.js";
import { privateClawConfigSchema } from "./compat/openclaw.js";
import { DEFAULT_SESSION_TTL_MS } from "./provider.js";
import { DEFAULT_RELAY_BASE_URL } from "./relay-defaults.js";
import type {
  OpenClawPluginCliRegistrarCompat,
  OpenClawPluginApiCompat,
  OpenClawPluginCommandDefinitionCompat,
  OpenClawPluginServiceCompat,
} from "./compat/openclaw.js";
import { createOpenClawCompatiblePlugin } from "./openclaw-plugin.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createMockApi(): {
  api: OpenClawPluginApiCompat;
  getCli(): { registrar: OpenClawPluginCliRegistrarCompat; commands: string[] };
  getCommand(): OpenClawPluginCommandDefinitionCompat;
  getService(): OpenClawPluginServiceCompat;
} {
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
      runtime: {},
      logger,
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

  option(_flags: string, _description?: string, _defaultValue?: string | boolean): FakeCliCommand {
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

  const inviteUri = reply.text.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");

  const invite = decodeInviteString(inviteUri);
  const remainingMs = new Date(invite.expiresAt).getTime() - Date.now();
  assert.ok(
    remainingMs > DEFAULT_SESSION_TTL_MS - 60_000,
    "new sessions should default to roughly 8 hours even when relay default TTL is shorter",
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
    "local pair sessions should default to roughly 8 hours even when relay default TTL is shorter",
  );
  const qrPath = qrPathLine.replace("二维码 PNG 路径 / QR PNG path: ", "");
  const qrPng = await readFile(qrPath);
  assert.deepEqual(qrPng.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
});
