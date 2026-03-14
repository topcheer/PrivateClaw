import type {
  PrivateClawAttachment,
  PrivateClawInvite,
  PrivateClawParticipant,
  PrivateClawSlashCommand,
} from "@privateclaw/protocol";

export interface PrivateClawConversationTurn {
  messageId: string;
  role: "user" | "assistant" | "system";
  text: string;
  sentAt: string;
  appId?: string;
  participantLabel?: string;
  replyTo?: string;
  severity?: "info" | "error";
  attachments?: PrivateClawAttachment[];
}

export type BridgeMessage =
  | string
  | {
      text: string;
      attachments?: PrivateClawAttachment[];
    };

export interface BridgeResponseEnvelope {
  messages: BridgeMessage[];
  data?: unknown;
}

export type BridgeResponse = string | BridgeResponseEnvelope;

export interface PrivateClawAgentBridge {
  handleUserMessage(params: {
    sessionId: string;
    invite: PrivateClawInvite;
    message: string;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
    history: ReadonlyArray<PrivateClawConversationTurn>;
  }): Promise<BridgeResponse>;
}

export interface PrivateClawProviderOptions {
  providerWsUrl: string;
  appWsUrl: string;
  bridge: PrivateClawAgentBridge;
  defaultTtlMs?: number;
  providerLabel?: string;
  welcomeMessage?: string;
  commandsProvider?: () => Promise<PrivateClawSlashCommand[]>;
  onLog?: (message: string) => void;
}

export interface ProviderParticipantState extends PrivateClawParticipant {
  lastSeenAt: string;
}

export interface PrivateClawInviteBundle {
  invite: PrivateClawInvite;
  inviteUri: string;
  qrSvg: string;
  qrTerminal: string;
  announcementText: string;
  qrPngPath?: string;
}

export interface ProviderSessionState {
  invite: PrivateClawInvite;
  history: PrivateClawConversationTurn[];
  groupMode: boolean;
  botMuted: boolean;
  participants: Map<string, ProviderParticipantState>;
  state: "awaiting_hello" | "active";
  pendingRenewal?: {
    expiresAt: string;
    sentAt: string;
  };
  renewalReminderSentAt?: string;
  renewalReminderTimer?: ReturnType<typeof setTimeout>;
}
