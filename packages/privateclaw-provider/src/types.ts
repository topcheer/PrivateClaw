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
  bridgeText?: string;
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

export interface PrivateClawAudioTranscriptionRequest {
  sessionId: string;
  requestId: string;
  attachments: ReadonlyArray<PrivateClawAttachment>;
}

export interface PrivateClawAgentBridge {
  handleUserMessage(params: {
    sessionId: string;
    invite: PrivateClawInvite;
    message: string;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
    history: ReadonlyArray<PrivateClawConversationTurn>;
  }): Promise<BridgeResponse>;
  transcribeAudioAttachments?(
    params: PrivateClawAudioTranscriptionRequest,
  ): Promise<string>;
}

export interface PrivateClawProviderOptions {
  providerWsUrl: string;
  appWsUrl: string;
  bridge: PrivateClawAgentBridge;
  providerId?: string;
  defaultTtlMs?: number;
  providerLabel?: string;
  welcomeMessage?: string;
  commandsProvider?: () => Promise<PrivateClawSlashCommand[]>;
  onLog?: (message: string) => void;
}

export interface ProviderParticipantState extends PrivateClawParticipant {
  lastSeenAt: string;
}

export interface PrivateClawManagedSession {
  sessionId: string;
  expiresAt: string;
  providerLabel?: string;
  label?: string;
  groupMode: boolean;
  participantCount: number;
  participants: PrivateClawParticipant[];
  state: "awaiting_hello" | "active";
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
  label?: string;
  history: PrivateClawConversationTurn[];
  groupMode: boolean;
  botMuted: boolean;
  participants: Map<string, ProviderParticipantState>;
  removedParticipantAppIds: Set<string>;
  state: "awaiting_hello" | "active";
  pendingRenewal?: {
    expiresAt: string;
    sentAt: string;
  };
  renewalReminderSentAt?: string;
  renewalReminderTimer?: ReturnType<typeof setTimeout>;
}

export interface PrivateClawProviderSessionHandoff {
  invite: PrivateClawInvite;
  label?: string;
  history: PrivateClawConversationTurn[];
  groupMode: boolean;
  botMuted: boolean;
  participants: ProviderParticipantState[];
  removedParticipantAppIds: string[];
  state: "awaiting_hello" | "active";
  pendingRenewal?: {
    expiresAt: string;
    sentAt: string;
  };
  renewalReminderSentAt?: string;
}

export interface PrivateClawProviderHandoffState {
  providerId: string;
  sessions: PrivateClawProviderSessionHandoff[];
}
