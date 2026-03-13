import type {
  PrivateClawAttachment,
  PrivateClawInvite,
  PrivateClawSlashCommand,
} from "@privateclaw/protocol";

export interface PrivateClawConversationTurn {
  role: "user" | "assistant" | "system";
  text: string;
  sentAt: string;
  attachments?: PrivateClawAttachment[];
}

export type BridgeMessage =
  | string
  | {
      text: string;
      attachments?: PrivateClawAttachment[];
    };

export type BridgeResponse = string | { messages: BridgeMessage[] };

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

export interface PrivateClawInviteBundle {
  invite: PrivateClawInvite;
  inviteUri: string;
  qrSvg: string;
  qrTerminal: string;
  announcementText: string;
}

export interface ProviderSessionState {
  invite: PrivateClawInvite;
  history: PrivateClawConversationTurn[];
  state: "awaiting_hello" | "active";
  pendingRenewal?: {
    expiresAt: string;
    sentAt: string;
  };
}
