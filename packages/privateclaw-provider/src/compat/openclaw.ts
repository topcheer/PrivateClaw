import { DEFAULT_RELAY_BASE_URL } from "../relay-defaults.js";

export const privateClawConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    relayBaseUrl: {
      type: "string",
      description: `Relay base URL used to derive /ws/provider and /ws/app endpoints. Defaults to ${DEFAULT_RELAY_BASE_URL}.`,
      default: DEFAULT_RELAY_BASE_URL,
    },
    sessionTtlMs: {
      type: "number",
      description: "Lifetime of a one-time PrivateClaw session in milliseconds.",
      minimum: 1000,
    },
    welcomeMessage: {
      type: "string",
      description: "Encrypted welcome message sent to the client after handshake.",
    },
    botMode: {
      type: "boolean",
      description:
        "Enable proactive bot-mode group replies: greet silent joiners after 10 minutes and re-engage quiet groups after 20 minutes.",
    },
    botModeSilentJoinDelayMs: {
      type: "number",
      description: "Optional override for the silent-join proactive greeting delay in milliseconds.",
      minimum: 0,
    },
    botModeIdleDelayMs: {
      type: "number",
      description: "Optional override for the quiet-group proactive re-engagement delay in milliseconds.",
      minimum: 0,
    },
    providerLabel: {
      type: "string",
      description: "Label rendered into the invite payload and QR metadata.",
    },
    webhookUrl: {
      type: "string",
      description: "Optional upstream bridge endpoint that converts user messages into OpenClaw replies.",
    },
    webhookToken: {
      type: "string",
      description: "Optional bearer token sent with the webhook bridge.",
    },
    bridgeMode: {
      type: "string",
      enum: ["openclaw-agent", "webhook", "echo"],
      description: "Which upstream bridge the plugin should use for PrivateClaw sessions.",
    },
    echoPrefix: {
      type: "string",
      description: "Prefix used when bridgeMode is set to echo.",
    },
    openclawAgentExecutable: {
      type: "string",
      description: "Optional executable path used for the OpenClaw agent bridge.",
    },
    openclawAgentId: {
      type: "string",
      description: "Optional OpenClaw agent id forwarded to `openclaw agent`.",
    },
    openclawAgentChannel: {
      type: "string",
      description: "Optional OpenClaw channel id forwarded to `openclaw agent`.",
      default: "privateclaw",
    },
    openclawAgentLocal: {
      type: "boolean",
      description: "Whether the OpenClaw agent bridge should pass --local.",
    },
    openclawAgentThinking: {
      type: "string",
      enum: ["off", "minimal", "low", "medium", "high"],
      description: "Optional thinking level for `openclaw agent`.",
    },
    openclawAgentTimeoutSeconds: {
      type: "number",
      description: "Optional timeout in seconds for `openclaw agent` invocations.",
      minimum: 0,
    },
  },
} as const;

export interface ReplyPayloadCompat {
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  replyToId?: string | null;
  isError?: boolean;
  channelData?: Record<string, unknown>;
}

export type OpenClawConfigCompat = Record<string, unknown>;

export interface OpenClawPluginCommandContextCompat {
  senderId?: string;
  channel: string;
  channelId?: string;
  isAuthorizedSender: boolean;
  args?: string;
  commandBody: string;
  config: unknown;
  from?: string;
  to?: string;
  accountId?: string;
  messageThreadId?: number;
}

export interface OpenClawPluginCommandDefinitionCompat {
  name: string;
  nativeNames?: Partial<Record<string, string>> & { default?: string };
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  handler(
    ctx: OpenClawPluginCommandContextCompat,
  ): Promise<ReplyPayloadCompat> | ReplyPayloadCompat;
}

export interface OpenClawPluginLoggerCompat {
  debug?(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface OpenClawMsgContextCompat {
  Body?: string;
  BodyForAgent?: string;
  RawBody?: string;
  CommandBody?: string;
  BodyForCommands?: string;
  From?: string;
  To?: string;
  SessionKey?: string;
  ParentSessionKey?: string;
  AccountId?: string;
  MessageSid?: string;
  MessageSidFull?: string;
  ReplyToId?: string | null;
  Timestamp?: number;
  ChatType?: string;
  ConversationLabel?: string;
  SenderName?: string;
  SenderId?: string;
  Provider?: string;
  Surface?: string;
  CommandAuthorized?: boolean;
  MessageThreadId?: string | number;
  NativeChannelId?: string;
  OriginatingChannel?: string;
  OriginatingTo?: string;
  ExplicitDeliverRoute?: boolean;
}

export interface OpenClawFinalizedMsgContextCompat
  extends Omit<OpenClawMsgContextCompat, "CommandAuthorized"> {
  CommandAuthorized: boolean;
}

export interface OpenClawResolvedAgentRouteCompat {
  agentId: string;
  sessionKey: string;
  mainSessionKey: string;
  lastRoutePolicy?: "main" | "current" | string;
}

export interface OpenClawReplyDispatchInfoCompat {
  kind: "tool" | "block" | "final";
}

export interface OpenClawReplyDispatcherOptionsCompat {
  deliver(
    payload: ReplyPayloadCompat,
    info: OpenClawReplyDispatchInfoCompat,
  ): Promise<void>;
  onError?(error: unknown, info: OpenClawReplyDispatchInfoCompat): void;
  onSkip?(
    payload: ReplyPayloadCompat,
    info: OpenClawReplyDispatchInfoCompat & { reason: string },
  ): void;
}

export interface OpenClawPluginRuntimeChannelCompat {
  reply: {
    finalizeInboundContext<T extends Record<string, unknown>>(
      ctx: T,
      opts?: {
        forceBodyForAgent?: boolean;
        forceBodyForCommands?: boolean;
        forceChatType?: boolean;
        forceConversationLabel?: boolean;
      },
    ): T & OpenClawFinalizedMsgContextCompat;
    dispatchReplyWithBufferedBlockDispatcher(params: {
      ctx: OpenClawMsgContextCompat | OpenClawFinalizedMsgContextCompat;
      cfg: OpenClawConfigCompat;
      dispatcherOptions: OpenClawReplyDispatcherOptionsCompat;
      replyOptions?: Record<string, unknown>;
    }): Promise<unknown>;
  };
  routing: {
    resolveAgentRoute(params: {
      cfg: OpenClawConfigCompat;
      ctx: OpenClawMsgContextCompat | OpenClawFinalizedMsgContextCompat;
      agentId?: string;
    }): OpenClawResolvedAgentRouteCompat;
  };
  session: {
    resolveStorePath(
      store?: string,
      opts?: {
        agentId?: string;
        env?: NodeJS.ProcessEnv;
      },
    ): string;
    recordInboundSession(params: {
      storePath: string;
      sessionKey: string;
      ctx: OpenClawMsgContextCompat | OpenClawFinalizedMsgContextCompat;
      groupResolution?: unknown;
      createIfMissing?: boolean;
      updateLastRoute?: {
        sessionKey: string;
        channel?: string;
        to: string;
        accountId?: string;
        threadId?: string | number;
      };
      onRecordError(error: unknown): void;
    }): Promise<void> | void;
    updateLastRoute?(params: {
      storePath: string;
      sessionKey: string;
      channel?: string;
      to?: string;
      accountId?: string;
      threadId?: string | number;
      deliveryContext?: {
        channel?: string;
        to?: string;
        accountId?: string;
        threadId?: string | number;
      };
      ctx?: OpenClawMsgContextCompat | OpenClawFinalizedMsgContextCompat;
      groupResolution?: unknown;
    }): Promise<void> | void;
  };
}

export interface OpenClawPluginRuntimeCompat {
  channel?: OpenClawPluginRuntimeChannelCompat;
}

export interface OpenClawChannelMetaCompat {
  id: string;
  label: string;
  selectionLabel: string;
  docsPath: string;
  blurb: string;
  docsLabel?: string;
  order?: number;
  aliases?: string[];
  selectionDocsPrefix?: string;
  selectionDocsOmitLabel?: boolean;
  selectionExtras?: string[];
  detailLabel?: string;
  systemImage?: string;
  showConfigured?: boolean;
  quickstartAllowFrom?: boolean;
  forceAccountBinding?: boolean;
  preferSessionLookupForAnnounceTarget?: boolean;
  preferOver?: string[];
}

export interface OpenClawChannelCapabilitiesCompat {
  chatTypes: Array<"direct" | "group" | "thread">;
  polls?: boolean;
  reactions?: boolean;
  edit?: boolean;
  unsend?: boolean;
  reply?: boolean;
  effects?: boolean;
  groupManagement?: boolean;
  threads?: boolean;
  media?: boolean;
  nativeCommands?: boolean;
  blockStreaming?: boolean;
}

export interface OpenClawChannelAccountSnapshotCompat {
  accountId: string;
  name?: string;
  enabled?: boolean;
  configured?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
}

export interface OpenClawChannelConfigAdapterCompat<ResolvedAccount = unknown> {
  listAccountIds(cfg: OpenClawConfigCompat): string[];
  resolveAccount(
    cfg: OpenClawConfigCompat,
    accountId?: string | null,
  ): ResolvedAccount;
  inspectAccount?(
    cfg: OpenClawConfigCompat,
    accountId?: string | null,
  ): unknown;
  defaultAccountId?(cfg: OpenClawConfigCompat): string;
  isEnabled?(
    account: ResolvedAccount,
    cfg: OpenClawConfigCompat,
  ): boolean;
  isConfigured?(
    account: ResolvedAccount,
    cfg: OpenClawConfigCompat,
  ): boolean | Promise<boolean>;
  describeAccount?(
    account: ResolvedAccount,
    cfg: OpenClawConfigCompat,
  ): OpenClawChannelAccountSnapshotCompat;
  resolveAllowFrom?(params: {
    cfg: OpenClawConfigCompat;
    accountId?: string | null;
  }): Array<string | number> | undefined;
  resolveDefaultTo?(params: {
    cfg: OpenClawConfigCompat;
    accountId?: string | null;
  }): string | undefined;
}

export interface OpenClawOutboundDeliveryResultCompat {
  channel: string;
  messageId: string;
  chatId?: string;
  channelId?: string;
  roomId?: string;
  conversationId?: string;
  timestamp?: number;
  toJid?: string;
  pollId?: string;
  meta?: Record<string, unknown>;
}

export interface OpenClawChannelOutboundContextCompat {
  cfg: OpenClawConfigCompat;
  to: string;
  text: string;
  mediaUrl?: string;
  mediaLocalRoots?: readonly string[];
  gifPlayback?: boolean;
  replyToId?: string | null;
  threadId?: string | number | null;
  accountId?: string | null;
  identity?: unknown;
  deps?: unknown;
  silent?: boolean;
}

export interface OpenClawChannelOutboundPayloadContextCompat
  extends OpenClawChannelOutboundContextCompat {
  payload: ReplyPayloadCompat;
}

export interface OpenClawChannelOutboundAdapterCompat {
  deliveryMode: "direct" | "gateway" | "hybrid";
  sendPayload?(
    ctx: OpenClawChannelOutboundPayloadContextCompat,
  ): Promise<OpenClawOutboundDeliveryResultCompat>;
  sendText?(
    ctx: OpenClawChannelOutboundContextCompat,
  ): Promise<OpenClawOutboundDeliveryResultCompat>;
  sendMedia?(
    ctx: OpenClawChannelOutboundContextCompat,
  ): Promise<OpenClawOutboundDeliveryResultCompat>;
}

export interface OpenClawChannelThreadingAdapterCompat {
  resolveReplyToMode?(params: {
    cfg: OpenClawConfigCompat;
    accountId?: string | null;
    chatType?: string | null;
  }): "off" | "first" | "all";
}

export interface OpenClawChannelPluginCompat<ResolvedAccount = unknown> {
  id: string;
  meta: OpenClawChannelMetaCompat;
  capabilities: OpenClawChannelCapabilitiesCompat;
  config: OpenClawChannelConfigAdapterCompat<ResolvedAccount>;
  outbound?: OpenClawChannelOutboundAdapterCompat;
  threading?: OpenClawChannelThreadingAdapterCompat;
  commands?: {
    skipWhenConfigEmpty?: boolean;
  };
}

export interface OpenClawPluginServiceCompat {
  id: string;
  start(params: {
    config: unknown;
    workspaceDir?: string;
    stateDir: string;
    logger: OpenClawPluginLoggerCompat;
  }): Promise<void> | void;
  stop?(params: {
    config: unknown;
    workspaceDir?: string;
    stateDir: string;
    logger: OpenClawPluginLoggerCompat;
  }): Promise<void> | void;
}

export interface OpenClawCliCommandCompat {
  command(name: string): OpenClawCliCommandCompat;
  description(text: string): OpenClawCliCommandCompat;
  argument(spec: string): OpenClawCliCommandCompat;
  option(
    flags: string,
    description?: string,
    defaultValue?: string | boolean,
  ): OpenClawCliCommandCompat;
  action(handler: (...args: unknown[]) => void | Promise<void>): OpenClawCliCommandCompat;
}

export interface OpenClawPluginCliContextCompat {
  program: OpenClawCliCommandCompat;
  config: unknown;
  workspaceDir?: string;
  logger: OpenClawPluginLoggerCompat;
}

export type OpenClawPluginCliRegistrarCompat = (
  ctx: OpenClawPluginCliContextCompat,
) => Promise<void> | void;

export interface OpenClawPluginApiCompat {
  runtime: OpenClawPluginRuntimeCompat | unknown;
  pluginConfig?: Record<string, unknown>;
  logger: OpenClawPluginLoggerCompat;
  registerChannel?(params: { plugin: OpenClawChannelPluginCompat | unknown }): void;
  registerCommand(command: OpenClawPluginCommandDefinitionCompat): void;
  registerCli?(
    registrar: OpenClawPluginCliRegistrarCompat,
    opts?: { commands?: string[] },
  ): void;
  registerService?(service: OpenClawPluginServiceCompat): void;
}

export interface OpenClawExtensionPluginCompat {
  id: string;
  name: string;
  description: string;
  configSchema: typeof privateClawConfigSchema;
  register(api: OpenClawPluginApiCompat): void;
}
