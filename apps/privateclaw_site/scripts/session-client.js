import { createCryptoContext, createMessageId } from "./protocol-web.js?v=20260316-1";

const CONNECT_TIMEOUT_MS = 15000;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

function normalizeTimestamp(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return new Date();
  }
  return parsed;
}

function parseAttachments(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: typeof item.id === "string" ? item.id : createMessageId("attachment"),
      name: typeof item.name === "string" ? item.name : "attachment",
      mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
      sizeBytes: typeof item.sizeBytes === "number" ? item.sizeBytes : 0,
      dataBase64: typeof item.dataBase64 === "string" ? item.dataBase64 : null,
      uri: typeof item.uri === "string" ? item.uri : null,
    }));
}

function parseCommands(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      slash: typeof item.slash === "string" ? item.slash : "/unknown",
      description: typeof item.description === "string" ? item.description : "",
      acceptsArgs: Boolean(item.acceptsArgs),
      source: typeof item.source === "string" ? item.source : "privateclaw",
    }));
}

function parseParticipants(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      appId: typeof item.appId === "string" ? item.appId : createMessageId("participant"),
      displayName: typeof item.displayName === "string" ? item.displayName : "Participant",
      deviceLabel: typeof item.deviceLabel === "string" ? item.deviceLabel : null,
      joinedAt: normalizeTimestamp(item.joinedAt),
    }));
}

function parseThinkingStatus(value) {
  switch (value) {
    case "started":
    case "streaming":
    case "completed":
    case "failed":
      return value;
    default:
      return "completed";
  }
}

function parseThinkingEntryKind(value) {
  switch (value) {
    case "thought":
    case "action":
    case "result":
    case "error":
      return value;
    default:
      return null;
  }
}

function parseThinkingEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .flatMap((item) => {
      const kind = parseThinkingEntryKind(item.kind);
      if (!kind) {
        return [];
      }
      return [{
        id: typeof item.id === "string" ? item.id : createMessageId("thinking-entry"),
        kind,
        title: typeof item.title === "string" ? item.title : "",
        text: typeof item.text === "string" ? item.text : "",
        sentAt: normalizeTimestamp(item.sentAt),
        toolName: typeof item.toolName === "string" ? item.toolName : null,
      }];
    });
}

export class PrivateClawWebSessionClient extends EventTarget {
  constructor(invite, { identity }) {
    super();
    this.invite = { ...invite };
    this.identity = { ...identity };
    this.socket = null;
    this.cryptoContext = null;
    this.connectTimeout = null;
    this.reconnectTimer = null;
    this.disposed = false;
    this.sawTerminalClose = false;
    this.messageCounter = 0;
    this.connectionGeneration = 0;
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  }

  async connect() {
    if (this.disposed) {
      throw new Error("session_client_disposed");
    }
    this.cryptoContext = await createCryptoContext({
      sessionId: this.invite.sessionId,
      sessionKey: this.invite.sessionKey,
    });
    this.#openSocket("connecting");
  }

  async disconnect({ reason = "client_closed", notifyRemote = true } = {}) {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    clearTimeout(this.connectTimeout);
    clearTimeout(this.reconnectTimer);
    this.connectTimeout = null;
    this.reconnectTimer = null;

    try {
      if (notifyRemote && this.socket?.readyState === WebSocket.OPEN && this.cryptoContext) {
        await this.#sendEncrypted({
          kind: "session_close",
          reason,
          appId: this.identity.appId,
          sentAt: new Date().toISOString(),
        });
      }
    } finally {
      if (this.socket) {
        this.socket.close(1000, reason);
      }
      this.socket = null;
    }
  }

  async sendUserMessage(text, { attachments = [] } = {}) {
    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed && attachments.length === 0) {
      return;
    }

    const sentAt = new Date();
    const clientMessageId = this.#nextLocalMessageId();
    await this.#sendEncrypted({
      kind: "user_message",
      text: trimmed,
      clientMessageId,
      sentAt: sentAt.toISOString(),
      appId: this.identity.appId,
      ...(this.identity.displayName ? { displayName: this.identity.displayName } : {}),
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    this.#dispatch("message", {
      message: {
        id: clientMessageId,
        sender: "user",
        text: trimmed,
        sentAt,
        attachments,
        isPending: true,
        isOwnMessage: true,
        senderId: this.identity.appId,
        senderLabel: this.identity.displayName,
      },
    });
  }

  #openSocket(status) {
    this.connectionGeneration += 1;
    const generation = this.connectionGeneration;
    this.sawTerminalClose = false;

    clearTimeout(this.connectTimeout);
    if (this.socket) {
      this.socket.close(1000, "reconnect");
    }

    this.#dispatch("state", {
      status,
      notice: "connectingRelay",
      invite: this.invite,
    });

    const socket = new WebSocket(this.#buildSocketUrl());
    this.socket = socket;

    this.connectTimeout = window.setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.close(4000, "connect_timeout");
        this.#handleSocketError(new Error("connect_timeout"), generation);
      }
    }, CONNECT_TIMEOUT_MS);

    socket.addEventListener("open", () => {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    });

    socket.addEventListener("message", async (event) => {
      try {
        await this.#handleRawMessage(event.data, generation);
      } catch (error) {
        this.#dispatch("state", {
          status: "error",
          notice: "unknownPayload",
          details: error instanceof Error ? error.message : String(error),
          invite: this.invite,
        });
      }
    });

    socket.addEventListener("error", () => {
      this.#handleSocketError(new Error("websocket_error"), generation);
    });

    socket.addEventListener("close", () => {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
      if (this.disposed || this.sawTerminalClose || generation !== this.connectionGeneration) {
        return;
      }
      this.socket = null;
      this.#scheduleReconnect();
    });
  }

  #handleSocketError(error, generation) {
    if (this.disposed || this.sawTerminalClose || generation !== this.connectionGeneration) {
      return;
    }
    this.#dispatch("state", {
      status: "error",
      notice: "connectionError",
      details: error instanceof Error ? error.message : String(error),
      invite: this.invite,
    });
  }

  #scheduleReconnect() {
    if (this.disposed || this.sawTerminalClose || this.reconnectTimer) {
      return;
    }
    const delay = this.reconnectDelayMs;
    this.#dispatch("state", {
      status: "reconnecting",
      notice: "connectingRelay",
      invite: this.invite,
    });
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.#openSocket("reconnecting");
    }, delay);
    this.reconnectDelayMs = Math.min(MAX_RECONNECT_DELAY_MS, this.reconnectDelayMs * 2);
  }

  async #handleRawMessage(rawMessage, generation) {
    if (this.disposed || generation !== this.connectionGeneration || typeof rawMessage !== "string") {
      return;
    }

    const decoded = JSON.parse(rawMessage);
    if (!decoded || typeof decoded !== "object") {
      throw new Error("relay_event_not_object");
    }

    switch (decoded.type) {
      case "relay:attached": {
        this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
        if (typeof decoded.expiresAt === "string" && decoded.expiresAt) {
          this.invite = {
            ...this.invite,
            expiresAt: decoded.expiresAt,
          };
        }
        this.#dispatch("state", {
          status: "relayAttached",
          notice: "relayAttached",
          invite: this.invite,
        });
        await this.#sendEncrypted({
          kind: "client_hello",
          appVersion: "privateclaw_web/0.1.0",
          appId: this.identity.appId,
          deviceLabel: "PrivateClaw Web",
          supportsThinkingTrace: true,
          ...(this.identity.displayName ? { displayName: this.identity.displayName } : {}),
          sentAt: new Date().toISOString(),
        });
        return;
      }
      case "relay:frame": {
        if (!decoded.envelope || typeof decoded.envelope !== "object") {
          throw new Error("missing_encrypted_envelope");
        }
        if (!this.cryptoContext) {
          throw new Error("missing_crypto_context");
        }
        const payload = await this.cryptoContext.decrypt(decoded.envelope);
        await this.#handlePayload(payload);
        return;
      }
      case "relay:error": {
        this.#dispatch("state", {
          status: "error",
          notice: "relayError",
          details: typeof decoded.message === "string" ? decoded.message : "unknown_error",
          invite: this.invite,
        });
        return;
      }
      case "relay:session_closed": {
        this.sawTerminalClose = true;
        this.#dispatch("state", {
          status: "closed",
          notice: "sessionClosed",
          details: typeof decoded.reason === "string" ? decoded.reason : "unknown_reason",
          invite: this.invite,
        });
        await this.disconnect({ notifyRemote: false, reason: "session_closed" });
        return;
      }
      default:
        this.#dispatch("state", {
          status: "error",
          notice: "unknownRelayEvent",
          details: typeof decoded.type === "string" ? decoded.type : "unknown_event",
          invite: this.invite,
        });
    }
  }

  async #handlePayload(payload) {
    switch (payload.kind) {
      case "server_welcome": {
        this.#dispatch("state", {
          status: "active",
          notice: "welcome",
          details: typeof payload.message === "string" ? payload.message : null,
          invite: this.invite,
        });
        return;
      }
      case "assistant_message": {
        this.#dispatch("message", {
          message: {
            id: typeof payload.messageId === "string" ? payload.messageId : this.#nextLocalMessageId(),
            sender: "assistant",
            text: typeof payload.text === "string" ? payload.text : "",
            sentAt: normalizeTimestamp(payload.sentAt),
            replyTo: typeof payload.replyTo === "string" ? payload.replyTo : null,
            isPending: payload.pending === true,
            attachments: parseAttachments(payload.attachments),
          },
        });
        return;
      }
      case "thinking_message": {
        this.#dispatch("message", {
          message: {
            id: typeof payload.messageId === "string" ? payload.messageId : this.#nextLocalMessageId(),
            sender: "assistant",
            text: "",
            sentAt: normalizeTimestamp(payload.sentAt),
            replyTo: typeof payload.replyTo === "string" ? payload.replyTo : null,
            isPending: false,
            attachments: [],
            thinkingStatus: parseThinkingStatus(payload.status),
            thinkingSummary: typeof payload.summary === "string" ? payload.summary : "",
            thinkingEntries: parseThinkingEntries(payload.entries),
          },
        });
        return;
      }
      case "participant_message": {
        const senderAppId = typeof payload.senderAppId === "string" ? payload.senderAppId : "unknown-app";
        this.#dispatch("message", {
          message: {
            id: typeof payload.messageId === "string" ? payload.messageId : this.#nextLocalMessageId(),
            sender: "user",
            text: typeof payload.text === "string" ? payload.text : "",
            sentAt: normalizeTimestamp(payload.sentAt),
            replyTo: typeof payload.clientMessageId === "string" ? payload.clientMessageId : null,
            attachments: parseAttachments(payload.attachments),
            isOwnMessage: senderAppId === this.identity.appId,
            senderId: senderAppId,
            senderLabel:
              typeof payload.senderDisplayName === "string" ? payload.senderDisplayName : senderAppId,
          },
        });
        return;
      }
      case "system_message": {
        this.#dispatch("message", {
          message: {
            id: typeof payload.messageId === "string" ? payload.messageId : this.#nextLocalMessageId(),
            sender: "system",
            text: typeof payload.message === "string" ? payload.message : "",
            sentAt: normalizeTimestamp(payload.sentAt),
            replyTo: typeof payload.replyTo === "string" ? payload.replyTo : null,
            severity: typeof payload.severity === "string" ? payload.severity : "info",
            attachments: [],
          },
        });
        return;
      }
      case "provider_capabilities": {
        this.invite = {
          ...this.invite,
          expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : this.invite.expiresAt,
          groupMode: typeof payload.groupMode === "boolean" ? payload.groupMode : this.invite.groupMode,
          providerLabel:
            typeof payload.providerLabel === "string" ? payload.providerLabel : this.invite.providerLabel,
        };
        let assignedIdentity = null;
        if (
          payload.currentAppId === this.identity.appId &&
          typeof payload.currentDisplayName === "string" &&
          payload.currentDisplayName.trim() !== "" &&
          payload.currentDisplayName !== this.identity.displayName
        ) {
          this.identity = {
            ...this.identity,
            displayName: payload.currentDisplayName,
          };
          assignedIdentity = this.identity;
        }
        this.#dispatch("capabilities", {
          status: "active",
          invite: this.invite,
          commands: parseCommands(payload.commands),
          participants: parseParticipants(payload.participants),
          identity: assignedIdentity,
          botMuted: Boolean(payload.botMuted),
        });
        this.#dispatch("state", {
          status: "active",
          invite: this.invite,
        });
        return;
      }
      case "session_renewed": {
        if (typeof payload.newSessionKey !== "string" || payload.newSessionKey.trim() === "") {
          throw new Error("missing_next_session_key");
        }
        this.invite = {
          ...this.invite,
          sessionKey: payload.newSessionKey,
          expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : this.invite.expiresAt,
        };
        this.cryptoContext = await createCryptoContext({
          sessionId: this.invite.sessionId,
          sessionKey: this.invite.sessionKey,
        });
        this.#dispatch("renewed", {
          invite: this.invite,
          expiresAt: normalizeTimestamp(payload.expiresAt),
          replyTo: typeof payload.replyTo === "string" ? payload.replyTo : null,
          message: typeof payload.message === "string" ? payload.message : "",
        });
        this.#dispatch("state", {
          status: "active",
          invite: this.invite,
        });
        await this.#sendEncrypted({
          kind: "client_hello",
          appVersion: "privateclaw_web/0.1.0",
          appId: this.identity.appId,
          deviceLabel: "PrivateClaw Web",
          supportsThinkingTrace: true,
          ...(this.identity.displayName ? { displayName: this.identity.displayName } : {}),
          sentAt: new Date().toISOString(),
        });
        return;
      }
      default:
        this.#dispatch("state", {
          status: "error",
          notice: "unknownPayload",
          details: typeof payload.kind === "string" ? payload.kind : "unknown_payload",
          invite: this.invite,
        });
    }
  }

  async #sendEncrypted(payload) {
    if (!this.cryptoContext || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("session_not_connected");
    }
    const envelope = await this.cryptoContext.encrypt(payload);
    this.socket.send(JSON.stringify({ type: "app:frame", envelope }));
  }

  #buildSocketUrl() {
    const baseUrl = new URL(this.invite.appWsUrl);
    baseUrl.searchParams.set("appId", this.identity.appId);
    return baseUrl.toString();
  }

  #dispatch(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  #nextLocalMessageId() {
    this.messageCounter += 1;
    return `client-${Date.now()}-${this.messageCounter}`;
  }
}
