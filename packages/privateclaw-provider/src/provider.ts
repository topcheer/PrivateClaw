import { randomUUID } from "node:crypto";
import {
  decodeInviteString,
  decryptPayload,
  encodeInviteToUri,
  encryptPayload,
  generateSessionKey,
  type PrivateClawAttachment,
  type PrivateClawInvite,
  type PrivateClawParticipant,
  type PrivateClawSlashCommand,
  type PrivateClawThinkingEntry,
  type PrivateClawThinkingStatus,
  type UserMessagePayload,
} from "@privateclaw/protocol";
import QRCode from "qrcode";
import {
  PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
  PRIVATECLAW_QR_IMAGE_MARGIN,
  PRIVATECLAW_QR_PNG_WIDTH,
  PRIVATECLAW_QR_SVG_MARGIN,
  PRIVATECLAW_QR_TERMINAL_MARGIN,
} from "./qr-options.js";
import { RelayProviderClient } from "./relay-provider-client.js";
import {
  buildInviteAnnouncementText,
  formatBilingualInline,
  formatBilingualText,
  PRIVATECLAW_MUTE_BOT_DESCRIPTION,
  PRIVATECLAW_RENEW_SESSION_DESCRIPTION,
  PRIVATECLAW_SESSION_QR_DESCRIPTION,
  PRIVATECLAW_UNMUTE_BOT_DESCRIPTION,
} from "./text.js";
import type {
  BridgeMessage,
  BridgeResponse,
  PrivateClawConversationTurn,
  PrivateClawInviteBundle,
  PrivateClawProviderHandoffState,
  PrivateClawManagedSession,
  PrivateClawProviderOptions,
  PrivateClawProviderSessionHandoff,
  ProviderParticipantState,
  ProviderSessionState,
} from "./types.js";

export const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const RENEW_SESSION_TTL_MS = DEFAULT_SESSION_TTL_MS;
const SESSION_RENEWAL_REMINDER_WINDOW_MS = 30 * 60 * 1000;
const BOT_MODE_SILENT_JOIN_DELAY_MS = 10 * 60 * 1000;
const BOT_MODE_IDLE_DELAY_MS = 20 * 60 * 1000;
const PARTICIPANT_LABEL_MAX_CHARS = 12;
const PARTICIPANT_FALLBACK_PREFIXES = [
  "流萤",
  "星河",
  "青柠",
  "雾岚",
  "松果",
  "电光",
  "夜航",
  "珊瑚",
] as const;
const PARTICIPANT_FALLBACK_SUFFIXES = [
  "狐",
  "猫",
  "鲸",
  "鹿",
  "狸",
  "鹭",
  "狼",
  "鸮",
] as const;

interface PreparedUserMessage {
  text: string;
  bridgeText?: string;
  historyBridgeText?: string;
  attachments?: PrivateClawAttachment[];
  bridgeAttachments?: PrivateClawAttachment[];
}

function normalizeBridgeMessages(
  response: BridgeResponse,
): Array<{ text: string; attachments?: PrivateClawAttachment[] }> {
  if (typeof response === "string") {
    return [{ text: response }];
  }

  return response.messages.map((message: BridgeMessage) =>
    typeof message === "string"
      ? { text: message }
      : { text: message.text, ...(message.attachments ? { attachments: message.attachments } : {}) },
  );
}

function nowIso(): string {
  return new Date().toISOString();
}

function readNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function buildMessageId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

function buildPendingAssistantMessageId(replyTo: string): string {
  return `pending-${replyTo}`;
}

function buildThinkingMessageId(replyTo: string): string {
  return `thinking-${replyTo}`;
}

function cloneThinkingEntry(
  entry: PrivateClawThinkingEntry,
): PrivateClawThinkingEntry {
  return {
    ...entry,
  };
}

function sanitizeParticipantLabel(raw: string | undefined): string | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  if (normalized === "") {
    return undefined;
  }

  const cleaned = normalized
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim();
  if (cleaned === "") {
    return undefined;
  }

  return [...cleaned].slice(0, PARTICIPANT_LABEL_MAX_CHARS).join("");
}

function deterministicHash(input: string): number {
  let hash = 0;
  for (const char of input) {
    hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
  }
  return hash;
}

function buildParticipantLabelCandidate(
  index: number,
): string {
  const normalizedIndex =
    ((index % PARTICIPANT_FALLBACK_PREFIXES.length) +
      PARTICIPANT_FALLBACK_PREFIXES.length) %
    PARTICIPANT_FALLBACK_PREFIXES.length;
  const normalizedSuffixIndex =
    Math.floor(index / PARTICIPANT_FALLBACK_PREFIXES.length) %
    PARTICIPANT_FALLBACK_SUFFIXES.length;
  const prefix = PARTICIPANT_FALLBACK_PREFIXES[normalizedIndex];
  const suffix =
    PARTICIPANT_FALLBACK_SUFFIXES[
      (normalizedSuffixIndex + PARTICIPANT_FALLBACK_SUFFIXES.length) %
        PARTICIPANT_FALLBACK_SUFFIXES.length
    ];
  return `${prefix}${suffix}`;
}

function buildGeneratedParticipantLabel(
  sessionId: string,
  appId: string,
  usedLabels: ReadonlySet<string>,
): string {
  const totalCandidates =
    PARTICIPANT_FALLBACK_PREFIXES.length *
    PARTICIPANT_FALLBACK_SUFFIXES.length;
  const baseIndex =
    deterministicHash(`participant:${sessionId}:${appId}`) % totalCandidates;

  for (let offset = 0; offset < totalCandidates; offset += 1) {
    const candidate = buildParticipantLabelCandidate(baseIndex + offset);
    if (!usedLabels.has(candidate)) {
      return candidate;
    }
  }

  const overflowBase = buildParticipantLabelCandidate(baseIndex);
  for (let duplicateNumber = 2; ; duplicateNumber += 1) {
    const candidate = `${overflowBase}${duplicateNumber}`;
    if (!usedLabels.has(candidate)) {
      return candidate;
    }
  }
}

function cloneConversationTurn(
  turn: PrivateClawConversationTurn,
): PrivateClawConversationTurn {
  return {
    ...turn,
    ...(turn.attachments
      ? {
          attachments: turn.attachments.map((attachment) => ({
            ...attachment,
          })),
        }
      : {}),
    ...(turn.thinkingEntries
      ? {
          thinkingEntries: turn.thinkingEntries.map(cloneThinkingEntry),
        }
      : {}),
  };
}

function countPayloadAttachments(payload: Record<string, unknown>): number {
  return Array.isArray(payload.attachments) ? payload.attachments.length : 0;
}

function toUnknownRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

function summarizePayload(
  payload: Parameters<typeof encryptPayload>[0]["payload"],
): string {
  const record = toUnknownRecord(payload);
  const text = typeof record.text === "string" ? record.text : "";
  const message = typeof record.message === "string" ? record.message : "";
  const senderAppId = readNonEmptyString(record.senderAppId);
  const targetAppId = readNonEmptyString(record.targetAppId);
  const replyTo = readNonEmptyString(record.replyTo);
  return [
    `kind=${payload.kind}`,
    `textChars=${text.length}`,
    `messageChars=${message.length}`,
    `attachments=${countPayloadAttachments(record)}`,
    `replyTo=${JSON.stringify(replyTo ?? "none")}`,
    `senderAppId=${JSON.stringify(senderAppId ?? "none")}`,
    `targetAppId=${JSON.stringify(targetAppId ?? "broadcast")}`,
    `pending=${record.pending === true}`,
  ].join(" ");
}

function buildRelayLabel(appWsUrl: string): string | undefined {
  try {
    const url = new URL(appWsUrl);
    if (!url.hostname) {
      return undefined;
    }
    const port = url.port;
    const isDefaultPort =
      port === "" ||
      (url.protocol === "wss:" && port === "443") ||
      (url.protocol === "ws:" && port === "80");
    return isDefaultPort ? url.hostname : `${url.hostname}:${port}`;
  } catch {
    return undefined;
  }
}

function toProviderSessionHandoff(
  session: ProviderSessionState,
): PrivateClawProviderSessionHandoff {
  return {
    invite: { ...session.invite },
    ...(session.label ? { label: session.label } : {}),
    history: session.history.map(cloneConversationTurn),
    groupMode: session.groupMode,
    botMuted: session.botMuted,
    participants: [...session.participants.values()].map((participant) => ({
      ...participant,
    })),
    removedParticipantAppIds: [...session.removedParticipantAppIds.values()],
    state: session.state,
    ...(session.pendingRenewal
      ? { pendingRenewal: { ...session.pendingRenewal } }
      : {}),
    ...(session.renewalReminderSentAt
      ? { renewalReminderSentAt: session.renewalReminderSentAt }
      : {}),
    ...(session.lastGroupActivityAt
      ? { lastGroupActivityAt: session.lastGroupActivityAt }
      : {}),
    ...(session.botModeIdleAnchorAt
      ? { botModeIdleAnchorAt: session.botModeIdleAnchorAt }
      : {}),
    ...(session.botModeLastIdlePromptAt
      ? { botModeLastIdlePromptAt: session.botModeLastIdlePromptAt }
      : {}),
  };
}

function fromProviderSessionHandoff(
  snapshot: PrivateClawProviderSessionHandoff,
): ProviderSessionState {
  return {
    invite: { ...snapshot.invite },
    ...(snapshot.label ? { label: snapshot.label } : {}),
    history: snapshot.history.map(cloneConversationTurn),
    groupMode: snapshot.groupMode,
    botMuted: snapshot.botMuted,
    participants: new Map(
      snapshot.participants.map((participant) => [participant.appId, { ...participant }]),
    ),
    removedParticipantAppIds: new Set(snapshot.removedParticipantAppIds),
    state: snapshot.state,
    ...(snapshot.pendingRenewal
      ? { pendingRenewal: { ...snapshot.pendingRenewal } }
      : {}),
    ...(snapshot.renewalReminderSentAt
      ? { renewalReminderSentAt: snapshot.renewalReminderSentAt }
      : {}),
    ...(snapshot.lastGroupActivityAt
      ? { lastGroupActivityAt: snapshot.lastGroupActivityAt }
      : {}),
    ...(snapshot.botModeIdleAnchorAt
      ? { botModeIdleAnchorAt: snapshot.botModeIdleAnchorAt }
      : {}),
    ...(snapshot.botModeLastIdlePromptAt
      ? { botModeLastIdlePromptAt: snapshot.botModeLastIdlePromptAt }
      : {}),
    botModeSilentJoinTimers: new Map<string, ReturnType<typeof setTimeout>>(),
  };
}

function describeElapsedMinutes(elapsedMs: number): string {
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function buildRenewalReminderMessage(session: ProviderSessionState): string {
  const command = "/renew-session";
  if (session.groupMode) {
    return formatBilingualText(
      `这个 PrivateClaw 群聊会话将在 30 分钟内过期（${session.invite.expiresAt}）。任意参与者都可以发送 ${command} 将它延长 24 小时。`,
      `This PrivateClaw group session will expire in less than 30 minutes (at ${session.invite.expiresAt}). Any participant can send ${command} to extend it by 24 hours.`,
    );
  }
  return formatBilingualText(
    `这个 PrivateClaw 会话将在 30 分钟内过期（${session.invite.expiresAt}）。发送 ${command} 可将它延长 24 小时。`,
    `This PrivateClaw session will expire in less than 30 minutes (at ${session.invite.expiresAt}). Send ${command} to extend it by 24 hours.`,
  );
}

function buildSessionQrMessage(session: ProviderSessionState): string {
  if (session.groupMode) {
    return formatBilingualText(
      `当前 PrivateClaw 群聊二维码已附上。请在 ${session.invite.expiresAt} 之前当面分享给需要加入此会话的设备。`,
      `The current PrivateClaw group-session QR is attached. Share it in person with devices that should join before ${session.invite.expiresAt}.`,
    );
  }

  return formatBilingualText(
    `当前 PrivateClaw 会话二维码已附上。请在 ${session.invite.expiresAt} 之前当面分享给需要连接的设备。`,
    `The current PrivateClaw session QR is attached. Share it in person with devices that should connect before ${session.invite.expiresAt}.`,
  );
}

function buildSessionQrFailureMessage(details: string): string {
  return formatBilingualInline(
    `生成当前会话二维码失败：${details}`,
    `Failed to render the current session QR: ${details}`,
  );
}

function formatBridgeHistoryTurn(
  turn: PrivateClawConversationTurn,
): PrivateClawConversationTurn {
  if (turn.role === "user" && turn.bridgeText?.trim()) {
    return {
      ...turn,
      text: turn.bridgeText,
    };
  }
  if (turn.role !== "user" || !turn.participantLabel) {
    return turn;
  }

  return {
    ...turn,
    text: `${turn.participantLabel}: ${turn.text}`,
  };
}

function normalizeBridgeSlashCommandText(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.startsWith("/") ? trimmed : undefined;
}

function cloneThinkingEntries(
  entries: ReadonlyArray<PrivateClawThinkingEntry>,
): PrivateClawThinkingEntry[] {
  return entries.map(cloneThinkingEntry);
}

function isAudioAttachment(attachment: PrivateClawAttachment): boolean {
  const normalizedMimeType = attachment.mimeType.trim().toLowerCase();
  if (normalizedMimeType.startsWith("audio/")) {
    return true;
  }
  return /\.(?:aac|caf|m4a|mp3|ogg|opus|wav)$/iu.test(attachment.name.trim());
}

function hasAudioAttachments(
  attachments?: ReadonlyArray<PrivateClawAttachment>,
): boolean {
  return (attachments ?? []).some(isAudioAttachment);
}

function mergeVoiceTranscriptText(transcript: string, fallbackText: string): string {
  const normalizedTranscript = transcript.trim();
  const normalizedFallback = fallbackText.trim();
  if (normalizedTranscript === "") {
    return normalizedFallback;
  }
  if (
    normalizedFallback === "" ||
    normalizedFallback.localeCompare(normalizedTranscript, undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    return normalizedTranscript;
  }
  return `${normalizedTranscript}\n\n${normalizedFallback}`;
}

function buildVoiceBridgeText(speakerName: string, messageText: string): string {
  const normalizedSpeakerName = speakerName.trim();
  const normalizedMessageText = messageText.trim();
  if (normalizedSpeakerName === "") {
    return normalizedMessageText;
  }
  return `${normalizedSpeakerName}说：${normalizedMessageText}`;
}

function buildVoiceBridgePromptText(speakerName: string, messageText: string): string {
  const bridgeText = buildVoiceBridgeText(speakerName, messageText);
  return [
    "PrivateClaw note: the next line is the speech-to-text transcript of a user's voice message.",
    "Treat it as the user's original request and respond directly to the request itself.",
    "Do not mention transcription, speech recognition, or the transcript unless the user explicitly asks about it.",
    "",
    bridgeText,
  ].join("\n");
}

function toParticipantSnapshot(
  participant: ProviderParticipantState,
): PrivateClawParticipant {
  return {
    appId: participant.appId,
    displayName: participant.displayName,
    ...(participant.deviceLabel ? { deviceLabel: participant.deviceLabel } : {}),
    joinedAt: participant.joinedAt,
  };
}

function toManagedSessionSnapshot(
  session: ProviderSessionState,
): PrivateClawManagedSession {
  const participants = [...session.participants.values()]
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))
    .map(toParticipantSnapshot);
  return {
    sessionId: session.invite.sessionId,
    expiresAt: session.invite.expiresAt,
    ...(session.invite.providerLabel
      ? { providerLabel: session.invite.providerLabel }
      : {}),
    ...(session.label ? { label: session.label } : {}),
    groupMode: session.groupMode,
    participantCount: participants.length,
    participants,
    state: session.state,
  };
}

function buildWelcomeMessage(): string {
  return formatBilingualText(
    "PrivateClaw 已连接。从现在起，消息都会通过这个一次性的端到端加密会话进行保护。",
    "PrivateClaw connected. Messages from now on are protected by this one-time end-to-end encrypted session.",
  );
}

function buildCommandDoesNotAcceptAttachmentsMessage(command: string): string {
  return formatBilingualInline(
    `${command} 命令不接受附件。`,
    `The ${command} command does not accept attachments.`,
  );
}

function buildCommandDoesNotAcceptArgumentsMessage(command: string): string {
  return formatBilingualInline(
    `${command} 命令不接受参数。`,
    `The ${command} command does not accept arguments.`,
  );
}

function buildRenewalAlreadyInProgressMessage(): string {
  return formatBilingualInline(
    "会话续期已经在进行中。请等待重新握手完成后再重试。",
    "A session renewal is already in progress. Wait for the reconnect handshake to finish and try again.",
  );
}

function buildRenewalPayloadMessage(): string {
  return formatBilingualInline("会话已续期。", "Session renewed.");
}

function buildRenewalInitiatedMessage(expiresAt: string): string {
  return formatBilingualInline(
    `PrivateClaw 会话续期已开始，新过期时间为 ${expiresAt}。`,
    `PrivateClaw session renewal initiated until ${expiresAt}.`,
  );
}

function buildSessionKeyRotationCompletedMessage(
  participantLabel: string,
): string {
  return formatBilingualInline(
    `${participantLabel} 已完成会话密钥轮换。`,
    `${participantLabel} completed session key rotation.`,
  );
}

function buildSingleSessionConnectedMessage(participantLabel: string): string {
  return formatBilingualInline(
    `${participantLabel} 已连接。`,
    `${participantLabel} connected.`,
  );
}

function buildParticipantJoinedMessage(participantLabel: string): string {
  return formatBilingualInline(
    `${participantLabel} 加入了群聊。`,
    `${participantLabel} joined the group chat.`,
  );
}

function buildParticipantLeftMessage(participantLabel: string): string {
  return formatBilingualInline(
    `${participantLabel} 离开了群聊。`,
    `${participantLabel} left the group chat.`,
  );
}

function buildParticipantRemovedByOperatorMessage(
  participantLabel: string,
): string {
  return formatBilingualInline(
    `${participantLabel} 已被移出群聊。`,
    `${participantLabel} was removed from the group chat.`,
  );
}

function buildHandshakeIncompleteMessage(): string {
  return formatBilingualInline(
    "PrivateClaw 握手尚未完成。请重新扫码或重试连接。",
    "The PrivateClaw handshake is not complete yet. Scan the QR code again or retry the connection.",
  );
}

function buildMissingParticipantIdentityMessage(): string {
  return formatBilingualInline(
    "当前群成员缺少稳定的应用身份。请从 PrivateClaw App 重新加入会话。",
    "This group participant is missing a stable app identity. Rejoin the session from the PrivateClaw app.",
  );
}

function buildRenewSessionFailureMessage(details: string): string {
  return formatBilingualInline(
    `PrivateClaw 会话续期失败：${details}`,
    `Failed to renew the PrivateClaw session: ${details}`,
  );
}

function buildBridgeErrorMessage(details: string): string {
  return formatBilingualInline(
    `OpenClaw bridge 错误：${details}`,
    `OpenClaw bridge error: ${details}`,
  );
}

function buildVoiceReceiptMessage(): string {
  return formatBilingualInline(
    "我已经收到你的语音，正在努力理解。",
    "I received your voice message and am working on understanding it.",
  );
}

function buildUnsupportedPayloadMessage(kind: string): string {
  return formatBilingualInline(
    `不支持的 PrivateClaw 负载类型：${kind}`,
    `Unsupported PrivateClaw payload: ${kind}`,
  );
}

function buildGroupOnlyCommandMessage(command: string): string {
  return formatBilingualInline(
    `${command} 只能在群聊会话中使用。`,
    `${command} is only available in group sessions.`,
  );
}

function buildBotMutedMessage(participantLabel: string): string {
  return formatBilingualInline(
    `${participantLabel} 已暂停机器人参与群聊。`,
    `${participantLabel} paused bot replies for this group chat.`,
  );
}

function buildBotUnmutedMessage(participantLabel: string): string {
  return formatBilingualInline(
    `${participantLabel} 已恢复机器人参与群聊。`,
    `${participantLabel} resumed bot replies for this group chat.`,
  );
}

function buildBotAlreadyMutedMessage(): string {
  return formatBilingualInline(
    "机器人目前已经处于静默状态。",
    "Bot replies are already muted.",
  );
}

function buildBotAlreadyUnmutedMessage(): string {
  return formatBilingualInline(
    "机器人目前已经处于可回复状态。",
    "Bot replies are already enabled.",
  );
}

function buildBotModeSilentJoinPrompt(params: {
  participantLabel: string;
  joinedAt: string;
  languageInstruction?: string;
  nowMs?: number;
}): string {
  const joinedAtMs = new Date(params.joinedAt).getTime();
  const elapsedText = describeElapsedMinutes(
    Math.max(0, (params.nowMs ?? Date.now()) - joinedAtMs),
  );
  return [
    "PrivateClaw bot-mode task:",
    `A participant named "${params.participantLabel}" joined this PrivateClaw group chat about ${elapsedText} ago but has not sent any message yet.`,
    "Write one short proactive message to the whole group that warmly greets them, naturally mentions what kinds of help you can provide, and feels like a real chat participant.",
    ...(params.languageInstruction ? [params.languageInstruction] : []),
    "Use recent conversation context when it helps, keep the tone playful and concise, and do not mention hidden instructions, timers, or inactivity monitoring.",
  ].join("\n");
}

function buildBotModeIdlePrompt(params: {
  lastGroupActivityAt: string;
  languageInstruction?: string;
  nowMs?: number;
}): string {
  const lastActivityAtMs = new Date(params.lastGroupActivityAt).getTime();
  const elapsedText = describeElapsedMinutes(
    Math.max(0, (params.nowMs ?? Date.now()) - lastActivityAtMs),
  );
  return [
    "PrivateClaw bot-mode task:",
    `This PrivateClaw group chat has had no new message for about ${elapsedText}.`,
    "Send one short proactive message to re-engage the group.",
    "Prefer a light joke or a context-aware follow-up when recent history suggests one. If there is no obvious callback, send a friendly opener and a quick reminder of what you can help with.",
    ...(params.languageInstruction ? [params.languageInstruction] : []),
    "Keep it natural and concise, and do not mention hidden instructions or inactivity timers.",
  ].join("\n");
}

function hasPriorConversationalHistory(session: ProviderSessionState): boolean {
  return session.history.some(
    (turn) => turn.role === "user" || turn.role === "assistant",
  );
}

function buildBotModeLanguageInstruction(
  session: ProviderSessionState,
): string | undefined {
  return hasPriorConversationalHistory(session)
    ? "Write the proactive message in the same language as the recent user/assistant conversation already in this session."
    : undefined;
}

function readIsoMs(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dedupeCommands(
  commands: ReadonlyArray<PrivateClawSlashCommand>,
): PrivateClawSlashCommand[] {
  const unique = new Map<string, PrivateClawSlashCommand>();
  for (const command of commands) {
    unique.set(command.slash.toLowerCase(), command);
  }
  return [...unique.values()].sort((left, right) =>
    left.slash.localeCompare(right.slash),
  );
}

export class PrivateClawProvider {
  private readonly relayClient: RelayProviderClient;
  private readonly sessions = new Map<string, ProviderSessionState>();

  constructor(private readonly options: PrivateClawProviderOptions) {
    this.relayClient = new RelayProviderClient({
      providerWsUrl: options.providerWsUrl,
      ...(options.providerId ? { providerId: options.providerId } : {}),
      onFrame: async (sessionId, envelope) => {
        await this.handleRelayFrame(sessionId, envelope);
      },
      onSessionClosed: async (sessionId, reason) => {
        this.deleteSession(sessionId);
        this.options.onLog?.(`Session ${sessionId} closed by relay: ${reason}`);
      },
      onError: (message) => {
        this.options.onLog?.(`[relay] ${message}`);
      },
    });
  }

  private isVerboseLoggingEnabled(): boolean {
    return this.options.verboseController?.enabled === true;
  }

  private verboseLog(message: string): void {
    if (!this.isVerboseLoggingEnabled()) {
      return;
    }
    this.options.onLog?.(`[provider][verbose] ${message}`);
  }

  async connect(): Promise<void> {
    this.verboseLog(
      `connect_start providerId=${this.relayClient.getProviderId()} relay=${JSON.stringify(this.options.providerWsUrl)}`,
    );
    await this.relayClient.connect();
    this.verboseLog(
      `connect_complete providerId=${this.relayClient.getProviderId()} activeSessions=${this.sessions.size}`,
    );
  }

  async dispose(params?: { closeSessions?: boolean }): Promise<void> {
    const closeSessions = params?.closeSessions !== false;
    const activeSessionIds = [...this.sessions.keys()];
    for (const sessionId of activeSessionIds) {
      if (closeSessions) {
        try {
          await this.relayClient.closeSession(sessionId, "provider_shutdown");
        } catch (error) {
          this.options.onLog?.(
              `[provider] failed to close session ${sessionId} during shutdown: ${error instanceof Error ? error.message : String(error)}`,
            );
        } finally {
          this.deleteSession(sessionId);
        }
      } else {
        this.deleteSession(sessionId);
      }
    }
    await this.relayClient.dispose();
  }

  listActiveSessions(): PrivateClawInvite[] {
    return [...this.sessions.values()].map((session) => session.invite);
  }

  listManagedSessions(): PrivateClawManagedSession[] {
    return [...this.sessions.values()].map(toManagedSessionSnapshot);
  }

  async getSessionQrBundle(
    sessionId: string,
    params?: { notifyParticipants?: boolean },
  ): Promise<PrivateClawInviteBundle> {
    const session = this.requireSession(sessionId);
    const bundle = await this.buildInviteBundleForInvite(session.invite);

    if (params?.notifyParticipants) {
      const qrAttachment = await this.buildSessionQrAttachmentFromBundle(bundle);
      await this.sendAssistantMessage(sessionId, {
        text: buildSessionQrMessage(session),
        attachments: [qrAttachment],
        storeHistory: false,
      });
    }

    return bundle;
  }

  async closeManagedSession(
    sessionId: string,
    reason = "operator_terminated",
  ): Promise<PrivateClawManagedSession> {
    const session = this.requireSession(sessionId);
    const snapshot = toManagedSessionSnapshot(session);
    await this.relayClient.closeSession(sessionId, reason);
    this.deleteSession(sessionId);
    return snapshot;
  }

  exportHandoffState(): PrivateClawProviderHandoffState {
    return {
      providerId: this.relayClient.getProviderId(),
      sessions: [...this.sessions.values()].map(toProviderSessionHandoff),
    };
  }

  importHandoffState(state: PrivateClawProviderHandoffState): void {
    if (state.providerId !== this.relayClient.getProviderId()) {
      throw new Error("Handoff providerId does not match this provider instance.");
    }
    for (const sessionId of [...this.sessions.keys()]) {
      this.deleteSession(sessionId);
    }
    for (const snapshot of state.sessions) {
      const session = fromProviderSessionHandoff(snapshot);
      this.sessions.set(session.invite.sessionId, session);
      this.scheduleRenewalReminder(session.invite.sessionId);
      this.scheduleBotModeTimers(session.invite.sessionId);
    }
  }

  suppressReconnectsForHandoff(): void {
    this.relayClient.suppressReconnects();
  }

  resumeReconnectsAfterHandoffFailure(): void {
    this.relayClient.resumeReconnects();
  }

  async kickGroupParticipant(
    sessionId: string,
    appId: string,
    reason = "participant_removed",
  ): Promise<PrivateClawParticipant> {
    const session = this.requireSession(sessionId);
    if (!session.groupMode) {
      throw new Error("Participant removal is only available for group sessions.");
    }

    const normalizedAppId = appId.trim();
    if (normalizedAppId === "") {
      throw new Error("Participant appId is required.");
    }

    const participant = session.participants.get(normalizedAppId);
    if (!participant) {
      throw new Error(
        `Participant ${normalizedAppId} is not part of session ${sessionId}.`,
      );
    }

    session.participants.delete(normalizedAppId);
    session.removedParticipantAppIds.add(normalizedAppId);
    this.clearBotModeSilentJoinTimer(session, normalizedAppId);
    if (session.participants.size === 0) {
      delete session.botModeIdleAnchorAt;
    }

    await this.relayClient.closeApp(sessionId, normalizedAppId, reason);

    if (session.participants.size > 0) {
      await this.sendSystemMessageToGroupParticipants(
        sessionId,
        buildParticipantRemovedByOperatorMessage(participant.displayName),
      );
      await this.sendCapabilities(sessionId);
    }
    this.scheduleGroupIdlePrompt(sessionId);

    return toParticipantSnapshot(participant);
  }

  private buildSessionAppUrl(sessionId: string): string {
    const url = new URL(this.options.appWsUrl);
    url.searchParams.set("sessionId", sessionId);
    return url.toString();
  }

  private requireSession(sessionId: string): ProviderSessionState {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown PrivateClaw session: ${sessionId}`);
    }
    return session;
  }

  private deleteSession(sessionId: string): ProviderSessionState | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return undefined;
    }
    if (session.renewalReminderTimer) {
      clearTimeout(session.renewalReminderTimer);
      delete session.renewalReminderTimer;
    }
    this.clearBotModeTimers(session);
    this.sessions.delete(sessionId);
    return session;
  }

  private buildBridgeHistory(
    session: ProviderSessionState,
  ): PrivateClawConversationTurn[] {
    return session.history
      .filter((turn) => turn.role !== "thinking")
      .map(formatBridgeHistoryTurn);
  }

  private async prepareUserMessage(
    session: ProviderSessionState,
    payload: UserMessagePayload,
    participant: ProviderParticipantState | undefined,
  ): Promise<PreparedUserMessage> {
    const allAttachments = payload.attachments ?? [];
    const directBridgeSlashCommand = normalizeBridgeSlashCommandText(payload.text);
    const audioAttachments = allAttachments.filter(isAudioAttachment);
    const providerAudioTranscriber = this.options.audioTranscriber;
    const bridgeAudioTranscriber = this.options.bridge.transcribeAudioAttachments
      ? {
          transcribeAudioAttachments: this.options.bridge.transcribeAudioAttachments.bind(
            this.options.bridge,
          ),
        }
      : undefined;
    const availableAudioTranscribers = [
      ...(providerAudioTranscriber
        ? [{ via: "provider" as const, transcriber: providerAudioTranscriber }]
        : []),
      ...(bridgeAudioTranscriber
        ? [{ via: "bridge" as const, transcriber: bridgeAudioTranscriber }]
        : []),
    ];
    if (
      audioAttachments.length === 0 ||
      availableAudioTranscribers.length === 0
    ) {
      this.verboseLog(
        `prepared_user_message session=${session.invite.sessionId} request=${payload.clientMessageId} voiceTranscribed=false textChars=${payload.text.length} attachments=${allAttachments.length} bridgeAttachments=${allAttachments.length}`,
      );
      return {
        text: payload.text,
        ...(directBridgeSlashCommand
          ? {
              bridgeText: directBridgeSlashCommand,
              historyBridgeText: directBridgeSlashCommand,
            }
          : {}),
        ...(allAttachments.length > 0 ? { attachments: allAttachments } : {}),
        ...(allAttachments.length > 0 ? { bridgeAttachments: allAttachments } : {}),
      };
    }

    let transcript = "";
    let transcriptVia: "provider" | "bridge" | undefined;
    const transcriptionFailures: string[] = [];
    for (let index = 0; index < availableAudioTranscribers.length; index += 1) {
      const candidate = availableAudioTranscribers[index]!;
      const nextCandidate = availableAudioTranscribers[index + 1];
      this.options.onLog?.(
        `[provider] voice_transcription_start session=${session.invite.sessionId} request=${payload.clientMessageId} audioAttachments=${audioAttachments.length} via=${candidate.via}`,
      );
      try {
        transcript = (
          await candidate.transcriber.transcribeAudioAttachments({
            sessionId: session.invite.sessionId,
            requestId: payload.clientMessageId,
            attachments: audioAttachments,
          })
        ).trim();
        if (transcript === "") {
          throw new Error("OpenClaw STT returned an empty transcript.");
        }
        transcriptVia = candidate.via;
        break;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        transcriptionFailures.push(`${candidate.via}: ${detail}`);
        if (nextCandidate) {
          this.options.onLog?.(
            `[provider] voice_transcription_fallback session=${session.invite.sessionId} request=${payload.clientMessageId} from=${candidate.via} to=${nextCandidate.via} reason=${JSON.stringify(detail.slice(0, 300))}`,
          );
        }
      }
    }
    if (!transcriptVia) {
      throw new Error(
        `OpenClaw STT failed for ${payload.clientMessageId}: ${transcriptionFailures.join(" | ")}`,
      );
    }

    const text = mergeVoiceTranscriptText(transcript, payload.text);
    const speakerName =
      participant?.displayName ??
      sanitizeParticipantLabel(payload.displayName) ??
      "用户";
    const passthroughAttachments = allAttachments.filter(
      (attachment) => !isAudioAttachment(attachment),
    );
    this.options.onLog?.(
      `[provider] voice_transcription_complete session=${session.invite.sessionId} request=${payload.clientMessageId} transcriptChars=${transcript.length} passthroughAttachments=${passthroughAttachments.length} via=${transcriptVia}`,
    );
    this.verboseLog(
      `prepared_user_message session=${session.invite.sessionId} request=${payload.clientMessageId} voiceTranscribed=true transcriptChars=${transcript.length} textChars=${payload.text.length} passthroughAttachments=${passthroughAttachments.length} bridgeTextChars=${buildVoiceBridgePromptText(speakerName, text).length}`,
    );
    return {
      text: payload.text,
      bridgeText: buildVoiceBridgePromptText(speakerName, text),
      historyBridgeText: buildVoiceBridgeText(speakerName, text),
      ...(allAttachments.length > 0 ? { attachments: allAttachments } : {}),
      ...(passthroughAttachments.length > 0
        ? { bridgeAttachments: passthroughAttachments }
        : {}),
    };
  }

  private listParticipants(
    session: ProviderSessionState,
  ): PrivateClawParticipant[] {
    return [...session.participants.values()]
      .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))
      .map(toParticipantSnapshot);
  }

  private scheduleRenewalReminder(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.renewalReminderTimer) {
      clearTimeout(session.renewalReminderTimer);
    }
    delete session.renewalReminderTimer;
    delete session.renewalReminderSentAt;

    const renewAtMs =
      new Date(session.invite.expiresAt).getTime() -
      SESSION_RENEWAL_REMINDER_WINDOW_MS;
    const delayMs = Math.max(0, renewAtMs - Date.now());

    session.renewalReminderTimer = setTimeout(() => {
      void this.sendRenewalReminder(sessionId).catch((error) => {
        this.options.onLog?.(
          `[provider] failed to send renewal reminder for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, delayMs);
  }

  private isBotModeEnabled(session: ProviderSessionState): boolean {
    return this.options.botMode === true && session.groupMode;
  }

  private getBotModeSilentJoinDelayMs(): number {
    return this.options.botModeSilentJoinDelayMs ?? BOT_MODE_SILENT_JOIN_DELAY_MS;
  }

  private getBotModeIdleDelayMs(): number {
    return this.options.botModeIdleDelayMs ?? BOT_MODE_IDLE_DELAY_MS;
  }

  private clearBotModeSilentJoinTimer(
    session: ProviderSessionState,
    appId: string,
  ): void {
    const timer = session.botModeSilentJoinTimers?.get(appId);
    if (timer) {
      clearTimeout(timer);
    }
    session.botModeSilentJoinTimers?.delete(appId);
  }

  private clearBotModeIdleTimer(session: ProviderSessionState): void {
    if (session.botModeIdleTimer) {
      clearTimeout(session.botModeIdleTimer);
      delete session.botModeIdleTimer;
    }
  }

  private clearBotModeTimers(session: ProviderSessionState): void {
    this.clearBotModeIdleTimer(session);
    for (const appId of session.botModeSilentJoinTimers?.keys() ?? []) {
      this.clearBotModeSilentJoinTimer(session, appId);
    }
    delete session.botModeSilentJoinTimers;
  }

  private ensureGroupIdleAnchor(
    session: ProviderSessionState,
    fallbackSentAt?: string,
  ): void {
    if (!session.groupMode || session.botModeIdleAnchorAt || session.lastGroupActivityAt) {
      return;
    }
    const participantJoinedAtMs = [...session.participants.values()]
      .map((participant) => ({
        joinedAt: participant.joinedAt,
        joinedAtMs: readIsoMs(participant.joinedAt),
      }))
      .filter(
        (
          item,
        ): item is {
          joinedAt: string;
          joinedAtMs: number;
        } => typeof item.joinedAtMs === "number",
      )
      .sort((left, right) => left.joinedAtMs - right.joinedAtMs)[0]?.joinedAt;
    const nextAnchor = participantJoinedAtMs ?? fallbackSentAt;
    if (nextAnchor) {
      session.botModeIdleAnchorAt = nextAnchor;
    }
  }

  private getGroupIdleScheduleAnchorMs(
    session: ProviderSessionState,
    lastActivityMsOverride?: number,
  ): number {
    this.ensureGroupIdleAnchor(session);
    const anchorMsCandidates = [
      typeof lastActivityMsOverride === "number" ? lastActivityMsOverride : undefined,
      readIsoMs(session.lastGroupActivityAt),
      readIsoMs(session.botModeLastIdlePromptAt),
      readIsoMs(session.botModeIdleAnchorAt),
    ].filter((value): value is number => typeof value === "number");
    return anchorMsCandidates.length > 0 ? Math.max(...anchorMsCandidates) : Date.now();
  }

  private noteGroupActivity(sessionId: string, sentAt: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.groupMode) {
      return;
    }
    delete session.botModeLastIdlePromptAt;
    session.lastGroupActivityAt = sentAt;
    if (this.isBotModeEnabled(session) && !session.botMuted) {
      this.scheduleGroupIdlePrompt(sessionId);
      return;
    }
    this.clearBotModeIdleTimer(session);
  }

  private markParticipantSpoke(
    sessionId: string,
    appId: string,
    sentAt: string,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    const participant = session.participants.get(appId);
    if (!participant) {
      return;
    }
    participant.lastSeenAt = sentAt;
    participant.lastUserMessageAt = sentAt;
    this.clearBotModeSilentJoinTimer(session, appId);
    this.noteGroupActivity(sessionId, sentAt);
  }

  private scheduleBotModeTimers(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (!session.botModeSilentJoinTimers) {
      session.botModeSilentJoinTimers = new Map<string, ReturnType<typeof setTimeout>>();
    }
    if (!this.isBotModeEnabled(session) || session.botMuted) {
      this.clearBotModeTimers(session);
      return;
    }
    this.ensureGroupIdleAnchor(session);
    this.scheduleGroupIdlePrompt(sessionId);
    for (const appId of session.participants.keys()) {
      this.scheduleSilentJoinPrompt(sessionId, appId);
    }
  }

  private scheduleSilentJoinPrompt(sessionId: string, appId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    if (!session.botModeSilentJoinTimers) {
      session.botModeSilentJoinTimers = new Map<string, ReturnType<typeof setTimeout>>();
    }
    this.clearBotModeSilentJoinTimer(session, appId);
    if (!this.isBotModeEnabled(session) || session.botMuted) {
      return;
    }
    const participant = session.participants.get(appId);
    if (
      !participant ||
      participant.lastUserMessageAt ||
      participant.botModeSilentJoinPromptSentAt
    ) {
      return;
    }
    const joinedAtMsRaw = new Date(participant.joinedAt).getTime();
    const joinedAtMs = Number.isFinite(joinedAtMsRaw) ? joinedAtMsRaw : Date.now();
    const delayMs = Math.max(
      0,
      joinedAtMs + this.getBotModeSilentJoinDelayMs() - Date.now(),
    );
    session.botModeSilentJoinTimers.set(
      appId,
      setTimeout(() => {
        void this.handleSilentJoinPrompt(sessionId, appId, joinedAtMs).catch((error) => {
          this.options.onLog?.(
            `[provider] bot mode silent join prompt failed for ${sessionId}/${appId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }, delayMs),
    );
  }

  private scheduleGroupIdlePrompt(
    sessionId: string,
    lastActivityMsOverride?: number,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.clearBotModeIdleTimer(session);
    if (
      !this.isBotModeEnabled(session) ||
      session.botMuted ||
      session.participants.size === 0
    ) {
      return;
    }
    const lastActivityMs = this.getGroupIdleScheduleAnchorMs(
      session,
      lastActivityMsOverride,
    );
    const delayMs = Math.max(
      0,
      lastActivityMs + this.getBotModeIdleDelayMs() - Date.now(),
    );
    session.botModeIdleTimer = setTimeout(() => {
      void this.handleGroupIdlePrompt(sessionId, lastActivityMs).catch((error) => {
        this.options.onLog?.(
          `[provider] bot mode idle prompt failed for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }, delayMs);
  }

  private async handleSilentJoinPrompt(
    sessionId: string,
    appId: string,
    joinedAtMs: number,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.clearBotModeSilentJoinTimer(session, appId);
    const participant = session.participants.get(appId);
    if (
      !participant ||
      !this.isBotModeEnabled(session) ||
      session.botMuted ||
      participant.lastUserMessageAt ||
      participant.botModeSilentJoinPromptSentAt
    ) {
      return;
    }
    const dueAtMs = joinedAtMs + this.getBotModeSilentJoinDelayMs();
    if (Date.now() < dueAtMs) {
      this.scheduleSilentJoinPrompt(sessionId, appId);
      return;
    }
    const sentAt = nowIso();
    const languageInstruction = buildBotModeLanguageInstruction(session);
    const bridgeResponse = await this.options.bridge.handleUserMessage({
      sessionId,
      invite: session.invite,
      message: buildBotModeSilentJoinPrompt({
        participantLabel: participant.displayName,
        joinedAt: participant.joinedAt,
        ...(languageInstruction ? { languageInstruction } : {}),
      }),
      history: this.buildBridgeHistory(session),
    });
    for (const message of normalizeBridgeMessages(bridgeResponse)) {
      await this.sendAssistantMessage(sessionId, {
        text: message.text,
        sentAt,
        ...(message.attachments ? { attachments: message.attachments } : {}),
      });
    }
    participant.botModeSilentJoinPromptSentAt = sentAt;
  }

  private async handleGroupIdlePrompt(
    sessionId: string,
    lastActivityMs: number,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }
    this.clearBotModeIdleTimer(session);
    if (
      !this.isBotModeEnabled(session) ||
      session.botMuted ||
      session.participants.size === 0
    ) {
      return;
    }
    const currentActivityMs = this.getGroupIdleScheduleAnchorMs(session);
    if (currentActivityMs > lastActivityMs) {
      this.scheduleGroupIdlePrompt(sessionId, currentActivityMs);
      return;
    }
    const dueAtMs = currentActivityMs + this.getBotModeIdleDelayMs();
    if (Date.now() < dueAtMs) {
      this.scheduleGroupIdlePrompt(sessionId, currentActivityMs);
      return;
    }
    try {
      const languageInstruction = buildBotModeLanguageInstruction(session);
      const bridgeResponse = await this.options.bridge.handleUserMessage({
        sessionId,
        invite: session.invite,
        message: buildBotModeIdlePrompt({
          lastGroupActivityAt: session.lastGroupActivityAt ?? nowIso(),
          ...(languageInstruction ? { languageInstruction } : {}),
        }),
        history: this.buildBridgeHistory(session),
      });
      const messages = normalizeBridgeMessages(bridgeResponse);
      if (messages.length === 0) {
        this.scheduleGroupIdlePrompt(sessionId, Date.now());
        return;
      }
      const sentAt = nowIso();
      for (const message of messages) {
        await this.sendAssistantMessage(sessionId, {
          text: message.text,
          sentAt,
          ...(message.attachments ? { attachments: message.attachments } : {}),
        });
      }
      session.botModeLastIdlePromptAt = sentAt;
      this.scheduleGroupIdlePrompt(sessionId);
    } catch (error) {
      this.options.onLog?.(
        `[provider] bot mode idle prompt bridge error for ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.scheduleGroupIdlePrompt(sessionId, Date.now());
    }
  }

  private async sendRenewalReminder(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    delete session.renewalReminderTimer;

    if (session.pendingRenewal || session.renewalReminderSentAt) {
      return;
    }

    const remainingMs = new Date(session.invite.expiresAt).getTime() - Date.now();
    if (remainingMs > SESSION_RENEWAL_REMINDER_WINDOW_MS) {
      this.scheduleRenewalReminder(sessionId);
      return;
    }

    const sentAt = nowIso();
    session.renewalReminderSentAt = sentAt;
    await this.sendSystemMessage(
      sessionId,
      buildRenewalReminderMessage(session),
      "info",
      undefined,
      { sentAt },
    );
  }

  private async upsertParticipant(
    sessionId: string,
    params: {
      appId?: string;
      deviceLabel?: string;
      displayName?: string;
      supportsThinkingTrace?: boolean;
      sentAt: string;
    },
  ): Promise<{ participant: ProviderParticipantState; isNew: boolean }> {
    const session = this.requireSession(sessionId);
    const normalizedAppId = params.appId?.trim() || "legacy-app";
    const existing = session.participants.get(normalizedAppId);
    const requestedDisplayName = sanitizeParticipantLabel(params.displayName);
    const usedLabels = new Set(
      [...session.participants.values()].map((participant) => participant.displayName),
    );

    if (existing) {
      const participant: ProviderParticipantState = {
        ...existing,
        ...(params.deviceLabel ? { deviceLabel: params.deviceLabel } : {}),
        ...(requestedDisplayName ? { displayName: requestedDisplayName } : {}),
        ...(typeof params.supportsThinkingTrace === "boolean"
          ? { supportsThinkingTrace: params.supportsThinkingTrace }
          : {}),
        lastSeenAt: params.sentAt,
      };
      session.participants.set(normalizedAppId, participant);
      this.verboseLog(
        `participant_upsert session=${sessionId} appId=${JSON.stringify(normalizedAppId)} isNew=false displayName=${JSON.stringify(participant.displayName)} participants=${session.participants.size}`,
      );
      return { participant, isNew: false };
    }

    const participant: ProviderParticipantState = {
      appId: normalizedAppId,
      displayName:
        requestedDisplayName ??
        buildGeneratedParticipantLabel(
          sessionId,
          normalizedAppId,
          usedLabels,
        ),
      ...(params.deviceLabel ? { deviceLabel: params.deviceLabel } : {}),
      ...(typeof params.supportsThinkingTrace === "boolean"
        ? { supportsThinkingTrace: params.supportsThinkingTrace }
        : {}),
      joinedAt: params.sentAt,
      lastSeenAt: params.sentAt,
    };
    session.participants.set(normalizedAppId, participant);
    this.verboseLog(
      `participant_upsert session=${sessionId} appId=${JSON.stringify(normalizedAppId)} isNew=true displayName=${JSON.stringify(participant.displayName)} participants=${session.participants.size}`,
    );
    return { participant, isNew: true };
  }

  private async sendPayloadWithSessionKey(
    sessionId: string,
    sessionKey: string,
    payload: Parameters<typeof encryptPayload>[0]["payload"],
    targetAppId?: string,
  ): Promise<void> {
    this.verboseLog(
      `payload_out session=${sessionId} ${summarizePayload(payload)} target=${JSON.stringify(targetAppId ?? "broadcast")}`,
    );
    await this.relayClient.sendFrame(
      sessionId,
      encryptPayload({
        sessionId,
        sessionKey,
        payload,
      }),
      targetAppId,
    );
  }

  private async sendPayload(
    sessionId: string,
    payload: Parameters<typeof encryptPayload>[0]["payload"],
    targetAppId?: string,
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.sendPayloadWithSessionKey(
      sessionId,
      session.invite.sessionKey,
      payload,
      targetAppId,
    );
  }

  async sendAssistantMessage(
    sessionId: string,
    params: {
      text: string;
      replyTo?: string;
      pending?: boolean;
      attachments?: PrivateClawAttachment[];
      messageId?: string;
      sentAt?: string;
      targetAppId?: string;
      storeHistory?: boolean;
    },
  ): Promise<void> {
    const sentAt = params.sentAt ?? nowIso();
    const messageId = params.messageId ?? buildMessageId("assistant");
    const session = this.requireSession(sessionId);
    if (params.storeHistory !== false) {
      session.history.push({
        messageId,
        role: "assistant",
        text: params.text,
        sentAt,
        ...(params.replyTo ? { replyTo: params.replyTo } : {}),
        ...(params.attachments ? { attachments: params.attachments } : {}),
      });
    }
    await this.sendPayload(sessionId, {
      kind: "assistant_message",
      messageId,
      text: params.text,
      sentAt,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.pending ? { pending: true } : {}),
      ...(params.attachments ? { attachments: params.attachments } : {}),
    }, params.targetAppId);
  }

  async sendThinkingMessage(
    sessionId: string,
    params: {
      messageId: string;
      status: PrivateClawThinkingStatus;
      summary: string;
      entries: ReadonlyArray<PrivateClawThinkingEntry>;
      replyTo?: string;
      sentAt?: string;
      targetAppId?: string;
      storeHistory?: boolean;
    },
  ): Promise<void> {
    const sentAt = params.sentAt ?? nowIso();
    const session = this.requireSession(sessionId);
    if (params.storeHistory !== false) {
      this.upsertThinkingHistoryTurn(session, {
        messageId: params.messageId,
        sentAt,
        status: params.status,
        summary: params.summary,
        entries: params.entries,
        ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      });
    }
    const targetAppIds = params.targetAppId
      ? (session.participants.get(params.targetAppId)?.supportsThinkingTrace === true
          ? [params.targetAppId]
          : [])
      : [...session.participants.values()]
          .filter((participant) => participant.supportsThinkingTrace === true)
          .map((participant) => participant.appId);
    if (targetAppIds.length === 0) {
      return;
    }
    const payload = {
      kind: "thinking_message",
      messageId: params.messageId,
      status: params.status,
      summary: params.summary,
      entries: cloneThinkingEntries(params.entries),
      sentAt,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    } as const;
    await Promise.all(
      targetAppIds.map((targetAppId) =>
        this.sendPayload(sessionId, payload, targetAppId),
      ),
    );
  }

  private async sendPendingAssistantStatus(
    sessionId: string,
    params: {
      replyTo: string;
      targetAppId?: string;
      sentAt?: string;
    },
  ): Promise<void> {
    await this.sendAssistantMessage(sessionId, {
      text: "",
      replyTo: params.replyTo,
      pending: true,
      messageId: buildPendingAssistantMessageId(params.replyTo),
      storeHistory: false,
      ...(params.sentAt ? { sentAt: params.sentAt } : {}),
      ...(params.targetAppId ? { targetAppId: params.targetAppId } : {}),
    });
  }

  async sendSystemMessage(
    sessionId: string,
    message: string,
    severity: "info" | "error" = "info",
    replyTo?: string,
    params?: {
      messageId?: string;
      sentAt?: string;
      targetAppId?: string;
      storeHistory?: boolean;
    },
  ): Promise<void> {
    const sentAt = params?.sentAt ?? nowIso();
    const messageId = params?.messageId ?? buildMessageId("system");
    const session = this.requireSession(sessionId);
    if (params?.storeHistory !== false) {
      session.history.push({
        messageId,
        role: "system",
        text: message,
        sentAt,
        ...(replyTo ? { replyTo } : {}),
        severity,
      });
    }
    await this.sendPayload(sessionId, {
      kind: "system_message",
      messageId,
      message,
      severity,
      sentAt,
      ...(replyTo ? { replyTo } : {}),
    }, params?.targetAppId);
  }

  private async sendSystemMessageToGroupParticipants(
    sessionId: string,
    message: string,
    params?: {
      excludeAppId?: string;
      severity?: "info" | "error";
      sentAt?: string;
      messageId?: string;
    },
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const sentAt = params?.sentAt ?? nowIso();
    const severity = params?.severity ?? "info";
    const messageId = params?.messageId ?? buildMessageId("system");
    const targetAppIds = [...session.participants.keys()].filter(
      (appId) => appId !== params?.excludeAppId,
    );

    if (targetAppIds.length === 0) {
      return;
    }

    session.history.push({
      messageId,
      role: "system",
      text: message,
      sentAt,
      severity,
    });

    await Promise.all(
      targetAppIds.map((targetAppId) =>
        this.sendPayload(
          sessionId,
          {
            kind: "system_message",
            messageId,
            message,
            severity,
            sentAt,
          },
          targetAppId,
        ),
      ),
    );
  }

  private async sendParticipantMessage(
    sessionId: string,
    params: {
      text: string;
      senderAppId: string;
      senderDisplayName: string;
      clientMessageId: string;
      sentAt?: string;
      attachments?: PrivateClawAttachment[];
      bridgeText?: string;
      targetAppId?: string;
      storeHistory?: boolean;
    },
  ): Promise<void> {
    const sentAt = params.sentAt ?? nowIso();
    const session = this.requireSession(sessionId);
    if (params.storeHistory !== false) {
      this.storeUserMessageTurn(session, {
        messageId: params.clientMessageId,
        text: params.text,
        sentAt,
        appId: params.senderAppId,
        participantLabel: params.senderDisplayName,
        ...(params.attachments ? { attachments: params.attachments } : {}),
        ...(params.bridgeText ? { bridgeText: params.bridgeText } : {}),
      });
    }
    await this.sendPayload(sessionId, {
      kind: "participant_message",
      messageId: params.clientMessageId,
      senderAppId: params.senderAppId,
      senderDisplayName: params.senderDisplayName,
      text: params.text,
      clientMessageId: params.clientMessageId,
      sentAt,
      ...(params.attachments ? { attachments: params.attachments } : {}),
    }, params.targetAppId);
  }

  private async sendParticipantMessageToGroupParticipants(
    sessionId: string,
    params: {
      text: string;
      senderAppId: string;
      senderDisplayName: string;
      clientMessageId: string;
      sentAt?: string;
      attachments?: PrivateClawAttachment[];
      excludeAppId?: string;
      bridgeText?: string;
      storeHistory?: boolean;
    },
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const sentAt = params.sentAt ?? nowIso();
    if (params.storeHistory !== false) {
      this.storeUserMessageTurn(session, {
        messageId: params.clientMessageId,
        text: params.text,
        sentAt,
        appId: params.senderAppId,
        participantLabel: params.senderDisplayName,
        ...(params.attachments ? { attachments: params.attachments } : {}),
        ...(params.bridgeText ? { bridgeText: params.bridgeText } : {}),
      });
    }
    const targetAppIds = [...session.participants.keys()].filter(
      (appId) => appId !== params.excludeAppId,
    );
    if (targetAppIds.length === 0) {
      return;
    }
    await Promise.all(
      targetAppIds.map((targetAppId) =>
        this.sendPayload(
          sessionId,
          {
            kind: "participant_message",
            messageId: params.clientMessageId,
            senderAppId: params.senderAppId,
            senderDisplayName: params.senderDisplayName,
            text: params.text,
            clientMessageId: params.clientMessageId,
            sentAt,
            ...(params.attachments ? { attachments: params.attachments } : {}),
          },
          targetAppId,
        ),
      ),
    );
  }

  private storeUserMessageTurn(
    session: ProviderSessionState,
    params: {
      messageId: string;
      text: string;
      sentAt: string;
      bridgeText?: string;
      appId?: string;
      participantLabel?: string;
      attachments?: PrivateClawAttachment[];
    },
  ): void {
    session.history.push({
      messageId: params.messageId,
      role: "user",
      text: params.text,
      sentAt: params.sentAt,
      ...(params.bridgeText ? { bridgeText: params.bridgeText } : {}),
      ...(params.appId ? { appId: params.appId } : {}),
      ...(params.participantLabel ? { participantLabel: params.participantLabel } : {}),
      ...(params.attachments ? { attachments: params.attachments } : {}),
    });
  }

  private upsertThinkingHistoryTurn(
    session: ProviderSessionState,
    params: {
      messageId: string;
      replyTo?: string;
      sentAt: string;
      status: PrivateClawThinkingStatus;
      summary: string;
      entries: ReadonlyArray<PrivateClawThinkingEntry>;
    },
  ): void {
    const turn: PrivateClawConversationTurn = {
      messageId: params.messageId,
      role: "thinking",
      text: params.summary,
      sentAt: params.sentAt,
      thinkingStatus: params.status,
      thinkingSummary: params.summary,
      thinkingEntries: cloneThinkingEntries(params.entries),
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    };
    const existingIndex = session.history.findIndex(
      (item) => item.messageId === params.messageId,
    );
    if (existingIndex >= 0) {
      session.history[existingIndex] = turn;
      return;
    }
    session.history.push(turn);
  }

  private updateStoredUserBridgeText(
    session: ProviderSessionState,
    messageId: string,
    bridgeText: string,
  ): void {
    for (let index = session.history.length - 1; index >= 0; index -= 1) {
      const turn = session.history[index];
      if (turn?.role === "user" && turn.messageId === messageId) {
        turn.bridgeText = bridgeText;
        return;
      }
    }
  }

  private async sendWelcomeMessage(
    sessionId: string,
    targetAppId?: string,
  ): Promise<void> {
    const sentAt = nowIso();
    const message = this.options.welcomeMessage ?? buildWelcomeMessage();
    await this.sendPayload(sessionId, {
      kind: "server_welcome",
      message,
      sentAt,
    }, targetAppId);
  }

  private async listAvailableCommands(
    session: ProviderSessionState,
  ): Promise<PrivateClawSlashCommand[]> {
    const discovered = (await this.options.commandsProvider?.()) ?? [];
    const commands: PrivateClawSlashCommand[] = [
      ...discovered,
      {
        slash: "/renew-session",
        description: PRIVATECLAW_RENEW_SESSION_DESCRIPTION,
        acceptsArgs: false,
        source: "privateclaw",
      },
      {
        slash: "/session-qr",
        description: PRIVATECLAW_SESSION_QR_DESCRIPTION,
        acceptsArgs: false,
        source: "privateclaw",
      },
    ];

    if (session.groupMode) {
      commands.push({
        slash: session.botMuted ? "/unmute-bot" : "/mute-bot",
        description: session.botMuted
          ? PRIVATECLAW_UNMUTE_BOT_DESCRIPTION
          : PRIVATECLAW_MUTE_BOT_DESCRIPTION,
        acceptsArgs: false,
        source: "privateclaw",
      });
    }

    return dedupeCommands(commands);
  }

  private async sendCapabilities(
    sessionId: string,
    params?: {
      targetAppId?: string;
      includeCurrentIdentity?: boolean;
    },
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const currentParticipant = params?.targetAppId
      ? session.participants.get(params.targetAppId)
      : undefined;
    const commands = await this.listAvailableCommands(session);
    this.verboseLog(
      `capabilities_out session=${sessionId} targetAppId=${JSON.stringify(params?.targetAppId ?? "broadcast")} includeCurrentIdentity=${params?.includeCurrentIdentity === true} commands=${commands.length} participants=${session.participants.size} groupMode=${session.groupMode}`,
    );
    await this.sendPayload(sessionId, {
      kind: "provider_capabilities",
      sentAt: nowIso(),
      expiresAt: session.invite.expiresAt,
      ...(session.groupMode ? { groupMode: true } : {}),
      ...(session.groupMode ? { botMuted: session.botMuted } : {}),
      commands,
      ...(session.groupMode
        ? { participants: this.listParticipants(session) }
        : {}),
      ...(session.invite.providerLabel
        ? { providerLabel: session.invite.providerLabel }
        : {}),
      ...(params?.includeCurrentIdentity && currentParticipant
        ? {
            currentAppId: currentParticipant.appId,
            currentDisplayName: currentParticipant.displayName,
          }
        : {}),
    }, params?.targetAppId);
  }

  private async sendHistorySnapshot(
    sessionId: string,
    targetAppId: string,
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    this.verboseLog(
      `history_snapshot_out session=${sessionId} targetAppId=${JSON.stringify(targetAppId)} turns=${session.history.length}`,
    );
    for (const turn of session.history) {
      switch (turn.role) {
        case "assistant":
          await this.sendAssistantMessage(sessionId, {
            messageId: turn.messageId,
            text: turn.text,
            sentAt: turn.sentAt,
            targetAppId,
            storeHistory: false,
            ...(turn.replyTo ? { replyTo: turn.replyTo } : {}),
            ...(turn.attachments ? { attachments: turn.attachments } : {}),
          });
          break;
        case "system":
          await this.sendSystemMessage(
            sessionId,
            turn.text,
            turn.severity ?? "info",
            turn.replyTo,
            {
              messageId: turn.messageId,
              sentAt: turn.sentAt,
              targetAppId,
              storeHistory: false,
            },
          );
          break;
        case "thinking":
          await this.sendThinkingMessage(sessionId, {
            messageId: turn.messageId,
            status: turn.thinkingStatus ?? "completed",
            summary: turn.thinkingSummary ?? turn.text,
            entries: turn.thinkingEntries ?? [],
            sentAt: turn.sentAt,
            targetAppId,
            storeHistory: false,
            ...(turn.replyTo ? { replyTo: turn.replyTo } : {}),
          });
          break;
        case "user":
          if (!session.groupMode || !turn.appId || !turn.participantLabel) {
            break;
          }
          await this.sendParticipantMessage(sessionId, {
            text: turn.text,
            senderAppId: turn.appId,
            senderDisplayName: turn.participantLabel,
            clientMessageId: turn.messageId,
            sentAt: turn.sentAt,
            targetAppId,
            storeHistory: false,
            ...(turn.attachments ? { attachments: turn.attachments } : {}),
          });
          break;
      }
    }
  }

  private async renewSession(sessionId: string, replyTo?: string): Promise<void> {
    const session = this.requireSession(sessionId);
    if (session.pendingRenewal) {
      await this.sendSystemMessage(
        sessionId,
        buildRenewalAlreadyInProgressMessage(),
        "error",
        replyTo,
      );
      return;
    }

    const { expiresAt } = await this.relayClient.renewSession(
      sessionId,
      RENEW_SESSION_TTL_MS,
    );
    const sentAt = nowIso();
    const previousSessionKey = session.invite.sessionKey;
    const nextSessionKey = generateSessionKey();

    await this.sendPayloadWithSessionKey(sessionId, previousSessionKey, {
      kind: "session_renewed",
      message: buildRenewalPayloadMessage(),
      newSessionKey: nextSessionKey,
      expiresAt,
      sentAt,
      ...(replyTo ? { replyTo } : {}),
    });

    session.invite = {
      ...session.invite,
      sessionKey: nextSessionKey,
      expiresAt,
    };
    session.pendingRenewal = { expiresAt, sentAt };
    this.scheduleRenewalReminder(sessionId);
    session.state = "awaiting_hello";
    session.history.push({
      messageId: buildMessageId("system"),
      role: "system",
      text: buildRenewalInitiatedMessage(expiresAt),
      sentAt,
      severity: "info",
    });
  }

  private async handleRelayFrame(
    sessionId: string,
    envelope: Parameters<typeof decryptPayload>[0]["envelope"],
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const payload = decryptPayload({
      sessionId,
      sessionKey: session.invite.sessionKey,
      envelope,
    });
    const payloadRecord = toUnknownRecord(payload);
    this.verboseLog(
      `payload_in session=${sessionId} kind=${payload.kind} state=${session.state} appId=${JSON.stringify(readNonEmptyString(payloadRecord.appId) ?? "none")} textChars=${typeof payloadRecord.text === "string" ? payloadRecord.text.length : 0} attachments=${countPayloadAttachments(payloadRecord)}`,
    );

    switch (payload.kind) {
      case "client_hello": {
        const normalizedAppId = payload.appId?.trim() || "legacy-app";
        if (session.removedParticipantAppIds.has(normalizedAppId)) {
          await this.relayClient.closeApp(
            sessionId,
            normalizedAppId,
            "participant_removed",
          );
          return;
        }
        const participantState = await this.upsertParticipant(sessionId, {
          sentAt: payload.sentAt,
          supportsThinkingTrace: payload.supportsThinkingTrace === true,
          ...(payload.appId ? { appId: normalizedAppId } : {}),
          ...(payload.deviceLabel
            ? { deviceLabel: payload.deviceLabel }
            : {}),
          ...(payload.displayName
            ? { displayName: payload.displayName }
            : {}),
        });
        const participant = participantState.participant;
        const wasAwaitingHello = session.state !== "active";
        const wasRenewing = Boolean(session.pendingRenewal);
        this.verboseLog(
          `client_hello_processed session=${sessionId} appId=${JSON.stringify(participant.appId)} isNew=${participantState.isNew} participants=${session.participants.size} awaitingHello=${wasAwaitingHello} renewing=${wasRenewing} groupMode=${session.groupMode}`,
        );
        session.state = "active";
        this.ensureGroupIdleAnchor(session, payload.sentAt);
        this.scheduleGroupIdlePrompt(sessionId);
        this.scheduleSilentJoinPrompt(sessionId, participant.appId);
        if (wasRenewing) {
          session.history.push({
            messageId: buildMessageId("system"),
            role: "system",
            text: buildSessionKeyRotationCompletedMessage(
              participant.displayName,
            ),
            sentAt: payload.sentAt,
            severity: "info",
          });
          delete session.pendingRenewal;
        } else if (!session.groupMode && wasAwaitingHello) {
          session.history.push({
            messageId: buildMessageId("system"),
            role: "system",
            text: buildSingleSessionConnectedMessage(participant.displayName),
            sentAt: payload.sentAt,
            severity: "info",
          });
        }

        if (session.groupMode) {
          await this.sendHistorySnapshot(sessionId, participant.appId);
          await this.sendWelcomeMessage(sessionId, participant.appId);
          await this.sendCapabilities(sessionId, {
            targetAppId: participant.appId,
            includeCurrentIdentity: true,
          });
          if (participantState.isNew && session.participants.size > 1) {
            await this.sendSystemMessageToGroupParticipants(
              sessionId,
              buildParticipantJoinedMessage(participant.displayName),
              {
                excludeAppId: participant.appId,
                sentAt: payload.sentAt,
              },
            );
          }
          await this.sendCapabilities(sessionId);
          return;
        }

        if (wasAwaitingHello && !wasRenewing) {
          await this.sendWelcomeMessage(sessionId);
        }
        await this.sendCapabilities(sessionId, {
          targetAppId: participant.appId,
          includeCurrentIdentity: true,
        });
        return;
      }
      case "user_message": {
        if (session.state !== "active") {
          await this.sendSystemMessage(
            sessionId,
            buildHandshakeIncompleteMessage(),
            "error",
            payload.clientMessageId,
          );
          return;
        }

        this.options.onLog?.(
          `[provider] user_message session=${sessionId} textChars=${payload.text.length} attachments=${payload.attachments?.length ?? 0}`,
        );
        for (const attachment of payload.attachments ?? []) {
          this.options.onLog?.(
            `[provider] attachment_in session=${sessionId} name=${JSON.stringify(attachment.name)} mimeType=${attachment.mimeType} sizeBytes=${attachment.sizeBytes} hasData=${Boolean(attachment.dataBase64?.trim())} hasUri=${Boolean(attachment.uri?.trim())}`,
          );
        }

        const participant =
          (payload.appId ? session.participants.get(payload.appId) : undefined) ??
          (session.participants.size === 1
            ? [...session.participants.values()][0]
            : undefined);
        if (session.groupMode && participant) {
          this.markParticipantSpoke(sessionId, participant.appId, payload.sentAt);
        }

        const normalizedCommand = payload.text.trim().toLowerCase();
        const directBridgeSlashCommand = normalizeBridgeSlashCommandText(payload.text);
        const isRenewCommand =
          normalizedCommand === "/renew-session" ||
          normalizedCommand === "/session_renew";
        const hasRenewCommandArgs =
          normalizedCommand.startsWith("/renew-session ") ||
          normalizedCommand.startsWith("/session_renew ");
        const isSessionQrCommand = normalizedCommand === "/session-qr";
        const hasSessionQrArgs = normalizedCommand.startsWith("/session-qr ");
        const isMuteBotCommand = normalizedCommand === "/mute-bot";
        const hasMuteBotArgs = normalizedCommand.startsWith("/mute-bot ");
        const isUnmuteBotCommand = normalizedCommand === "/unmute-bot";
        const hasUnmuteBotArgs = normalizedCommand.startsWith("/unmute-bot ");
        if (isRenewCommand) {
          if ((payload.attachments?.length ?? 0) > 0) {
            await this.sendSystemMessage(
              sessionId,
              buildCommandDoesNotAcceptAttachmentsMessage("/renew-session"),
              "error",
              payload.clientMessageId,
            );
            return;
          }
          try {
            await this.renewSession(sessionId, payload.clientMessageId);
          } catch (error) {
            await this.sendSystemMessage(
              sessionId,
              buildRenewSessionFailureMessage(
                error instanceof Error ? error.message : String(error),
              ),
              "error",
              payload.clientMessageId,
            );
          }
          return;
        }
        if (hasRenewCommandArgs) {
          await this.sendSystemMessage(
            sessionId,
            buildCommandDoesNotAcceptArgumentsMessage("/renew-session"),
            "error",
            payload.clientMessageId,
          );
          return;
        }

        if (isSessionQrCommand) {
          if ((payload.attachments?.length ?? 0) > 0) {
            await this.sendSystemMessage(
              sessionId,
              buildCommandDoesNotAcceptAttachmentsMessage("/session-qr"),
              "error",
              payload.clientMessageId,
              participant
                ? {
                    targetAppId: participant.appId,
                    storeHistory: false,
                  }
                : undefined,
            );
            return;
          }
          if (session.groupMode && !participant) {
            await this.sendSystemMessage(
              sessionId,
              buildMissingParticipantIdentityMessage(),
              "error",
              payload.clientMessageId,
            );
            return;
          }
          try {
            const qrAttachment = await this.buildSessionQrAttachment(sessionId);
            await this.sendAssistantMessage(sessionId, {
              text: buildSessionQrMessage(session),
              replyTo: payload.clientMessageId,
              attachments: [qrAttachment],
              ...(participant ? { targetAppId: participant.appId } : {}),
              storeHistory: false,
            });
          } catch (error) {
            await this.sendSystemMessage(
              sessionId,
              buildSessionQrFailureMessage(
                error instanceof Error ? error.message : String(error),
              ),
              "error",
              payload.clientMessageId,
              participant
                ? {
                    targetAppId: participant.appId,
                    storeHistory: false,
                  }
                : undefined,
            );
          }
          return;
        }
        if (hasSessionQrArgs) {
          await this.sendSystemMessage(
            sessionId,
            buildCommandDoesNotAcceptArgumentsMessage("/session-qr"),
            "error",
            payload.clientMessageId,
            participant
              ? {
                  targetAppId: participant.appId,
                  storeHistory: false,
                }
              : undefined,
          );
          return;
        }

        if (isMuteBotCommand || isUnmuteBotCommand) {
          const command = isMuteBotCommand ? "/mute-bot" : "/unmute-bot";
          if ((payload.attachments?.length ?? 0) > 0) {
            await this.sendSystemMessage(
              sessionId,
              buildCommandDoesNotAcceptAttachmentsMessage(command),
              "error",
              payload.clientMessageId,
            );
            return;
          }
          if (!session.groupMode) {
            await this.sendSystemMessage(
              sessionId,
              buildGroupOnlyCommandMessage(command),
              "error",
              payload.clientMessageId,
            );
            return;
          }
          if (!participant) {
            await this.sendSystemMessage(
              sessionId,
              buildMissingParticipantIdentityMessage(),
              "error",
              payload.clientMessageId,
            );
            return;
          }

          const shouldMute = isMuteBotCommand;
          if (session.botMuted === shouldMute) {
            await this.sendSystemMessage(
              sessionId,
              shouldMute
                ? buildBotAlreadyMutedMessage()
                : buildBotAlreadyUnmutedMessage(),
              "info",
              payload.clientMessageId,
            );
            return;
          }

          session.botMuted = shouldMute;
          const messageId = buildMessageId("system");
          const message = shouldMute
            ? buildBotMutedMessage(participant.displayName)
            : buildBotUnmutedMessage(participant.displayName);
          await this.sendSystemMessage(
            sessionId,
            message,
            "info",
            payload.clientMessageId,
            {
              messageId,
              sentAt: payload.sentAt,
              targetAppId: participant.appId,
              storeHistory: false,
            },
          );
          await this.sendSystemMessageToGroupParticipants(
            sessionId,
            message,
            {
              excludeAppId: participant.appId,
              sentAt: payload.sentAt,
              messageId,
            },
          );
          if (shouldMute) {
            this.clearBotModeTimers(session);
          } else {
            this.scheduleBotModeTimers(sessionId);
          }
          await this.sendCapabilities(sessionId);
          return;
        }

        if (hasMuteBotArgs || hasUnmuteBotArgs) {
          const command = hasMuteBotArgs ? "/mute-bot" : "/unmute-bot";
          await this.sendSystemMessage(
            sessionId,
            buildCommandDoesNotAcceptArgumentsMessage(command),
            "error",
            payload.clientMessageId,
          );
          return;
        }

        if (session.groupMode && !participant) {
          await this.sendSystemMessage(
            sessionId,
            buildMissingParticipantIdentityMessage(),
            "error",
            payload.clientMessageId,
          );
          return;
        }

        const supportsVoiceTranscription = Boolean(
          this.options.bridge.transcribeAudioAttachments,
        );
        const containsAudioAttachment = hasAudioAttachments(payload.attachments);
        const shouldHandleVoiceAsynchronously =
          containsAudioAttachment && supportsVoiceTranscription;
        const voiceFeedbackParams =
          shouldHandleVoiceAsynchronously && participant
            ? {
                targetAppId: participant.appId,
                storeHistory: false,
              }
            : undefined;

        if (shouldHandleVoiceAsynchronously) {
          if (session.groupMode) {
            this.storeUserMessageTurn(session, {
              messageId: payload.clientMessageId,
              text: payload.text,
              sentAt: payload.sentAt,
              appId: participant!.appId,
              participantLabel: participant!.displayName,
              ...(payload.attachments ? { attachments: payload.attachments } : {}),
            });
            await this.sendParticipantMessageToGroupParticipants(sessionId, {
              text: payload.text,
              senderAppId: participant!.appId,
              senderDisplayName: participant!.displayName,
              clientMessageId: payload.clientMessageId,
              sentAt: payload.sentAt,
              ...(payload.attachments ? { attachments: payload.attachments } : {}),
              excludeAppId: participant!.appId,
              storeHistory: false,
            });
          } else {
            this.storeUserMessageTurn(session, {
              messageId: payload.clientMessageId,
              text: payload.text,
              sentAt: payload.sentAt,
              ...(payload.attachments ? { attachments: payload.attachments } : {}),
            });
          }
        }

        if (session.groupMode && session.botMuted && !directBridgeSlashCommand) {
          if (!shouldHandleVoiceAsynchronously) {
            await this.sendParticipantMessage(sessionId, {
              text: payload.text,
              senderAppId: participant!.appId,
              senderDisplayName: participant!.displayName,
              clientMessageId: payload.clientMessageId,
              sentAt: payload.sentAt,
              ...(payload.attachments ? { attachments: payload.attachments } : {}),
            });
          }
          return;
        }

        if (voiceFeedbackParams) {
          await this.sendSystemMessage(
            sessionId,
            buildVoiceReceiptMessage(),
            "info",
            undefined,
            voiceFeedbackParams,
          );
          await this.sendPendingAssistantStatus(sessionId, {
            replyTo: payload.clientMessageId,
            targetAppId: voiceFeedbackParams.targetAppId,
            sentAt: payload.sentAt,
          });
        }

        let preparedMessage: PreparedUserMessage;
        try {
          preparedMessage = await this.prepareUserMessage(
            session,
            payload,
            participant,
          );
        } catch (error) {
          await this.sendSystemMessage(
            sessionId,
            buildBridgeErrorMessage(
              error instanceof Error ? error.message : String(error),
            ),
            "error",
            payload.clientMessageId,
            voiceFeedbackParams,
          );
          return;
        }

        if (shouldHandleVoiceAsynchronously) {
          if (preparedMessage.historyBridgeText) {
            this.updateStoredUserBridgeText(
              session,
              payload.clientMessageId,
              preparedMessage.historyBridgeText,
            );
          }
        } else if (session.groupMode) {
          await this.sendParticipantMessage(sessionId, {
            text: preparedMessage.text,
            senderAppId: participant!.appId,
            senderDisplayName: participant!.displayName,
            clientMessageId: payload.clientMessageId,
            sentAt: payload.sentAt,
            ...(preparedMessage.attachments
              ? { attachments: preparedMessage.attachments }
              : {}),
            ...(preparedMessage.historyBridgeText
              ? { bridgeText: preparedMessage.historyBridgeText }
              : {}),
          });
        } else {
          this.storeUserMessageTurn(session, {
            messageId: payload.clientMessageId,
            text: preparedMessage.text,
            sentAt: payload.sentAt,
            ...(preparedMessage.historyBridgeText
              ? { bridgeText: preparedMessage.historyBridgeText }
              : {}),
            ...(preparedMessage.attachments
              ? { attachments: preparedMessage.attachments }
              : {}),
          });
        }

        const bridgeMessage =
          preparedMessage.bridgeText ??
          (session.groupMode && participant
            ? `${participant.displayName}: ${preparedMessage.text}`
            : preparedMessage.text);
        const supportsThinkingTrace =
          this.options.bridge.supportsThinkingTrace === true;
        const thinkingMessageId = buildThinkingMessageId(payload.clientMessageId);
        let latestThinkingSummary = "";
        let latestThinkingEntries: PrivateClawThinkingEntry[] = [];
        try {
          if (supportsThinkingTrace) {
            await this.sendThinkingMessage(sessionId, {
              messageId: thinkingMessageId,
              status: "started",
              summary: "",
              entries: [],
              replyTo: payload.clientMessageId,
              sentAt: payload.sentAt,
              storeHistory: false,
            });
          }
          const bridgeResponse = await this.options.bridge.handleUserMessage({
            sessionId,
            invite: session.invite,
            message: bridgeMessage,
            ...(preparedMessage.bridgeAttachments
              ? { attachments: preparedMessage.bridgeAttachments }
              : preparedMessage.attachments
                ? { attachments: preparedMessage.attachments }
               : {}),
            history: this.buildBridgeHistory(session),
            ...(supportsThinkingTrace
              ? {
                  onThinkingTrace: async (snapshot) => {
                    latestThinkingSummary = snapshot.summary;
                    latestThinkingEntries = cloneThinkingEntries(snapshot.entries);
                    await this.sendThinkingMessage(sessionId, {
                      messageId: thinkingMessageId,
                      status: "streaming",
                      summary: snapshot.summary,
                      entries: snapshot.entries,
                      replyTo: payload.clientMessageId,
                      sentAt: snapshot.sentAt,
                      storeHistory: snapshot.entries.length > 0,
                    });
                  },
                }
              : {}),
          });
          if (supportsThinkingTrace) {
            await this.sendThinkingMessage(sessionId, {
              messageId: thinkingMessageId,
              status: "completed",
              summary: latestThinkingSummary,
              entries: latestThinkingEntries,
              replyTo: payload.clientMessageId,
              storeHistory: latestThinkingEntries.length > 0,
            });
          }

          for (const message of normalizeBridgeMessages(bridgeResponse)) {
            this.options.onLog?.(
              `[provider] bridge_message_out session=${sessionId} textChars=${message.text.length} attachments=${message.attachments?.length ?? 0}`,
            );
            for (const attachment of message.attachments ?? []) {
              this.options.onLog?.(
                `[provider] attachment_out session=${sessionId} name=${JSON.stringify(attachment.name)} mimeType=${attachment.mimeType} sizeBytes=${attachment.sizeBytes} hasData=${Boolean(attachment.dataBase64?.trim())}`,
              );
            }
            await this.sendAssistantMessage(sessionId, {
              text: message.text,
              replyTo: payload.clientMessageId,
              ...(message.attachments ? { attachments: message.attachments } : {}),
            });
          }
        } catch (error) {
          if (supportsThinkingTrace) {
            await this.sendThinkingMessage(sessionId, {
              messageId: thinkingMessageId,
              status: "failed",
              summary: latestThinkingSummary,
              entries: latestThinkingEntries,
              replyTo: payload.clientMessageId,
              storeHistory: latestThinkingEntries.length > 0,
            });
          }
          await this.sendSystemMessage(
            sessionId,
            buildBridgeErrorMessage(
              error instanceof Error ? error.message : String(error),
            ),
            "error",
            payload.clientMessageId,
            voiceFeedbackParams,
          );
        }
        return;
      }
      case "session_close": {
        if (!session.groupMode) {
          this.deleteSession(sessionId);
          await this.relayClient.closeSession(sessionId, payload.reason);
          return;
        }

        const participantAppId =
          payload.appId?.trim() ||
          (session.participants.size === 1
            ? [...session.participants.keys()][0]
            : undefined);
        if (!participantAppId) {
          return;
        }

        const participant = session.participants.get(participantAppId);
        session.participants.delete(participantAppId);
        this.clearBotModeSilentJoinTimer(session, participantAppId);
        if (session.participants.size === 0) {
          delete session.botModeIdleAnchorAt;
        }
        if (participant && session.participants.size > 0) {
          await this.sendSystemMessageToGroupParticipants(
            sessionId,
            buildParticipantLeftMessage(participant.displayName),
            { sentAt: payload.sentAt },
          );
        }
        if (session.participants.size > 0) {
          await this.sendCapabilities(sessionId);
        }
        this.scheduleGroupIdlePrompt(sessionId);
        return;
      }
      case "assistant_message":
      case "participant_message":
      case "server_welcome":
      case "provider_capabilities":
      case "session_renewed":
      case "system_message":
        return;
      default:
        await this.sendSystemMessage(
          sessionId,
          buildUnsupportedPayloadMessage(
            (payload as { kind?: string }).kind ?? "unknown",
          ),
          "error",
        );
    }
  }

  async createInviteBundle(params?: {
    ttlMs?: number;
    label?: string;
    groupMode?: boolean;
  }): Promise<PrivateClawInviteBundle> {
    await this.connect();

    const groupMode = params?.groupMode === true;
    const relayLabel = buildRelayLabel(this.options.appWsUrl);
    const { sessionId, expiresAt } = await this.relayClient.createSession(
      params?.ttlMs ?? this.options.defaultTtlMs,
      params?.label,
      groupMode,
    );

    const invite: PrivateClawInvite = {
      version: 1,
      sessionId,
      sessionKey: generateSessionKey(),
      appWsUrl: this.buildSessionAppUrl(sessionId),
      expiresAt,
      ...(groupMode ? { groupMode: true } : {}),
      ...(this.options.providerLabel ? { providerLabel: this.options.providerLabel } : {}),
      ...(relayLabel ? { relayLabel } : {}),
    };

    this.sessions.set(sessionId, {
      invite,
      ...(params?.label ? { label: params.label } : {}),
      history: [],
      groupMode,
      botMuted: false,
      participants: new Map<string, ProviderParticipantState>(),
      removedParticipantAppIds: new Set<string>(),
      state: "awaiting_hello",
      botModeSilentJoinTimers: new Map<string, ReturnType<typeof setTimeout>>(),
    });
    this.scheduleRenewalReminder(sessionId);
    this.verboseLog(
      `session_created session=${sessionId} groupMode=${groupMode} label=${JSON.stringify(params?.label ?? "")} expiresAt=${JSON.stringify(expiresAt)} relayLabel=${JSON.stringify(relayLabel ?? "")} ttlMs=${params?.ttlMs ?? this.options.defaultTtlMs ?? DEFAULT_SESSION_TTL_MS}`,
    );
    return this.buildInviteBundleForInvite(invite);
  }

  decodeInvite(uri: string): PrivateClawInvite {
    return decodeInviteString(uri);
  }

  private async buildInviteBundleForInvite(
    invite: PrivateClawInvite,
  ): Promise<PrivateClawInviteBundle> {
    const inviteUri = encodeInviteToUri(invite);
    const qrSvg = await QRCode.toString(inviteUri, {
      type: "svg",
      errorCorrectionLevel: PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
      margin: PRIVATECLAW_QR_SVG_MARGIN,
    });
    const qrTerminal = await QRCode.toString(inviteUri, {
      type: "terminal",
      margin: PRIVATECLAW_QR_TERMINAL_MARGIN,
      small: true,
    });

    return {
      invite,
      inviteUri,
      qrSvg,
      qrTerminal,
      announcementText: buildInviteAnnouncementText({
        sessionId: invite.sessionId,
        expiresAt: invite.expiresAt,
        groupMode: invite.groupMode === true,
      }),
    };
  }

  private async buildSessionQrAttachment(sessionId: string): Promise<PrivateClawAttachment> {
    const bundle = await this.getSessionQrBundle(sessionId);
    return this.buildSessionQrAttachmentFromBundle(bundle);
  }

  private async buildSessionQrAttachmentFromBundle(
    bundle: PrivateClawInviteBundle,
  ): Promise<PrivateClawAttachment> {
    const pngBuffer = await QRCode.toBuffer(bundle.inviteUri, {
      type: "png",
      errorCorrectionLevel: PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
      margin: PRIVATECLAW_QR_IMAGE_MARGIN,
      width: PRIVATECLAW_QR_PNG_WIDTH,
    });

    return {
      id: buildMessageId("attachment"),
      name: `privateclaw-${bundle.invite.sessionId}.png`,
      mimeType: "image/png",
      sizeBytes: pngBuffer.length,
      dataBase64: pngBuffer.toString("base64"),
    };
  }
}
