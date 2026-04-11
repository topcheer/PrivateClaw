import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
import {
  appendPrivateClawAppInstallFooter,
  appendPrivateClawAppInstallFooterLines,
  formatBilingualInline,
} from "./text.js";

export interface LocalOpenClawStatus {
  openClawAvailable: boolean;
  privateClawCommandAvailable: boolean;
  privateClawPluginPresent?: boolean;
}

interface PrivateClawSetupCommandCandidate {
  label: string;
  command: string;
  args: string[];
  display: string;
  env?: NodeJS.ProcessEnv;
}

export interface PrivateClawSetupStep {
  title: string;
  command: string;
  args: string[];
  display: string;
  env?: NodeJS.ProcessEnv;
  kind?: "command" | "install-candidates";
  candidates?: readonly PrivateClawSetupCommandCandidate[];
}

export interface PrivateClawSetupChoice {
  value: string;
  label: string;
}

export interface PrivateClawSessionDurationPreset {
  id: string;
  ttlMs: number;
  label: string;
  aliases: readonly string[];
}

export interface PrivateClawSetupSelection {
  groupMode: boolean;
  ttlMs: number;
  durationLabel: string;
}

export interface PrivateClawSetupPlan {
  packageSpec: string;
  localOpenClaw: boolean;
  privateClawCommandAvailable: boolean;
  introduction: string;
  automaticSteps: PrivateClawSetupStep[];
  manualSteps: PrivateClawSetupStep[];
  selectionNotes: string[];
  verificationNotes: string[];
  pairingCommand: PrivateClawSetupStep;
}

interface RunOneShotCommandResult {
  stdout: string;
  stderr: string;
  combined: string;
}

type OneShotCommandRunner = (
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
) => Promise<RunOneShotCommandResult>;

export interface RunPrivateClawSetupOptions {
  packageSpec?: string;
  packageRoot?: string;
  relayBaseUrl?: string;
  configPath?: string;
  label?: string;
  foreground?: boolean;
  openInBrowser?: boolean;
  verbose?: boolean;
  groupMode?: boolean;
  ttlMs?: number;
  durationPreset?: string;
  selection?: PrivateClawSetupSelection;
  detectLocalOpenClawStatus?: () => Promise<LocalOpenClawStatus>;
  promptForChoice?: (
    question: string,
    choices: readonly PrivateClawSetupChoice[],
    defaultValue?: string,
  ) => Promise<string>;
  runStep?: (step: PrivateClawSetupStep) => Promise<void>;
  runPairingCommand?: (
    step: PrivateClawSetupStep,
  ) => Promise<RunOneShotCommandResult>;
  onLog?: (line: string) => void;
  verificationTimeoutMs?: number;
  verificationPollMs?: number;
  gatewaySettleMs?: number;
}

const PRIVATECLAW_PACKAGE_NAME = "@privateclaw/privateclaw";
const PRIVATECLAW_PLUGIN_ID = "privateclaw";
const OPENCLAW_UNSAFE_INSTALL_FLAG = "--dangerously-force-unsafe-install";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

export const EFFECTIVELY_PERMANENT_SESSION_TTL_MS = 100 * YEAR_MS;

export const PRIVATECLAW_SESSION_DURATION_PRESETS: readonly PrivateClawSessionDurationPreset[] =
  [
    {
      id: "30m",
      ttlMs: 30 * MINUTE_MS,
      label: "30 分钟 / 30 minutes",
      aliases: ["30min", "30mins", "30minutes"],
    },
    {
      id: "2h",
      ttlMs: 2 * HOUR_MS,
      label: "2 小时 / 2 hours",
      aliases: ["2hr", "2hrs", "2hours"],
    },
    {
      id: "4h",
      ttlMs: 4 * HOUR_MS,
      label: "4 小时 / 4 hours",
      aliases: ["4hr", "4hrs", "4hours"],
    },
    {
      id: "8h",
      ttlMs: 8 * HOUR_MS,
      label: "8 小时 / 8 hours",
      aliases: ["8hr", "8hrs", "8hours"],
    },
    {
      id: "24h",
      ttlMs: DAY_MS,
      label: "24 小时 / 24 hours",
      aliases: ["24hr", "24hrs", "1d", "1day"],
    },
    {
      id: "1w",
      ttlMs: WEEK_MS,
      label: "1 周 / 1 week",
      aliases: ["1week", "week"],
    },
    {
      id: "1mo",
      ttlMs: MONTH_MS,
      label: "1 个月 / 1 month",
      aliases: ["1month", "month"],
    },
    {
      id: "1y",
      ttlMs: YEAR_MS,
      label: "1 年 / 1 year",
      aliases: ["1year", "year"],
    },
    {
      id: "permanent",
      ttlMs: EFFECTIVELY_PERMANENT_SESSION_TTL_MS,
      label: "永久（100 年） / Permanent (100 years)",
      aliases: ["forever", "infinite"],
    },
  ] as const;

const PRIVATECLAW_SETUP_MODE_CHOICES: readonly PrivateClawSetupChoice[] = [
  {
    value: "single",
    label: "单独会话 / Single chat",
  },
  {
    value: "group",
    label: "群聊会话 / Group chat",
  },
] as const;

function createStep(
  title: string,
  command: string,
  args: string[],
  display: string,
  extra?: Pick<PrivateClawSetupStep, "kind" | "env" | "candidates">,
): PrivateClawSetupStep {
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

export function buildOpenClawCommandEnv(configPath: string): NodeJS.ProcessEnv {
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
): PrivateClawSetupStep {
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
): PrivateClawSetupStep {
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
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
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
}

async function runStreamingCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
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
      throw new Error(
        `Command \`${[command, ...args].join(" ")}\` exited with ${
          code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`
        }.`,
      );
    }
    return {
      stdout: stdoutText,
      stderr: stderrText,
      combined: `${stdoutText}${stderrText}`,
    };
  } catch (error) {
    if (isUnavailableCommandError(error)) {
      throw new Error(
        formatBilingualInline(
          `无法运行 \`${[command, ...args].join(" ")}\`，因为本机缺少可执行命令 \`${command}\`。`,
          `Could not run \`${[command, ...args].join(" ")}\` because \`${command}\` is unavailable or not executable locally.`,
        ),
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
    await runCommand("openclaw", ["plugins", "info", PRIVATECLAW_PLUGIN_ID]);
    return true;
  } catch {
    return false;
  }
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

export async function resolveCurrentPrivateClawPackageSpec(): Promise<string> {
  try {
    const packageJsonUrl = new URL("../package.json", import.meta.url);
    const packageJson = JSON.parse(
      await readFile(packageJsonUrl, "utf8"),
    ) as { name?: unknown; version?: unknown };
    const packageName =
      typeof packageJson.name === "string" && packageJson.name.trim() !== ""
        ? packageJson.name.trim()
        : PRIVATECLAW_PACKAGE_NAME;
    const packageVersion =
      typeof packageJson.version === "string" && packageJson.version.trim() !== ""
        ? packageJson.version.trim()
        : "latest";
    return `${packageName}@${packageVersion}`;
  } catch {
    return `${PRIVATECLAW_PACKAGE_NAME}@latest`;
  }
}

function resolveNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function resolveCurrentPrivateClawPackageRoot(): string {
  return fileURLToPath(new URL("../", import.meta.url));
}

function buildPrivateClawVerificationDisplay(configPath?: string): string {
  return buildDisplayWithOptionalPrefix(
    "openclaw",
    ["privateclaw", "pair", "--help"],
    buildOpenClawDisplayPrefix(configPath),
  );
}

function createOpenClawInstallCandidates(params: {
  packageRoot: string;
  packageSpec: string;
  configPath?: string;
}): PrivateClawSetupCommandCandidate[] {
  const normalizedPackageRoot = path.resolve(params.packageRoot);
  const installArgs = [
    "plugins",
    "install",
    OPENCLAW_UNSAFE_INSTALL_FLAG,
    normalizedPackageRoot,
  ];
  const updateArgs = [
    "plugins",
    "update",
    PRIVATECLAW_PLUGIN_ID,
    OPENCLAW_UNSAFE_INSTALL_FLAG,
  ];
  const exactSpecArgs = [
    "plugins",
    "install",
    OPENCLAW_UNSAFE_INSTALL_FLAG,
    params.packageSpec,
  ];
  const openClawLocalStep = createOpenClawStep(
    "Install the local PrivateClaw package directory into OpenClaw",
    installArgs,
    params.configPath,
  );
  const updateStep = createOpenClawStep(
    "Update the existing PrivateClaw plugin in OpenClaw",
    updateArgs,
    params.configPath,
  );
  const npmExecFallbackStep = createNpmExecOpenClawStep(
    "Install the local PrivateClaw package directory via npm exec openclaw",
    installArgs,
    params.configPath,
  );
  const exactVersionStep = createOpenClawStep(
    "Install the published PrivateClaw package with the exact npm spec",
    exactSpecArgs,
    params.configPath,
  );
  return [
    {
      label: "openclaw (local package directory)",
      command: openClawLocalStep.command,
      args: openClawLocalStep.args,
      display: openClawLocalStep.display,
      ...(openClawLocalStep.env ? { env: openClawLocalStep.env } : {}),
    },
    {
      label: "openclaw update (for plugin-already-exists)",
      command: updateStep.command,
      args: updateStep.args,
      display: updateStep.display,
      ...(updateStep.env ? { env: updateStep.env } : {}),
    },
    {
      label: "npm exec fallback (local package directory)",
      command: npmExecFallbackStep.command,
      args: npmExecFallbackStep.args,
      display: npmExecFallbackStep.display,
      ...(npmExecFallbackStep.env ? { env: npmExecFallbackStep.env } : {}),
    },
    {
      label: "openclaw (exact version fallback)",
      command: exactVersionStep.command,
      args: exactVersionStep.args,
      display: exactVersionStep.display,
      ...(exactVersionStep.env ? { env: exactVersionStep.env } : {}),
    },
  ];
}

function createOpenClawInstallStep(params: {
  packageRoot: string;
  packageSpec: string;
  configPath?: string;
}): PrivateClawSetupStep {
  const candidates = createOpenClawInstallCandidates(params);
  const [firstCandidate] = candidates;
  if (!firstCandidate) {
    throw new Error("Missing OpenClaw install candidates.");
  }
  return createStep(
    "Install the local PrivateClaw package into OpenClaw",
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

function createManualOpenClawInstallSteps(params: {
  packageRoot: string;
  packageSpec: string;
  configPath?: string;
}): PrivateClawSetupStep[] {
  const candidates = createOpenClawInstallCandidates(params);
  return candidates.map((candidate) =>
    createStep(candidate.label, candidate.command, candidate.args, candidate.display, {
      ...(candidate.env ? { env: candidate.env } : {}),
    }),
  );
}

export function parsePrivateClawSessionDurationPreset(
  value: string,
  label = "--duration",
): PrivateClawSessionDurationPreset {
  const normalized = value.trim().toLowerCase();
  const preset = PRIVATECLAW_SESSION_DURATION_PRESETS.find(
    (entry) => entry.id === normalized || entry.aliases.includes(normalized),
  );
  if (!preset) {
    throw new Error(
      formatBilingualInline(
        `${label} 仅支持这些预设：${PRIVATECLAW_SESSION_DURATION_PRESETS.map((entry) => entry.id).join(", ")}。`,
        `${label} only supports these presets: ${PRIVATECLAW_SESSION_DURATION_PRESETS.map((entry) => entry.id).join(", ")}.`,
      ),
    );
  }
  return preset;
}

function buildPairingCommandStep(params: {
  groupMode: boolean;
  ttlMs: number;
  relayBaseUrl?: string;
  configPath?: string;
  label?: string;
  foreground?: boolean;
  openInBrowser?: boolean;
  verbose?: boolean;
}): PrivateClawSetupStep {
  const args = [
    "privateclaw",
    "pair",
    "--ttl-ms",
    String(params.ttlMs),
  ];
  if (params.groupMode) {
    args.push("--group");
  }
  if (params.label) {
    args.push("--label", params.label);
  }
  if (params.relayBaseUrl) {
    args.push("--relay", params.relayBaseUrl);
  }
  if (params.openInBrowser) {
    args.push("--open");
  }
  if (params.foreground) {
    args.push("--foreground");
  }
  if (params.verbose) {
    args.push("--verbose");
  }
  return createOpenClawStep(
    "Start the requested PrivateClaw pairing flow",
    args,
    params.configPath,
  );
}

export async function resolvePrivateClawSetupSelection(params: {
  groupMode?: boolean;
  ttlMs?: number;
  durationPreset?: string;
  promptForChoice?: (
    question: string,
    choices: readonly PrivateClawSetupChoice[],
    defaultValue?: string,
  ) => Promise<string>;
}): Promise<PrivateClawSetupSelection> {
  const promptForChoice = params.promptForChoice ?? promptForPrivateClawChoice;
  let groupMode = params.groupMode;
  if (typeof groupMode !== "boolean") {
    const mode = await promptForChoice(
      formatBilingualInline(
        "请选择要创建的会话类型：",
        "Choose which session type to start:",
      ),
      PRIVATECLAW_SETUP_MODE_CHOICES,
      "single",
    );
    groupMode = mode === "group";
  }

  if (typeof params.ttlMs === "number") {
    return {
      groupMode,
      ttlMs: params.ttlMs,
      durationLabel: formatBilingualInline(
        `${params.ttlMs} 毫秒`,
        `${params.ttlMs} ms`,
      ),
    };
  }

  if (params.durationPreset) {
    const preset = parsePrivateClawSessionDurationPreset(params.durationPreset);
    return {
      groupMode,
      ttlMs: preset.ttlMs,
      durationLabel: preset.label,
    };
  }

  const durationChoices = PRIVATECLAW_SESSION_DURATION_PRESETS.map((preset) => ({
    value: preset.id,
    label: preset.label,
  }));
  const durationPresetId = await promptForChoice(
    formatBilingualInline(
      "请选择本次会话时长：",
      "Choose the session duration:",
    ),
    durationChoices,
    "24h",
  );
  const preset = parsePrivateClawSessionDurationPreset(durationPresetId);
  return {
    groupMode,
    ttlMs: preset.ttlMs,
    durationLabel: preset.label,
  };
}

export function buildPrivateClawSetupPlan(params: {
  packageSpec: string;
  packageRoot: string;
  status: LocalOpenClawStatus;
  selection: PrivateClawSetupSelection;
  relayBaseUrl?: string;
  configPath?: string;
  label?: string;
  foreground?: boolean;
  openInBrowser?: boolean;
  verbose?: boolean;
}): PrivateClawSetupPlan {
  const installStep = createOpenClawInstallStep({
    packageRoot: params.packageRoot,
    packageSpec: params.packageSpec,
    ...(params.configPath ? { configPath: params.configPath } : {}),
  });
  const manualInstallSteps = createManualOpenClawInstallSteps({
    packageRoot: params.packageRoot,
    packageSpec: params.packageSpec,
    ...(params.configPath ? { configPath: params.configPath } : {}),
  });
  const updateStep = createOpenClawStep(
    "Update the existing PrivateClaw OpenClaw plugin",
    ["plugins", "update", PRIVATECLAW_PLUGIN_ID, OPENCLAW_UNSAFE_INSTALL_FLAG],
    params.configPath,
  );
  const enableStep = createOpenClawStep(
    "Enable the PrivateClaw OpenClaw plugin",
    ["plugins", "enable", PRIVATECLAW_PLUGIN_ID],
    params.configPath,
  );
  const gatewayModeStep = params.configPath
    ? createOpenClawStep(
        "Mark this isolated OpenClaw config as a local gateway",
        ["config", "set", "gateway.mode", "local"],
        params.configPath,
      )
    : undefined;
  const restartStep = createOpenClawStep(
    "Restart the OpenClaw gateway so the new plugin command is reloaded",
    ["gateway", "restart"],
    params.configPath,
  );
  const startStep = createOpenClawStep(
    "Start the OpenClaw gateway with this config",
    ["gateway", "run"],
    params.configPath,
  );
  const startupStep = params.configPath ? startStep : restartStep;
  const pairingCommand = buildPairingCommandStep({
    groupMode: params.selection.groupMode,
    ttlMs: params.selection.ttlMs,
    ...(params.relayBaseUrl ? { relayBaseUrl: params.relayBaseUrl } : {}),
    ...(params.configPath ? { configPath: params.configPath } : {}),
    ...(params.label ? { label: params.label } : {}),
    ...(params.foreground ? { foreground: true } : {}),
    ...(params.openInBrowser ? { openInBrowser: true } : {}),
    ...(params.verbose ? { verbose: true } : {}),
  });
  const selectionNotes = [
    formatBilingualInline(
      `配对模式：${params.selection.groupMode ? "群聊" : "单独会话"}`,
      `Pairing mode: ${params.selection.groupMode ? "group chat" : "single chat"}`,
    ),
    formatBilingualInline(
      `会话时长：${params.selection.durationLabel.split(" / ")[0]}`,
      `Session duration: ${params.selection.durationLabel.split(" / ")[1] ?? params.selection.durationLabel}`,
    ),
  ];
  const verificationNotes = [
    ...(params.configPath
      ? [
          `[privateclaw-provider] ${formatBilingualInline(
            `若要启动这个隔离配置对应的 OpenClaw，请运行：${startStep.display}`,
            `To start OpenClaw for this isolated config, run: ${startStep.display}`,
          )}`,
        ]
      : []),
    `[privateclaw-provider] ${formatBilingualInline(
      `若需要手工确认插件命令是否就绪，可运行：${buildPrivateClawVerificationDisplay(params.configPath)}`,
      `If you want to verify the plugin command manually, run: ${buildPrivateClawVerificationDisplay(params.configPath)}`,
    )}`,
  ];

  if (!params.status.openClawAvailable) {
    return {
      packageSpec: params.packageSpec,
      localOpenClaw: false,
      privateClawCommandAvailable: false,
      introduction:
        `[privateclaw-provider] ${formatBilingualInline(
          "当前机器上未检测到 `openclaw`。请先在安装了 OpenClaw 的机器上执行下面这些命令：",
          "Could not detect `openclaw` on this machine. Run these commands on the machine where OpenClaw is installed:",
        )}`,
      automaticSteps: [],
      manualSteps: [
        ...manualInstallSteps,
        enableStep,
        ...(gatewayModeStep ? [gatewayModeStep] : []),
        startupStep,
        pairingCommand,
      ],
      selectionNotes,
      verificationNotes,
      pairingCommand,
    };
  }

  if (params.status.privateClawCommandAvailable) {
    return {
      packageSpec: params.packageSpec,
      localOpenClaw: true,
      privateClawCommandAvailable: true,
      introduction:
        `[privateclaw-provider] ${formatBilingualInline(
          params.status.privateClawPluginPresent
            ? "检测到本机已经安装了 PrivateClaw 插件。正在检查并更新到最新版本："
            : "本机的 OpenClaw + PrivateClaw 已经可用，接下来直接开始配对：",
          params.status.privateClawPluginPresent
            ? "A PrivateClaw plugin is already installed locally. Checking for updates:"
            : "OpenClaw + PrivateClaw are already available locally. Starting pairing next:",
        )}`,
      automaticSteps: [
        ...(params.status.privateClawPluginPresent ? [updateStep] : []),
        ...(gatewayModeStep ? [gatewayModeStep] : []),
      ],
      manualSteps: params.configPath
        ? [...(gatewayModeStep ? [gatewayModeStep] : []), startupStep, pairingCommand]
        : [pairingCommand],
      selectionNotes,
      verificationNotes,
      pairingCommand,
    };
  }

  return {
    packageSpec: params.packageSpec,
    localOpenClaw: true,
    privateClawCommandAvailable: false,
      introduction:
        `[privateclaw-provider] ${formatBilingualInline(
          params.configPath
            ? params.status.privateClawPluginPresent
              ? "检测到本机已经安装过 PrivateClaw 插件，但命令还没有生效。现在会更新并启用插件；隔离配置对应的 OpenClaw 启动命令见下方："
              : "检测到本机可以直接运行 OpenClaw。现在会安装并启用 PrivateClaw 插件；隔离配置对应的 OpenClaw 启动命令见下方："
            : params.status.privateClawPluginPresent
              ? "检测到本机已经安装过 PrivateClaw 插件，但命令还没有生效。现在会更新、启用并重启 OpenClaw："
              : "检测到本机可以直接运行 OpenClaw。现在会安装、启用 PrivateClaw 插件并重启 OpenClaw：",
          params.configPath
            ? params.status.privateClawPluginPresent
              ? "A local PrivateClaw plugin is already present, but the command is not active yet. Updating and enabling it now; the isolated OpenClaw start command is shown below:"
              : "OpenClaw is available locally. Installing and enabling the PrivateClaw plugin now; the isolated OpenClaw start command is shown below:"
            : params.status.privateClawPluginPresent
              ? "A local PrivateClaw plugin is already present, but the command is not active yet. Updating, enabling, and restarting OpenClaw now:"
              : "OpenClaw is available locally. Installing, enabling, and restarting the PrivateClaw plugin now:",
        )}`,
    automaticSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      ...(gatewayModeStep ? [gatewayModeStep] : []),
      ...(params.configPath ? [] : [restartStep]),
    ],
    manualSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      ...(gatewayModeStep ? [gatewayModeStep] : []),
      startupStep,
      pairingCommand,
    ],
    selectionNotes,
    verificationNotes,
    pairingCommand,
  };
}

export function renderPrivateClawSetupGuidance(
  plan: PrivateClawSetupPlan,
): string {
  return appendPrivateClawAppInstallFooter(
    [
      plan.introduction,
      ...plan.selectionNotes.map((line) => `[privateclaw-provider] ${line}`),
      ...plan.manualSteps.map((step) => `[privateclaw-provider]   ${step.display}`),
      ...plan.verificationNotes,
    ].join("\n"),
  );
}

async function promptForPrivateClawChoice(
  question: string,
  choices: readonly PrivateClawSetupChoice[],
  defaultValue?: string,
): Promise<string> {
  if (!isInteractiveTerminal()) {
    throw new Error(
      formatBilingualInline(
        "当前终端不是交互式终端；请改为显式传入 setup 参数。",
        "The current terminal is not interactive; pass explicit setup flags instead.",
      ),
    );
  }
  const rl = createInterface({
    input: stdin,
    output: stdout,
  });
  try {
    while (true) {
      console.log(question);
      for (const [index, choice] of choices.entries()) {
        const isDefault = defaultValue === choice.value;
        console.log(
          `${index + 1}. ${choice.label}${isDefault ? ` ${formatBilingualInline("(默认)", "(default)")}` : ""}`,
        );
      }
      const answer = await rl.question(
        `${formatBilingualInline("请输入序号", "Enter a number")} [1-${choices.length}]${defaultValue ? ` ${formatBilingualInline("留空使用默认值", "press Enter for the default")}` : ""}: `,
      );
      const normalized = answer.trim().toLowerCase();
      if (normalized === "" && defaultValue) {
        return defaultValue;
      }
      const numeric = Number.parseInt(normalized, 10);
      if (
        Number.isInteger(numeric) &&
        numeric >= 1 &&
        numeric <= choices.length
      ) {
        return choices[numeric - 1]!.value;
      }
      const matchedChoice = choices.find(
        (choice) => choice.value.toLowerCase() === normalized,
      );
      if (matchedChoice) {
        return matchedChoice.value;
      }
      console.log(
        formatBilingualInline(
          "无效输入，请重新选择。",
          "Invalid input. Please choose again.",
        ),
      );
    }
  } finally {
    rl.close();
  }
}

async function runPrivateClawSetupStep(
  step: PrivateClawSetupStep,
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
          `[privateclaw-provider] Install attempt failed (${candidate.label}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    throw lastError ?? new Error("Missing OpenClaw install candidates.");
  }
  await runStreamingCommand(step.command, step.args, {
    ...(step.env ? { env: step.env } : {}),
  });
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

function resolveOpenClawConfigPath(configPath?: string): string | undefined {
  if (configPath) {
    return path.resolve(configPath);
  }
  const envConfigPath = process.env.OPENCLAW_CONFIG_PATH?.trim();
  if (envConfigPath) {
    return path.resolve(envConfigPath);
  }
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

async function patchOpenClawPluginsAllow(
  configPath: string | undefined,
  pluginId: string,
  log: (line: string) => void,
): Promise<void> {
  const resolvedPath = resolveOpenClawConfigPath(configPath);
  if (!resolvedPath) {
    return;
  }

  let config: Record<string, unknown>;
  try {
    config = JSON.parse(await readFile(resolvedPath, "utf8")) as Record<string, unknown>;
  } catch {
    config = {};
  }

  // OpenClaw config uses nested structure: { "plugins": { "allow": [...] } }
  let pluginsSection = config["plugins"];
  if (
    typeof pluginsSection === "object" &&
    pluginsSection !== null &&
    !Array.isArray(pluginsSection)
  ) {
    // existing plugins section – keep it
  } else {
    pluginsSection = {};
    config["plugins"] = pluginsSection;
  }

  const currentAllow = (pluginsSection as Record<string, unknown>)["allow"];
  let allowList: string[];
  if (Array.isArray(currentAllow)) {
    allowList = currentAllow.filter((item): item is string => typeof item === "string");
  } else {
    allowList = [];
  }

  if (allowList.includes(pluginId)) {
    return;
  }

  allowList.push(pluginId);
  (pluginsSection as Record<string, unknown>)["allow"] = allowList;

  // Remove any flat "plugins.allow" key that a previous buggy version may have written.
  if ("plugins.allow" in config) {
    delete config["plugins.allow"];
  }

  await mkdir(path.dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, JSON.stringify(config, null, 2), "utf8");

  log(
    `[privateclaw-provider] ${formatBilingualInline(
      `已将 ${pluginId} 加入 ${resolvedPath} 的 plugins.allow`,
      `Added ${pluginId} to plugins.allow in ${resolvedPath}`,
    )}`,
  );
}

export async function runPrivateClawSetup(
  options: RunPrivateClawSetupOptions = {},
): Promise<void> {
  const detectStatus =
    options.detectLocalOpenClawStatus ??
    (() =>
      detectLocalOpenClawStatus(
        createOpenClawOneShotRunner(options.configPath),
      ));
  const packageSpec =
    options.packageSpec ?? (await resolveCurrentPrivateClawPackageSpec());
  const packageRoot = options.packageRoot ?? resolveCurrentPrivateClawPackageRoot();
  const log = options.onLog ?? ((line: string) => console.log(line));

  // Phase 1: Detect status and prepare the plugin BEFORE asking about pairing.
  const status = await detectStatus();

  // If openclaw is not available at all, show manual steps with full pairing command.
  // Selection is needed early here to render the correct pairing command in guidance.
  if (!status.openClawAvailable) {
    const selection =
      options.selection ??
      (await resolvePrivateClawSetupSelection({
        ...(typeof options.groupMode === "boolean"
          ? { groupMode: options.groupMode }
          : {}),
        ...(typeof options.ttlMs === "number" ? { ttlMs: options.ttlMs } : {}),
        ...(options.durationPreset ? { durationPreset: options.durationPreset } : {}),
        ...(options.promptForChoice
          ? { promptForChoice: options.promptForChoice }
          : {}),
      }));
    const plan = buildPrivateClawSetupPlan({
      packageSpec,
      packageRoot,
      status,
      selection,
      ...(options.configPath ? { configPath: options.configPath } : {}),
      ...(options.relayBaseUrl ? { relayBaseUrl: options.relayBaseUrl } : {}),
      ...(options.label ? { label: options.label } : {}),
      ...(options.foreground ? { foreground: true } : {}),
      ...(options.openInBrowser ? { openInBrowser: true } : {}),
      ...(options.verbose ? { verbose: true } : {}),
    });
    const guidance = renderPrivateClawSetupGuidance(plan);
    for (const line of guidance.split("\n")) {
      log(line);
    }
    throw new Error(
      formatBilingualInline(
        "当前机器上还没有可用的 `openclaw` 命令，无法继续自动安装 PrivateClaw 插件。",
        "This machine does not have a working `openclaw` command yet, so the PrivateClaw plugin cannot be installed automatically.",
      ),
    );
  }

  // Build a preparation plan with a placeholder selection to get the install/update/enable steps.
  const placeholderSelection: PrivateClawSetupSelection = {
    groupMode: false,
    ttlMs: DAY_MS,
    durationLabel: formatBilingualInline("24 小时", "24 hours"),
  };
  const prepPlan = buildPrivateClawSetupPlan({
    packageSpec,
    packageRoot,
    status,
    selection: placeholderSelection,
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.relayBaseUrl ? { relayBaseUrl: options.relayBaseUrl } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.foreground ? { foreground: true } : {}),
    ...(options.openInBrowser ? { openInBrowser: true } : {}),
    ...(options.verbose ? { verbose: true } : {}),
  });

  // Show introduction.
  log(prepPlan.introduction);

  // Patch plugins.allow in the OpenClaw config before install/update.
  await patchOpenClawPluginsAllow(options.configPath, PRIVATECLAW_PLUGIN_ID, log);

  // Run automatic steps (install / update / enable / restart).
  const runStep = options.runStep ?? runPrivateClawSetupStep;
  for (const step of prepPlan.automaticSteps) {
    log(`[privateclaw-provider] ${formatBilingualInline("正在执行", "Running")}: ${step.display}`);
    await runStep(step);
  }

  // Verify command availability after install/update/enable.
  const didRestart = prepPlan.automaticSteps.some(
    (step) => step.args[0] === "gateway" && step.args[1] === "restart",
  );
  if (!prepPlan.privateClawCommandAvailable || didRestart) {
    const refreshedStatus = await waitForPrivateClawCommandAvailability(
      detectStatus,
      options.verificationTimeoutMs ?? 15_000,
      options.verificationPollMs ?? 1_000,
    );
    if (!refreshedStatus.privateClawCommandAvailable) {
      throw new Error(
        formatBilingualInline(
          `PrivateClaw 安装/启用步骤已完成，但 \`privateclaw\` 仍然无法响应 \`${buildPrivateClawVerificationDisplay(options.configPath)}\`。请确认当前 OpenClaw 配置已正确生效后再试。`,
          `The PrivateClaw install/enable steps completed, but \`privateclaw\` still does not respond to \`${buildPrivateClawVerificationDisplay(options.configPath)}\`. Confirm the current OpenClaw config loaded cleanly, then try again.`,
        ),
      );
    }
    log(
      `[privateclaw-provider] ${formatBilingualInline(
        `已确认命令就绪：${buildPrivateClawVerificationDisplay(options.configPath)}`,
        `Verified command availability with: ${buildPrivateClawVerificationDisplay(options.configPath)}`,
      )}`,
    );
    // After a gateway restart, give the gateway extra time to finish loading
    // plugins and restoring sessions before issuing the pair command.
    if (didRestart) {
      const settleMs = options.gatewaySettleMs ?? 5_000;
      if (settleMs > 0) {
        log(
          `[privateclaw-provider] ${formatBilingualInline(
            `等待 gateway 完全就绪（${settleMs / 1000} 秒）…`,
            `Waiting for gateway to settle (${settleMs / 1000}s)...`,
          )}`,
        );
        await delay(settleMs);
      }
    }
  }

  // Phase 2: Plugin is now ready. Ask the user for pairing preferences.
  const selection =
    options.selection ??
    (await resolvePrivateClawSetupSelection({
      ...(typeof options.groupMode === "boolean"
        ? { groupMode: options.groupMode }
        : {}),
      ...(typeof options.ttlMs === "number" ? { ttlMs: options.ttlMs } : {}),
      ...(options.durationPreset ? { durationPreset: options.durationPreset } : {}),
      ...(options.promptForChoice
        ? { promptForChoice: options.promptForChoice }
        : {}),
    }));

  log(
    `[privateclaw-provider] ${formatBilingualInline(
      `配对模式：${selection.groupMode ? "群聊" : "单独会话"}`,
      `Pairing mode: ${selection.groupMode ? "group chat" : "single chat"}`,
    )}`,
  );
  log(
    `[privateclaw-provider] ${formatBilingualInline(
      `会话时长：${selection.durationLabel.split(" / ")[0]}`,
      `Session duration: ${selection.durationLabel.split(" / ")[1] ?? selection.durationLabel}`,
    )}`,
  );

  // Build and run the pairing command.
  const pairingCommand = buildPairingCommandStep({
    groupMode: selection.groupMode,
    ttlMs: selection.ttlMs,
    ...(options.relayBaseUrl ? { relayBaseUrl: options.relayBaseUrl } : {}),
    ...(options.configPath ? { configPath: options.configPath } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.foreground ? { foreground: true } : {}),
    ...(options.openInBrowser ? { openInBrowser: true } : {}),
    ...(options.verbose ? { verbose: true } : {}),
  });
  log(
    `[privateclaw-provider] ${formatBilingualInline("开始配对", "Starting pairing")}: ${pairingCommand.display}`,
  );
  for (const line of appendPrivateClawAppInstallFooterLines([])) {
    log(line);
  }
  const runPairingCommand =
    options.runPairingCommand ??
    ((step: PrivateClawSetupStep) =>
      runStreamingCommand(step.command, step.args, {
        ...(step.env ? { env: step.env } : {}),
      }));
  await runPairingCommand(pairingCommand);
}
