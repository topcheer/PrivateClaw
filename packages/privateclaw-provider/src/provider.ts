import {
  decodeInviteString,
  decryptPayload,
  encodeInviteToUri,
  encryptPayload,
  generateSessionKey,
  type PrivateClawAttachment,
  type PrivateClawInvite,
  type PrivateClawSlashCommand,
} from "@privateclaw/protocol";
import QRCode from "qrcode";
import { RelayProviderClient } from "./relay-provider-client.js";
import type {
  BridgeMessage,
  BridgeResponse,
  PrivateClawConversationTurn,
  PrivateClawInviteBundle,
  PrivateClawProviderOptions,
  ProviderSessionState,
} from "./types.js";

const RENEW_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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
      onFrame: async (sessionId, envelope) => {
        await this.handleRelayFrame(sessionId, envelope);
      },
      onSessionClosed: async (sessionId, reason) => {
        this.sessions.delete(sessionId);
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

  async dispose(): Promise<void> {
    const activeSessionIds = [...this.sessions.keys()];
    for (const sessionId of activeSessionIds) {
      try {
        await this.relayClient.closeSession(sessionId, "provider_shutdown");
      } catch (error) {
        this.options.onLog?.(
          `[provider] failed to close session ${sessionId} during shutdown: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.sessions.clear();
    await this.relayClient.dispose();
  }

  listActiveSessions(): PrivateClawInvite[] {
    return [...this.sessions.values()].map((session) => session.invite);
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

  private async sendPayloadWithSessionKey(
    sessionId: string,
    sessionKey: string,
    payload: Parameters<typeof encryptPayload>[0]["payload"],
  ): Promise<void> {
    await this.relayClient.sendFrame(
      sessionId,
      encryptPayload({
        sessionId,
        sessionKey,
        payload,
      }),
    );
  }

  private async sendPayload(
    sessionId: string,
    payload: Parameters<typeof encryptPayload>[0]["payload"],
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.sendPayloadWithSessionKey(
      sessionId,
      session.invite.sessionKey,
      payload,
    );
  }

  async sendAssistantMessage(
    sessionId: string,
    params: {
      text: string;
      replyTo?: string;
      attachments?: PrivateClawAttachment[];
    },
  ): Promise<void> {
    const sentAt = nowIso();
    const session = this.requireSession(sessionId);
    session.history.push({
      role: "assistant",
      text: params.text,
      sentAt,
      ...(params.attachments ? { attachments: params.attachments } : {}),
    });
    await this.sendPayload(sessionId, {
      kind: "assistant_message",
      text: params.text,
      sentAt,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
      ...(params.attachments ? { attachments: params.attachments } : {}),
    });
  }

  async sendSystemMessage(
    sessionId: string,
    message: string,
    severity: "info" | "error" = "info",
    replyTo?: string,
  ): Promise<void> {
    const sentAt = nowIso();
    const session = this.requireSession(sessionId);
    session.history.push({ role: "system", text: message, sentAt });
    await this.sendPayload(sessionId, {
      kind: "system_message",
      message,
      severity,
      sentAt,
      ...(replyTo ? { replyTo } : {}),
    });
  }

  private async sendWelcomeMessage(sessionId: string): Promise<void> {
    const sentAt = nowIso();
    const message =
      this.options.welcomeMessage ??
      "PrivateClaw connected. Messages from now on are protected by this one-time end-to-end encrypted session.";
    await this.sendPayload(sessionId, {
      kind: "server_welcome",
      message,
      sentAt,
    });
  }

  private async listAvailableCommands(): Promise<PrivateClawSlashCommand[]> {
    const discovered = (await this.options.commandsProvider?.()) ?? [];
    return dedupeCommands([
      ...discovered,
      {
        slash: "/renew-session",
        description:
          "Rotate the current PrivateClaw session key and extend this session by 8 hours.",
        acceptsArgs: false,
        source: "privateclaw",
      },
    ]);
  }

  private async sendCapabilities(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    await this.sendPayload(sessionId, {
      kind: "provider_capabilities",
      sentAt: nowIso(),
      expiresAt: session.invite.expiresAt,
      commands: await this.listAvailableCommands(),
      ...(session.invite.providerLabel
        ? { providerLabel: session.invite.providerLabel }
        : {}),
    });
  }

  private async renewSession(sessionId: string, replyTo?: string): Promise<void> {
    const session = this.requireSession(sessionId);
    if (session.pendingRenewal) {
      await this.sendSystemMessage(
        sessionId,
        "A session renewal is already in progress. Wait for the reconnect handshake to finish and try again.",
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
      message: "Session renewed.",
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
    session.state = "awaiting_hello";
    session.history.push({
      role: "system",
      text: `PrivateClaw session renewal initiated until ${expiresAt}`,
      sentAt,
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
        const wasAwaitingHello = session.state !== "active";
        const wasRenewing = Boolean(session.pendingRenewal);
        session.state = "active";
        if (wasRenewing) {
          session.history.push({
            role: "system",
            text: `${payload.deviceLabel ?? "PrivateClaw app"} completed session key rotation`,
            sentAt: payload.sentAt,
          });
          delete session.pendingRenewal;
        } else if (wasAwaitingHello) {
          session.history.push({
            role: "system",
            text: `${payload.deviceLabel ?? "PrivateClaw app"} connected`,
            sentAt: payload.sentAt,
          });
          await this.sendWelcomeMessage(sessionId);
        }
        await this.sendCapabilities(sessionId);
        return;
      }
      case "user_message": {
        if (session.state !== "active") {
          await this.sendSystemMessage(
            sessionId,
            "The PrivateClaw handshake is not complete yet. Scan the QR code again or retry the connection.",
            "error",
            payload.clientMessageId,
          );
          return;
        }

        session.history.push({
          role: "user",
          text: payload.text,
          sentAt: payload.sentAt,
          ...(payload.attachments ? { attachments: payload.attachments } : {}),
        });
        this.options.onLog?.(
          `[provider] user_message session=${sessionId} textChars=${payload.text.length} attachments=${payload.attachments?.length ?? 0}`,
        );

        const normalizedCommand = payload.text.trim().toLowerCase();
        if (normalizedCommand === "/renew-session") {
          if ((payload.attachments?.length ?? 0) > 0) {
            await this.sendSystemMessage(
              sessionId,
              "The /renew-session command does not accept attachments.",
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
              `Failed to renew the PrivateClaw session: ${error instanceof Error ? error.message : String(error)}`,
              "error",
              payload.clientMessageId,
            );
          }
          return;
        }
        if (normalizedCommand.startsWith("/renew-session ")) {
          await this.sendSystemMessage(
            sessionId,
            "The /renew-session command does not accept arguments.",
            "error",
            payload.clientMessageId,
          );
          return;
        }

        try {
          const bridgeResponse = await this.options.bridge.handleUserMessage({
            sessionId,
            invite: session.invite,
            message: payload.text,
            ...(payload.attachments ? { attachments: payload.attachments } : {}),
            history: [...session.history],
          });

          for (const message of normalizeBridgeMessages(bridgeResponse)) {
            await this.sendAssistantMessage(sessionId, {
              text: message.text,
              replyTo: payload.clientMessageId,
              ...(message.attachments ? { attachments: message.attachments } : {}),
            });
          }
        } catch (error) {
          await this.sendSystemMessage(
            sessionId,
            `OpenClaw bridge error: ${error instanceof Error ? error.message : String(error)}`,
            "error",
            payload.clientMessageId,
          );
        }
        return;
      }
      case "session_close":
        this.sessions.delete(sessionId);
        await this.relayClient.closeSession(sessionId, payload.reason);
        return;
      case "assistant_message":
      case "server_welcome":
      case "provider_capabilities":
      case "session_renewed":
      case "system_message":
        return;
      default:
        await this.sendSystemMessage(
          sessionId,
          `Unsupported PrivateClaw payload: ${(payload as { kind?: string }).kind ?? "unknown"}`,
          "error",
        );
    }
  }

  async createInviteBundle(params?: { ttlMs?: number; label?: string }): Promise<PrivateClawInviteBundle> {
    await this.connect();

    const { sessionId, expiresAt } = await this.relayClient.createSession(
      params?.ttlMs ?? this.options.defaultTtlMs,
      params?.label,
    );

    const invite: PrivateClawInvite = {
      version: 1,
      sessionId,
      sessionKey: generateSessionKey(),
      appWsUrl: this.buildSessionAppUrl(sessionId),
      expiresAt,
      ...(this.options.providerLabel ? { providerLabel: this.options.providerLabel } : {}),
    };

    this.sessions.set(sessionId, {
      invite,
      history: [],
      state: "awaiting_hello",
    });

    const inviteUri = encodeInviteToUri(invite);
    const qrSvg = await QRCode.toString(inviteUri, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
    });
    const qrTerminal = await QRCode.toString(inviteUri, {
      type: "terminal",
      small: true,
    });

    return {
      invite,
      inviteUri,
      qrSvg,
      qrTerminal,
      announcementText:
        `PrivateClaw session ${sessionId} is ready until ${expiresAt}. ` +
        "Scan the QR code or paste the invite link into the PrivateClaw app to connect.",
    };
  }

  decodeInvite(uri: string): PrivateClawInvite {
    return decodeInviteString(uri);
  }
}
