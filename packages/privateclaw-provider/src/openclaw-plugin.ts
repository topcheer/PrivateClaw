import { pathToFileURL } from "node:url";
import { EchoBridge } from "./bridges/echo-bridge.js";
import {
  OpenClawAgentBridge,
  type OpenClawAgentBridgeOptions,
} from "./bridges/openclaw-agent-bridge.js";
import {
  buildPreferredAudioTranscriber,
  resolvePrivateClawSttConfig,
} from "./audio-transcriber.js";
import {
  resolvePrivateClawMediaDir,
  writeInviteQrPng,
} from "./invite-qr-files.js";
import { loadAvailableOpenClawCommands } from "./openclaw-command-discovery.js";
import {
  openInBrowserPreview,
  parsePositiveIntegerFlag,
  printPairInviteBundle,
  renderInviteBundleOutput,
  runPairSession,
} from "./pair-session.js";
import {
  handoffForegroundPairToBackground,
  spawnBackgroundPairDaemon,
} from "./pair-daemon.js";
import { WebhookBridge } from "./bridges/webhook-bridge.js";
import {
  createPrivateClawChannelPlugin,
  PRIVATECLAW_OPENCLAW_ACCOUNT_ID,
  PRIVATECLAW_OPENCLAW_CHANNEL_ID,
} from "./channel.js";
import {
  type OpenClawConfigCompat,
  type OpenClawChannelPluginCompat,
  type OpenClawExtensionPluginCompat,
  type OpenClawMsgContextCompat,
  type OpenClawPluginApiCompat,
  type OpenClawPluginCommandContextCompat,
  type OpenClawPluginRuntimeCompat,
  type ReplyPayloadCompat,
  privateClawConfigSchema,
} from "./compat/openclaw.js";
import { DEFAULT_SESSION_TTL_MS, PrivateClawProvider } from "./provider.js";
import { DEFAULT_RELAY_BASE_URL } from "./relay-defaults.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";
import {
  buildManagedSessionQrLegacyLines,
  followManagedSessionLogFromStateDir,
  buildManagedSessionsReportLines,
  closeManagedSessionsFromStateDir,
  closeManagedSessionFromStateDir,
  deliverManagedSessionOutboundFromStateDir,
  dispatchRoutedAppMessageToPluginServiceFromStateDir,
  getManagedSessionQrBundleFromStateDir,
  isManagedSessionQrLegacyResult,
  kickManagedParticipantFromStateDir,
  listManagedSessionsFromStateDir,
  PrivateClawSessionControlServer,
  resolvePrivateClawStateDir,
  type PrivateClawControlHostKind,
} from "./session-control.js";
import {
  appendPrivateClawAppInstallFooter,
  buildPrivateClawBackgroundDaemonReminder,
  buildPrivateClawCommandErrorMessage,
  formatBilingualInline,
  PRIVATECLAW_CLI_FOREGROUND_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_GROUP_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_KICK_DESCRIPTION,
  PRIVATECLAW_CLI_LABEL_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_NOTIFY_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_OPEN_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_PAIR_DESCRIPTION,
  PRIVATECLAW_CLI_PRINT_ONLY_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_RELAY_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_ROOT_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_FOLLOW_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_KILL_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_KILLALL_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_QR_DESCRIPTION,
  PRIVATECLAW_CLI_TTL_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_VERBOSE_OPTION_DESCRIPTION,
  PRIVATECLAW_COMMAND_DESCRIPTION,
  PRIVATECLAW_INVITE_URI_LABEL,
  PRIVATECLAW_PLUGIN_DESCRIPTION,
  writePrivateClawAppInstallFooter,
} from "./text.js";
import type {
  PrivateClawAgentBridge,
  PrivateClawInviteBundle,
  PrivateClawManagedSession,
  PrivateClawOpenClawOutboundMessage,
  PrivateClawProviderOptions,
  PrivateClawRoutedAppMessage,
  PrivateClawVerboseController,
} from "./types.js";

type PrivateClawBridgeMode = "openclaw-agent" | "webhook" | "echo";

type OpenClawThinkingLevel = NonNullable<OpenClawAgentBridgeOptions["thinking"]>;

export interface PrivateClawPluginConfig {
  relayBaseUrl?: string;
  sessionTtlMs?: number;
  welcomeMessage?: string;
  botMode?: boolean;
  botModeSilentJoinDelayMs?: number;
  botModeIdleDelayMs?: number;
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
  botMode?: boolean;
  botModeSilentJoinDelayMs?: number;
  botModeIdleDelayMs?: number;
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
  relay?: string;
  printOnly?: boolean;
  group?: boolean;
  open?: boolean;
  foreground?: boolean;
  verbose?: boolean;
}

interface PrivateClawSessionsQrCliOptions {
  open?: boolean;
  notify?: boolean;
}

const DEFAULT_PROVIDER_LABEL = "PrivateClaw";
const DEFAULT_BRIDGE_MODE: PrivateClawBridgeMode = "openclaw-agent";
const DEFAULT_OPENCLAW_AGENT_CHANNEL = "privateclaw";
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
  const text = !channelRequiresInlineImageReply(params.channel)
    ? baseText
    : `${baseText}\n\n<qqimg>${params.qrImagePath}</qqimg>`;

  // QQ command replies expand images from inline <qqimg> tags instead of mediaUrl payloads.
  return appendPrivateClawAppInstallFooter(text);
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
  const botMode =
    readBoolean(pluginConfig?.botMode) ??
    readBoolean(process.env.PRIVATECLAW_BOT_MODE);
  const botModeSilentJoinDelayMs =
    readNumber(pluginConfig?.botModeSilentJoinDelayMs) ??
    readNumber(process.env.PRIVATECLAW_BOT_MODE_SILENT_JOIN_DELAY_MS);
  const botModeIdleDelayMs =
    readNumber(pluginConfig?.botModeIdleDelayMs) ??
    readNumber(process.env.PRIVATECLAW_BOT_MODE_IDLE_DELAY_MS);
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
    readString(process.env.PRIVATECLAW_OPENCLAW_AGENT_CHANNEL) ??
    DEFAULT_OPENCLAW_AGENT_CHANNEL;
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
    ...(typeof botMode === "boolean" ? { botMode } : {}),
    ...(typeof botModeSilentJoinDelayMs === "number"
      ? { botModeSilentJoinDelayMs }
      : {}),
    ...(typeof botModeIdleDelayMs === "number" ? { botModeIdleDelayMs } : {}),
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
  verboseController?: PrivateClawVerboseController,
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
    ...(verboseController ? { verboseController } : {}),
    ...(onLog ? { onLog } : {}),
  });
}

function buildProviderAudioTranscriber(params: {
  rootConfig?: unknown;
  onLog?: (message: string) => void;
  env?: NodeJS.ProcessEnv;
}) {
  return buildPreferredAudioTranscriber({
    rootConfig: params.rootConfig,
    ...(params.env ? { env: params.env } : {}),
    ...(params.onLog ? { onLog: params.onLog } : {}),
  });
}

function buildDirectAudioTranscriberEnv(rootConfig?: unknown): NodeJS.ProcessEnv | undefined {
  const sttConfig = resolvePrivateClawSttConfig({ rootConfig });
  if (!sttConfig) {
    return undefined;
  }
  return {
    PRIVATECLAW_STT_BASE_URL: sttConfig.baseUrl,
    PRIVATECLAW_STT_MODEL: sttConfig.model,
    ...(sttConfig.apiKey ? { PRIVATECLAW_STT_API_KEY: sttConfig.apiKey } : {}),
    ...(sttConfig.headers
      ? { PRIVATECLAW_STT_HEADERS: JSON.stringify(sttConfig.headers) }
      : {}),
  };
}

function normalizePairCliOptions(raw: unknown): PrivateClawPairCliOptions {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const options = raw as Record<string, unknown>;
  const ttlMs = readString(options.ttlMs);
  const label = readString(options.label);
  const relay = readString(options.relay);
  return {
    ...(ttlMs ? { ttlMs } : {}),
    ...(label ? { label } : {}),
    ...(relay ? { relay } : {}),
    ...(typeof options.printOnly === "boolean" ? { printOnly: options.printOnly } : {}),
    ...(typeof options.group === "boolean" ? { group: options.group } : {}),
    ...(typeof options.open === "boolean" ? { open: options.open } : {}),
    ...(typeof options.foreground === "boolean"
      ? { foreground: options.foreground }
      : {}),
    ...(typeof options.verbose === "boolean" ? { verbose: options.verbose } : {}),
  };
}

function normalizeSessionsQrCliOptions(
  raw: unknown,
): PrivateClawSessionsQrCliOptions {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const options = raw as Record<string, unknown>;
  return {
    ...(typeof options.open === "boolean" ? { open: options.open } : {}),
    ...(typeof options.notify === "boolean" ? { notify: options.notify } : {}),
  };
}

function parsePrivateClawCommandArgs(raw: string | undefined): {
  groupMode?: boolean;
  relayBaseUrl?: string;
} {
  const normalizedArgs = (raw ?? "")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token !== "");
  let groupMode = false;
  let relayBaseUrl: string | undefined;

  for (let index = 0; index < normalizedArgs.length; index += 1) {
    const token = normalizedArgs[index];
    if (!token) {
      continue;
    }
    const normalized = token.toLowerCase();
    if (normalized === "group" || normalized === "--group" || normalized === "-g") {
      groupMode = true;
      continue;
    }

    if (normalized === "--relay" || normalized === "-r") {
      const nextToken = normalizedArgs[index + 1]?.trim();
      if (!nextToken) {
        throw new Error(
          formatBilingualInline(
            "`/privateclaw --relay` 后面需要提供 relay URL。",
            "`/privateclaw --relay` requires a relay URL.",
          ),
        );
      }
      relayBaseUrl = nextToken;
      index += 1;
      continue;
    }

    const equalsIndex = token.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = token.slice(0, equalsIndex).toLowerCase();
    if (key !== "relay" && key !== "--relay" && key !== "-r") {
      continue;
    }
    const value = token.slice(equalsIndex + 1).trim();
    if (!value) {
      throw new Error(
        formatBilingualInline(
          "`relay=` 后面需要提供 relay URL。",
          "`relay=` requires a relay URL.",
        ),
      );
    }
    relayBaseUrl = value;
  }

  return {
    ...(groupMode ? { groupMode: true } : {}),
    ...(relayBaseUrl ? { relayBaseUrl } : {}),
  };
}

function inferRelayBaseUrlFromAppWsUrl(appWsUrl: string): string {
  try {
    const url = new URL(appWsUrl);
    url.pathname = "/";
    url.search = "";
    url.hash = "";
    return url.origin;
  } catch {
    return DEFAULT_RELAY_BASE_URL;
  }
}

function mergeDaemonEnvForRelay(
  baseEnv: NodeJS.ProcessEnv | undefined,
  relayBaseUrl?: string,
): NodeJS.ProcessEnv | undefined {
  if (!baseEnv) {
    return undefined;
  }
  const normalizedRelayBaseUrl = readString(relayBaseUrl);
  if (!normalizedRelayBaseUrl) {
    return baseEnv;
  }
  return {
    ...baseEnv,
    PRIVATECLAW_RELAY_BASE_URL: normalizedRelayBaseUrl,
  };
}

function buildProviderOptions(
  pluginConfig: ResolvedPrivateClawPluginConfig,
  api: Pick<OpenClawPluginApiCompat, "logger">,
): {
  options: PrivateClawProviderOptions;
  defaultTtlMs?: number;
  verboseController: PrivateClawVerboseController;
} {
  const relay = resolveRelayEndpoints(pluginConfig.relayBaseUrl);
  const log = (message: string) => api.logger.info(`[privateclaw] ${message}`);
  const verboseController = { enabled: false } satisfies PrivateClawVerboseController;
  return {
    options: {
      providerWsUrl: relay.providerWsUrl,
      appWsUrl: relay.appWsUrl,
      bridge: buildBridge(pluginConfig, log, verboseController),
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
      ...(typeof pluginConfig.botMode === "boolean"
        ? { botMode: pluginConfig.botMode }
        : {}),
      ...(typeof pluginConfig.botModeSilentJoinDelayMs === "number"
        ? { botModeSilentJoinDelayMs: pluginConfig.botModeSilentJoinDelayMs }
        : {}),
      ...(typeof pluginConfig.botModeIdleDelayMs === "number"
        ? { botModeIdleDelayMs: pluginConfig.botModeIdleDelayMs }
        : {}),
      verboseController,
      onLog: log,
    },
    ...(typeof pluginConfig.sessionTtlMs === "number"
      ? { defaultTtlMs: pluginConfig.sessionTtlMs }
      : {}),
    verboseController,
  };
}

function buildDaemonEnvFromPluginConfig(
  pluginConfig: ResolvedPrivateClawPluginConfig,
): NodeJS.ProcessEnv {
  return {
    PRIVATECLAW_RELAY_BASE_URL: pluginConfig.relayBaseUrl,
    PRIVATECLAW_BRIDGE_MODE: pluginConfig.bridgeMode,
    PRIVATECLAW_PROVIDER_LABEL: pluginConfig.providerLabel,
    ...(typeof pluginConfig.sessionTtlMs === "number"
      ? { PRIVATECLAW_SESSION_TTL_MS: String(pluginConfig.sessionTtlMs) }
      : {}),
    ...(pluginConfig.welcomeMessage
      ? { PRIVATECLAW_WELCOME_MESSAGE: pluginConfig.welcomeMessage }
      : {}),
    ...(typeof pluginConfig.botMode === "boolean"
      ? {
          PRIVATECLAW_BOT_MODE: pluginConfig.botMode ? "true" : "false",
        }
      : {}),
    ...(typeof pluginConfig.botModeSilentJoinDelayMs === "number"
      ? {
          PRIVATECLAW_BOT_MODE_SILENT_JOIN_DELAY_MS: String(
            pluginConfig.botModeSilentJoinDelayMs,
          ),
        }
      : {}),
    ...(typeof pluginConfig.botModeIdleDelayMs === "number"
      ? {
          PRIVATECLAW_BOT_MODE_IDLE_DELAY_MS: String(pluginConfig.botModeIdleDelayMs),
        }
      : {}),
    ...(pluginConfig.webhookUrl
      ? { PRIVATECLAW_WEBHOOK_URL: pluginConfig.webhookUrl }
      : {}),
    ...(pluginConfig.webhookToken
      ? { PRIVATECLAW_WEBHOOK_TOKEN: pluginConfig.webhookToken }
      : {}),
    ...(pluginConfig.echoPrefix
      ? { PRIVATECLAW_ECHO_PREFIX: pluginConfig.echoPrefix }
      : {}),
    ...(pluginConfig.openclawAgentExecutable
      ? { PRIVATECLAW_OPENCLAW_AGENT_BIN: pluginConfig.openclawAgentExecutable }
      : {}),
    ...(pluginConfig.openclawAgentId
      ? { PRIVATECLAW_OPENCLAW_AGENT_ID: pluginConfig.openclawAgentId }
      : {}),
    ...(pluginConfig.openclawAgentChannel
      ? { PRIVATECLAW_OPENCLAW_AGENT_CHANNEL: pluginConfig.openclawAgentChannel }
      : {}),
    ...(typeof pluginConfig.openclawAgentLocal === "boolean"
      ? {
          PRIVATECLAW_OPENCLAW_AGENT_LOCAL: pluginConfig.openclawAgentLocal
            ? "true"
            : "false",
        }
      : {}),
    ...(pluginConfig.openclawAgentThinking
      ? { PRIVATECLAW_OPENCLAW_AGENT_THINKING: pluginConfig.openclawAgentThinking }
      : {}),
    ...(typeof pluginConfig.openclawAgentTimeoutSeconds === "number"
      ? {
          PRIVATECLAW_OPENCLAW_AGENT_TIMEOUT_SECONDS: String(
            pluginConfig.openclawAgentTimeoutSeconds,
          ),
        }
      : {}),
  };
}

function isOpenClawPluginRuntimeCompatible(
  runtime: unknown,
): runtime is OpenClawPluginRuntimeCompat {
  if (!runtime || typeof runtime !== "object") {
    return false;
  }
  const channel = (runtime as { channel?: Record<string, unknown> }).channel;
  const reply =
    channel && typeof channel === "object"
      ? (channel.reply as Record<string, unknown> | undefined)
      : undefined;
  const routing =
    channel && typeof channel === "object"
      ? (channel.routing as Record<string, unknown> | undefined)
      : undefined;
  const session =
    channel && typeof channel === "object"
      ? (channel.session as Record<string, unknown> | undefined)
      : undefined;
  return (
    typeof reply?.dispatchReplyWithBufferedBlockDispatcher === "function" &&
    typeof reply.finalizeInboundContext === "function" &&
    typeof routing?.resolveAgentRoute === "function" &&
    typeof session?.resolveStorePath === "function" &&
    typeof session.recordInboundSession === "function"
  );
}

function buildBasePrivateClawInboundContext(
  message: PrivateClawRoutedAppMessage,
): OpenClawMsgContextCompat {
  const rawText = readString(message.payload.text) ?? "";
  const senderId =
    readString(message.participant?.appId) ??
    readString(message.payload.appId) ??
    message.sessionId;
  const senderName =
    readString(message.participant?.displayName) ??
    readString(message.payload.displayName) ??
    "PrivateClaw user";
  return {
    Body: rawText,
    BodyForAgent:
      message.groupMode && message.participant
        ? `${message.participant.displayName}: ${rawText}`
        : rawText,
    RawBody: rawText,
    CommandBody: rawText,
    BodyForCommands: rawText,
    From: `${PRIVATECLAW_OPENCLAW_CHANNEL_ID}:${senderId}`,
    To: message.sessionId,
    AccountId: PRIVATECLAW_OPENCLAW_ACCOUNT_ID,
    MessageSid: message.payload.clientMessageId,
    MessageSidFull: message.payload.clientMessageId,
    Timestamp: Number.isNaN(Date.parse(message.payload.sentAt))
      ? Date.now()
      : Date.parse(message.payload.sentAt),
    ChatType: message.groupMode ? "group" : "direct",
    ConversationLabel: readString(message.sessionLabel) ?? "PrivateClaw",
    SenderId: senderId,
    SenderName: senderName,
    Provider: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
    Surface: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
    CommandAuthorized: true,
    NativeChannelId: message.sessionId,
    OriginatingChannel: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
    OriginatingTo: message.sessionId,
    ExplicitDeliverRoute: true,
  };
}

function readConfiguredSessionStorePath(
  cfg: OpenClawConfigCompat,
): string | undefined {
  const rawStore = (cfg as { session?: { store?: unknown } }).session?.store;
  return readString(rawStore);
}

class PrivateClawPluginRuntime {
  private readonly providerEntries = new Map<
    string,
    {
      provider?: PrivateClawProvider;
      providerOptions: PrivateClawProviderOptions;
    }
  >();
  private stateDir: string | undefined;
  private rootConfig: unknown;
  private controlServer: PrivateClawSessionControlServer | undefined;
  private readonly defaultRelayBaseUrl: string;
  private readonly verboseController: PrivateClawVerboseController | undefined;
  private openClawRuntime: OpenClawPluginRuntimeCompat | undefined;
  private readonly channelPlugin: OpenClawChannelPluginCompat;

  constructor(
    private readonly providerOptions: PrivateClawProviderOptions,
    private readonly defaultTtlMs: number = DEFAULT_SESSION_TTL_MS,
    private readonly daemonEnv?: NodeJS.ProcessEnv,
    defaultRelayBaseUrl?: string,
    verboseController?: PrivateClawVerboseController,
  ) {
    this.defaultRelayBaseUrl =
      readString(defaultRelayBaseUrl) ??
      inferRelayBaseUrlFromAppWsUrl(providerOptions.appWsUrl);
    this.verboseController = verboseController ?? providerOptions.verboseController;
    this.channelPlugin = createPrivateClawChannelPlugin({
      deliverOutboundMessage: async (sessionId, payload) => {
        await this.deliverOpenClawOutboundMessage(sessionId, payload);
      },
    });
  }

  private async withVerboseLogging<T>(
    verbose: boolean | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!verbose || !this.verboseController) {
      return action();
    }
    const previous = this.verboseController.enabled;
    this.verboseController.enabled = true;
    try {
      return await action();
    } finally {
      this.verboseController.enabled = previous;
    }
  }

  setStateDir(stateDir: string): void {
    this.stateDir = stateDir;
  }

  setRootConfig(config: unknown): void {
    this.rootConfig = config;
  }

  setOpenClawRuntime(runtime: unknown): void {
    this.openClawRuntime = isOpenClawPluginRuntimeCompatible(runtime)
      ? runtime
      : undefined;
  }

  getChannelPlugin(): OpenClawChannelPluginCompat {
    return this.channelPlugin;
  }

  private ensureStateDir(): string {
    this.stateDir = resolvePrivateClawStateDir(this.stateDir);
    return this.stateDir;
  }

  private getMediaDir(): string {
    return resolvePrivateClawMediaDir(this.ensureStateDir());
  }

  private resolveRelayBaseUrl(relayBaseUrl?: string): string {
    return readString(relayBaseUrl) ?? this.defaultRelayBaseUrl;
  }

  private getProviderEntry(relayBaseUrl?: string): {
    provider?: PrivateClawProvider;
    providerOptions: PrivateClawProviderOptions;
  } {
    const resolvedRelayBaseUrl = this.resolveRelayBaseUrl(relayBaseUrl);
    let entry = this.providerEntries.get(resolvedRelayBaseUrl);
    if (!entry) {
      const relay = resolveRelayEndpoints(resolvedRelayBaseUrl);
      const audioTranscriber =
        this.providerOptions.audioTranscriber ??
        buildProviderAudioTranscriber({
          rootConfig: this.rootConfig,
          ...(this.providerOptions.onLog
            ? { onLog: this.providerOptions.onLog }
            : {}),
        });
      entry = {
        providerOptions: {
          ...this.providerOptions,
          providerWsUrl: relay.providerWsUrl,
          appWsUrl: relay.appWsUrl,
          appMessageRouter: async (message) =>
            this.routeOrForwardAppMessage(message),
          ...(audioTranscriber ? { audioTranscriber } : {}),
        },
      };
      this.providerEntries.set(resolvedRelayBaseUrl, entry);
    }
    return entry;
  }

  private getProvider(relayBaseUrl?: string): PrivateClawProvider {
    const entry = this.getProviderEntry(relayBaseUrl);
    if (!entry.provider) {
      entry.provider = new PrivateClawProvider(entry.providerOptions);
    }

    return entry.provider;
  }

  private findLocalProviderBySession(
    sessionId: string,
  ): PrivateClawProvider | undefined {
    for (const entry of this.providerEntries.values()) {
      if (entry.provider?.hasManagedSession(sessionId)) {
        return entry.provider;
      }
    }
    return undefined;
  }

  private async deliverOpenClawOutboundMessage(
    sessionId: string,
    payload: PrivateClawOpenClawOutboundMessage,
  ): Promise<void> {
    const provider = this.findLocalProviderBySession(sessionId);
    if (provider) {
      await provider.deliverOpenClawOutboundMessage(sessionId, payload);
      return;
    }
    await deliverManagedSessionOutboundFromStateDir({
      stateDir: this.ensureStateDir(),
      sessionId,
      payload,
    });
  }

  private async routeAppMessageToOpenClaw(
    message: PrivateClawRoutedAppMessage,
  ): Promise<void> {
    const runtime = this.openClawRuntime?.channel;
    if (!runtime) {
      throw new Error(
        "The active PrivateClaw host does not expose OpenClaw channel runtime helpers.",
      );
    }
    const cfg = (this.rootConfig ?? {}) as OpenClawConfigCompat;
    const baseCtx = buildBasePrivateClawInboundContext(message);
    const route = runtime.routing.resolveAgentRoute({
      cfg,
      ctx: baseCtx,
    });
    const finalizedCtx = runtime.reply.finalizeInboundContext(
      {
        ...baseCtx,
        SessionKey: route.sessionKey,
        ...(route.mainSessionKey !== route.sessionKey
          ? { ParentSessionKey: route.mainSessionKey }
          : {}),
      },
      {
        forceBodyForAgent: true,
        forceBodyForCommands: true,
        forceChatType: true,
        forceConversationLabel: true,
      },
    );
    const storePath = runtime.session.resolveStorePath(
      readConfiguredSessionStorePath(cfg),
      {
        agentId: route.agentId,
      },
    );
    await runtime.session.recordInboundSession({
      storePath,
      sessionKey: route.sessionKey,
      ctx: finalizedCtx,
      createIfMissing: true,
      updateLastRoute: {
        sessionKey:
          route.lastRoutePolicy === "main"
            ? route.mainSessionKey
            : route.sessionKey,
        channel: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
        to: message.sessionId,
        accountId: PRIVATECLAW_OPENCLAW_ACCOUNT_ID,
      },
      onRecordError: (error) => {
        this.providerOptions.onLog?.(
          `[privateclaw] runtime_session_record_error session=${message.sessionId} message=${formatCommandError(error)}`,
        );
      },
    });
    await runtime.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: finalizedCtx,
      cfg,
      dispatcherOptions: {
        deliver: async (payload) => {
          const replyToId =
            typeof payload.replyToId === "string" && payload.replyToId.trim() !== ""
              ? payload.replyToId
              : message.payload.clientMessageId;
          await this.deliverOpenClawOutboundMessage(message.sessionId, {
            ...(payload.text?.trim() ? { text: payload.text.trim() } : {}),
            ...(payload.mediaUrl?.trim()
              ? { mediaUrl: payload.mediaUrl.trim() }
              : {}),
            ...(payload.mediaUrls?.length
              ? { mediaUrls: payload.mediaUrls }
              : {}),
            replyToId,
          });
        },
        onError: (error, info) => {
          this.providerOptions.onLog?.(
            `[privateclaw] runtime_dispatch_error kind=${info.kind} message=${formatCommandError(error)}`,
          );
        },
      },
    });
  }

  private async routeOrForwardAppMessage(
    message: PrivateClawRoutedAppMessage,
  ): Promise<boolean> {
    if (this.openClawRuntime?.channel) {
      await this.routeAppMessageToOpenClaw(message);
      return true;
    }
    try {
      await dispatchRoutedAppMessageToPluginServiceFromStateDir({
        stateDir: this.ensureStateDir(),
        message,
      });
      return true;
    } catch (error) {
      this.providerOptions.onLog?.(
        `[privateclaw] runtime routing unavailable, falling back to bridge for ${message.sessionId}: ${formatCommandError(error)}`,
      );
      return false;
    }
  }

  private listLocalManagedSessions(): PrivateClawManagedSession[] {
    return [...this.providerEntries.values()].flatMap((entry) =>
      entry.provider?.listManagedSessions() ?? [],
    );
  }

  private async kickLocalManagedParticipant(
    sessionId: string,
    appId: string,
    reason = "participant_removed",
  ) {
    for (const entry of this.providerEntries.values()) {
      const provider = entry.provider;
      if (!provider) {
        continue;
      }
      if (
        provider
          .listManagedSessions()
          .some((session) => session.sessionId === sessionId)
      ) {
        return provider.kickGroupParticipant(sessionId, appId, reason);
      }
    }
    throw new Error(`Unknown PrivateClaw session: ${sessionId}`);
  }

  private async getLocalManagedSessionQrBundle(
    sessionId: string,
    params?: { notifyParticipants?: boolean },
  ): Promise<PrivateClawInviteBundle> {
    for (const entry of this.providerEntries.values()) {
      const provider = entry.provider;
      if (!provider) {
        continue;
      }
      if (
        provider
          .listManagedSessions()
          .some((session) => session.sessionId === sessionId)
      ) {
        return provider.getSessionQrBundle(sessionId, params);
      }
    }
    throw new Error(`Unknown PrivateClaw session: ${sessionId}`);
  }

  private async closeLocalManagedSession(
    sessionId: string,
    reason = "operator_terminated",
  ): Promise<PrivateClawManagedSession> {
    for (const entry of this.providerEntries.values()) {
      const provider = entry.provider;
      if (!provider) {
        continue;
      }
      if (
        provider
          .listManagedSessions()
          .some((session) => session.sessionId === sessionId)
      ) {
        return provider.closeManagedSession(sessionId, reason);
      }
    }
    throw new Error(`Unknown PrivateClaw session: ${sessionId}`);
  }

  private async ensureControlServer(
    kind: PrivateClawControlHostKind,
  ): Promise<void> {
    if (this.controlServer) {
      return;
    }
    this.controlServer = new PrivateClawSessionControlServer({
      provider: {
        listManagedSessions: () => this.listLocalManagedSessions(),
        getSessionQrBundle: (sessionId, params) =>
          this.getLocalManagedSessionQrBundle(sessionId, params),
        closeManagedSession: (sessionId, reason) =>
          this.closeLocalManagedSession(sessionId, reason),
        kickGroupParticipant: (sessionId, appId, reason) =>
          this.kickLocalManagedParticipant(sessionId, appId, reason),
        deliverOpenClawOutboundMessage: (sessionId, payload) =>
          this.deliverOpenClawOutboundMessage(sessionId, payload),
        routeAppMessageToOpenClaw: (message) =>
          this.routeAppMessageToOpenClaw(message),
      },
      stateDir: this.ensureStateDir(),
      kind,
      ...(this.providerOptions.onLog
        ? { onLog: this.providerOptions.onLog }
        : {}),
    });
    await this.controlServer.start();
  }

  async ensurePluginServiceControl(): Promise<void> {
    await this.ensureControlServer("plugin-service");
  }

  async createInviteBundle(params?: {
    ttlMs?: number;
    label?: string;
    groupMode?: boolean;
    relayBaseUrl?: string;
  }): Promise<PrivateClawInviteBundle> {
    await this.ensurePluginServiceControl();
    return this.getProvider(params?.relayBaseUrl).createInviteBundle(
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

  async runBackgroundPairSession(params?: {
    ttlMs?: number;
    label?: string;
    groupMode?: boolean;
    relayBaseUrl?: string;
    openInBrowser?: boolean;
    verbose?: boolean;
    writeLine?: (line: string) => void;
  }): Promise<PrivateClawInviteBundle> {
    if (!this.daemonEnv) {
      throw new Error(
        formatBilingualInline(
          "当前运行时无法安全地转入后台，请改用 --foreground。",
          "This runtime cannot safely move into the background. Use --foreground instead.",
        ),
      );
    }
    const daemonEnv = mergeDaemonEnvForRelay(
      {
        ...this.daemonEnv,
        ...buildDirectAudioTranscriberEnv(this.rootConfig),
      },
      params?.relayBaseUrl,
    );

    const bundle = await spawnBackgroundPairDaemon({
      cliModuleUrl: new URL(
        import.meta.url.endsWith(".ts") ? "./cli.ts" : "./cli.js",
        import.meta.url,
      ).href,
      stateDir: this.ensureStateDir(),
      ...(daemonEnv ? { env: daemonEnv } : {}),
      ...(typeof params?.ttlMs === "number" ? { ttlMs: params.ttlMs } : {}),
      ...(params?.label ? { label: params.label } : {}),
      ...(params?.groupMode === true ? { groupMode: true } : {}),
      ...(params?.openInBrowser === true ? { openInBrowser: true } : {}),
      ...(params?.verbose === true ? { verbose: true } : {}),
    });
    printPairInviteBundle(bundle, params?.writeLine ?? ((line) => console.log(line)));
    (params?.writeLine ?? ((line: string) => console.log(line)))(
      buildPrivateClawBackgroundDaemonReminder(
        "openclaw privateclaw",
        bundle.invite.sessionId,
      ),
    );
    writePrivateClawAppInstallFooter(
      params?.writeLine ?? ((line: string) => console.log(line)),
    );
    return bundle;
  }

  async runPairSession(params?: {
    ttlMs?: number;
    label?: string;
    printOnly?: boolean;
    groupMode?: boolean;
    relayBaseUrl?: string;
    foreground?: boolean;
    openInBrowser?: boolean;
    verbose?: boolean;
    writeLine?: (line: string) => void;
  }): Promise<PrivateClawInviteBundle> {
    return this.withVerboseLogging(params?.verbose, async () => {
      if (!params?.printOnly) {
        await this.ensureControlServer("pair-foreground");
      }
      const provider = this.getProvider(params?.relayBaseUrl);
      const handoffEnv = mergeDaemonEnvForRelay(
        {
          ...this.daemonEnv,
          ...buildDirectAudioTranscriberEnv(this.rootConfig),
        },
        params?.relayBaseUrl,
      );
      return runPairSession({
        provider,
        ...(typeof params?.ttlMs === "number"
          ? { ttlMs: params.ttlMs }
          : { ttlMs: this.defaultTtlMs }),
        ...(params?.label ? { label: params.label } : {}),
        ...(typeof params?.printOnly === "boolean" ? { printOnly: params.printOnly } : {}),
        ...(params?.groupMode === true ? { groupMode: true } : {}),
        ...(typeof params?.foreground === "boolean"
          ? { foreground: params.foreground }
          : {}),
        ...(typeof params?.openInBrowser === "boolean"
          ? { openInBrowser: params.openInBrowser }
          : {}),
        qrMediaDir: this.getMediaDir(),
        ...(this.daemonEnv && !params?.printOnly
          ? {
              handoffToBackground: async () => {
                provider.suppressReconnectsForHandoff();
                try {
                    await handoffForegroundPairToBackground({
                      cliModuleUrl: new URL(
                        import.meta.url.endsWith(".ts") ? "./cli.ts" : "./cli.js",
                        import.meta.url,
                      ).href,
                      stateDir: this.ensureStateDir(),
                      ...(handoffEnv ? { env: handoffEnv } : {}),
                      ...(params?.verbose === true ? { verbose: true } : {}),
                      handoffState: provider.exportHandoffState(),
                    });
                    return formatBilingualInline(
                      "当前 PrivateClaw 会话已转入后台。可使用 `openclaw privateclaw sessions` 查看，必要时用 `openclaw privateclaw sessions kill <sessionId>` 终止。",
                      "The current PrivateClaw session is now running in the background. Use `openclaw privateclaw sessions` to inspect it, and `openclaw privateclaw sessions kill <sessionId>` if you need to terminate it.",
                    );
                } catch (error) {
                  provider.resumeReconnectsAfterHandoffFailure();
                  throw error;
                }
              },
            }
          : {}),
        ...(params?.writeLine ? { writeLine: params.writeLine } : {}),
      });
    });
  }

  async listManagedSessions() {
    return listManagedSessionsFromStateDir(this.ensureStateDir());
  }

  async followManagedSessionLog(
    sessionId: string,
    params?: { writeLine?: (line: string) => void },
  ) {
    await followManagedSessionLogFromStateDir({
      stateDir: this.ensureStateDir(),
      sessionId,
      ...(params?.writeLine ? { writeLine: params.writeLine } : {}),
    });
  }

  async kickManagedParticipant(sessionId: string, appId: string) {
    return kickManagedParticipantFromStateDir({
      stateDir: this.ensureStateDir(),
      sessionId,
      appId,
      reason: "participant_removed",
    });
  }

  async closeManagedSession(sessionId: string) {
    return closeManagedSessionFromStateDir({
      stateDir: this.ensureStateDir(),
      sessionId,
      reason: "operator_terminated",
    });
  }

  async closeBackgroundManagedSessions() {
    return closeManagedSessionsFromStateDir({
      stateDir: this.ensureStateDir(),
      hostKinds: ["pair-daemon"],
      reason: "operator_terminated_all",
    });
  }

  async printManagedSessionQr(
    sessionId: string,
    params?: {
      notifyParticipants?: boolean;
      openInBrowser?: boolean;
      writeLine?: (line: string) => void;
    },
  ) {
    const result = await getManagedSessionQrBundleFromStateDir({
      stateDir: this.ensureStateDir(),
      sessionId,
      ...(params?.notifyParticipants ? { notifyParticipants: true } : {}),
    });
    if (isManagedSessionQrLegacyResult(result)) {
      for (const line of buildManagedSessionQrLegacyLines({
        result,
        ...(params?.notifyParticipants ? { notifyParticipants: true } : {}),
      })) {
        (params?.writeLine ?? ((line: string) => console.log(line)))(line);
      }
      if (params?.openInBrowser) {
        await openInBrowserPreview(pathToFileURL(result.legacyPngPath).href);
      }
      return result;
    }
    const bundle = await renderInviteBundleOutput(result.bundle, {
      qrMediaDir: this.getMediaDir(),
      ...(params?.openInBrowser ? { openInBrowser: true } : {}),
      includeFooter: false,
      ...(params?.writeLine ? { writeLine: params.writeLine } : {}),
    });
    return {
      ...result,
      bundle,
    };
  }

  async dispose(): Promise<void> {
    if (this.controlServer) {
      await this.controlServer.stop();
      this.controlServer = undefined;
    }
    const providers = [...this.providerEntries.values()]
      .map((entry) => entry.provider)
      .filter((provider): provider is PrivateClawProvider => provider != null);
    this.providerEntries.clear();
    for (const provider of providers) {
      await provider.dispose();
    }
  }
}

function formatCommandError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatCommandErrorWithFooter(error: unknown): string {
  return appendPrivateClawAppInstallFooter(formatCommandError(error));
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
      runtime.setOpenClawRuntime(api.runtime);

      api.registerService?.({
        id: "privateclaw-provider",
        start: async ({ stateDir, config }) => {
          runtime.setStateDir(stateDir);
          runtime.setRootConfig(config);
          await runtime.ensurePluginServiceControl();
        },
        stop: async () => {
          await runtime.dispose();
        },
      });

      api.registerChannel?.({
        plugin: runtime.getChannelPlugin(),
      });

      api.registerCommand({
        name: "privateclaw",
        description: PRIVATECLAW_COMMAND_DESCRIPTION,
        acceptsArgs: true,
        requireAuth: true,
        handler: async (ctx: OpenClawPluginCommandContextCompat) => {
          try {
            runtime.setRootConfig(ctx.config);
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
        ({ program, config }) => {
          runtime.setRootConfig(config);
          const privateclaw = program
            .command("privateclaw")
            .description(PRIVATECLAW_CLI_ROOT_DESCRIPTION);

          privateclaw
            .command("pair")
            .description(PRIVATECLAW_CLI_PAIR_DESCRIPTION)
              .option("--ttl-ms <ms>", PRIVATECLAW_CLI_TTL_OPTION_DESCRIPTION)
              .option("--label <label>", PRIVATECLAW_CLI_LABEL_OPTION_DESCRIPTION)
              .option("-r, --relay <url>", PRIVATECLAW_CLI_RELAY_OPTION_DESCRIPTION)
              .option("--group", PRIVATECLAW_CLI_GROUP_OPTION_DESCRIPTION)
              .option("--print-only", PRIVATECLAW_CLI_PRINT_ONLY_OPTION_DESCRIPTION)
              .option("--open", PRIVATECLAW_CLI_OPEN_OPTION_DESCRIPTION)
              .option("--foreground", PRIVATECLAW_CLI_FOREGROUND_OPTION_DESCRIPTION)
              .option("--verbose", PRIVATECLAW_CLI_VERBOSE_OPTION_DESCRIPTION)
              .action(async (rawOptions: unknown) => {
                const options = normalizePairCliOptions(rawOptions);
                const ttlMs = parsePositiveIntegerFlag(options.ttlMs, "--ttl-ms");
                const label = readString(options.label);
                const relayBaseUrl = readString(options.relay);
                const pairParams = {
                  ...(typeof ttlMs === "number" ? { ttlMs } : {}),
                  ...(label ? { label } : {}),
                  ...(relayBaseUrl ? { relayBaseUrl } : {}),
                  ...(options.group ? { groupMode: true } : {}),
                  ...(typeof options.printOnly === "boolean"
                    ? { printOnly: options.printOnly }
                    : {}),
                  ...(typeof options.open === "boolean"
                  ? { openInBrowser: options.open }
                  : {}),
                ...(typeof options.verbose === "boolean"
                  ? { verbose: options.verbose }
                  : {}),
                writeLine: (line: string) => {
                  console.log(line);
                },
              };
              if (options.printOnly || options.foreground) {
                await runtime.runPairSession({
                  ...pairParams,
                  foreground: true,
                });
                return;
              }
              await runtime.runBackgroundPairSession(pairParams);
            });

          const sessions = privateclaw
            .command("sessions")
            .description(PRIVATECLAW_CLI_SESSIONS_DESCRIPTION)
            .action(async () => {
              const listings = await runtime.listManagedSessions();
              for (const line of buildManagedSessionsReportLines(listings)) {
                console.log(line);
              }
            });

          sessions
            .command("follow")
            .description(PRIVATECLAW_CLI_SESSIONS_FOLLOW_DESCRIPTION)
            .argument("<sessionId>")
            .action(async (sessionIdRaw: unknown) => {
              try {
                const sessionId = readString(sessionIdRaw);
                if (!sessionId) {
                  throw new Error(
                    formatBilingualInline(
                      "`sessions follow` 需要提供 sessionId。",
                      "`sessions follow` requires a sessionId.",
                    ),
                  );
                }
                await runtime.followManagedSessionLog(sessionId, {
                  writeLine: (line: string) => {
                    console.log(line);
                  },
                });
              } catch (error) {
                console.error(formatCommandErrorWithFooter(error));
                process.exitCode = 1;
              }
            });

          sessions
            .command("qr")
            .description(PRIVATECLAW_CLI_SESSIONS_QR_DESCRIPTION)
            .argument("<sessionId>")
            .option("--open", PRIVATECLAW_CLI_OPEN_OPTION_DESCRIPTION)
            .option("--notify", PRIVATECLAW_CLI_NOTIFY_OPTION_DESCRIPTION)
            .action(async (sessionIdRaw: unknown, rawOptions: unknown) => {
              try {
                const writeLine = (line: string) => {
                  console.log(line);
                };
                const sessionId = readString(sessionIdRaw);
                if (!sessionId) {
                  throw new Error(
                    formatBilingualInline(
                      "`sessions qr` 需要提供 sessionId。",
                      "`sessions qr` requires a sessionId.",
                    ),
                  );
                }
                const options = normalizeSessionsQrCliOptions(rawOptions);
                const result = await runtime.printManagedSessionQr(sessionId, {
                  ...(options.notify ? { notifyParticipants: true } : {}),
                  ...(options.open ? { openInBrowser: true } : {}),
                  writeLine,
                });
                if (options.notify && !isManagedSessionQrLegacyResult(result)) {
                  console.log(
                    formatBilingualInline(
                      `已向会话 ${result.session.sessionId} 中的 ${result.session.participantCount} 位参与者推送二维码。`,
                      `Sent the QR code to ${result.session.participantCount} participant(s) in session ${result.session.sessionId}.`,
                    ),
                  );
                } else if (options.notify && isManagedSessionQrLegacyResult(result)) {
                  process.exitCode = 1;
                }
                if (!isManagedSessionQrLegacyResult(result)) {
                  writePrivateClawAppInstallFooter(writeLine);
                }
              } catch (error) {
                console.error(formatCommandErrorWithFooter(error));
                process.exitCode = 1;
              }
            });

          sessions
            .command("kill")
            .description(PRIVATECLAW_CLI_SESSIONS_KILL_DESCRIPTION)
            .argument("<sessionId>")
            .action(async (sessionIdRaw: unknown) => {
              try {
                const sessionId = readString(sessionIdRaw);
                if (!sessionId) {
                  throw new Error(
                    formatBilingualInline(
                      "`sessions kill` 需要提供 sessionId。",
                      "`sessions kill` requires a sessionId.",
                    ),
                  );
                }
                const result = await runtime.closeManagedSession(sessionId);
                console.log(
                  result.terminatedHost
                    ? formatBilingualInline(
                        `会话 ${result.session.sessionId} 已通过终止 legacy host ${result.host.kind}#${result.host.pid} 停止。`,
                        `Session ${result.session.sessionId} was stopped by terminating the legacy host ${result.host.kind}#${result.host.pid}.`,
                      )
                    : formatBilingualInline(
                        `会话 ${result.session.sessionId} 已终止。`,
                        `Session ${result.session.sessionId} has been terminated.`,
                      ),
                );
                writePrivateClawAppInstallFooter((line) => console.log(line));
              } catch (error) {
                console.error(formatCommandErrorWithFooter(error));
                process.exitCode = 1;
              }
            });

          sessions
            .command("killall")
            .description(PRIVATECLAW_CLI_SESSIONS_KILLALL_DESCRIPTION)
            .action(async () => {
              try {
                const result = await runtime.closeBackgroundManagedSessions();
                if (result.closed.length === 0 && result.failed.length === 0) {
                  console.log(
                    formatBilingualInline(
                      "当前没有需要终止的后台 daemon 会话。",
                      "There are no background daemon sessions to terminate.",
                    ),
                  );
                  writePrivateClawAppInstallFooter((line) => console.log(line));
                  return;
                }
                if (result.closed.length > 0) {
                  console.log(
                    formatBilingualInline(
                      `已终止 ${result.closed.length} 个后台 daemon 会话。`,
                      `Terminated ${result.closed.length} background daemon session(s).`,
                    ),
                  );
                  for (const item of result.closed) {
                    console.log(
                      item.terminatedHost
                        ? formatBilingualInline(
                            `- ${item.session.sessionId}：已通过终止 legacy host ${item.host.kind}#${item.host.pid} 停止。`,
                            `- ${item.session.sessionId}: stopped by terminating the legacy host ${item.host.kind}#${item.host.pid}.`,
                          )
                        : formatBilingualInline(
                            `- ${item.session.sessionId}：已终止。`,
                            `- ${item.session.sessionId}: terminated.`,
                          ),
                    );
                  }
                }
                if (result.failed.length > 0) {
                  console.error(
                    formatBilingualInline(
                      `${result.failed.length} 个后台 daemon 会话终止失败。`,
                      `${result.failed.length} background daemon session(s) failed to terminate.`,
                    ),
                  );
                  for (const item of result.failed) {
                    console.error(
                      formatBilingualInline(
                        `- ${item.session.sessionId}（${item.host.kind}#${item.host.pid}）：${item.error}`,
                        `- ${item.session.sessionId} (${item.host.kind}#${item.host.pid}): ${item.error}`,
                      ),
                    );
                  }
                  process.exitCode = 1;
                }
                writePrivateClawAppInstallFooter((line) => console.log(line));
              } catch (error) {
                console.error(formatCommandErrorWithFooter(error));
                process.exitCode = 1;
              }
            });

          privateclaw
            .command("kick")
            .description(PRIVATECLAW_CLI_KICK_DESCRIPTION)
            .argument("<sessionId>")
            .argument("<appId>")
            .action(async (sessionIdRaw: unknown, appIdRaw: unknown) => {
              const sessionId = readString(sessionIdRaw);
              const appId = readString(appIdRaw);
              if (!sessionId || !appId) {
                throw new Error(
                  formatBilingualInline(
                    "kick 需要提供 sessionId 和 appId。",
                    "kick requires both a sessionId and appId.",
                  ),
                );
              }
              const result = await runtime.kickManagedParticipant(sessionId, appId);
              console.log(
                formatBilingualInline(
                  `已从会话 ${result.session.sessionId} 中移除 ${result.participant.displayName} (${result.participant.appId})。`,
                  `Removed ${result.participant.displayName} (${result.participant.appId}) from session ${result.session.sessionId}.`,
                ),
              );
              writePrivateClawAppInstallFooter((line) => console.log(line));
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
    () =>
      new PrivateClawPluginRuntime(
        options,
        options.defaultTtlMs,
        undefined,
        inferRelayBaseUrlFromAppWsUrl(options.appWsUrl),
        options.verboseController,
      ),
  );
}

export function createPrivateClawPlugin(): OpenClawExtensionPluginCompat {
  return createPluginDefinition((api) => {
    const pluginConfig = resolvePluginConfig(api.pluginConfig);
    const resolved = buildProviderOptions(pluginConfig, api);
    return new PrivateClawPluginRuntime(
      resolved.options,
      resolved.defaultTtlMs,
      buildDaemonEnvFromPluginConfig(pluginConfig),
      pluginConfig.relayBaseUrl,
      resolved.verboseController,
    );
  });
}

const defaultPlugin = createPrivateClawPlugin();

export default defaultPlugin;
