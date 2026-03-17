import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRelayProviderSetupPlan,
  offerRelayProviderSetup,
  renderRelayProviderSetupGuidance,
} from "./provider-setup.js";

test("buildRelayProviderSetupPlan prints remote OpenClaw commands when openclaw is unavailable", () => {
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: "https://relay.example.com",
    status: {
      openClawAvailable: false,
      privateClawCommandAvailable: false,
    },
  });

  assert.equal(plan.localOpenClaw, false);
  assert.equal(plan.manualSteps.length, 3);
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw plugins install @privateclaw\/privateclaw@latest/,
  );
  assert.match(
    renderRelayProviderSetupGuidance(plan),
    /openclaw config set plugins\.entries\.privateclaw\.config\.relayBaseUrl https:\/\/relay\.example\.com/,
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
  assert.equal(plan.automaticSteps.length, 1);
  assert.equal(
    plan.automaticSteps[0]?.display,
    "openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
  );
});

test("offerRelayProviderSetup runs install + enable + config when local privateclaw is inactive", async () => {
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
      privateClawCommandAvailable: false,
    }),
    promptToContinue: async () => true,
    runStep: async (step) => {
      executed.push(step.display);
    },
  });

  assert.deepEqual(executed, [
    "openclaw plugins install @privateclaw/privateclaw@latest",
    "openclaw plugins enable privateclaw",
    "openclaw config set plugins.entries.privateclaw.config.relayBaseUrl https://relay.example.com",
  ]);
  assert.match(logs.join("\n"), /Restart the running OpenClaw gateway\/service now/);
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
    }),
    promptToContinue: async () => false,
    runStep: async (step) => {
      executed.push(step.display);
    },
  });

  assert.deepEqual(executed, []);
  assert.match(logs.join("\n"), /Skipping automatic OpenClaw configuration/);
});
