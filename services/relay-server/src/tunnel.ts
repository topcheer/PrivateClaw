import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

export type RelayTunnelProvider = "tailscale" | "cloudflare";

export interface RelayTunnelCommandPlan {
  command: string;
  args: string[];
}

export interface RelayTunnelHandle {
  kind: RelayTunnelProvider;
  publicUrl?: string;
  notes: string[];
  close(): Promise<void>;
}

export class MissingRelayTunnelBinaryError extends Error {
  constructor(
    readonly command: string,
    readonly hint: string,
  ) {
    super(
      `Could not run the \`${command}\` CLI from PATH because it is missing or not executable. ${hint}`,
    );
    this.name = "MissingRelayTunnelBinaryError";
  }
}

export class RelayTunnelPrerequisiteError extends Error {
  constructor(
    readonly provider: RelayTunnelProvider,
    message: string,
  ) {
    super(message);
    this.name = "RelayTunnelPrerequisiteError";
  }
}

interface OpenRelayTunnelOptions {
  provider: RelayTunnelProvider;
  localPort: number;
  localUrl: string;
  onLog?: (line: string) => void;
  spawnCommand?: typeof spawn;
}

const PUBLIC_URL_PATTERN = /https:\/\/[^\s"'`<>]+/gu;

function formatTunnelCommand(plan: RelayTunnelCommandPlan): string {
  return [plan.command, ...plan.args].join(" ");
}

function formatMissingBinaryError(command: string, hint: string): Error {
  return new MissingRelayTunnelBinaryError(command, hint);
}

function getMissingBinaryHint(command: string): string {
  return command === "tailscale"
    ? "Install Tailscale and run `tailscale up` before using `--public tailscale`."
    : "Install cloudflared before using `--public cloudflare`.";
}

export function isUnavailableTunnelBinaryError(
  error: unknown,
): error is NodeJS.ErrnoException {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "EACCES" || code === "EPERM";
}

function extractCommandFailureDetails(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const marker = "exited with ";
  const markerIndex = error.message.indexOf(marker);
  if (markerIndex === -1) {
    return error.message.trim();
  }
  const colonIndex = error.message.indexOf(": ", markerIndex);
  if (colonIndex === -1) {
    return error.message.trim();
  }
  return error.message.slice(colonIndex + 2).trim();
}

export function toTailscalePrerequisiteError(
  error: unknown,
): RelayTunnelPrerequisiteError | undefined {
  if (
    error instanceof MissingRelayTunnelBinaryError ||
    error instanceof RelayTunnelPrerequisiteError
  ) {
    return undefined;
  }
  const details = extractCommandFailureDetails(error);
  const normalized = details.toLowerCase();
  const summary = normalized.includes("logged out")
    || normalized.includes("not logged in")
    || normalized.includes("login")
    || normalized.includes("log in")
    ? "Tailscale is installed, but this device is not logged in. Run `tailscale up` before using `--public tailscale`."
    : normalized.includes("funnel") &&
        (normalized.includes("enable") || normalized.includes("enabled"))
      ? "Tailscale is installed, but Funnel is not enabled for this tailnet. Enable Funnel in the Tailscale admin console before using `--public tailscale`."
      : "Tailscale is installed, but Funnel could not be enabled automatically.";
  return new RelayTunnelPrerequisiteError(
    "tailscale",
    `${summary}\n[privateclaw-relay] tailscale reported: ${details}`,
  );
}

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[),.;:]+$/u, "");
}

function emitBufferedLines(
  buffer: string,
  params: {
    prefix: string;
    onLog?: (line: string) => void;
  },
): string {
  const lines = buffer.split(/\r?\n/u);
  const remainder = lines.pop() ?? "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed !== "") {
      params.onLog?.(`[privateclaw-relay] ${params.prefix} ${trimmed}`);
    }
  }
  return remainder;
}

async function runOneShotCommand(params: {
  plan: RelayTunnelCommandPlan;
  onLog?: (line: string) => void;
  logPrefix: string;
  spawnCommand?: typeof spawn;
}): Promise<{
  stdout: string;
  stderr: string;
  combined: string;
}> {
  const spawnCommand = params.spawnCommand ?? spawn;
  const child = spawnCommand(params.plan.command, params.plan.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  let stdoutRemainder = "";
  let stderrRemainder = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    stdoutRemainder = emitBufferedLines(
      stdoutRemainder + chunk,
      {
        prefix: params.logPrefix,
        ...(params.onLog ? { onLog: params.onLog } : {}),
      },
    );
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    stderrRemainder = emitBufferedLines(
      stderrRemainder + chunk,
      {
        prefix: params.logPrefix,
        ...(params.onLog ? { onLog: params.onLog } : {}),
      },
    );
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
    if (stdoutRemainder.trim() !== "") {
      params.onLog?.(`[privateclaw-relay] ${params.logPrefix} ${stdoutRemainder.trim()}`);
    }
    if (stderrRemainder.trim() !== "") {
      params.onLog?.(`[privateclaw-relay] ${params.logPrefix} ${stderrRemainder.trim()}`);
    }
    if (code !== 0) {
      const combined = `${stdout}${stderr}`.trim();
      throw new Error(
        `Command \`${formatTunnelCommand(params.plan)}\` exited with ${
          code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`
        }${combined ? `: ${combined}` : "."}`,
      );
    }
    return {
      stdout,
      stderr,
      combined: `${stdout}${stderr}`,
    };
  } catch (error) {
    if (isUnavailableTunnelBinaryError(error)) {
      throw formatMissingBinaryError(
        params.plan.command,
        getMissingBinaryHint(params.plan.command),
      );
    }
    throw error;
  }
}

async function stopPersistentChild(
  child: ChildProcess,
): Promise<void> {
  if (child.exitCode != null) {
    return;
  }
  child.kill("SIGTERM");
  const timer = setTimeout(() => {
    if (child.exitCode == null) {
      child.kill("SIGKILL");
    }
  }, 5_000);
  try {
    await once(child, "exit");
  } finally {
    clearTimeout(timer);
  }
}

export function isRelayTunnelProvider(value: string): value is RelayTunnelProvider {
  return value === "tailscale" || value === "cloudflare";
}

function extractPublicUrls(output: string): string[] {
  const matches = output.match(PUBLIC_URL_PATTERN);
  if (!matches) {
    return [];
  }
  return matches.map((match) => trimTrailingPunctuation(match));
}

export function extractRelayTunnelPublicUrl(output: string): string | undefined {
  return extractPublicUrls(output)[0];
}

export function extractCloudflareQuickTunnelPublicUrl(
  output: string,
): string | undefined {
  for (const candidate of extractPublicUrls(output)) {
    try {
      const hostname = new URL(candidate).hostname;
      if (
        hostname === "trycloudflare.com" ||
        hostname.endsWith(".trycloudflare.com")
      ) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

export function buildRelayTunnelCommand(params: {
  provider: RelayTunnelProvider;
  localPort: number;
  localUrl: string;
}): RelayTunnelCommandPlan {
  if (params.provider === "tailscale") {
    return {
      command: "tailscale",
      args: ["funnel", "--bg", String(params.localPort)],
    };
  }
  return {
    command: "cloudflared",
    args: ["tunnel", "--url", params.localUrl],
  };
}

async function openTailscaleFunnel(
  params: OpenRelayTunnelOptions,
): Promise<RelayTunnelHandle> {
  const statusPlan: RelayTunnelCommandPlan = {
    command: "tailscale",
    args: ["funnel", "status"],
  };
  const previousStatus = await runOneShotCommand({
    plan: statusPlan,
    logPrefix: "[tailscale]",
    ...(params.onLog ? { onLog: params.onLog } : {}),
    ...(params.spawnCommand ? { spawnCommand: params.spawnCommand } : {}),
  }).catch((error) => {
    if (
      error instanceof Error &&
      error.message.includes("Could not find the `tailscale` CLI")
    ) {
      throw error;
    }
    return {
      stdout: "",
      stderr: "",
      combined: "",
    };
  });
  const hadExistingPublicUrl =
    extractRelayTunnelPublicUrl(previousStatus.combined) != null;

  const enablePlan = buildRelayTunnelCommand({
    provider: "tailscale",
    localPort: params.localPort,
    localUrl: params.localUrl,
  });
  const enableResult = await runOneShotCommand({
    plan: enablePlan,
    logPrefix: "[tailscale]",
    ...(params.onLog ? { onLog: params.onLog } : {}),
    ...(params.spawnCommand ? { spawnCommand: params.spawnCommand } : {}),
  }).catch((error) => {
    throw toTailscalePrerequisiteError(error) ?? error;
  });
  const currentStatus = await runOneShotCommand({
    plan: statusPlan,
    logPrefix: "[tailscale]",
    ...(params.onLog ? { onLog: params.onLog } : {}),
    ...(params.spawnCommand ? { spawnCommand: params.spawnCommand } : {}),
  }).catch((error) => {
    throw toTailscalePrerequisiteError(error) ?? error;
  });
  const publicUrl =
    extractRelayTunnelPublicUrl(currentStatus.combined) ??
    extractRelayTunnelPublicUrl(enableResult.combined);

  return {
    kind: "tailscale",
    ...(publicUrl ? { publicUrl } : {}),
    notes: hadExistingPublicUrl
      ? [
          "Tailscale Funnel was already configured before this run, so the CLI will leave that public endpoint in place on shutdown.",
        ]
      : [
          "The CLI will run `tailscale funnel off` on shutdown to remove the public endpoint it created.",
        ],
    close: async () => {
      if (hadExistingPublicUrl) {
        return;
      }
      try {
        await runOneShotCommand({
          plan: {
            command: "tailscale",
            args: ["funnel", "off"],
          },
          logPrefix: "[tailscale]",
          ...(params.onLog ? { onLog: params.onLog } : {}),
          ...(params.spawnCommand ? { spawnCommand: params.spawnCommand } : {}),
        });
      } catch (error) {
        params.onLog?.(
          `[privateclaw-relay] [tailscale] failed to disable Funnel automatically: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  };
}

async function openCloudflareTunnel(
  params: OpenRelayTunnelOptions,
): Promise<RelayTunnelHandle> {
  const spawnCommand = params.spawnCommand ?? spawn;
  const plan = buildRelayTunnelCommand({
    provider: "cloudflare",
    localPort: params.localPort,
    localUrl: params.localUrl,
  });
  const child = spawnCommand(plan.command, plan.args, {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");

  return new Promise<RelayTunnelHandle>((resolve, reject) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let stdoutRemainder = "";
    let stderrRemainder = "";

    const cleanup = () => {
      clearTimeout(timeout);
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
      child.removeAllListeners("error");
      child.removeAllListeners("close");
    };

    const resolveWithUrl = (publicUrl: string | undefined) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve({
        kind: "cloudflare",
        ...(publicUrl ? { publicUrl } : {}),
        notes: [
          "Cloudflare quick tunnels are temporary and use a random trycloudflare.com URL.",
        ],
        close: async () => {
          await stopPersistentChild(child);
        },
      });
    };

    const rejectWithError = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (isUnavailableTunnelBinaryError(error)) {
        reject(
          formatMissingBinaryError(
            "cloudflared",
            getMissingBinaryHint("cloudflared"),
          ),
        );
        return;
      }
      reject(error);
    };

    const handleChunk = (chunk: string, prefix: string, target: "stdout" | "stderr") => {
      if (target === "stdout") {
        stdout += chunk;
        stdoutRemainder = emitBufferedLines(
          stdoutRemainder + chunk,
          {
            prefix,
            ...(params.onLog ? { onLog: params.onLog } : {}),
          },
        );
      } else {
        stderr += chunk;
        stderrRemainder = emitBufferedLines(
          stderrRemainder + chunk,
          {
            prefix,
            ...(params.onLog ? { onLog: params.onLog } : {}),
          },
        );
      }
      const publicUrl = extractCloudflareQuickTunnelPublicUrl(
        `${stdout}${stderr}`,
      );
      if (publicUrl) {
        if (stdoutRemainder.trim() !== "") {
          params.onLog?.(`[privateclaw-relay] ${prefix} ${stdoutRemainder.trim()}`);
        }
        if (stderrRemainder.trim() !== "") {
          params.onLog?.(`[privateclaw-relay] ${prefix} ${stderrRemainder.trim()}`);
        }
        resolveWithUrl(publicUrl);
      }
    };

    child.stdout.on("data", (chunk: string) => {
      handleChunk(chunk, "[cloudflare]", "stdout");
    });
    child.stderr.on("data", (chunk: string) => {
      handleChunk(chunk, "[cloudflare]", "stderr");
    });
    child.once("error", rejectWithError);
    child.once("close", (code, signal) => {
      if (settled) {
        return;
      }
      const combined = `${stdout}${stderr}`.trim();
      rejectWithError(
        new Error(
          `Command \`${formatTunnelCommand(plan)}\` exited with ${
            code == null ? `signal ${signal ?? "unknown"}` : `code ${code}`
          }${combined ? `: ${combined}` : "."}`,
        ),
      );
    });

    const timeout = setTimeout(() => {
      rejectWithError(
        new Error(
          `Timed out waiting for Cloudflare Tunnel to report a public URL after running \`${formatTunnelCommand(plan)}\`.`,
        ),
      );
    }, 30_000);
  });
}

export async function openRelayTunnel(
  params: OpenRelayTunnelOptions,
): Promise<RelayTunnelHandle> {
  if (params.provider === "tailscale") {
    return openTailscaleFunnel(params);
  }
  return openCloudflareTunnel(params);
}
