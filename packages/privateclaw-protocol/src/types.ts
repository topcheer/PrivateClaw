export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface EncryptedEnvelope {
  version: 1;
  messageId: string;
  iv: string;
  ciphertext: string;
  tag: string;
  sentAt: string;
}

export interface PrivateClawInvite {
  version: 1;
  sessionId: string;
  sessionKey: string;
  appWsUrl: string;
  expiresAt: string;
  groupMode?: boolean;
  providerLabel?: string;
  relayLabel?: string;
}

export interface PrivateClawParticipant {
  appId: string;
  displayName: string;
  deviceLabel?: string;
  joinedAt: string;
}

export interface ClientHelloPayload {
  kind: "client_hello";
  appVersion: string;
  appId?: string;
  deviceLabel?: string;
  displayName?: string;
  sentAt: string;
}

export interface ServerWelcomePayload {
  kind: "server_welcome";
  message: string;
  sentAt: string;
}

export interface PrivateClawAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64?: string;
  uri?: string;
}

export interface PrivateClawSlashCommand {
  slash: string;
  description: string;
  acceptsArgs: boolean;
  source: "openclaw" | "plugin" | "privateclaw";
}

export interface UserMessagePayload {
  kind: "user_message";
  text: string;
  clientMessageId: string;
  sentAt: string;
  appId?: string;
  displayName?: string;
  attachments?: PrivateClawAttachment[];
}

export interface ParticipantMessagePayload {
  kind: "participant_message";
  messageId: string;
  senderAppId: string;
  senderDisplayName: string;
  text: string;
  clientMessageId: string;
  sentAt: string;
  attachments?: PrivateClawAttachment[];
}

export interface AssistantMessagePayload {
  kind: "assistant_message";
  messageId?: string;
  text: string;
  replyTo?: string;
  sentAt: string;
  attachments?: PrivateClawAttachment[];
}

export interface SystemMessagePayload {
  kind: "system_message";
  messageId?: string;
  message: string;
  severity: "info" | "error";
  sentAt: string;
  replyTo?: string;
}

export interface ProviderCapabilitiesPayload {
  kind: "provider_capabilities";
  sentAt: string;
  expiresAt: string;
  groupMode?: boolean;
  botMuted?: boolean;
  providerLabel?: string;
  participants?: PrivateClawParticipant[];
  currentAppId?: string;
  currentDisplayName?: string;
  commands: PrivateClawSlashCommand[];
}

export interface SessionRenewedPayload {
  kind: "session_renewed";
  message: string;
  newSessionKey: string;
  expiresAt: string;
  sentAt: string;
  replyTo?: string;
}

export interface SessionClosePayload {
  kind: "session_close";
  reason: string;
  sentAt: string;
  appId?: string;
}

export type PrivateClawPayload =
  | ClientHelloPayload
  | ServerWelcomePayload
  | UserMessagePayload
  | ParticipantMessagePayload
  | AssistantMessagePayload
  | SystemMessagePayload
  | ProviderCapabilitiesPayload
  | SessionRenewedPayload
  | SessionClosePayload;

export interface ProviderCreateSessionMessage {
  type: "provider:create_session";
  requestId: string;
  ttlMs?: number;
  label?: string;
  groupMode?: boolean;
}

export interface ProviderFrameMessage {
  type: "provider:frame";
  sessionId: string;
  envelope: EncryptedEnvelope;
  targetAppId?: string;
}

export interface ProviderCloseSessionMessage {
  type: "provider:close_session";
  sessionId: string;
  reason?: string;
}

export interface ProviderCloseAppMessage {
  type: "provider:close_app";
  sessionId: string;
  appId: string;
  reason?: string;
}

export interface ProviderRenewSessionMessage {
  type: "provider:renew_session";
  requestId: string;
  sessionId: string;
  ttlMs: number;
}

export interface AppFrameMessage {
  type: "app:frame";
  envelope: EncryptedEnvelope;
}

export interface AppRegisterPushMessage {
  type: "app:register_push";
  token: string;
}

export interface AppUnregisterPushMessage {
  type: "app:unregister_push";
}

export interface RelayProviderReadyMessage {
  type: "relay:provider_ready";
}

export interface RelaySessionCreatedMessage {
  type: "relay:session_created";
  requestId: string;
  sessionId: string;
  expiresAt: string;
}

export interface RelaySessionRenewedMessage {
  type: "relay:session_renewed";
  requestId: string;
  sessionId: string;
  expiresAt: string;
}

export interface RelayAttachedMessage {
  type: "relay:attached";
  sessionId: string;
  expiresAt: string;
}

export interface RelayFrameMessage {
  type: "relay:frame";
  sessionId: string;
  envelope: EncryptedEnvelope;
}

export interface RelaySessionClosedMessage {
  type: "relay:session_closed";
  sessionId: string;
  reason: string;
}

export interface RelayErrorMessage {
  type: "relay:error";
  code: string;
  message: string;
  sessionId?: string;
  requestId?: string;
}

export type ProviderToRelayMessage =
  | ProviderCreateSessionMessage
  | ProviderFrameMessage
  | ProviderCloseSessionMessage
  | ProviderCloseAppMessage
  | ProviderRenewSessionMessage;

export type AppToRelayMessage =
  | AppFrameMessage
  | AppRegisterPushMessage
  | AppUnregisterPushMessage;

export type RelayToProviderMessage =
  | RelayProviderReadyMessage
  | RelaySessionCreatedMessage
  | RelaySessionRenewedMessage
  | RelayFrameMessage
  | RelaySessionClosedMessage
  | RelayErrorMessage;

export type RelayToAppMessage =
  | RelayAttachedMessage
  | RelayFrameMessage
  | RelaySessionClosedMessage
  | RelayErrorMessage;

export type CachedRelayFrameTarget = "app" | "provider";
