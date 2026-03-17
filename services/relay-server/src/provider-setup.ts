import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { RelayCliUserError } from "./cli-error.js";

export interface RelayProviderSetupStep {
  title: string;
  command: string;
  args: string[];
  display: string;
}

export interface LocalOpenClawStatus {
  openClawAvailable: boolean;
  privateClawCommandAvailable: boolean;
}

export interface RelayProviderSetupPlan {
  relayBaseUrl: string;
  localOpenClaw: boolean;
  privateClawCommandAvailable: boolean;
  introduction: string;
  automaticSteps: RelayProviderSetupStep[];
  manualSteps: RelayProviderSetupStep[];
  restartNotes: string[];
  pairingNotes: string[];
}

interface OfferRelayProviderSetupOptions {
  relayBaseUrl: string;
  onLog?: (line: string) => void;
  isInteractive?: boolean;
  detectLocalOpenClawStatus?: () => Promise<LocalOpenClawStatus>;
  promptToContinue?: (question: string) => Promise<boolean>;
  runStep?: (step: RelayProviderSetupStep) => Promise<void>;
}

interface RunOneShotCommandResult {
  stdout: string;
  stderr: string;
  combined: string;
}

function createStep(
  title: string,
  command: string,
  args: string[],
  display: string,
): RelayProviderSetupStep {
  return {
    title,
    command,
    args,
    display,
  };
}

function isUnavailableCommandError(error: unknown): error is NodeJS.ErrnoException {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "EACCES" || code === "EPERM";
}

function isInteractiveTerminal(): boolean {
  return Boolean(
    process.stdin.isTTY &&
      process.stdout.isTTY &&
      !process.stdin.destroyed &&
      !process.stdout.destroyed,
  );
}

async function runOneShotCommand(
  command: string,
  args: string[],
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdoutText = "";
  let stderrText = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdoutText += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderrText += chunk;
  });
  const childError = once(child, "error").then(([error]) => {
    throw error;
  });
  const childClose = once(child, "close").then(([code, signal]) => ({
    code,
    signal,
  }));

  try {
    const { code, signal } = await Promise.race([childError, childClose]);
    if (code !== 0) {
      const combined = `${stdoutText}${stderrText}`.trim();
      throw new Error(
        `Command \`${[command, ...args].join(" ")}\` exited with ${
          code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`
        }${combined ? `: ${combined}` : "."}`,
      );
    }
    return {
      stdout: stdoutText,
      stderr: stderrText,
      combined: `${stdoutText}${stderrText}`,
    };
  } catch (error) {
    throw error;
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await runOneShotCommand(command, ["--version"]);
    return true;
  } catch (error) {
    return !isUnavailableCommandError(error);
  }
}

export async function detectLocalOpenClawStatus(): Promise<LocalOpenClawStatus> {
  if (!(await commandExists("openclaw"))) {
    return {
      openClawAvailable: false,
      privateClawCommandAvailable: false,
    };
  }

  try {
    const commands = await runOneShotCommand("openclaw", ["commands", "list"]);
    return {
      openClawAvailable: true,
      privateClawCommandAvailable: /\bprivateclaw\b/u.test(commands.combined),
    };
  } catch {
    return {
      openClawAvailable: true,
      privateClawCommandAvailable: false,
    };
  }
}

export function buildRelayProviderSetupPlan(params: {
  relayBaseUrl: string;
  status: LocalOpenClawStatus;
}): RelayProviderSetupPlan {
  const installStep = createStep(
    "Install the PrivateClaw OpenClaw plugin",
    "openclaw",
    ["plugins", "install", "@privateclaw/privateclaw@latest"],
    "openclaw plugins install @privateclaw/privateclaw@latest",
  );
  const enableStep = createStep(
    "Enable the PrivateClaw OpenClaw plugin",
    "openclaw",
    ["plugins", "enable", "privateclaw"],
    "openclaw plugins enable privateclaw",
  );
  const configStep = createStep(
    "Point PrivateClaw at the public relay URL",
    "openclaw",
    [
      "config",
      "set",
      "plugins.entries.privateclaw.config.relayBaseUrl",
      params.relayBaseUrl,
    ],
    `openclaw config set plugins.entries.privateclaw.config.relayBaseUrl ${params.relayBaseUrl}`,
  );

  const restartNotes = [
    "[privateclaw-relay] Restart the running OpenClaw gateway/service now so it reloads the plugin + relay config.",
    "[privateclaw-relay] After restart, verify the command registration with: openclaw commands list",
  ];
  const pairingNotes = [
    "[privateclaw-relay] Then create a pairing QR either by sending `/privateclaw` in an existing OpenClaw-backed chat or by running: openclaw privateclaw pair",
  ];

  if (!params.status.openClawAvailable) {
    return {
      relayBaseUrl: params.relayBaseUrl,
      localOpenClaw: false,
      privateClawCommandAvailable: false,
      introduction:
        "[privateclaw-relay] To connect an OpenClaw machine to this relay, run these commands on the machine where `openclaw` is installed:",
      automaticSteps: [],
      manualSteps: [installStep, enableStep, configStep],
      restartNotes,
      pairingNotes,
    };
  }

  if (params.status.privateClawCommandAvailable) {
    return {
      relayBaseUrl: params.relayBaseUrl,
      localOpenClaw: true,
      privateClawCommandAvailable: true,
      introduction:
        "[privateclaw-relay] OpenClaw + PrivateClaw are already available locally. Point the provider at this relay with:",
      automaticSteps: [configStep],
      manualSteps: [configStep],
      restartNotes,
      pairingNotes,
    };
  }

  return {
    relayBaseUrl: params.relayBaseUrl,
    localOpenClaw: true,
    privateClawCommandAvailable: false,
    introduction:
      "[privateclaw-relay] OpenClaw is available locally, but PrivateClaw is not active yet. Configure it with:",
    automaticSteps: [installStep, enableStep, configStep],
    manualSteps: [installStep, enableStep, configStep],
    restartNotes,
    pairingNotes,
  };
}

export function renderRelayProviderSetupGuidance(
  plan: RelayProviderSetupPlan,
): string {
  const lines = [
    plan.introduction,
    ...plan.manualSteps.map((step) => `[privateclaw-relay]   ${step.display}`),
    ...plan.restartNotes,
    ...plan.pairingNotes,
  ];
  return lines.join("\n");
}

async function promptForConfirmation(question: string): Promise<boolean> {
  const rl = createInterface({
    input: stdin,
    output: stdout,
  });
  try {
    const answer = await rl.question(`${question} [Y/n] `);
    const normalized = answer.trim().toLowerCase();
    return normalized === "" || normalized === "y" || normalized === "yes";
  } finally {
    rl.close();
  }
}

async function runRelayProviderSetupStep(
  step: RelayProviderSetupStep,
): Promise<void> {
  const child = spawn(step.command, step.args, {
    stdio: "inherit",
  });
  const childError = once(child, "error").then(([error]) => {
    throw error;
  });
  const childClose = once(child, "close").then(([code, signal]) => ({
    code,
    signal,
  }));

  try {
    const { code, signal } = await Promise.race([childError, childClose]);
    if (code !== 0) {
      throw new RelayCliUserError(
        `Command \`${step.display}\` exited with ${
          code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`
        }.`,
      );
    }
  } catch (error) {
    if (isUnavailableCommandError(error)) {
      throw new RelayCliUserError(
        `Could not run \`${step.display}\` because \`${step.command}\` is unavailable or not executable.`,
      );
    }
    throw error;
  }
}

export async function offerRelayProviderSetup(
  options: OfferRelayProviderSetupOptions,
): Promise<void> {
  const detectStatus =
    options.detectLocalOpenClawStatus ?? detectLocalOpenClawStatus;
  const status = await detectStatus();
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: options.relayBaseUrl,
    status,
  });
  const guidance = renderRelayProviderSetupGuidance(plan);

  for (const line of guidance.split("\n")) {
    options.onLog?.(line);
  }

  if (!plan.localOpenClaw) {
    return;
  }

  const interactive = options.isInteractive ?? isInteractiveTerminal();
  if (!interactive) {
    return;
  }

  const promptToContinue = options.promptToContinue ?? promptForConfirmation;
  const runStep = options.runStep ?? runRelayProviderSetupStep;
  const configureNow = await promptToContinue(
    plan.privateClawCommandAvailable
      ? `OpenClaw is available locally. Configure the local PrivateClaw provider to use ${options.relayBaseUrl} now?`
      : `OpenClaw is available locally. Install/configure the local PrivateClaw provider for ${options.relayBaseUrl} now?`,
  );

  if (!configureNow) {
    options.onLog?.(
      "[privateclaw-relay] Skipping automatic OpenClaw configuration for now.",
    );
    return;
  }

  for (const step of plan.automaticSteps) {
    options.onLog?.(`[privateclaw-relay] Running: ${step.display}`);
    await runStep(step);
  }

  options.onLog?.(
    "[privateclaw-relay] Local OpenClaw configuration commands completed.",
  );
  for (const line of [...plan.restartNotes, ...plan.pairingNotes]) {
    options.onLog?.(line);
  }
}
