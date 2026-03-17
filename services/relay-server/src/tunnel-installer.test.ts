import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureRelayTunnelDependencyAvailable,
  ensureRelayTunnelProviderConfigured,
  renderRelayTunnelConfigurationGuidance,
  renderRelayTunnelDependencyGuidance,
  resolveRelayTunnelDependencyPlan,
  type RelayTunnelDependencyPlan,
} from "./tunnel-installer.js";
import { RelayCliUserError } from "./cli-error.js";
import { MissingRelayTunnelBinaryError } from "./tunnel.js";

test("resolveRelayTunnelDependencyPlan uses Homebrew on macOS", () => {
  const plan = resolveRelayTunnelDependencyPlan("cloudflare", {
    platform: "darwin",
    availableCommands: ["brew"],
  });

  assert.equal(plan.installStep?.display, "brew install cloudflared");
  assert.equal(plan.docsUrl.includes("cloudflare"), true);
});

test("resolveRelayTunnelDependencyPlan uses winget on Windows", () => {
  const plan = resolveRelayTunnelDependencyPlan("tailscale", {
    platform: "win32",
    availableCommands: ["winget"],
  });

  assert.equal(
    plan.installStep?.display,
    "winget install --id Tailscale.Tailscale -e",
  );
  assert.deepEqual(
    plan.configureSteps.map((step) => step.display),
    ["tailscale up"],
  );
});

test("resolveRelayTunnelDependencyPlan offers Linux tailscale install and setup", () => {
  const plan = resolveRelayTunnelDependencyPlan("tailscale", {
    platform: "linux",
    availableCommands: ["curl", "sh", "sudo", "systemctl"],
    isRoot: false,
  });

  assert.equal(
    plan.installStep?.display,
    "curl -fsSL https://tailscale.com/install.sh | sh",
  );
  assert.deepEqual(
    plan.configureSteps.map((step) => step.display),
    ["sudo systemctl enable --now tailscaled", "sudo tailscale up"],
  );
});

test("renderRelayTunnelDependencyGuidance includes install and docs guidance", () => {
  const plan = resolveRelayTunnelDependencyPlan("cloudflare", {
    platform: "darwin",
    availableCommands: ["brew"],
  });

  const guidance = renderRelayTunnelDependencyGuidance(plan);
  assert.match(guidance, /brew install cloudflared/);
  assert.match(guidance, /not found in PATH or is not executable/);
  assert.match(guidance, /Docs:/);
});

test("renderRelayTunnelConfigurationGuidance includes setup commands and docs", () => {
  const plan = resolveRelayTunnelDependencyPlan("tailscale", {
    platform: "linux",
    availableCommands: ["curl", "sh", "sudo", "systemctl"],
    isRoot: false,
  });

  const guidance = renderRelayTunnelConfigurationGuidance(
    plan,
    "Tailscale is installed, but this device is not logged in.",
  );
  assert.match(guidance, /tailscale up/);
  assert.match(guidance, /Docs:/);
});

test("ensureRelayTunnelDependencyAvailable runs install and configure steps after confirmation", async () => {
  const executed: string[] = [];
  const plan: RelayTunnelDependencyPlan = {
    provider: "tailscale",
    binary: "tailscale",
    displayName: "Tailscale CLI",
    docsUrl: "https://tailscale.com/docs/install",
    installStep: {
      title: "Install Tailscale",
      command: "brew",
      args: ["install", "tailscale"],
      display: "brew install tailscale",
    },
    configureSteps: [
      {
        title: "Start service",
        command: "sudo",
        args: ["brew", "services", "start", "tailscale"],
        display: "sudo brew services start tailscale",
      },
      {
        title: "Connect",
        command: "tailscale",
        args: ["up"],
        display: "tailscale up",
      },
    ],
    manualSteps: [],
    notes: [],
  };

  await ensureRelayTunnelDependencyAvailable({
    provider: "tailscale",
    missingDependency: new MissingRelayTunnelBinaryError(
      "tailscale",
      "Install Tailscale first.",
    ),
    isInteractive: true,
    resolvePlan: () => plan,
    promptToContinue: async () => true,
    runStep: async (step) => {
      executed.push(step.display);
    },
  });

  assert.deepEqual(executed, [
    "brew install tailscale",
    "sudo brew services start tailscale",
    "tailscale up",
  ]);
});

test("ensureRelayTunnelDependencyAvailable explains when automatic install is unavailable", async () => {
  await assert.rejects(
    () =>
      ensureRelayTunnelDependencyAvailable({
        provider: "cloudflare",
        missingDependency: new MissingRelayTunnelBinaryError(
          "cloudflared",
          "Install cloudflared first.",
        ),
        isInteractive: true,
        resolvePlan: () => ({
          provider: "cloudflare",
          binary: "cloudflared",
          displayName: "cloudflared",
          docsUrl:
            "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/",
          configureSteps: [],
          manualSteps: [],
          notes: [],
        }),
      }),
    /Automatic installation is not available/,
  );
});

test("ensureRelayTunnelProviderConfigured runs setup steps after confirmation", async () => {
  const executed: string[] = [];
  const plan = resolveRelayTunnelDependencyPlan("tailscale", {
    platform: "linux",
    availableCommands: ["curl", "sh", "sudo", "systemctl"],
    isRoot: false,
  });

  await ensureRelayTunnelProviderConfigured({
    provider: "tailscale",
    summary: "Tailscale is installed, but this device is not logged in.",
    isInteractive: true,
    resolvePlan: () => plan,
    promptToContinue: async () => true,
    runStep: async (step) => {
      executed.push(step.display);
    },
  });

  assert.deepEqual(executed, [
    "sudo systemctl enable --now tailscaled",
    "sudo tailscale up",
  ]);
});

test("ensureRelayTunnelProviderConfigured treats declined setup as a user-facing error", async () => {
  const plan = resolveRelayTunnelDependencyPlan("tailscale", {
    platform: "linux",
    availableCommands: ["curl", "sh", "sudo", "systemctl"],
    isRoot: false,
  });

  await assert.rejects(
    () =>
      ensureRelayTunnelProviderConfigured({
        provider: "tailscale",
        summary: "Tailscale is installed, but this device is not logged in.",
        isInteractive: true,
        resolvePlan: () => plan,
        promptToContinue: async () => false,
      }),
    (error) =>
      error instanceof RelayCliUserError &&
      /Setup was declined/.test(error.message),
  );
});

test("ensureRelayTunnelDependencyAvailable treats declined install as a user-facing error", async () => {
  await assert.rejects(
    () =>
      ensureRelayTunnelDependencyAvailable({
        provider: "cloudflare",
        missingDependency: new MissingRelayTunnelBinaryError(
          "cloudflared",
          "Install cloudflared first.",
        ),
        isInteractive: true,
        resolvePlan: () => ({
          provider: "cloudflare",
          binary: "cloudflared",
          displayName: "cloudflared",
          docsUrl:
            "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/",
          installStep: {
            title: "Install cloudflared",
            command: "brew",
            args: ["install", "cloudflared"],
            display: "brew install cloudflared",
          },
          configureSteps: [],
          manualSteps: [],
          notes: [],
        }),
        promptToContinue: async () => false,
      }),
    (error) =>
      error instanceof RelayCliUserError &&
      /Installation was declined/.test(error.message),
  );
});
