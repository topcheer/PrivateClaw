import type {
  PrivateClawAttachment,
  PrivateClawInvite,
  PrivateClawParticipant,
  PrivateClawSlashCommand,
  PrivateClawThinkingEntry,
  PrivateClawThinkingStatus,
} from "@privateclaw/protocol";

export interface PrivateClawConversationTurn {
  messageId: string;
  role: "user" | "assistant" | "system" | "thinking";
  text: string;
  sentAt: string;
  bridgeText?: string;
  appId?: string;
  participantLabel?: string;
  replyTo?: string;
  severity?: "info" | "error";
  attachments?: PrivateClawAttachment[];
  thinkingStatus?: PrivateClawThinkingStatus;
  thinkingSummary?: string;
  thinkingEntries?: PrivateClawThinkingEntry[];
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

export interface PrivateClawAudioTranscriber {
  transcribeAudioAttachments(
    params: PrivateClawAudioTranscriptionRequest,
  ): Promise<string>;
}

export interface PrivateClawVerboseController {
  enabled: boolean;
}

export interface PrivateClawThinkingTraceSnapshot {
  entries: ReadonlyArray<PrivateClawThinkingEntry>;
  sentAt: string;
  summary: string;
}

export interface PrivateClawAgentBridge {
  supportsThinkingTrace?: boolean;
  handleUserMessage(params: {
    sessionId: string;
    invite: PrivateClawInvite;
    message: string;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
    history: ReadonlyArray<PrivateClawConversationTurn>;
    onThinkingTrace?: (
      snapshot: PrivateClawThinkingTraceSnapshot,
    ) => void | Promise<void>;
  }): Promise<BridgeResponse>;
  transcribeAudioAttachments?(
    params: PrivateClawAudioTranscriptionRequest,
  ): Promise<string>;
}

export interface PrivateClawProviderOptions {
  providerWsUrl: string;
  appWsUrl: string;
  bridge: PrivateClawAgentBridge;
  audioTranscriber?: PrivateClawAudioTranscriber;
  providerId?: string;
  defaultTtlMs?: number;
  providerLabel?: string;
  welcomeMessage?: string;
  botMode?: boolean;
  botModeSilentJoinDelayMs?: number;
  botModeIdleDelayMs?: number;
  commandsProvider?: () => Promise<PrivateClawSlashCommand[]>;
  verboseController?: PrivateClawVerboseController;
  onLog?: (message: string) => void;
}

export interface ProviderParticipantState extends PrivateClawParticipant {
  lastSeenAt: string;
  lastUserMessageAt?: string;
  botModeSilentJoinPromptSentAt?: string;
  supportsThinkingTrace?: boolean;
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
  lastGroupActivityAt?: string;
  botModeIdleAnchorAt?: string;
  botModeLastIdlePromptAt?: string;
  botModeLastIdleTopicId?: string;
  pendingRenewal?: {
    expiresAt: string;
    sentAt: string;
  };
  renewalReminderSentAt?: string;
  renewalReminderTimer?: ReturnType<typeof setTimeout>;
  botModeIdleTimer?: ReturnType<typeof setTimeout>;
  botModeSilentJoinTimers?: Map<string, ReturnType<typeof setTimeout>>;
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
  lastGroupActivityAt?: string;
  botModeIdleAnchorAt?: string;
  botModeLastIdlePromptAt?: string;
  botModeLastIdleTopicId?: string;
}

export interface PrivateClawProviderHandoffState {
  providerId: string;
  sessions: PrivateClawProviderSessionHandoff[];
}
