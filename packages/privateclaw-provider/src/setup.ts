import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { formatBilingualInline } from "./text.js";

export interface LocalOpenClawStatus {
  openClawAvailable: boolean;
  privateClawCommandAvailable: boolean;
  privateClawPluginPresent?: boolean;
}

export interface PrivateClawSetupStep {
  title: string;
  command: string;
  args: string[];
  display: string;
  kind?: "command" | "npm-pack-install";
  packageSpec?: string;
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
) => Promise<RunOneShotCommandResult>;

export interface RunPrivateClawSetupOptions {
  packageSpec?: string;
  relayBaseUrl?: string;
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
}

const PRIVATECLAW_PACKAGE_NAME = "@privateclaw/privateclaw";
const PRIVATECLAW_VERIFICATION_COMMAND = "openclaw privateclaw pair --help";
const PRIVATECLAW_PLUGIN_ID = "privateclaw";

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
  extra?: Pick<PrivateClawSetupStep, "kind" | "packageSpec">,
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

async function runOneShotCommand(
  command: string,
  args: string[],
  options?: {
    cwd?: string;
  },
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
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
  },
): Promise<RunOneShotCommandResult> {
  const child = spawn(command, args, {
    ...(options?.cwd ? { cwd: options.cwd } : {}),
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

function isExactSemverVersion(value: string): boolean {
  return /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u.test(
    value.trim(),
  );
}

function buildPackedArchiveHint(packageSpec: string): string {
  const normalizedSpec = packageSpec.trim();
  const lastAt = normalizedSpec.lastIndexOf("@");
  const hasSelector = lastAt > 0;
  const packageName = hasSelector ? normalizedSpec.slice(0, lastAt) : normalizedSpec;
  const selector = hasSelector ? normalizedSpec.slice(lastAt + 1) : "";
  const sanitizedName = packageName.replace(/^@/u, "").replace(/\//gu, "-");
  if (selector && isExactSemverVersion(selector)) {
    return `${sanitizedName}-${selector.replace(/^v/iu, "")}.tgz`;
  }
  return `${sanitizedName}-*.tgz`;
}

function createNpmPackInstallStep(packageSpec: string): PrivateClawSetupStep {
  return createStep(
    "Pack the PrivateClaw npm package locally, then install the generated archive into OpenClaw",
    resolveNpmCommand(),
    ["pack", packageSpec],
    `npm pack ${packageSpec} && openclaw plugins install ./${buildPackedArchiveHint(packageSpec)}`,
    {
      kind: "npm-pack-install",
      packageSpec,
    },
  );
}

function createManualNpmArchiveInstallSteps(
  packageSpec: string,
): [PrivateClawSetupStep, PrivateClawSetupStep] {
  const archiveHint = buildPackedArchiveHint(packageSpec);
  return [
    createStep(
      "Pack the PrivateClaw plugin from npm into a local archive",
      resolveNpmCommand(),
      ["pack", packageSpec],
      `npm pack ${packageSpec}`,
    ),
    createStep(
      "Install the generated PrivateClaw plugin archive into OpenClaw",
      "openclaw",
      ["plugins", "install", `./${archiveHint}`],
      `openclaw plugins install ./${archiveHint}`,
    ),
  ];
}

async function runNpmPackInstallStep(step: PrivateClawSetupStep): Promise<void> {
  if (!step.packageSpec) {
    throw new Error("Missing packageSpec for npm-pack-install step.");
  }
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-plugin-install-"));
  try {
    const packResult = await runOneShotCommand(
      resolveNpmCommand(),
      [
        "pack",
        step.packageSpec,
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        tempDir,
      ],
    );
    const packOutput = packResult.stdout.trim() || packResult.combined.trim();
    const parsed = JSON.parse(packOutput) as Array<{ filename?: unknown }>;
    const archiveFileName =
      typeof parsed[0]?.filename === "string" && parsed[0].filename.trim() !== ""
        ? parsed[0].filename.trim()
        : undefined;
    if (!archiveFileName) {
      throw new Error(`Could not determine the generated archive for ${step.packageSpec}.`);
    }
    await runStreamingCommand("openclaw", [
      "plugins",
      "install",
      path.join(tempDir, archiveFileName),
    ]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
  return createStep(
    "Start the requested PrivateClaw pairing flow",
    "openclaw",
    args,
    `openclaw ${args.join(" ")}`,
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
  status: LocalOpenClawStatus;
  selection: PrivateClawSetupSelection;
  relayBaseUrl?: string;
  label?: string;
  foreground?: boolean;
  openInBrowser?: boolean;
  verbose?: boolean;
}): PrivateClawSetupPlan {
  const installStep = createNpmPackInstallStep(params.packageSpec);
  const manualInstallSteps = createManualNpmArchiveInstallSteps(params.packageSpec);
  const updateStep = createStep(
    "Update the existing PrivateClaw OpenClaw plugin",
    "openclaw",
    ["plugins", "update", PRIVATECLAW_PLUGIN_ID],
    `openclaw plugins update ${PRIVATECLAW_PLUGIN_ID}`,
  );
  const enableStep = createStep(
    "Enable the PrivateClaw OpenClaw plugin",
    "openclaw",
    ["plugins", "enable", PRIVATECLAW_PLUGIN_ID],
    `openclaw plugins enable ${PRIVATECLAW_PLUGIN_ID}`,
  );
  const restartStep = createStep(
    "Restart the OpenClaw gateway so the new plugin command is reloaded",
    "openclaw",
    ["gateway", "restart"],
    "openclaw gateway restart",
  );
  const pairingCommand = buildPairingCommandStep({
    groupMode: params.selection.groupMode,
    ttlMs: params.selection.ttlMs,
    ...(params.relayBaseUrl ? { relayBaseUrl: params.relayBaseUrl } : {}),
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
    `[privateclaw-provider] ${formatBilingualInline(
      `若需要手工确认插件命令是否就绪，可运行：${PRIVATECLAW_VERIFICATION_COMMAND}`,
      `If you want to verify the plugin command manually, run: ${PRIVATECLAW_VERIFICATION_COMMAND}`,
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
      manualSteps: [...manualInstallSteps, enableStep, restartStep, pairingCommand],
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
          "本机的 OpenClaw + PrivateClaw 已经可用，接下来直接开始配对：",
          "OpenClaw + PrivateClaw are already available locally. Starting pairing next:",
        )}`,
      automaticSteps: [],
      manualSteps: [pairingCommand],
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
        params.status.privateClawPluginPresent
          ? "检测到本机已经安装过 PrivateClaw 插件，但命令还没有生效。现在会更新、启用并重启 OpenClaw："
          : "检测到本机可以直接运行 OpenClaw。现在会安装、启用 PrivateClaw 插件并重启 OpenClaw：",
        params.status.privateClawPluginPresent
          ? "A local PrivateClaw plugin is already present, but the command is not active yet. Updating, enabling, and restarting OpenClaw now:"
          : "OpenClaw is available locally. Installing, enabling, and restarting the PrivateClaw plugin now:",
      )}`,
    automaticSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      restartStep,
    ],
    manualSteps: [
      ...(params.status.privateClawPluginPresent ? [updateStep] : [installStep]),
      enableStep,
      restartStep,
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
  return [
    plan.introduction,
    ...plan.selectionNotes.map((line) => `[privateclaw-provider] ${line}`),
    ...plan.manualSteps.map((step) => `[privateclaw-provider]   ${step.display}`),
    ...plan.verificationNotes,
  ].join("\n");
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
  if (step.kind === "npm-pack-install") {
    await runNpmPackInstallStep(step);
    return;
  }
  await runStreamingCommand(step.command, step.args);
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

export async function runPrivateClawSetup(
  options: RunPrivateClawSetupOptions = {},
): Promise<void> {
  const detectStatus =
    options.detectLocalOpenClawStatus ?? detectLocalOpenClawStatus;
  const packageSpec =
    options.packageSpec ?? (await resolveCurrentPrivateClawPackageSpec());
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
  const status = await detectStatus();
  const plan = buildPrivateClawSetupPlan({
    packageSpec,
    status,
    selection,
    ...(options.relayBaseUrl ? { relayBaseUrl: options.relayBaseUrl } : {}),
    ...(options.label ? { label: options.label } : {}),
    ...(options.foreground ? { foreground: true } : {}),
    ...(options.openInBrowser ? { openInBrowser: true } : {}),
    ...(options.verbose ? { verbose: true } : {}),
  });
  const guidance = renderPrivateClawSetupGuidance(plan);
  const log = options.onLog ?? ((line: string) => console.log(line));
  for (const line of guidance.split("\n")) {
    log(line);
  }

  if (!plan.localOpenClaw) {
    throw new Error(
      formatBilingualInline(
        "当前机器上还没有可用的 `openclaw` 命令，无法继续自动安装 PrivateClaw 插件。",
        "This machine does not have a working `openclaw` command yet, so the PrivateClaw plugin cannot be installed automatically.",
      ),
    );
  }

  const runStep = options.runStep ?? runPrivateClawSetupStep;
  const runPairingCommand =
    options.runPairingCommand ??
    ((step: PrivateClawSetupStep) => runStreamingCommand(step.command, step.args));

  for (const step of plan.automaticSteps) {
    log(`[privateclaw-provider] ${formatBilingualInline("正在执行", "Running")}: ${step.display}`);
    await runStep(step);
  }

  if (!plan.privateClawCommandAvailable) {
    const refreshedStatus = await waitForPrivateClawCommandAvailability(
      detectStatus,
      options.verificationTimeoutMs ?? 15_000,
      options.verificationPollMs ?? 1_000,
    );
    if (!refreshedStatus.privateClawCommandAvailable) {
      throw new Error(
        formatBilingualInline(
          `OpenClaw 已重载，但 \`privateclaw\` 仍然无法响应 \`${PRIVATECLAW_VERIFICATION_COMMAND}\`。请确认 gateway 已正常重启后再试。`,
          `OpenClaw reloaded, but \`privateclaw\` still does not respond to \`${PRIVATECLAW_VERIFICATION_COMMAND}\`. Confirm the gateway restarted cleanly, then try again.`,
        ),
      );
    }
    log(
      `[privateclaw-provider] ${formatBilingualInline(
        `已确认命令就绪：${PRIVATECLAW_VERIFICATION_COMMAND}`,
        `Verified command availability with: ${PRIVATECLAW_VERIFICATION_COMMAND}`,
      )}`,
    );
  }

  log(
    `[privateclaw-provider] ${formatBilingualInline("开始配对", "Starting pairing")}: ${plan.pairingCommand.display}`,
  );
  await runPairingCommand(plan.pairingCommand);
}
