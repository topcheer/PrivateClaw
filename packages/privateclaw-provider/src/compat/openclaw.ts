export const privateClawConfigSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    relayBaseUrl: {
      type: "string",
      description: "Relay base URL used to derive /ws/provider and /ws/app endpoints.",
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
  isError?: boolean;
  channelData?: Record<string, unknown>;
}

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
  runtime: unknown;
  pluginConfig?: Record<string, unknown>;
  logger: OpenClawPluginLoggerCompat;
  registerChannel?(params: { plugin: unknown }): void;
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
