import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelayProviderSetupPlan,
  detectLocalOpenClawStatus,
  offerRelayProviderSetup,
  renderRelayProviderSetupGuidance,
} from "./provider-setup.js";

test("detectLocalOpenClawStatus uses the privateclaw help probe to confirm command availability", async () => {
  const status = await detectLocalOpenClawStatus(async (_command, args) => {
    if (args.length === 1 && args[0] === "--version") {
      return {
        stdout: "OpenClaw 2026.3.13\n",
        stderr: "",
        combined: "OpenClaw 2026.3.13\n",
      };
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

test("detectLocalOpenClawStatus does not trust commands-list mentions when the privateclaw help probe fails", async () => {
  const status = await detectLocalOpenClawStatus(async (_command, args) => {
    if (args.length === 1 && args[0] === "--version") {
      return {
        stdout: "OpenClaw 2026.3.13\n",
        stderr: "",
        combined: "OpenClaw 2026.3.13\n",
      };
    }
    if (
      args[0] === "privateclaw" &&
      args[1] === "pair" &&
      args[2] === "--help"
    ) {
      throw new Error("Command `openclaw privateclaw pair --help` exited with code 1: error: unknown command 'privateclaw'");
    }
    if (args[0] === "plugins" && args[1] === "info" && args[2] === "privateclaw") {
      throw new Error("Plugin not found");
    }
    throw new Error(`Unexpected command args: ${args.join(" ")}`);
  });

  assert.deepEqual(status, {
    openClawAvailable: true,
    privateClawCommandAvailable: false,
    privateClawPluginPresent: false,
  });
});

test("detectLocalOpenClawStatus does not trust generic root help output for unknown commands", async () => {
  const status = await detectLocalOpenClawStatus(async (_command, args) => {
    if (args.length === 1 && args[0] === "--version") {
      return {
        stdout: "OpenClaw 2026.3.13\n",
        stderr: "",
        combined: "OpenClaw 2026.3.13\n",
      };
    }
    if (
      args[0] === "privateclaw" &&
      args[1] === "pair" &&
      args[2] === "--help"
    ) {
      return {
        stdout: "Usage: openclaw [options] [command]\nCommands:\n  help  Display help for command\n",
        stderr: "",
        combined:
          "Usage: openclaw [options] [command]\nCommands:\n  help  Display help for command\n",
      };
    }
    if (args[0] === "plugins" && args[1] === "info" && args[2] === "privateclaw") {
      throw new Error("Plugin not found");
    }
    throw new Error(`Unexpected command args: ${args.join(" ")}`);
  });

  assert.deepEqual(status, {
    openClawAvailable: true,
    privateClawCommandAvailable: false,
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
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
    status: {
      openClawAvailable: false,
      privateClawCommandAvailable: false,
    },
  });

  assert.equal(plan.localOpenClaw, false);
  assert.equal(plan.manualSteps.length, 6);
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw plugins install --dangerously-force-unsafe-install \/tmp\/privateclaw-package/,
  );
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw plugins install --dangerously-force-unsafe-install @privateclaw\/privateclaw@0\.1\.40/,
  );
  assert.doesNotMatch(renderRelayProviderSetupGuidance(plan), /npm pack/u);
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
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
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
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
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
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
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
    "openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
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
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
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

test("offerRelayProviderSetup propagates OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH when an OpenClaw config path is provided", async () => {
  const executed: string[] = [];
  const stepEnvs: Array<NodeJS.ProcessEnv | undefined> = [];
  const pairingEnvs: Array<NodeJS.ProcessEnv | undefined> = [];
  const prompts = [true, true];
  let detectCalls = 0;

  await offerRelayProviderSetup({
    relayBaseUrl: "https://relay.example.com",
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
    openClawConfigPath: "/tmp/openclaw-test/openclaw.json",
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
      stepEnvs.push(step.env);
    },
    runPairingCommand: async (step) => {
      pairingEnvs.push(step.env);
      return {
        stdout: "邀请链接 / Invite URI: privateclaw://connect?payload=test-invite\n",
        stderr: "",
        combined:
          "邀请链接 / Invite URI: privateclaw://connect?payload=test-invite\n",
      };
    },
    verificationTimeoutMs: 10,
    verificationPollMs: 0,
  });

  assert.equal(
    executed[0],
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
  );
  assert.deepEqual(executed, [
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins enable privateclaw",
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw config set gateway.mode local",
  ]);
  assert.equal(stepEnvs[0]?.OPENCLAW_STATE_DIR, "/tmp/openclaw-test");
  assert.equal(
    stepEnvs[0]?.OPENCLAW_CONFIG_PATH,
    "/tmp/openclaw-test/openclaw.json",
  );
  assert.equal(pairingEnvs[0]?.OPENCLAW_STATE_DIR, "/tmp/openclaw-test");
  assert.equal(
    pairingEnvs[0]?.OPENCLAW_CONFIG_PATH,
    "/tmp/openclaw-test/openclaw.json",
  );
});

test("buildRelayProviderSetupPlan uses gateway run guidance instead of restart when config path is provided", () => {
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: "https://relay.example.com",
    packageRoot: "/tmp/privateclaw-package",
    packageSpec: "@privateclaw/privateclaw@0.1.40",
    openClawConfigPath: "/tmp/openclaw-test/openclaw.json",
    status: {
      openClawAvailable: true,
      privateClawCommandAvailable: false,
      privateClawPluginPresent: false,
    },
  });

  assert.deepEqual(
    plan.automaticSteps.map((step) => step.display),
    [
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins enable privateclaw",
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw config set gateway.mode local",
    ],
  );
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /OPENCLAW_STATE_DIR=\/tmp\/openclaw-test OPENCLAW_CONFIG_PATH=\/tmp\/openclaw-test\/openclaw\.json openclaw gateway run/,
  );
  assert.doesNotMatch(renderRelayProviderSetupGuidance(plan), /openclaw gateway restart/u);
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
