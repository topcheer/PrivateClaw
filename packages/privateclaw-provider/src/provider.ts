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

export const DEFAULT_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const RENEW_SESSION_TTL_MS = DEFAULT_SESSION_TTL_MS;
const SESSION_RENEWAL_REMINDER_WINDOW_MS = 30 * 60 * 1000;
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

function buildMessageId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
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
  };
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
  };
}

function buildRenewalReminderMessage(session: ProviderSessionState): string {
  const command = "/renew-session";
  if (session.groupMode) {
    return formatBilingualText(
      `这个 PrivateClaw 群聊会话将在 30 分钟内过期（${session.invite.expiresAt}）。任意参与者都可以发送 ${command} 将它延长 8 小时。`,
      `This PrivateClaw group session will expire in less than 30 minutes (at ${session.invite.expiresAt}). Any participant can send ${command} to extend it by 8 hours.`,
    );
  }
  return formatBilingualText(
    `这个 PrivateClaw 会话将在 30 分钟内过期（${session.invite.expiresAt}）。发送 ${command} 可将它延长 8 小时。`,
    `This PrivateClaw session will expire in less than 30 minutes (at ${session.invite.expiresAt}). Send ${command} to extend it by 8 hours.`,
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
  if (turn.role !== "user" || !turn.participantLabel) {
    return turn;
  }

  return {
    ...turn,
    text: `${turn.participantLabel}: ${turn.text}`,
  };
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

  async connect(): Promise<void> {
    await this.relayClient.connect();
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

    await this.relayClient.closeApp(sessionId, normalizedAppId, reason);

    if (session.participants.size > 0) {
      await this.sendSystemMessageToGroupParticipants(
        sessionId,
        buildParticipantRemovedByOperatorMessage(participant.displayName),
      );
      await this.sendCapabilities(sessionId);
    }

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
    this.sessions.delete(sessionId);
    return session;
  }

  private buildBridgeHistory(
    session: ProviderSessionState,
  ): PrivateClawConversationTurn[] {
    return session.history.map(formatBridgeHistoryTurn);
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
        lastSeenAt: params.sentAt,
      };
      session.participants.set(normalizedAppId, participant);
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
      joinedAt: params.sentAt,
      lastSeenAt: params.sentAt,
    };
    session.participants.set(normalizedAppId, participant);
    return { participant, isNew: true };
  }

  private async sendPayloadWithSessionKey(
    sessionId: string,
    sessionKey: string,
    payload: Parameters<typeof encryptPayload>[0]["payload"],
    targetAppId?: string,
  ): Promise<void> {
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
      ...(params.attachments ? { attachments: params.attachments } : {}),
    }, params.targetAppId);
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
      targetAppId?: string;
      storeHistory?: boolean;
    },
  ): Promise<void> {
    const sentAt = params.sentAt ?? nowIso();
    const session = this.requireSession(sessionId);
    if (params.storeHistory !== false) {
      session.history.push({
        messageId: params.clientMessageId,
        role: "user",
        text: params.text,
        sentAt,
        appId: params.senderAppId,
        participantLabel: params.senderDisplayName,
        ...(params.attachments ? { attachments: params.attachments } : {}),
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
    await this.sendPayload(sessionId, {
      kind: "provider_capabilities",
      sentAt: nowIso(),
      expiresAt: session.invite.expiresAt,
      ...(session.groupMode ? { groupMode: true } : {}),
      ...(session.groupMode ? { botMuted: session.botMuted } : {}),
      commands: await this.listAvailableCommands(session),
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
        session.state = "active";
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

        const normalizedCommand = payload.text.trim().toLowerCase();
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

        if (session.groupMode) {
          if (!participant) {
            await this.sendSystemMessage(
              sessionId,
              buildMissingParticipantIdentityMessage(),
              "error",
              payload.clientMessageId,
            );
            return;
          }
          await this.sendParticipantMessage(sessionId, {
            text: payload.text,
            senderAppId: participant.appId,
            senderDisplayName: participant.displayName,
            clientMessageId: payload.clientMessageId,
            sentAt: payload.sentAt,
            ...(payload.attachments ? { attachments: payload.attachments } : {}),
          });
        } else {
          session.history.push({
            messageId: payload.clientMessageId,
            role: "user",
            text: payload.text,
            sentAt: payload.sentAt,
            ...(payload.attachments ? { attachments: payload.attachments } : {}),
          });
        }

        if (session.groupMode && session.botMuted) {
          return;
        }

        try {
          const bridgeMessage =
            session.groupMode && participant
              ? `${participant.displayName}: ${payload.text}`
              : payload.text;
          const bridgeResponse = await this.options.bridge.handleUserMessage({
            sessionId,
            invite: session.invite,
            message: bridgeMessage,
            ...(payload.attachments ? { attachments: payload.attachments } : {}),
            history: this.buildBridgeHistory(session),
          });

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
          await this.sendSystemMessage(
            sessionId,
            buildBridgeErrorMessage(
              error instanceof Error ? error.message : String(error),
            ),
            "error",
            payload.clientMessageId,
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
    });
    this.scheduleRenewalReminder(sessionId);
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
