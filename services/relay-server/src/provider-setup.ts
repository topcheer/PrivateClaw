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
  privateClawPluginPresent?: boolean;
}

export interface RelayProviderSetupPlan {
  relayBaseUrl: string;
  localOpenClaw: boolean;
  privateClawCommandAvailable: boolean;
  introduction: string;
  automaticSteps: RelayProviderSetupStep[];
  manualSteps: RelayProviderSetupStep[];
  verificationNotes: string[];
  pairingCommand: RelayProviderSetupStep;
}

type OneShotCommandRunner = (
  command: string,
  args: string[],
) => Promise<RunOneShotCommandResult>;

const PRIVATECLAW_VERIFICATION_COMMAND = "openclaw privateclaw pair --help";

interface OfferRelayProviderSetupOptions {
  relayBaseUrl: string;
  webChatUrl?: string;
  onLog?: (line: string) => void;
  isInteractive?: boolean;
  detectLocalOpenClawStatus?: () => Promise<LocalOpenClawStatus>;
  promptToContinue?: (question: string) => Promise<boolean>;
  runStep?: (step: RelayProviderSetupStep) => Promise<void>;
  runPairingCommand?: (
    step: RelayProviderSetupStep,
  ) => Promise<RunOneShotCommandResult>;
  openBrowser?: (target: string) => Promise<void>;
  verificationTimeoutMs?: number;
  verificationPollMs?: number;
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

function outputMentionsPrivateClawCommand(output: string): boolean {
  return /\/?privateclaw\b/iu.test(output);
}

async function runStreamingCommand(
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
    process.stdout.write(chunk);
  });
  child.stderr.on("data", (chunk: string) => {
    stderrText += chunk;
    process.stderr.write(chunk);
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
      throw new RelayCliUserError(
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
    if (isUnavailableCommandError(error)) {
      throw new RelayCliUserError(
        `Could not run \`${[command, ...args].join(" ")}\` because \`${command}\` is unavailable or not executable.`,
      );
    }
    throw error;
  }
}

async function commandExists(
  command: string,
  runCommand: OneShotCommandRunner = runOneShotCommand,
): Promise<boolean> {
  try {
    await runCommand(command, ["--version"]);
    return true;
  } catch (error) {
    return !isUnavailableCommandError(error);
  }
}

async function detectPrivateClawCommandAvailability(
  runCommand: OneShotCommandRunner,
): Promise<boolean> {
  try {
    const commands = await runCommand("openclaw", ["commands", "list"]);
    if (outputMentionsPrivateClawCommand(commands.combined)) {
      return true;
    }
  } catch {
    // Newer OpenClaw builds may not expose `openclaw commands list`.
  }

  try {
    await runCommand("openclaw", ["privateclaw", "pair", "--help"]);
    return true;
  } catch {
    return false;
  }
}

async function detectPrivateClawPluginPresence(
  runCommand: OneShotCommandRunner,
): Promise<boolean> {
  try {
    await runCommand("openclaw", ["plugins", "info", "privateclaw"]);
    return true;
  } catch {
    return false;
  }
}

export async function openBrowserTarget(target: string): Promise<void> {
  const command =
    process.platform === "win32"
      ? {
          file: "cmd.exe",
          args: ["/d", "/s", "/c", `start "" "${target.replace(/"/gu, '""')}"`],
        }
      : process.platform === "darwin"
        ? { file: "open", args: [target] }
        : { file: "xdg-open", args: [target] };

  await runOneShotCommand(command.file, command.args);
}

export async function detectLocalOpenClawStatus(
  runCommand: OneShotCommandRunner = runOneShotCommand,
): Promise<LocalOpenClawStatus> {
  if (!(await commandExists("openclaw", runCommand))) {
    return {
      openClawAvailable: false,
      privateClawCommandAvailable: false,
    };
  }

  const [privateClawCommandAvailable, privateClawPluginPresent] =
    await Promise.all([
      detectPrivateClawCommandAvailability(runCommand),
      detectPrivateClawPluginPresence(runCommand),
    ]);

  return {
    openClawAvailable: true,
    privateClawCommandAvailable,
    privateClawPluginPresent,
  };
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
  const updateStep = createStep(
    "Update the existing PrivateClaw OpenClaw plugin",
    "openclaw",
    ["plugins", "update", "privateclaw"],
    "openclaw plugins update privateclaw",
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
  const restartStep = createStep(
    "Restart the OpenClaw gateway so the plugin + relay config are reloaded",
    "openclaw",
    ["gateway", "restart"],
    "openclaw gateway restart",
  );
  const pairingCommand = createStep(
    "Start a group pairing request",
    "openclaw",
    ["privateclaw", "pair", "--group", "--relay", params.relayBaseUrl],
    `openclaw privateclaw pair --group --relay ${params.relayBaseUrl}`,
  );
  const verificationNotes = [
    `[privateclaw-relay] After restart, verify the command registration with: ${PRIVATECLAW_VERIFICATION_COMMAND}`,
    `[privateclaw-relay] When the provider is ready, start a group pairing with: ${pairingCommand.display}`,
  ];

  if (!params.status.openClawAvailable) {
    return {
      relayBaseUrl: params.relayBaseUrl,
      localOpenClaw: false,
      privateClawCommandAvailable: false,
      introduction:
        "[privateclaw-relay] To connect an OpenClaw machine to this relay, run these commands on the machine where `openclaw` is installed:",
      automaticSteps: [],
      manualSteps: [installStep, enableStep, configStep, restartStep],
      verificationNotes,
      pairingCommand,
    };
  }

  if (params.status.privateClawCommandAvailable) {
    return {
      relayBaseUrl: params.relayBaseUrl,
      localOpenClaw: true,
      privateClawCommandAvailable: true,
      introduction:
        "[privateclaw-relay] OpenClaw + PrivateClaw are already available locally. Point the provider at this relay with:",
      automaticSteps: [configStep, restartStep],
      manualSteps: [configStep, restartStep],
      verificationNotes,
      pairingCommand,
    };
  }

  return {
    relayBaseUrl: params.relayBaseUrl,
    localOpenClaw: true,
    privateClawCommandAvailable: false,
    introduction:
      params.status.privateClawPluginPresent
        ? "[privateclaw-relay] OpenClaw can already see a local PrivateClaw plugin, but the command is not active yet. Refresh/configure it with:"
        : "[privateclaw-relay] OpenClaw is available locally, but PrivateClaw is not active yet. Configure it with:",
    automaticSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      configStep,
      restartStep,
    ],
    manualSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      configStep,
      restartStep,
    ],
    verificationNotes,
    pairingCommand,
  };
}

export function renderRelayProviderSetupGuidance(
  plan: RelayProviderSetupPlan,
): string {
  const lines = [
    plan.introduction,
    ...plan.manualSteps.map((step) => `[privateclaw-relay]   ${step.display}`),
    ...plan.verificationNotes,
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

function extractPrivateClawInviteUri(output: string): string | undefined {
  return output.match(/privateclaw:\/\/connect\?payload=\S+/u)?.[0];
}

function buildRelayWebInviteUrl(
  webChatUrl: string,
  inviteUri: string,
): string {
  const url = new URL(webChatUrl);
  url.searchParams.set("invite", inviteUri);
  return url.toString();
}

async function waitForPrivateClawCommandAvailability(
  detectStatus: () => Promise<LocalOpenClawStatus>,
  timeoutMs: number,
  pollMs: number,
): Promise<LocalOpenClawStatus> {
  const deadline = Date.now() + timeoutMs;
  let status = await detectStatus();
  while (
    status.openClawAvailable &&
    !status.privateClawCommandAvailable &&
    Date.now() < deadline
  ) {
    await delay(pollMs);
    status = await detectStatus();
  }
  return status;
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
  const runPairingCommand = options.runPairingCommand ?? ((step) =>
    runStreamingCommand(step.command, step.args));
  const openBrowser = options.openBrowser ?? openBrowserTarget;
  const verificationTimeoutMs = options.verificationTimeoutMs ?? 15_000;
  const verificationPollMs = options.verificationPollMs ?? 1_000;
  const configureNow = await promptToContinue(
    plan.privateClawCommandAvailable
      ? `OpenClaw is available locally. Configure the local PrivateClaw provider to use ${options.relayBaseUrl} now?`
      : status.privateClawPluginPresent
        ? `OpenClaw is available locally. Update/configure the local PrivateClaw provider for ${options.relayBaseUrl} now?`
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
  const refreshedStatus = await waitForPrivateClawCommandAvailability(
    detectStatus,
    verificationTimeoutMs,
    verificationPollMs,
  );
  if (!refreshedStatus.privateClawCommandAvailable) {
    throw new RelayCliUserError(
      `OpenClaw restarted, but \`privateclaw\` still does not respond to \`${PRIVATECLAW_VERIFICATION_COMMAND}\`. Confirm the gateway finished restarting cleanly, then rerun \`privateclaw-relay\`.`,
    );
  }
  options.onLog?.(
    `[privateclaw-relay] Verified \`privateclaw\` is now available via \`${PRIVATECLAW_VERIFICATION_COMMAND}\`.`,
  );
  for (const line of plan.verificationNotes) {
    options.onLog?.(line);
  }

  const startGroupPairing = await promptToContinue(
    "PrivateClaw is ready locally. Start a new group pairing now?",
  );
  if (!startGroupPairing) {
    options.onLog?.(
      "[privateclaw-relay] Skipping automatic group pairing for now.",
    );
    return;
  }

  options.onLog?.(
    `[privateclaw-relay] Running: ${plan.pairingCommand.display}`,
  );
  const pairingResult = await runPairingCommand(plan.pairingCommand);
  const inviteUri = extractPrivateClawInviteUri(pairingResult.combined);
  if (!inviteUri) {
    options.onLog?.(
      "[privateclaw-relay] Created the group pairing request, but could not extract the invite URI from the command output for automatic browser launch.",
    );
    return;
  }

  if (!options.webChatUrl) {
    options.onLog?.(
      "[privateclaw-relay] Group pairing is ready. Start the relay with `--web` next time if you want this CLI to open the web chat automatically with the invite prefilled.",
    );
    return;
  }

  const webInviteUrl = buildRelayWebInviteUrl(options.webChatUrl, inviteUri);
  options.onLog?.(
    `[privateclaw-relay] Opening web chat with the new invite: ${webInviteUrl}`,
  );
  try {
    await openBrowser(webInviteUrl);
  } catch (error) {
    options.onLog?.(
      `[privateclaw-relay] Could not open the browser automatically: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
