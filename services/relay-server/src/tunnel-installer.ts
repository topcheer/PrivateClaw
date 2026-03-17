import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { RelayCliUserError } from "./cli-error.js";
import {
  MissingRelayTunnelBinaryError,
  isUnavailableTunnelBinaryError,
  type RelayTunnelProvider,
} from "./tunnel.js";

const TAILSCALE_INSTALL_DOCS_URL = "https://tailscale.com/docs/install";
const CLOUDFLARE_INSTALL_DOCS_URL =
  "https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/";

const PACKAGE_MANAGER_PROBES = new Map<string, string[]>([
  ["brew", ["--version"]],
  ["curl", ["--version"]],
  ["dnf", ["--version"]],
  ["pacman", ["--version"]],
  ["apt-get", ["--version"]],
  ["sh", ["-c", "exit 0"]],
  ["sudo", ["--version"]],
  ["systemctl", ["--version"]],
  ["winget", ["--version"]],
  ["yum", ["--version"]],
]);

export interface RelayTunnelDependencyStep {
  title: string;
  command: string;
  args: string[];
  display: string;
}

export interface RelayTunnelDependencyPlan {
  provider: RelayTunnelProvider;
  binary: string;
  displayName: string;
  docsUrl: string;
  installStep?: RelayTunnelDependencyStep;
  configureSteps: RelayTunnelDependencyStep[];
  manualSteps: RelayTunnelDependencyStep[];
  notes: string[];
}

interface ResolveRelayTunnelDependencyPlanOptions {
  platform?: NodeJS.Platform;
  availableCommands?: Iterable<string>;
  isRoot?: boolean;
}

interface EnsureRelayTunnelDependencyOptions {
  provider: RelayTunnelProvider;
  missingDependency: MissingRelayTunnelBinaryError;
  onLog?: (line: string) => void;
  isInteractive?: boolean;
  resolvePlan?: (
    provider: RelayTunnelProvider,
  ) => Promise<RelayTunnelDependencyPlan> | RelayTunnelDependencyPlan;
  promptToContinue?: (question: string) => Promise<boolean>;
  runStep?: (step: RelayTunnelDependencyStep) => Promise<void>;
}

interface EnsureRelayTunnelProviderConfiguredOptions {
  provider: RelayTunnelProvider;
  summary: string;
  onLog?: (line: string) => void;
  isInteractive?: boolean;
  resolvePlan?: (
    provider: RelayTunnelProvider,
  ) => Promise<RelayTunnelDependencyPlan> | RelayTunnelDependencyPlan;
  promptToContinue?: (question: string) => Promise<boolean>;
  runStep?: (step: RelayTunnelDependencyStep) => Promise<void>;
}

function createStep(
  title: string,
  command: string,
  args: string[],
  display: string,
): RelayTunnelDependencyStep {
  return {
    title,
    command,
    args,
    display,
  };
}

function createShellStep(
  title: string,
  script: string,
  display: string,
): RelayTunnelDependencyStep {
  return createStep(title, "sh", ["-c", script], display);
}

function createStepWithOptionalSudo(
  useSudo: boolean,
  title: string,
  command: string,
  args: string[],
  display: string,
): RelayTunnelDependencyStep {
  if (!useSudo) {
    return createStep(title, command, args, display);
  }
  return createStep(title, "sudo", [command, ...args], `sudo ${display}`);
}

function supportsAutomaticInstall(plan: RelayTunnelDependencyPlan): boolean {
  return plan.installStep != null;
}

function isInteractiveTerminal(): boolean {
  return Boolean(
    process.stdin.isTTY &&
      process.stdout.isTTY &&
      !process.stdin.destroyed &&
      !process.stdout.destroyed,
  );
}

async function commandExists(command: string): Promise<boolean> {
  const args = PACKAGE_MANAGER_PROBES.get(command) ?? ["--version"];
  const child = spawn(command, args, {
    stdio: "ignore",
  });
  const childError = once(child, "error").then(([error]) => {
    throw error;
  });
  const childClose = once(child, "close");

  try {
    await Promise.race([childError, childClose]);
    return true;
  } catch (error) {
    return !isUnavailableTunnelBinaryError(error);
  }
}

async function detectAvailableCommands(commands: string[]): Promise<Set<string>> {
  const entries = await Promise.all(
    commands.map(async (command) => [command, await commandExists(command)] as const),
  );
  return new Set(entries.filter(([, present]) => present).map(([command]) => command));
}

export function resolveRelayTunnelDependencyPlan(
  provider: RelayTunnelProvider,
  options: ResolveRelayTunnelDependencyPlanOptions = {},
): RelayTunnelDependencyPlan {
  const platform = options.platform ?? process.platform;
  const availableCommands = new Set(options.availableCommands ?? []);
  const isRoot =
    options.isRoot ??
    (typeof process.getuid === "function" ? process.getuid() === 0 : false);
  const canSudo = isRoot || availableCommands.has("sudo");
  const useSudo = !isRoot && availableCommands.has("sudo");

  if (provider === "tailscale") {
    const docsUrl = TAILSCALE_INSTALL_DOCS_URL;
    if (platform === "darwin") {
      const installStep = availableCommands.has("brew")
        ? createStep(
            "Install Tailscale with Homebrew",
            "brew",
            ["install", "tailscale"],
            "brew install tailscale",
          )
        : undefined;
      const configureSteps = [
        createStepWithOptionalSudo(
          useSudo,
          "Start the local Tailscale daemon",
          "brew",
          ["services", "start", "tailscale"],
          "brew services start tailscale",
        ),
        createStep(
          "Connect this device to your tailnet",
          "tailscale",
          ["up"],
          "tailscale up",
        ),
      ];
      return {
        provider,
        binary: "tailscale",
        displayName: "Tailscale CLI",
        docsUrl,
        ...(installStep ? { installStep } : {}),
        configureSteps,
        manualSteps: [
          createStep(
            "Install Tailscale with Homebrew",
            "brew",
            ["install", "tailscale"],
            "brew install tailscale",
          ),
          createStepWithOptionalSudo(
            useSudo,
            "Start the local Tailscale daemon",
            "brew",
            ["services", "start", "tailscale"],
            "brew services start tailscale",
          ),
          createStep(
            "Connect this device to your tailnet",
            "tailscale",
            ["up"],
            "tailscale up",
          ),
        ],
        notes: [
          "Tailscale Funnel also requires Funnel to be enabled for your tailnet.",
        ],
      };
    }

    if (platform === "win32") {
      const installStep = availableCommands.has("winget")
        ? createStep(
            "Install Tailscale with winget",
            "winget",
            ["install", "--id", "Tailscale.Tailscale", "-e"],
            "winget install --id Tailscale.Tailscale -e",
          )
        : undefined;
      return {
        provider,
        binary: "tailscale",
        displayName: "Tailscale CLI",
        docsUrl,
        ...(installStep ? { installStep } : {}),
        configureSteps: [
          createStep(
            "Connect this device to your tailnet",
            "tailscale",
            ["up"],
            "tailscale up",
          ),
        ],
        manualSteps: [
          createStep(
            "Install Tailscale with winget",
            "winget",
            ["install", "--id", "Tailscale.Tailscale", "-e"],
            "winget install --id Tailscale.Tailscale -e",
          ),
          createStep(
            "Connect this device to your tailnet",
            "tailscale",
            ["up"],
            "tailscale up",
          ),
        ],
        notes: [
          "Tailscale Funnel also requires Funnel to be enabled for your tailnet.",
        ],
      };
    }

    const installStep =
      availableCommands.has("curl") && availableCommands.has("sh")
        ? createShellStep(
            "Install Tailscale with the official installer",
            "curl -fsSL https://tailscale.com/install.sh | sh",
            "curl -fsSL https://tailscale.com/install.sh | sh",
          )
        : undefined;
    return {
      provider,
      binary: "tailscale",
      displayName: "Tailscale CLI",
      docsUrl,
      ...(installStep ? { installStep } : {}),
      configureSteps: [
        ...(availableCommands.has("systemctl") && canSudo
          ? [
              createStepWithOptionalSudo(
                useSudo,
                "Start the local tailscaled service",
                "systemctl",
                ["enable", "--now", "tailscaled"],
                "systemctl enable --now tailscaled",
              ),
            ]
          : []),
        ...(canSudo
          ? [
              createStepWithOptionalSudo(
                useSudo,
                "Connect this device to your tailnet",
                "tailscale",
                ["up"],
                "tailscale up",
              ),
            ]
          : [
              createStep(
                "Connect this device to your tailnet",
                "tailscale",
                ["up"],
                "tailscale up",
              ),
            ]),
      ],
      manualSteps: [
        createShellStep(
          "Install Tailscale with the official installer",
          "curl -fsSL https://tailscale.com/install.sh | sh",
          "curl -fsSL https://tailscale.com/install.sh | sh",
        ),
        ...(availableCommands.has("systemctl") && canSudo
          ? [
              createStepWithOptionalSudo(
                useSudo,
                "Start the local tailscaled service",
                "systemctl",
                ["enable", "--now", "tailscaled"],
                "systemctl enable --now tailscaled",
              ),
            ]
          : []),
        ...(canSudo
          ? [
              createStepWithOptionalSudo(
                useSudo,
                "Connect this device to your tailnet",
                "tailscale",
                ["up"],
                "tailscale up",
              ),
            ]
          : [
              createStep(
                "Connect this device to your tailnet",
                "tailscale",
                ["up"],
                "tailscale up",
              ),
            ]),
      ],
      notes: [
        "Tailscale Funnel also requires Funnel to be enabled for your tailnet.",
      ],
    };
  }

  const docsUrl = CLOUDFLARE_INSTALL_DOCS_URL;
  if (platform === "darwin") {
    const installStep = availableCommands.has("brew")
      ? createStep(
          "Install cloudflared with Homebrew",
          "brew",
          ["install", "cloudflared"],
          "brew install cloudflared",
        )
      : undefined;
    return {
      provider,
      binary: "cloudflared",
      displayName: "cloudflared",
      docsUrl,
      ...(installStep ? { installStep } : {}),
      configureSteps: [],
      manualSteps: [
        createStep(
          "Install cloudflared with Homebrew",
          "brew",
          ["install", "cloudflared"],
          "brew install cloudflared",
        ),
      ],
      notes: [],
    };
  }

  if (platform === "win32") {
    const installStep = availableCommands.has("winget")
      ? createStep(
          "Install cloudflared with winget",
          "winget",
          ["install", "--id", "Cloudflare.cloudflared", "-e"],
          "winget install --id Cloudflare.cloudflared -e",
        )
      : undefined;
    return {
      provider,
      binary: "cloudflared",
      displayName: "cloudflared",
      docsUrl,
      ...(installStep ? { installStep } : {}),
      configureSteps: [],
      manualSteps: [
        createStep(
          "Install cloudflared with winget",
          "winget",
          ["install", "--id", "Cloudflare.cloudflared", "-e"],
          "winget install --id Cloudflare.cloudflared -e",
        ),
      ],
      notes: [],
    };
  }

  if (availableCommands.has("brew")) {
    return {
      provider,
      binary: "cloudflared",
      displayName: "cloudflared",
      docsUrl,
      installStep: createStep(
        "Install cloudflared with Homebrew",
        "brew",
        ["install", "cloudflared"],
        "brew install cloudflared",
      ),
      configureSteps: [],
      manualSteps: [
        createStep(
          "Install cloudflared with Homebrew",
          "brew",
          ["install", "cloudflared"],
          "brew install cloudflared",
        ),
      ],
      notes: [],
    };
  }

  if (availableCommands.has("pacman") && canSudo) {
    const installStep = createStepWithOptionalSudo(
      useSudo,
      "Install cloudflared with pacman",
      "pacman",
      ["-Syu", "--needed", "cloudflared"],
      "pacman -Syu --needed cloudflared",
    );
    return {
      provider,
      binary: "cloudflared",
      displayName: "cloudflared",
      docsUrl,
      installStep,
      configureSteps: [],
      manualSteps: [installStep],
      notes: [],
    };
  }

  if (availableCommands.has("apt-get") && availableCommands.has("curl") && canSudo) {
    const sudoPrefix = useSudo ? "sudo " : "";
    const installDisplay = [
      `${sudoPrefix}mkdir -p --mode=0755 /usr/share/keyrings`,
      `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | ${sudoPrefix}tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null`,
      `. /etc/os-release && codename="${"${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"}"`,
      `echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $codename main" | ${sudoPrefix}tee /etc/apt/sources.list.d/cloudflared.list >/dev/null`,
      `${sudoPrefix}apt-get update`,
      `${sudoPrefix}apt-get install -y cloudflared`,
    ].join(" && ");
    const installStep = createShellStep(
      "Install cloudflared from Cloudflare's apt repository",
      [
        "set -e",
        `${sudoPrefix}mkdir -p --mode=0755 /usr/share/keyrings`,
        `curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | ${sudoPrefix}tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null`,
        ". /etc/os-release",
        'codename="${VERSION_CODENAME:-${UBUNTU_CODENAME:-}}"',
        'if [ -z "$codename" ]; then echo "Could not determine the Linux codename for cloudflared." >&2; exit 1; fi',
        `echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared ${"$"}codename main" | ${sudoPrefix}tee /etc/apt/sources.list.d/cloudflared.list >/dev/null`,
        `${sudoPrefix}apt-get update`,
        `${sudoPrefix}apt-get install -y cloudflared`,
      ].join(" && "),
      installDisplay,
    );
    return {
      provider,
      binary: "cloudflared",
      displayName: "cloudflared",
      docsUrl,
      installStep,
      configureSteps: [],
      manualSteps: [installStep],
      notes: [],
    };
  }

  if (
    (availableCommands.has("dnf") || availableCommands.has("yum")) &&
    availableCommands.has("curl") &&
    canSudo
  ) {
    const manager = availableCommands.has("dnf") ? "dnf" : "yum";
    const sudoPrefix = useSudo ? "sudo " : "";
    const installStep = createShellStep(
      `Install cloudflared with ${manager}`,
      [
        "set -e",
        `curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | ${sudoPrefix}tee /etc/yum.repos.d/cloudflared.repo >/dev/null`,
        `${sudoPrefix}${manager} install -y cloudflared`,
      ].join(" && "),
      [
        `curl -fsSL https://pkg.cloudflare.com/cloudflared-ascii.repo | ${sudoPrefix}tee /etc/yum.repos.d/cloudflared.repo >/dev/null`,
        `${sudoPrefix}${manager} install -y cloudflared`,
      ].join(" && "),
    );
    return {
      provider,
      binary: "cloudflared",
      displayName: "cloudflared",
      docsUrl,
      installStep,
      configureSteps: [],
      manualSteps: [installStep],
      notes: [],
    };
  }

  return {
    provider,
    binary: "cloudflared",
    displayName: "cloudflared",
    docsUrl,
    configureSteps: [],
    manualSteps: [],
    notes: [],
  };
}

export function renderRelayTunnelDependencyGuidance(
  plan: RelayTunnelDependencyPlan,
): string {
  const lines = [
    `[privateclaw-relay] ${plan.displayName} (\`${plan.binary}\`) is required for \`--public ${plan.provider}\` but was not found in PATH or is not executable.`,
    ...(supportsAutomaticInstall(plan)
      ? [
          `[privateclaw-relay] Suggested install command: ${plan.installStep!.display}`,
        ]
      : []),
    ...(!supportsAutomaticInstall(plan) && plan.manualSteps.length > 0
      ? [
          "[privateclaw-relay] Suggested install/setup commands:",
          ...plan.manualSteps.map(
            (step) => `[privateclaw-relay]   ${step.display}`,
          ),
        ]
      : []),
    ...plan.notes.map((note) => `[privateclaw-relay] ${note}`),
    ...(plan.configureSteps.length > 0
      ? [
          "[privateclaw-relay] Recommended follow-up commands:",
          ...plan.configureSteps.map(
            (step) => `[privateclaw-relay]   ${step.display}`,
          ),
        ]
      : []),
    `[privateclaw-relay] Docs: ${plan.docsUrl}`,
  ];
  return lines.join("\n");
}

export function renderRelayTunnelConfigurationGuidance(
  plan: RelayTunnelDependencyPlan,
  summary: string,
): string {
  const lines = [
    summary,
    ...plan.notes.map((note) => `[privateclaw-relay] ${note}`),
    ...(plan.configureSteps.length > 0
      ? [
          "[privateclaw-relay] Recommended follow-up commands:",
          ...plan.configureSteps.map(
            (step) => `[privateclaw-relay]   ${step.display}`,
          ),
        ]
      : []),
    `[privateclaw-relay] Docs: ${plan.docsUrl}`,
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

async function runRelayTunnelDependencyStep(
  step: RelayTunnelDependencyStep,
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
      throw new Error(
        `Command \`${step.display}\` exited with ${
          code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`
        }.`,
      );
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Could not run \`${step.display}\` because \`${step.command}\` is unavailable.`,
      );
    }
    throw error;
  }
}

export async function buildRelayTunnelDependencyPlanForCurrentSystem(
  provider: RelayTunnelProvider,
): Promise<RelayTunnelDependencyPlan> {
  const availableCommands = await detectAvailableCommands(
    Array.from(PACKAGE_MANAGER_PROBES.keys()),
  );
  return resolveRelayTunnelDependencyPlan(provider, {
    availableCommands,
  });
}

export async function ensureRelayTunnelDependencyAvailable(
  options: EnsureRelayTunnelDependencyOptions,
): Promise<void> {
  const resolvePlan =
    options.resolvePlan ??
    ((provider: RelayTunnelProvider) =>
      buildRelayTunnelDependencyPlanForCurrentSystem(provider));
  const plan = await resolvePlan(options.provider);
  const guidance = renderRelayTunnelDependencyGuidance(plan);

  for (const line of guidance.split("\n")) {
    options.onLog?.(line);
  }
  const includeGuidanceInError = !options.onLog;

  const interactive = options.isInteractive ?? isInteractiveTerminal();
  if (!interactive) {
    throw new RelayCliUserError(
      includeGuidanceInError
        ? `${options.missingDependency.message}\n${guidance}\n[privateclaw-relay] Re-run in an interactive terminal to let the CLI install it for you automatically when supported.`
        : "[privateclaw-relay] Re-run in an interactive terminal to let the CLI install it for you automatically when supported.",
    );
  }

  if (!supportsAutomaticInstall(plan)) {
    throw new RelayCliUserError(
      includeGuidanceInError
        ? `${options.missingDependency.message}\n${guidance}\n[privateclaw-relay] Automatic installation is not available for this platform/package-manager combination yet.`
        : "[privateclaw-relay] Automatic installation is not available for this platform/package-manager combination yet.",
    );
  }

  const promptToContinue = options.promptToContinue ?? promptForConfirmation;
  const runStep = options.runStep ?? runRelayTunnelDependencyStep;
  const installStep = plan.installStep!;

  const installNow = await promptToContinue(
    `Install ${plan.displayName} now with \`${installStep.display}\`?`,
  );
  if (!installNow) {
    throw new RelayCliUserError(
      includeGuidanceInError
        ? `${options.missingDependency.message}\n${guidance}\n[privateclaw-relay] Installation was declined, so the public tunnel could not be started.`
        : "[privateclaw-relay] Installation was declined, so the public tunnel could not be started.",
    );
  }

  options.onLog?.(
    `[privateclaw-relay] Running: ${installStep.display}`,
  );
  await runStep(installStep);
  options.onLog?.(
    `[privateclaw-relay] ${plan.displayName} installation completed.`,
  );

  if (plan.configureSteps.length === 0) {
    return;
  }

  const configureNow = await promptToContinue(
    `Run the recommended ${plan.provider} setup commands now so the tunnel can be retried automatically?`,
  );
  if (!configureNow) {
    options.onLog?.(
      "[privateclaw-relay] Skipping the optional setup commands for now.",
    );
    return;
  }

  for (const step of plan.configureSteps) {
    options.onLog?.(`[privateclaw-relay] Running: ${step.display}`);
    await runStep(step);
  }
}

export async function ensureRelayTunnelProviderConfigured(
  options: EnsureRelayTunnelProviderConfiguredOptions,
): Promise<void> {
  const resolvePlan =
    options.resolvePlan ??
    ((provider: RelayTunnelProvider) =>
      buildRelayTunnelDependencyPlanForCurrentSystem(provider));
  const plan = await resolvePlan(options.provider);
  const guidance = renderRelayTunnelConfigurationGuidance(
    plan,
    options.summary,
  );

  for (const line of guidance.split("\n")) {
    options.onLog?.(line);
  }
  const includeGuidanceInError = !options.onLog;

  const interactive = options.isInteractive ?? isInteractiveTerminal();
  if (!interactive) {
    throw new RelayCliUserError(
      includeGuidanceInError
        ? `${options.summary}\n${guidance}\n[privateclaw-relay] Re-run in an interactive terminal to let the CLI run the recommended setup commands for you when supported.`
        : "[privateclaw-relay] Re-run in an interactive terminal to let the CLI run the recommended setup commands for you when supported.",
    );
  }

  if (plan.configureSteps.length === 0) {
    throw new RelayCliUserError(
      includeGuidanceInError
        ? `${options.summary}\n${guidance}\n[privateclaw-relay] Automatic setup commands are not available for this platform/package-manager combination yet.`
        : "[privateclaw-relay] Automatic setup commands are not available for this platform/package-manager combination yet.",
    );
  }

  const promptToContinue = options.promptToContinue ?? promptForConfirmation;
  const runStep = options.runStep ?? runRelayTunnelDependencyStep;
  const configureNow = await promptToContinue(
    `Run the recommended ${plan.provider} setup commands now so the tunnel can be retried automatically?`,
  );
  if (!configureNow) {
    throw new RelayCliUserError(
      includeGuidanceInError
        ? `${options.summary}\n${guidance}\n[privateclaw-relay] Setup was declined, so the public tunnel could not be started.`
        : "[privateclaw-relay] Setup was declined, so the public tunnel could not be started.",
    );
  }

  for (const step of plan.configureSteps) {
    options.onLog?.(`[privateclaw-relay] Running: ${step.display}`);
    await runStep(step);
  }
}
