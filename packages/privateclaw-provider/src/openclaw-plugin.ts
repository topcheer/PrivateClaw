import { EchoBridge } from "./bridges/echo-bridge.js";
import {
  OpenClawAgentBridge,
  type OpenClawAgentBridgeOptions,
} from "./bridges/openclaw-agent-bridge.js";
import {
  resolvePrivateClawMediaDir,
  writeInviteQrPng,
} from "./invite-qr-files.js";
import { loadAvailableOpenClawCommands } from "./openclaw-command-discovery.js";
import { parsePositiveIntegerFlag, runPairSession } from "./pair-session.js";
import { WebhookBridge } from "./bridges/webhook-bridge.js";
import {
  type OpenClawExtensionPluginCompat,
  type OpenClawPluginApiCompat,
  type OpenClawPluginCommandContextCompat,
  type ReplyPayloadCompat,
  privateClawConfigSchema,
} from "./compat/openclaw.js";
import { DEFAULT_SESSION_TTL_MS, PrivateClawProvider } from "./provider.js";
import { DEFAULT_RELAY_BASE_URL } from "./relay-defaults.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";
import {
  buildPrivateClawCommandErrorMessage,
  PRIVATECLAW_CLI_GROUP_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_LABEL_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_OPEN_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_PAIR_DESCRIPTION,
  PRIVATECLAW_CLI_PRINT_ONLY_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_ROOT_DESCRIPTION,
  PRIVATECLAW_CLI_TTL_OPTION_DESCRIPTION,
  PRIVATECLAW_COMMAND_DESCRIPTION,
  PRIVATECLAW_INVITE_URI_LABEL,
  PRIVATECLAW_PLUGIN_DESCRIPTION,
} from "./text.js";
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
  group?: boolean;
  open?: boolean;
}

const DEFAULT_PROVIDER_LABEL = "PrivateClaw";
const DEFAULT_BRIDGE_MODE: PrivateClawBridgeMode = "openclaw-agent";
const QQ_INLINE_IMAGE_REPLY_CHANNELS = new Set(["qqbot", "qq", "qqguild", "qq-guild"]);
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

function channelRequiresInlineImageReply(channel?: string): boolean {
  const normalized = readString(channel)?.toLowerCase();
  return normalized != null && QQ_INLINE_IMAGE_REPLY_CHANNELS.has(normalized);
}

function buildCommandReplyText(params: {
  announcementText: string;
  inviteUri: string;
  channel: string | undefined;
  qrImagePath: string;
}): string {
  const baseText =
    `${params.announcementText}\n\n${PRIVATECLAW_INVITE_URI_LABEL}:\n${params.inviteUri}`;
  if (!channelRequiresInlineImageReply(params.channel)) {
    return baseText;
  }

  // QQ command replies expand images from inline <qqimg> tags instead of mediaUrl payloads.
  return `${baseText}\n\n<qqimg>${params.qrImagePath}</qqimg>`;
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
    readNumber(process.env.PRIVATECLAW_SESSION_TTL_MS) ??
    DEFAULT_SESSION_TTL_MS;
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

function buildBridge(
  config: ResolvedPrivateClawPluginConfig,
  onLog?: (message: string) => void,
): PrivateClawAgentBridge {
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
    ...(onLog ? { onLog } : {}),
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
    ...(typeof options.group === "boolean" ? { group: options.group } : {}),
    ...(typeof options.open === "boolean" ? { open: options.open } : {}),
  };
}

function parsePrivateClawCommandArgs(raw: string | undefined): {
  groupMode?: boolean;
} {
  const normalizedArgs = (raw ?? "")
    .split(/\s+/)
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "");
  return normalizedArgs.some(
    (token) => token === "group" || token === "--group" || token === "-g",
  )
    ? { groupMode: true }
    : {};
}

function buildProviderOptions(
  pluginConfig: ResolvedPrivateClawPluginConfig,
  api: Pick<OpenClawPluginApiCompat, "logger">,
): { options: PrivateClawProviderOptions; defaultTtlMs?: number } {
  const relay = resolveRelayEndpoints(pluginConfig.relayBaseUrl);
  const log = (message: string) => api.logger.info(`[privateclaw] ${message}`);
  return {
    options: {
      providerWsUrl: relay.providerWsUrl,
      appWsUrl: relay.appWsUrl,
      bridge: buildBridge(pluginConfig, log),
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
      onLog: log,
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
    private readonly defaultTtlMs: number = DEFAULT_SESSION_TTL_MS,
  ) {}

  setStateDir(stateDir: string): void {
    this.stateDir = stateDir;
  }

  private getMediaDir(): string {
    return resolvePrivateClawMediaDir(this.stateDir);
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
    groupMode?: boolean;
  }): Promise<PrivateClawInviteBundle> {
    return this.getProvider().createInviteBundle(
      {
        ...(typeof params?.ttlMs === "number"
          ? { ttlMs: params.ttlMs }
          : typeof this.defaultTtlMs === "number"
            ? { ttlMs: this.defaultTtlMs }
            : {}),
        ...(params?.label ? { label: params.label } : {}),
        ...(params?.groupMode === true ? { groupMode: true } : {}),
      },
    );
  }

  async buildCommandReply(
    bundle: PrivateClawInviteBundle,
    channel?: string,
  ): Promise<ReplyPayloadCompat> {
    const qrPng = await writeInviteQrPng(bundle, this.getMediaDir());
    const text = buildCommandReplyText({
      announcementText: bundle.announcementText,
      inviteUri: bundle.inviteUri,
      channel,
      qrImagePath: qrPng.pngPath,
    });
    if (channelRequiresInlineImageReply(channel)) {
      return { text };
    }

    return {
      text,
      mediaUrl: process.platform === "win32" ? qrPng.pngFileUrl : qrPng.pngPath,
    };
  }

  async runPairSession(params?: {
    ttlMs?: number;
    label?: string;
    printOnly?: boolean;
    groupMode?: boolean;
    openInBrowser?: boolean;
    writeLine?: (line: string) => void;
  }): Promise<PrivateClawInviteBundle> {
    return runPairSession({
      provider: this.getProvider(),
      ...(typeof params?.ttlMs === "number"
        ? { ttlMs: params.ttlMs }
        : { ttlMs: this.defaultTtlMs }),
      ...(params?.label ? { label: params.label } : {}),
      ...(typeof params?.printOnly === "boolean" ? { printOnly: params.printOnly } : {}),
      ...(params?.groupMode === true ? { groupMode: true } : {}),
      ...(typeof params?.openInBrowser === "boolean"
        ? { openInBrowser: params.openInBrowser }
        : {}),
      qrMediaDir: this.getMediaDir(),
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

function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createPluginDefinition(
  runtimeFactory: (api: OpenClawPluginApiCompat) => PrivateClawPluginRuntime,
): OpenClawExtensionPluginCompat {
  return {
    id: "privateclaw",
    name: "PrivateClaw",
    description: PRIVATECLAW_PLUGIN_DESCRIPTION,
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
        description: PRIVATECLAW_COMMAND_DESCRIPTION,
        acceptsArgs: true,
        requireAuth: true,
        handler: async (ctx: OpenClawPluginCommandContextCompat) => {
          try {
            api.logger.info(
              `[privateclaw] /privateclaw invoked via ${ctx.channel}${ctx.senderId ? ` by ${ctx.senderId}` : ""}`,
            );
            const bundle = await runtime.createInviteBundle(
              parsePrivateClawCommandArgs(ctx.args),
            );
            api.logger.info(
              `[privateclaw] invite created for session ${bundle.invite.sessionId} on ${ctx.channel}`,
            );
            const reply = await runtime.buildCommandReply(bundle, ctx.channel);
            api.logger.info(
              `[privateclaw] QR image prepared for session ${bundle.invite.sessionId}`,
            );
            return reply;
          } catch (error) {
            api.logger.error(
              `[privateclaw] Failed to create invite bundle: ${formatCommandError(error)}`,
            );
            return {
              text: buildPrivateClawCommandErrorMessage(formatCommandError(error)),
              isError: true,
            };
          }
        },
      });

      api.registerCli?.(
        ({ program }) => {
          const privateclaw = program
            .command("privateclaw")
            .description(PRIVATECLAW_CLI_ROOT_DESCRIPTION);

          privateclaw
            .command("pair")
            .description(PRIVATECLAW_CLI_PAIR_DESCRIPTION)
            .option("--ttl-ms <ms>", PRIVATECLAW_CLI_TTL_OPTION_DESCRIPTION)
            .option("--label <label>", PRIVATECLAW_CLI_LABEL_OPTION_DESCRIPTION)
            .option("--group", PRIVATECLAW_CLI_GROUP_OPTION_DESCRIPTION)
            .option("--print-only", PRIVATECLAW_CLI_PRINT_ONLY_OPTION_DESCRIPTION)
            .option("--open", PRIVATECLAW_CLI_OPEN_OPTION_DESCRIPTION)
            .action(async (rawOptions: unknown) => {
              const options = normalizePairCliOptions(rawOptions);
              const ttlMs = parsePositiveIntegerFlag(options.ttlMs, "--ttl-ms");
              const label = readString(options.label);
              await runtime.runPairSession({
                ...(typeof ttlMs === "number" ? { ttlMs } : {}),
                ...(label ? { label } : {}),
                ...(options.group ? { groupMode: true } : {}),
                ...(typeof options.printOnly === "boolean"
                  ? { printOnly: options.printOnly }
                  : {}),
                ...(typeof options.open === "boolean"
                  ? { openInBrowser: options.open }
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
