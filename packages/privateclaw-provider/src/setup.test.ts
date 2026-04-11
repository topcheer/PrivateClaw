import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPrivateClawSetupPlan,
  detectLocalOpenClawStatus,
  EFFECTIVELY_PERMANENT_SESSION_TTL_MS,
  parsePrivateClawSessionDurationPreset,
  renderPrivateClawSetupGuidance,
  resolvePrivateClawSetupSelection,
  runPrivateClawSetup,
} from "./setup.js";

test("detectLocalOpenClawStatus uses the privateclaw help probe to confirm command availability", async () => {
  const status = await detectLocalOpenClawStatus(async (_command, args) => {
    if (args.length === 1 && args[0] === "--version") {
      return {
        stdout: "OpenClaw 2026.3.22\n",
        stderr: "",
        combined: "OpenClaw 2026.3.22\n",
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
        stdout: "OpenClaw 2026.3.22\n",
        stderr: "",
        combined: "OpenClaw 2026.3.22\n",
      };
    }
    if (
      args[0] === "privateclaw" &&
      args[1] === "pair" &&
      args[2] === "--help"
    ) {
      throw new Error(
        "Command `openclaw privateclaw pair --help` exited with code 1: error: unknown command 'privateclaw'",
      );
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
        stdout: "OpenClaw 2026.3.22\n",
        stderr: "",
        combined: "OpenClaw 2026.3.22\n",
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

test("parsePrivateClawSessionDurationPreset supports the permanent preset", () => {
  const preset = parsePrivateClawSessionDurationPreset("permanent");
  assert.equal(preset.ttlMs, EFFECTIVELY_PERMANENT_SESSION_TTL_MS);
  assert.match(preset.label, /Permanent/);
});

test("resolvePrivateClawSetupSelection prompts for missing mode and duration", async () => {
  const prompts: string[] = [];
  const selection = await resolvePrivateClawSetupSelection({
    promptForChoice: async (question, _choices, defaultValue) => {
      prompts.push(question);
      if (question.includes("session type")) {
        return "group";
      }
      assert.equal(defaultValue, "24h");
      return "1w";
    },
  });

  assert.equal(selection.groupMode, true);
  assert.equal(selection.ttlMs, 7 * 24 * 60 * 60 * 1000);
  assert.match(selection.durationLabel, /1 week/);
  assert.equal(prompts.length, 2);
});

test("buildPrivateClawSetupPlan prints manual OpenClaw commands when openclaw is unavailable", () => {
  const plan = buildPrivateClawSetupPlan({
    packageSpec: "@privateclaw/privateclaw@0.1.26",
    packageRoot: "/tmp/privateclaw-package",
    status: {
      openClawAvailable: false,
      privateClawCommandAvailable: false,
    },
    selection: {
      groupMode: true,
      ttlMs: 2 * 60 * 60 * 1000,
      durationLabel: "2 小时 / 2 hours",
    },
    relayBaseUrl: "https://relay.example.com",
    label: "hello",
    openInBrowser: true,
  });

  assert.equal(plan.localOpenClaw, false);
  assert.equal(plan.manualSteps.length, 7);
  assert.match(
    renderPrivateClawSetupGuidance(plan),
    /openclaw plugins install --dangerously-force-unsafe-install \/tmp\/privateclaw-package/,
  );
  assert.match(
    renderPrivateClawSetupGuidance(plan),
    /openclaw plugins install --dangerously-force-unsafe-install @privateclaw\/privateclaw@0\.1\.26/,
  );
  assert.doesNotMatch(renderPrivateClawSetupGuidance(plan), /npm pack/u);
  assert.match(renderPrivateClawSetupGuidance(plan), /GitHub Releases/i);
  assert.equal(
    plan.pairingCommand.display,
    "openclaw privateclaw pair --ttl-ms 7200000 --group --label hello --relay https://relay.example.com --open",
  );
});

test("runPrivateClawSetup installs, enables, restarts, then starts pairing", async () => {
  const executed: string[] = [];
  const pairings: string[] = [];
  const logs: string[] = [];
  let detectCalls = 0;

  await runPrivateClawSetup({
    packageSpec: "@privateclaw/privateclaw@0.1.26",
    packageRoot: "/tmp/privateclaw-package",
    selection: {
      groupMode: true,
      ttlMs: 8 * 60 * 60 * 1000,
      durationLabel: "8 小时 / 8 hours",
    },
    relayBaseUrl: "https://relay.example.com",
    label: "demo",
    verbose: true,
    onLog: (line) => {
      logs.push(line);
    },
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
    runStep: async (step) => {
      executed.push(step.display);
    },
    runPairingCommand: async (step) => {
      pairings.push(step.display);
      return {
        stdout: "",
        stderr: "",
        combined: "",
      };
    },
    verificationTimeoutMs: 10,
    verificationPollMs: 0,
  });

  assert.deepEqual(executed, [
    "openclaw plugins allow privateclaw",
    "openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
    "openclaw plugins enable privateclaw",
    "openclaw gateway restart",
  ]);
  assert.deepEqual(pairings, [
    "openclaw privateclaw pair --ttl-ms 28800000 --group --label demo --relay https://relay.example.com --verbose",
  ]);
  assert.match(logs.join("\n"), /Verified command availability/);
  assert.match(logs.join("\n"), /GitHub Releases/i);
});

test("runPrivateClawSetup propagates OPENCLAW_STATE_DIR and OPENCLAW_CONFIG_PATH when configPath is provided", async () => {
  const executed: string[] = [];
  const stepEnvs: Array<NodeJS.ProcessEnv | undefined> = [];
  const pairingEnvs: Array<NodeJS.ProcessEnv | undefined> = [];
  let detectCalls = 0;

  await runPrivateClawSetup({
    packageSpec: "@privateclaw/privateclaw@0.1.26",
    packageRoot: "/tmp/privateclaw-package",
    configPath: "/tmp/openclaw-test/openclaw.json",
    selection: {
      groupMode: false,
      ttlMs: 30 * 60 * 1000,
      durationLabel: "30 分钟 / 30 minutes",
    },
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
    runStep: async (step) => {
      executed.push(step.display);
      stepEnvs.push(step.env);
    },
    runPairingCommand: async (step) => {
      pairingEnvs.push(step.env);
      return {
        stdout: "",
        stderr: "",
        combined: "",
      };
    },
    verificationTimeoutMs: 10,
    verificationPollMs: 0,
  });

  assert.equal(
    executed[0],
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins allow privateclaw",
  );
  assert.deepEqual(executed, [
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins allow privateclaw",
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
    "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins enable privateclaw",
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

test("buildPrivateClawSetupPlan uses gateway run guidance instead of restart when configPath is provided", () => {
  const plan = buildPrivateClawSetupPlan({
    packageSpec: "@privateclaw/privateclaw@0.1.26",
    packageRoot: "/tmp/privateclaw-package",
    configPath: "/tmp/openclaw-test/openclaw.json",
    status: {
      openClawAvailable: true,
      privateClawCommandAvailable: false,
      privateClawPluginPresent: false,
    },
    selection: {
      groupMode: false,
      ttlMs: 30 * 60 * 1000,
      durationLabel: "30 分钟 / 30 minutes",
    },
  });

  assert.deepEqual(
    plan.automaticSteps.map((step) => step.display),
    [
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins allow privateclaw",
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins install --dangerously-force-unsafe-install /tmp/privateclaw-package",
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw plugins enable privateclaw",
      "OPENCLAW_STATE_DIR=/tmp/openclaw-test OPENCLAW_CONFIG_PATH=/tmp/openclaw-test/openclaw.json openclaw config set gateway.mode local",
    ],
  );
  assert.match(
    renderPrivateClawSetupGuidance(plan),
    /OPENCLAW_STATE_DIR=\/tmp\/openclaw-test OPENCLAW_CONFIG_PATH=\/tmp\/openclaw-test\/openclaw\.json openclaw gateway run/,
  );
  assert.doesNotMatch(renderPrivateClawSetupGuidance(plan), /openclaw gateway restart/u);
});

test("runPrivateClawSetup prints guidance and fails when openclaw is unavailable locally", async () => {
  const logs: string[] = [];

  await assert.rejects(
    runPrivateClawSetup({
      selection: {
        groupMode: false,
        ttlMs: 30 * 60 * 1000,
        durationLabel: "30 分钟 / 30 minutes",
      },
      onLog: (line) => {
        logs.push(line);
      },
      detectLocalOpenClawStatus: async () => ({
        openClawAvailable: false,
        privateClawCommandAvailable: false,
      }),
    }),
    /cannot be installed automatically/i,
  );

  assert.match(logs.join("\n"), /Run these commands on the machine where OpenClaw is installed/i);
  assert.match(logs.join("\n"), /GitHub Releases/i);
});
