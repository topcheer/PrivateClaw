import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelayProviderSetupPlan,
  detectLocalOpenClawStatus,
  offerRelayProviderSetup,
  renderRelayProviderSetupGuidance,
} from "./provider-setup.js";

test("detectLocalOpenClawStatus falls back to the privateclaw help probe when commands list is unavailable", async () => {
  const status = await detectLocalOpenClawStatus(async (_command, args) => {
    if (args.length === 1 && args[0] === "--version") {
      return {
        stdout: "OpenClaw 2026.3.13\n",
        stderr: "",
        combined: "OpenClaw 2026.3.13\n",
      };
    }
    if (args[0] === "commands" && args[1] === "list") {
      throw new Error("Command `openclaw commands list` exited with code 1: error: unknown command 'commands'");
    }
    if (
      args[0] === "privateclaw" &&
      args[1] === "pair" &&
      args[2] === "--help"
    ) {
      return {
        stdout: "Usage: openclaw privateclaw pair [options]\n",
        stderr: "",
        combined: "Usage: openclaw privateclaw pair [options]\n",
      };
    }
    if (args[0] === "plugins" && args[1] === "info" && args[2] === "privateclaw") {
      throw new Error("Plugin not found");
    }
    throw new Error(`Unexpected command args: ${args.join(" ")}`);
  });

  assert.deepEqual(status, {
    openClawAvailable: true,
    privateClawCommandAvailable: true,
    privateClawPluginPresent: false,
  });
});

test("detectLocalOpenClawStatus marks the plugin as present when OpenClaw can inspect it", async () => {
  const status = await detectLocalOpenClawStatus(async (_command, args) => {
    if (args.length === 1 && args[0] === "--version") {
      return {
        stdout: "OpenClaw 2026.3.13\n",
        stderr: "",
        combined: "OpenClaw 2026.3.13\n",
      };
    }
    if (args[0] === "commands" && args[1] === "list") {
      throw new Error("Command `openclaw commands list` exited with code 1: error: unknown command 'commands'");
    }
    if (
      args[0] === "privateclaw" &&
      args[1] === "pair" &&
      args[2] === "--help"
    ) {
      throw new Error("Command `openclaw privateclaw pair --help` exited with code 1.");
    }
    if (args[0] === "plugins" && args[1] === "info" && args[2] === "privateclaw") {
      return {
        stdout: "PrivateClaw\nid: privateclaw\n",
        stderr: "",
        combined: "PrivateClaw\nid: privateclaw\n",
      };
    }
    throw new Error(`Unexpected command args: ${args.join(" ")}`);
  });

  assert.deepEqual(status, {
    openClawAvailable: true,
    privateClawCommandAvailable: false,
    privateClawPluginPresent: true,
  });
});

test("buildRelayProviderSetupPlan prints remote OpenClaw commands when openclaw is unavailable", () => {
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: "https://relay.example.com",
    status: {
      openClawAvailable: false,
      privateClawCommandAvailable: false,
    },
  });

  assert.equal(plan.localOpenClaw, false);
  assert.equal(plan.manualSteps.length, 4);
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw plugins install @privateclaw\/privateclaw@latest/,
  );
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw config set plugins\.entries\.privateclaw\.config\.relayBaseUrl https:\/\/relay\.example\.com/,
  );
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw gateway restart/,
  );
  assert.equal(
    plan.pairingCommand.display,
    "openclaw privateclaw pair --group --relay https://relay.example.com",
  );
});

test("buildRelayProviderSetupPlan uses config-only flow when local privateclaw is already active", () => {
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: "https://relay.example.com",
    status: {
      openClawAvailable: true,
      privateClawCommandAvailable: true,
    },
  });

  assert.equal(plan.localOpenClaw, true);
  assert.equal(plan.automaticSteps.length, 2);
  assert.equal(
    plan.automaticSteps[0]?.display,
    "openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
  );
  assert.equal(
    plan.automaticSteps[1]?.display,
    "openclaw gateway restart",
  );
});

test("buildRelayProviderSetupPlan uses update when privateclaw is already installed but inactive", () => {
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: "https://relay.example.com",
    status: {
      openClawAvailable: true,
      privateClawCommandAvailable: false,
      privateClawPluginPresent: true,
    },
  });

  assert.equal(plan.localOpenClaw, true);
  assert.equal(plan.automaticSteps.length, 4);
  assert.equal(
    plan.automaticSteps[0]?.display,
    "openclaw plugins update privateclaw",
  );
  assert.match(plan.introduction, /Refresh\/configure it with/);
});

test("offerRelayProviderSetup runs install + enable + config + restart, then starts group pairing", async () => {
  const executed: string[] = [];
  const pairings: string[] = [];
  const browserTargets: string[] = [];
  const logs: string[] = [];
  const prompts = [true, true];
  let detectCalls = 0;

  await offerRelayProviderSetup({
    relayBaseUrl: "https://relay.example.com",
    webChatUrl: "https://relay.example.com/chat/",
    onLog: (line) => {
      logs.push(line);
    },
    isInteractive: true,
    detectLocalOpenClawStatus: async () => {
      detectCalls += 1;
      if (detectCalls === 1) {
        return {
          openClawAvailable: true,
          privateClawCommandAvailable: false,
          privateClawPluginPresent: false,
        };
      }
      return {
        openClawAvailable: true,
        privateClawCommandAvailable: true,
        privateClawPluginPresent: true,
      };
    },
    promptToContinue: async () => prompts.shift() ?? false,
    runStep: async (step) => {
      executed.push(step.display);
    },
    runPairingCommand: async (step) => {
      pairings.push(step.display);
      return {
        stdout: "邀请链接 / Invite URI: privateclaw://connect?payload=test-invite\n",
        stderr: "",
        combined:
          "邀请链接 / Invite URI: privateclaw://connect?payload=test-invite\n",
      };
    },
    openBrowser: async (target) => {
      browserTargets.push(target);
    },
    verificationTimeoutMs: 10,
    verificationPollMs: 0,
  });

  assert.deepEqual(executed, [
    "openclaw plugins install @privateclaw/privateclaw@latest",
    "openclaw plugins enable privateclaw",
    "openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
    "openclaw gateway restart",
  ]);
  assert.deepEqual(pairings, [
    "openclaw privateclaw pair --group --relay https://relay.example.com",
  ]);
  assert.deepEqual(browserTargets, [
    "https://relay.example.com/chat/?invite=privateclaw%3A%2F%2Fconnect%3Fpayload%3Dtest-invite",
  ]);
  assert.match(logs.join("\n"), /Verified `privateclaw` is now available/);
});

test("offerRelayProviderSetup runs update instead of install when privateclaw is already present", async () => {
  const executed: string[] = [];
  const prompts = [true, false];
  let detectCalls = 0;

  await offerRelayProviderSetup({
    relayBaseUrl: "https://relay.example.com",
    isInteractive: true,
    detectLocalOpenClawStatus: async () => {
      detectCalls += 1;
      if (detectCalls === 1) {
        return {
          openClawAvailable: true,
          privateClawCommandAvailable: false,
          privateClawPluginPresent: true,
        };
      }
      return {
        openClawAvailable: true,
        privateClawCommandAvailable: true,
        privateClawPluginPresent: true,
      };
    },
    promptToContinue: async () => prompts.shift() ?? false,
    runStep: async (step) => {
      executed.push(step.display);
    },
    verificationTimeoutMs: 10,
    verificationPollMs: 0,
  });

  assert.deepEqual(executed, [
    "openclaw plugins update privateclaw",
    "openclaw plugins enable privateclaw",
    "openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
    "openclaw gateway restart",
  ]);
});

test("offerRelayProviderSetup only prints guidance when openclaw is unavailable locally", async () => {
  const executed: string[] = [];
  const logs: string[] = [];

  await offerRelayProviderSetup({
    relayBaseUrl: "https://relay.example.com",
    onLog: (line) => {
      logs.push(line);
    },
    isInteractive: true,
    detectLocalOpenClawStatus: async () => ({
      openClawAvailable: false,
      privateClawCommandAvailable: false,
      privateClawPluginPresent: false,
    }),
    promptToContinue: async () => true,
    runStep: async (step) => {
      executed.push(step.display);
    },
  });

  assert.deepEqual(executed, []);
  assert.match(logs.join("\n"), /run these commands on the machine where `openclaw` is installed/i);
});

test("offerRelayProviderSetup respects declined local configuration", async () => {
  const executed: string[] = [];
  const logs: string[] = [];

  await offerRelayProviderSetup({
    relayBaseUrl: "https://relay.example.com",
    onLog: (line) => {
      logs.push(line);
    },
    isInteractive: true,
    detectLocalOpenClawStatus: async () => ({
      openClawAvailable: true,
      privateClawCommandAvailable: true,
      privateClawPluginPresent: true,
    }),
    promptToContinue: async () => false,
    runStep: async (step) => {
      executed.push(step.display);
    },
  });

  assert.deepEqual(executed, []);
  assert.match(logs.join("\n"), /Skipping automatic OpenClaw configuration/);
});

test("offerRelayProviderSetup throws if privateclaw is still unavailable after restart", async () => {
  await assert.rejects(
    offerRelayProviderSetup({
      relayBaseUrl: "https://relay.example.com",
      isInteractive: true,
      detectLocalOpenClawStatus: async () => ({
        openClawAvailable: true,
        privateClawCommandAvailable: false,
        privateClawPluginPresent: false,
      }),
      promptToContinue: async () => true,
      runStep: async () => undefined,
      verificationTimeoutMs: 10,
      verificationPollMs: 0,
    }),
    /still does not respond to `openclaw privateclaw pair --help`/,
  );
});
