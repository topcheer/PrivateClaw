import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";
import { EchoBridge } from "./bridges/echo-bridge.js";
import {
  OpenClawAgentBridge,
  type OpenClawAgentBridgeOptions,
} from "./bridges/openclaw-agent-bridge.js";
import { loadAvailableOpenClawCommands } from "./openclaw-command-discovery.js";
import { parsePositiveIntegerFlag, runPairSession } from "./pair-session.js";
import {
  PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
  PRIVATECLAW_QR_IMAGE_MARGIN,
  PRIVATECLAW_QR_PNG_WIDTH,
} from "./qr-options.js";
import { WebhookBridge } from "./bridges/webhook-bridge.js";
import {
  type OpenClawExtensionPluginCompat,
  type OpenClawPluginApiCompat,
  type OpenClawPluginCommandContextCompat,
  type ReplyPayloadCompat,
  privateClawConfigSchema,
} from "./compat/openclaw.js";
import { PrivateClawProvider } from "./provider.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";
import type {
  PrivateClawAgentBridge,
  PrivateClawInviteBundle,
  PrivateClawProviderOptions,
} from "./types.js";

type PrivateClawBridgeMode = "openclaw-agent" | "webhook" | "echo";

type OpenClawThinkingLevel = NonNullable<OpenClawAgentBridgeOptions["thinking"]>;

export interface PrivateClawPluginConfig {
  relayBaseUrl?: string;
  sessionTtlMs?: number;
  welcomeMessage?: string;
  providerLabel?: string;
  webhookUrl?: string;
  webhookToken?: string;
  bridgeMode?: PrivateClawBridgeMode;
  echoPrefix?: string;
  openclawAgentExecutable?: string;
  openclawAgentId?: string;
  openclawAgentChannel?: string;
  openclawAgentLocal?: boolean;
  openclawAgentThinking?: OpenClawThinkingLevel;
  openclawAgentTimeoutSeconds?: number;
}

export interface PrivateClawCommandResult
  extends Pick<PrivateClawInviteBundle, "announcementText" | "inviteUri" | "qrSvg"> {
  qrPngDataUrl?: string;
}

interface ResolvedPrivateClawPluginConfig {
  relayBaseUrl: string;
  bridgeMode: PrivateClawBridgeMode;
  providerLabel: string;
  sessionTtlMs?: number;
  welcomeMessage?: string;
  webhookUrl?: string;
  webhookToken?: string;
  echoPrefix?: string;
  openclawAgentExecutable?: string;
  openclawAgentId?: string;
  openclawAgentChannel?: string;
  openclawAgentLocal?: boolean;
  openclawAgentThinking?: OpenClawThinkingLevel;
  openclawAgentTimeoutSeconds?: number;
}

interface PrivateClawPairCliOptions {
  ttlMs?: string;
  label?: string;
  printOnly?: boolean;
}

const DEFAULT_RELAY_BASE_URL = "ws://127.0.0.1:8787";
const DEFAULT_PROVIDER_LABEL = "PrivateClaw";
const DEFAULT_BRIDGE_MODE: PrivateClawBridgeMode = "openclaw-agent";
const ALLOWED_THINKING_LEVELS = new Set<OpenClawThinkingLevel>([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
]);

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function readNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no" || normalized === "off") {
    return false;
  }

  return undefined;
}

function readBridgeMode(value: unknown): PrivateClawBridgeMode | undefined {
  const normalized = readString(value)?.toLowerCase();
  if (
    normalized === "openclaw-agent" ||
    normalized === "webhook" ||
    normalized === "echo"
  ) {
    return normalized;
  }

  return undefined;
}

function readThinkingLevel(value: unknown): OpenClawThinkingLevel | undefined {
  const normalized = readString(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }

  return ALLOWED_THINKING_LEVELS.has(normalized as OpenClawThinkingLevel)
    ? (normalized as OpenClawThinkingLevel)
    : undefined;
}

function resolvePluginConfig(
  pluginConfig?: Record<string, unknown>,
): ResolvedPrivateClawPluginConfig {
  const relayBaseUrl =
    readString(pluginConfig?.relayBaseUrl) ??
    readString(process.env.PRIVATECLAW_RELAY_BASE_URL) ??
    DEFAULT_RELAY_BASE_URL;

  const sessionTtlMs =
    readNumber(pluginConfig?.sessionTtlMs) ??
    readNumber(process.env.PRIVATECLAW_SESSION_TTL_MS);
  const welcomeMessage =
    readString(pluginConfig?.welcomeMessage) ??
    readString(process.env.PRIVATECLAW_WELCOME_MESSAGE);
  const webhookUrl =
    readString(pluginConfig?.webhookUrl) ??
    readString(process.env.PRIVATECLAW_WEBHOOK_URL);
  const webhookToken =
    readString(pluginConfig?.webhookToken) ??
    readString(process.env.PRIVATECLAW_WEBHOOK_TOKEN);
  const echoPrefix =
    readString(pluginConfig?.echoPrefix) ??
    readString(process.env.PRIVATECLAW_ECHO_PREFIX);
  const openclawAgentExecutable =
    readString(pluginConfig?.openclawAgentExecutable) ??
    readString(process.env.PRIVATECLAW_OPENCLAW_AGENT_BIN);
  const openclawAgentId =
    readString(pluginConfig?.openclawAgentId) ??
    readString(process.env.PRIVATECLAW_OPENCLAW_AGENT_ID);
  const openclawAgentChannel =
    readString(pluginConfig?.openclawAgentChannel) ??
    readString(process.env.PRIVATECLAW_OPENCLAW_AGENT_CHANNEL);
  const openclawAgentLocal =
    readBoolean(pluginConfig?.openclawAgentLocal) ??
    readBoolean(process.env.PRIVATECLAW_OPENCLAW_AGENT_LOCAL);
  const openclawAgentThinking =
    readThinkingLevel(pluginConfig?.openclawAgentThinking) ??
    readThinkingLevel(process.env.PRIVATECLAW_OPENCLAW_AGENT_THINKING);
  const openclawAgentTimeoutSeconds =
    readNumber(pluginConfig?.openclawAgentTimeoutSeconds) ??
    readNumber(process.env.PRIVATECLAW_OPENCLAW_AGENT_TIMEOUT_SECONDS);

  const envBridgeMode =
    readBridgeMode(process.env.PRIVATECLAW_BRIDGE_MODE) ??
    (readBoolean(process.env.PRIVATECLAW_OPENCLAW_AGENT_BRIDGE) === false ? "echo" : undefined);

  const bridgeMode =
    readBridgeMode(pluginConfig?.bridgeMode) ??
    envBridgeMode ??
    (webhookUrl ? "webhook" : DEFAULT_BRIDGE_MODE);

  return {
    relayBaseUrl,
    bridgeMode,
    providerLabel:
      readString(pluginConfig?.providerLabel) ??
      readString(process.env.PRIVATECLAW_PROVIDER_LABEL) ??
      DEFAULT_PROVIDER_LABEL,
    ...(typeof sessionTtlMs === "number" ? { sessionTtlMs } : {}),
    ...(welcomeMessage ? { welcomeMessage } : {}),
    ...(webhookUrl ? { webhookUrl } : {}),
    ...(webhookToken ? { webhookToken } : {}),
    ...(echoPrefix ? { echoPrefix } : {}),
    ...(openclawAgentExecutable ? { openclawAgentExecutable } : {}),
    ...(openclawAgentId ? { openclawAgentId } : {}),
    ...(openclawAgentChannel ? { openclawAgentChannel } : {}),
    ...(typeof openclawAgentLocal === "boolean" ? { openclawAgentLocal } : {}),
    ...(openclawAgentThinking ? { openclawAgentThinking } : {}),
    ...(typeof openclawAgentTimeoutSeconds === "number"
      ? { openclawAgentTimeoutSeconds }
      : {}),
  };
}

function buildBridge(config: ResolvedPrivateClawPluginConfig): PrivateClawAgentBridge {
  if (config.bridgeMode === "webhook") {
    if (!config.webhookUrl) {
      throw new Error(
        "PrivateClaw bridgeMode=webhook requires webhookUrl or PRIVATECLAW_WEBHOOK_URL.",
      );
    }

    return new WebhookBridge({
      endpoint: config.webhookUrl,
      ...(config.webhookToken ? { token: config.webhookToken } : {}),
    });
  }

  if (config.bridgeMode === "echo") {
    return new EchoBridge(config.echoPrefix ?? "PrivateClaw demo");
  }

  return new OpenClawAgentBridge({
    ...(config.openclawAgentExecutable
      ? { executable: config.openclawAgentExecutable }
      : {}),
    ...(config.openclawAgentId ? { agentId: config.openclawAgentId } : {}),
    ...(config.openclawAgentChannel ? { channel: config.openclawAgentChannel } : {}),
    ...(typeof config.openclawAgentLocal === "boolean"
      ? { local: config.openclawAgentLocal }
      : {}),
    ...(config.openclawAgentThinking
      ? { thinking: config.openclawAgentThinking }
      : {}),
    ...(typeof config.openclawAgentTimeoutSeconds === "number"
      ? { timeoutSeconds: config.openclawAgentTimeoutSeconds }
      : {}),
  });
}

function normalizePairCliOptions(raw: unknown): PrivateClawPairCliOptions {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const options = raw as Record<string, unknown>;
  const ttlMs = readString(options.ttlMs);
  const label = readString(options.label);
  return {
    ...(ttlMs ? { ttlMs } : {}),
    ...(label ? { label } : {}),
    ...(typeof options.printOnly === "boolean" ? { printOnly: options.printOnly } : {}),
  };
}

function buildProviderOptions(
  pluginConfig: ResolvedPrivateClawPluginConfig,
  api: Pick<OpenClawPluginApiCompat, "logger">,
): { options: PrivateClawProviderOptions; defaultTtlMs?: number } {
  const relay = resolveRelayEndpoints(pluginConfig.relayBaseUrl);
  return {
    options: {
      providerWsUrl: relay.providerWsUrl,
      appWsUrl: relay.appWsUrl,
      bridge: buildBridge(pluginConfig),
      providerLabel: pluginConfig.providerLabel,
      commandsProvider: async () => {
        try {
          return await loadAvailableOpenClawCommands();
        } catch (error) {
          api.logger.warn(
            `[privateclaw] Failed to discover OpenClaw commands: ${formatCommandError(error)}`,
          );
          return [];
        }
      },
      ...(pluginConfig.welcomeMessage ? { welcomeMessage: pluginConfig.welcomeMessage } : {}),
      onLog: (message) => api.logger.info(`[privateclaw] ${message}`),
    },
    ...(typeof pluginConfig.sessionTtlMs === "number"
      ? { defaultTtlMs: pluginConfig.sessionTtlMs }
      : {}),
  };
}

class PrivateClawPluginRuntime {
  private provider: PrivateClawProvider | undefined;
  private stateDir: string | undefined;

  constructor(
    private readonly providerOptions: PrivateClawProviderOptions,
    private readonly defaultTtlMs?: number,
  ) {}

  setStateDir(stateDir: string): void {
    this.stateDir = stateDir;
  }

  private getMediaDir(): string {
    return path.join(
      this.stateDir ?? process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw"),
      "media",
      "privateclaw",
    );
  }

  private getProvider(): PrivateClawProvider {
    if (!this.provider) {
      this.provider = new PrivateClawProvider(this.providerOptions);
    }

    return this.provider;
  }

  async createInviteBundle(params?: {
    ttlMs?: number;
    label?: string;
  }): Promise<PrivateClawInviteBundle> {
    return this.getProvider().createInviteBundle(
      {
        ...(typeof params?.ttlMs === "number"
          ? { ttlMs: params.ttlMs }
          : typeof this.defaultTtlMs === "number"
            ? { ttlMs: this.defaultTtlMs }
            : {}),
        ...(params?.label ? { label: params.label } : {}),
      },
    );
  }

  async buildCommandReply(bundle: PrivateClawInviteBundle): Promise<ReplyPayloadCompat> {
    const text = `${bundle.announcementText}\n\nOpen invite:\n${bundle.inviteUri}`;
    const qrPngPath = await writeInviteQrPng(bundle, this.getMediaDir());
    return {
      text,
      mediaUrl: qrPngPath,
    };
  }

  async runPairSession(params?: {
    ttlMs?: number;
    label?: string;
    printOnly?: boolean;
    writeLine?: (line: string) => void;
  }): Promise<PrivateClawInviteBundle> {
    return runPairSession({
      provider: this.getProvider(),
      ...(typeof params?.ttlMs === "number" ? { ttlMs: params.ttlMs } : {}),
      ...(params?.label ? { label: params.label } : {}),
      ...(typeof params?.printOnly === "boolean" ? { printOnly: params.printOnly } : {}),
      ...(params?.writeLine ? { writeLine: params.writeLine } : {}),
    });
  }

  async dispose(): Promise<void> {
    if (!this.provider) {
      return;
    }

    await this.provider.dispose();
    this.provider = undefined;
  }
}

async function writeInviteQrPng(
  bundle: PrivateClawInviteBundle,
  mediaDir: string,
): Promise<string> {
  const pngBuffer = await QRCode.toBuffer(bundle.inviteUri, {
    type: "png",
    errorCorrectionLevel: PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
    margin: PRIVATECLAW_QR_IMAGE_MARGIN,
    width: PRIVATECLAW_QR_PNG_WIDTH,
  });
  await mkdir(mediaDir, { recursive: true });
  const qrPath = path.join(mediaDir, `privateclaw-${bundle.invite.sessionId}.png`);
  await writeFile(qrPath, pngBuffer);
  return qrPath;
}

function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createPluginDefinition(
  runtimeFactory: (api: OpenClawPluginApiCompat) => PrivateClawPluginRuntime,
): OpenClawExtensionPluginCompat {
  return {
    id: "privateclaw",
    name: "PrivateClaw",
    description: "Ephemeral end-to-end encrypted private session plugin for OpenClaw.",
    configSchema: privateClawConfigSchema,
    register(api: OpenClawPluginApiCompat) {
      const runtime = runtimeFactory(api);

      api.registerService?.({
        id: "privateclaw-provider",
        start: ({ stateDir }) => {
          runtime.setStateDir(stateDir);
        },
        stop: async () => {
          await runtime.dispose();
        },
      });

      api.registerCommand({
        name: "privateclaw",
        description: "Create a one-time encrypted PrivateClaw session QR code.",
        acceptsArgs: false,
        requireAuth: true,
        handler: async (ctx: OpenClawPluginCommandContextCompat) => {
          try {
            api.logger.info(
              `[privateclaw] /privateclaw invoked via ${ctx.channel}${ctx.senderId ? ` by ${ctx.senderId}` : ""}`,
            );
            const bundle = await runtime.createInviteBundle();
            api.logger.info(
              `[privateclaw] invite created for session ${bundle.invite.sessionId} on ${ctx.channel}`,
            );
            const reply = await runtime.buildCommandReply(bundle);
            api.logger.info(
              `[privateclaw] QR image prepared for session ${bundle.invite.sessionId}`,
            );
            return reply;
          } catch (error) {
            api.logger.error(
              `[privateclaw] Failed to create invite bundle: ${formatCommandError(error)}`,
            );
            return {
              text: `Failed to create a PrivateClaw session: ${formatCommandError(error)}`,
              isError: true,
            };
          }
        },
      });

      api.registerCli?.(
        ({ program }) => {
          const privateclaw = program
            .command("privateclaw")
            .description("PrivateClaw local pairing and session utilities.");

          privateclaw
            .command("pair")
            .description(
              "Start a local PrivateClaw session and render the pairing QR code in the terminal.",
            )
            .option("--ttl-ms <ms>", "Session TTL in milliseconds.")
            .option("--label <label>", "Optional relay session label.")
            .option(
              "--print-only",
              "Print the invite and QR code, then exit immediately.",
            )
            .action(async (rawOptions: unknown) => {
              const options = normalizePairCliOptions(rawOptions);
              const ttlMs = parsePositiveIntegerFlag(options.ttlMs, "--ttl-ms");
              const label = readString(options.label);
              await runtime.runPairSession({
                ...(typeof ttlMs === "number" ? { ttlMs } : {}),
                ...(label ? { label } : {}),
                ...(typeof options.printOnly === "boolean"
                  ? { printOnly: options.printOnly }
                  : {}),
                writeLine: (line) => {
                  console.log(line);
                },
              });
            });
        },
        { commands: ["privateclaw"] },
      );
    },
  };
}

export function createOpenClawCompatiblePlugin(
  options: PrivateClawProviderOptions & { defaultTtlMs?: number },
): OpenClawExtensionPluginCompat {
  return createPluginDefinition(
    () => new PrivateClawPluginRuntime(options, options.defaultTtlMs),
  );
}

export function createPrivateClawPlugin(): OpenClawExtensionPluginCompat {
  return createPluginDefinition((api) => {
    const pluginConfig = resolvePluginConfig(api.pluginConfig);
    const resolved = buildProviderOptions(pluginConfig, api);
    return new PrivateClawPluginRuntime(resolved.options, resolved.defaultTtlMs);
  });
}

const defaultPlugin = createPrivateClawPlugin();

export default defaultPlugin;
