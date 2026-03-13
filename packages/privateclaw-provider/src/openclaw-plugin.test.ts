import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { decodeInviteString } from "@privateclaw/protocol";
import { createRelayServer } from "../../../services/relay-server/src/relay-server.js";
import { EchoBridge } from "./bridges/echo-bridge.js";
import type {
  OpenClawPluginApiCompat,
  OpenClawPluginCommandDefinitionCompat,
  OpenClawPluginServiceCompat,
} from "./compat/openclaw.js";
import { createOpenClawCompatiblePlugin } from "./openclaw-plugin.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createMockApi(): {
  api: OpenClawPluginApiCompat;
  getCommand(): OpenClawPluginCommandDefinitionCompat;
  getService(): OpenClawPluginServiceCompat;
} {
  let command: OpenClawPluginCommandDefinitionCompat | undefined;
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
      registerService(registeredService) {
        service = registeredService;
      },
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

  const inviteUri = reply.text.match(/privateclaw:\/\/connect\?payload=\S+/)?.[0];
  assert.ok(inviteUri, "reply text should include a PrivateClaw invite URI");

  const invite = decodeInviteString(inviteUri);
  const expectedMediaDir = path.join(stateDir, "media", "privateclaw");
  assert.equal(path.dirname(reply.mediaUrl), expectedMediaDir);
  assert.equal(path.basename(reply.mediaUrl), `privateclaw-${invite.sessionId}.png`);

  const qrPng = await readFile(reply.mediaUrl);
  assert.deepEqual(qrPng.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);
});
