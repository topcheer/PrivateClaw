import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import { RelayCliUserError } from "./cli-error.js";

interface RelayProviderSetupCommandCandidate {
  label: string;
  command: string;
  args: string[];
  display: string;
  env?: NodeJS.ProcessEnv;
}

export interface RelayProviderSetupStep {
  title: string;
  command: string;
  args: string[];
  display: string;
  env?: NodeJS.ProcessEnv;
  kind?: "command" | "install-candidates";
  candidates?: readonly RelayProviderSetupCommandCandidate[];
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
  options?: {
    env?: NodeJS.ProcessEnv;
  },
) => Promise<RunOneShotCommandResult>;

const OPENCLAW_UNSAFE_INSTALL_FLAG = "--dangerously-force-unsafe-install";

interface OfferRelayProviderSetupOptions {
  relayBaseUrl: string;
  webChatUrl?: string;
  openClawConfigPath?: string;
  packageRoot?: string;
  packageSpec?: string;
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
  extra?: Pick<RelayProviderSetupStep, "kind" | "env" | "candidates">,
): RelayProviderSetupStep {
  return {
    title,
    command,
    args,
    display,
    ...(extra ?? {}),
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

function shellEscape(value: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/u.test(value)) {
    return value;
  }
  return `'${value.replace(/'/gu, `'\"'\"'`)}'`;
}

function buildCommandDisplay(command: string, args: string[]): string {
  return [command, ...args].map(shellEscape).join(" ");
}

function buildOpenClawCommandEnv(configPath: string): NodeJS.ProcessEnv {
  const resolvedConfigPath = path.resolve(configPath);
  const stateDir = path.dirname(resolvedConfigPath);
  return {
    ...process.env,
    OPENCLAW_STATE_DIR: stateDir,
    OPENCLAW_CONFIG_PATH: resolvedConfigPath,
  };
}

function buildOpenClawDisplayPrefix(configPath?: string): string | undefined {
  if (!configPath) {
    return undefined;
  }
  const resolvedConfigPath = path.resolve(configPath);
  const stateDir = path.dirname(resolvedConfigPath);
  return `OPENCLAW_STATE_DIR=${shellEscape(stateDir)} OPENCLAW_CONFIG_PATH=${shellEscape(resolvedConfigPath)}`;
}

function buildDisplayWithOptionalPrefix(
  command: string,
  args: string[],
  prefix?: string,
): string {
  const commandDisplay = buildCommandDisplay(command, args);
  return prefix ? `${prefix} ${commandDisplay}` : commandDisplay;
}

function createOpenClawStep(
  title: string,
  args: string[],
  configPath?: string,
): RelayProviderSetupStep {
  const env = configPath ? buildOpenClawCommandEnv(configPath) : undefined;
  return createStep(
    title,
    "openclaw",
    args,
    buildDisplayWithOptionalPrefix(
      "openclaw",
      args,
      buildOpenClawDisplayPrefix(configPath),
    ),
    {
      ...(env ? { env } : {}),
    },
  );
}

function createNpmExecOpenClawStep(
  title: string,
  args: string[],
  configPath?: string,
): RelayProviderSetupStep {
  const command = resolveNpmCommand();
  const fullArgs = ["exec", "-y", "openclaw@latest", "--", ...args];
  const env = configPath ? buildOpenClawCommandEnv(configPath) : undefined;
  return createStep(
    title,
    command,
    fullArgs,
    buildDisplayWithOptionalPrefix(
      command,
      fullArgs,
      buildOpenClawDisplayPrefix(configPath),
    ),
    {
      ...(env ? { env } : {}),
    },
  );
}

function createOpenClawOneShotRunner(configPath?: string): OneShotCommandRunner {
  if (!configPath) {
    return runOneShotCommand;
  }
  const env = buildOpenClawCommandEnv(configPath);
  return (command, args, options) =>
    runOneShotCommand(command, args, {
      ...(options ?? {}),
      env: {
        ...env,
        ...(options?.env ?? {}),
      },
    });
}

async function runOneShotCommand(
  command: string,
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
  },
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    ...(options?.env ? { env: options.env } : {}),
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

async function runStreamingCommand(
  command: string,
  args: string[],
  options?: {
    env?: NodeJS.ProcessEnv;
  },
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    ...(options?.env ? { env: options.env } : {}),
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

function resolveNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function resolveLocalPrivateClawPackageRoot(): string | undefined {
  const candidates = [
    fileURLToPath(new URL("../../../packages/privateclaw-provider/", import.meta.url)),
    path.join(process.cwd(), "packages/privateclaw-provider"),
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, "package.json")));
}

function resolveLocalPrivateClawPackageSpec(packageRoot?: string): string {
  if (packageRoot) {
    try {
      const packageJson = JSON.parse(
        readFileSync(path.join(packageRoot, "package.json"), "utf8"),
      ) as { name?: unknown; version?: unknown };
      if (
        typeof packageJson.name === "string" &&
        packageJson.name.trim() !== "" &&
        typeof packageJson.version === "string" &&
        packageJson.version.trim() !== ""
      ) {
        return `${packageJson.name.trim()}@${packageJson.version.trim()}`;
      }
    } catch {
      // Fall back to the published npm tag below.
    }
  }
  return "@privateclaw/privateclaw@latest";
}

function buildRelayPrivateClawVerificationDisplay(configPath?: string): string {
  return buildDisplayWithOptionalPrefix(
    "openclaw",
    ["privateclaw", "pair", "--help"],
    buildOpenClawDisplayPrefix(configPath),
  );
}

function createRelayOpenClawInstallCandidates(params: {
  packageRoot?: string;
  packageSpec: string;
  configPath?: string;
}): RelayProviderSetupCommandCandidate[] {
  const candidates: RelayProviderSetupCommandCandidate[] = [];
  if (params.packageRoot) {
    const normalizedPackageRoot = path.resolve(params.packageRoot);
    const installArgs = [
      "plugins",
      "install",
      OPENCLAW_UNSAFE_INSTALL_FLAG,
      normalizedPackageRoot,
    ];
    const openClawLocalStep = createOpenClawStep(
      "Install the local PrivateClaw package directory into OpenClaw",
      installArgs,
      params.configPath,
    );
    const npmExecFallbackStep = createNpmExecOpenClawStep(
      "Install the local PrivateClaw package directory via npm exec openclaw",
      installArgs,
      params.configPath,
    );
    candidates.push(
      {
        label: "openclaw (local package directory)",
        command: openClawLocalStep.command,
        args: openClawLocalStep.args,
        display: openClawLocalStep.display,
        ...(openClawLocalStep.env ? { env: openClawLocalStep.env } : {}),
      },
      {
        label: "npm exec fallback (local package directory)",
        command: npmExecFallbackStep.command,
        args: npmExecFallbackStep.args,
        display: npmExecFallbackStep.display,
        ...(npmExecFallbackStep.env ? { env: npmExecFallbackStep.env } : {}),
      },
    );
  }

  const exactSpecArgs = [
    "plugins",
    "install",
    OPENCLAW_UNSAFE_INSTALL_FLAG,
    params.packageSpec,
  ];
  const exactVersionStep = createOpenClawStep(
    params.packageRoot
      ? "Install the published PrivateClaw package with the exact npm spec"
      : "Install the published PrivateClaw package",
    exactSpecArgs,
    params.configPath,
  );
  candidates.push({
    label: params.packageRoot
      ? "openclaw (exact version fallback)"
      : "openclaw (published package)",
    command: exactVersionStep.command,
    args: exactVersionStep.args,
    display: exactVersionStep.display,
    ...(exactVersionStep.env ? { env: exactVersionStep.env } : {}),
  });
  return candidates;
}

function createRelayOpenClawInstallStep(params: {
  packageRoot?: string;
  packageSpec: string;
  configPath?: string;
}): RelayProviderSetupStep {
  const candidates = createRelayOpenClawInstallCandidates(params);
  const [firstCandidate] = candidates;
  if (!firstCandidate) {
    throw new RelayCliUserError("Missing OpenClaw install candidates.");
  }
  return createStep(
    "Install the PrivateClaw package into OpenClaw",
    firstCandidate.command,
    firstCandidate.args,
    firstCandidate.display,
    {
      kind: "install-candidates",
      candidates,
      ...(firstCandidate.env ? { env: firstCandidate.env } : {}),
    },
  );
}

function createManualRelayOpenClawInstallSteps(params: {
  packageRoot?: string;
  packageSpec: string;
  configPath?: string;
}): RelayProviderSetupStep[] {
  const candidates = createRelayOpenClawInstallCandidates(params);
  return candidates.map((candidate) =>
    createStep(candidate.label, candidate.command, candidate.args, candidate.display, {
      ...(candidate.env ? { env: candidate.env } : {}),
    }),
  );
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

function isPrivateClawPairHelpOutput(output: string): boolean {
  return /Usage:\s*openclaw privateclaw pair\b/iu.test(output);
}

async function detectPrivateClawCommandAvailability(
  runCommand: OneShotCommandRunner,
): Promise<boolean> {
  try {
    const result = await runCommand("openclaw", ["privateclaw", "pair", "--help"]);
    return isPrivateClawPairHelpOutput(result.combined);
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
  packageRoot?: string;
  packageSpec?: string;
  openClawConfigPath?: string;
}): RelayProviderSetupPlan {
  const packageSpec =
    params.packageSpec ?? resolveLocalPrivateClawPackageSpec(params.packageRoot);
  const installStep = createRelayOpenClawInstallStep({
    packageSpec,
    ...(params.packageRoot ? { packageRoot: params.packageRoot } : {}),
    ...(params.openClawConfigPath
      ? { configPath: params.openClawConfigPath }
      : {}),
  });
  const manualInstallSteps = createManualRelayOpenClawInstallSteps({
    packageSpec,
    ...(params.packageRoot ? { packageRoot: params.packageRoot } : {}),
    ...(params.openClawConfigPath
      ? { configPath: params.openClawConfigPath }
      : {}),
  });
  const updateStep = createOpenClawStep(
    "Update the existing PrivateClaw OpenClaw plugin",
    ["plugins", "update", "privateclaw"],
    params.openClawConfigPath,
  );
  const enableStep = createOpenClawStep(
    "Enable the PrivateClaw OpenClaw plugin",
    ["plugins", "enable", "privateclaw"],
    params.openClawConfigPath,
  );
  const configStep = createOpenClawStep(
    "Point PrivateClaw at the public relay URL",
    [
      "config",
      "set",
      "plugins.entries.privateclaw.config.relayBaseUrl",
      params.relayBaseUrl,
    ],
    params.openClawConfigPath,
  );
  const gatewayModeStep = params.openClawConfigPath
    ? createOpenClawStep(
        "Mark this isolated OpenClaw config as a local gateway",
        ["config", "set", "gateway.mode", "local"],
        params.openClawConfigPath,
      )
    : undefined;
  const restartStep = createOpenClawStep(
    "Restart the OpenClaw gateway so the plugin + relay config are reloaded",
    ["gateway", "restart"],
    params.openClawConfigPath,
  );
  const startStep = createOpenClawStep(
    "Start the OpenClaw gateway with this config",
    ["gateway", "run"],
    params.openClawConfigPath,
  );
  const startupStep = params.openClawConfigPath ? startStep : restartStep;
  const pairingCommand = createOpenClawStep(
    "Start a group pairing request",
    ["privateclaw", "pair", "--group", "--relay", params.relayBaseUrl],
    params.openClawConfigPath,
  );
  const verificationNotes = [
    ...(params.openClawConfigPath
      ? [
          `[privateclaw-relay] Start the isolated OpenClaw instance with: ${startStep.display}`,
        ]
      : []),
    `[privateclaw-relay] ${
      params.openClawConfigPath
        ? "Verify the command registration for this isolated config with:"
        : "After restart, verify the command registration with:"
    } ${buildRelayPrivateClawVerificationDisplay(params.openClawConfigPath)}`,
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
      manualSteps: [
        ...manualInstallSteps,
        enableStep,
        configStep,
        ...(gatewayModeStep ? [gatewayModeStep] : []),
        startupStep,
      ],
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
      automaticSteps: [
        configStep,
        ...(gatewayModeStep ? [gatewayModeStep] : []),
        ...(params.openClawConfigPath ? [] : [restartStep]),
      ],
      manualSteps: [configStep, ...(gatewayModeStep ? [gatewayModeStep] : []), startupStep],
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
      ...(gatewayModeStep ? [gatewayModeStep] : []),
      ...(params.openClawConfigPath ? [] : [restartStep]),
    ],
    manualSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      configStep,
      ...(gatewayModeStep ? [gatewayModeStep] : []),
      startupStep,
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
  if (step.kind === "install-candidates") {
    let lastError: unknown;
    for (const candidate of step.candidates ?? []) {
      try {
        await runStreamingCommand(candidate.command, candidate.args, {
          ...(candidate.env ? { env: candidate.env } : {}),
        });
        return;
      } catch (error) {
        lastError = error;
        console.warn(
          `[privateclaw-relay] Install attempt failed (${candidate.label}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    throw lastError ?? new RelayCliUserError("Missing OpenClaw install candidates.");
  }
  const child = spawn(step.command, step.args, {
    ...(step.env ? { env: step.env } : {}),
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
    options.detectLocalOpenClawStatus ??
    (() =>
      detectLocalOpenClawStatus(
        createOpenClawOneShotRunner(options.openClawConfigPath),
      ));
  const status = await detectStatus();
  const plan = buildRelayProviderSetupPlan({
    relayBaseUrl: options.relayBaseUrl,
    status,
    ...(options.packageRoot ? { packageRoot: options.packageRoot } : {}),
    ...(options.packageSpec ? { packageSpec: options.packageSpec } : {}),
    ...(options.openClawConfigPath
      ? { openClawConfigPath: options.openClawConfigPath }
      : {}),
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
    runStreamingCommand(step.command, step.args, {
      ...(step.env ? { env: step.env } : {}),
    }));
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
      `The PrivateClaw install/config steps completed, but \`privateclaw\` still does not respond to \`${buildRelayPrivateClawVerificationDisplay(options.openClawConfigPath)}\`. Confirm the current OpenClaw config loaded cleanly, then rerun \`privateclaw-relay\`.`,
    );
  }
  options.onLog?.(
    `[privateclaw-relay] Verified \`privateclaw\` is now available via \`${buildRelayPrivateClawVerificationDisplay(options.openClawConfigPath)}\`.`,
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
