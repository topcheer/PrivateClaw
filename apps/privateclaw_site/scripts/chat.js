import { applyTranslations, bindLocaleSelect, onLocaleChange, t } from "./i18n.js";
import {
  createIdentity,
  decodeBase64,
  decodeInviteString,
  readFileAsAttachment,
} from "./protocol-web.js";
import { PrivateClawWebSessionClient } from "./session-client.js";

const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const IDENTITY_STORAGE_KEY = "privateclaw.web.identity";

const elements = {
  localeSelect: document.getElementById("chat-locale-select"),
  statusPill: document.getElementById("status-pill"),
  disconnectButton: document.getElementById("disconnect-button"),
  desktopWarning: document.getElementById("desktop-warning"),
  toggleInviteButton: document.getElementById("toggle-invite-button"),
  statusCopy: document.getElementById("status-copy"),
  connectForm: document.getElementById("connect-form"),
  inviteInput: document.getElementById("invite-input"),
  connectButton: document.getElementById("connect-button"),
  sessionMeta: document.getElementById("session-meta"),
  providerLabel: document.getElementById("provider-label"),
  expiresLabel: document.getElementById("expires-label"),
  modeLabel: document.getElementById("mode-label"),
  identityLabel: document.getElementById("identity-label"),
  participantCount: document.getElementById("participant-count"),
  participantChips: document.getElementById("participant-chips"),
  emptyState: document.getElementById("empty-state"),
  messageList: document.getElementById("message-list"),
  messagesScroll: document.getElementById("messages-scroll"),
  draftStrip: document.getElementById("draft-strip"),
  draftChipRow: document.getElementById("draft-chip-row"),
  composerForm: document.getElementById("composer-form"),
  composerInput: document.getElementById("composer-input"),
  attachButton: document.getElementById("attach-button"),
  commandButton: document.getElementById("command-button"),
  sendButton: document.getElementById("send-button"),
  fileInput: document.getElementById("file-input"),
  commandSheet: document.getElementById("command-sheet"),
  closeCommandSheet: document.getElementById("close-command-sheet"),
  commandList: document.getElementById("command-list"),
  toastStack: document.getElementById("toast-stack"),
};

const state = {
  client: null,
  invite: null,
  messages: [],
  commands: [],
  participants: [],
  selectedAttachments: [],
  status: "idle",
  statusCopy: "",
  showInviteForm: true,
  botMuted: false,
  identity: loadIdentity(),
  objectUrls: new Map(),
};

bindLocaleSelect(elements.localeSelect);

function readStoredIdentity() {
  try {
    return window.localStorage.getItem(IDENTITY_STORAGE_KEY);
  } catch (error) {
    console.warn("PrivateClaw could not read the stored web identity.", error);
    return null;
  }
}

function saveIdentity(identity) {
  try {
    window.localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
  } catch (error) {
    console.warn("PrivateClaw could not persist the web identity.", error);
  }
}

function loadIdentity() {
  const stored = readStoredIdentity();
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.appId === "string" && parsed.appId.trim() !== "") {
        return {
          appId: parsed.appId,
          displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
        };
      }
    } catch (error) {
      console.warn("PrivateClaw could not parse the stored web identity.", error);
    }
  }

  const identity = createIdentity();
  saveIdentity(identity);
  return identity;
}

function isMobileDevice() {
  const ua = navigator.userAgent || "";
  const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowScreen = globalThis.matchMedia?.("(max-width: 820px)")?.matches ?? false;
  return coarsePointer || narrowScreen || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function formatDateTime(value) {
  if (!value) {
    return t("chat.expiresUnknown");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return t("chat.expiresUnknown");
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function mapClientError(error) {
  const reason = error instanceof Error ? error.message : String(error);
  switch (reason) {
    case "empty_invite":
    case "malformed_invite":
    case "missing_payload":
    case "invite_missing_sessionId":
    case "invite_missing_sessionKey":
    case "invite_missing_appWsUrl":
    case "invite_missing_expiresAt":
      return t("chat.connectFailed");
    case "unsupported_invite_version":
      return t("chat.invalidInviteVersion");
    case "browser_crypto_unavailable":
      return t("chat.browserCryptoUnavailable");
    case "invalid_session_key_length":
      return t("chat.sessionKeyLengthError");
    case "session_not_connected":
      return t("chat.notConnected");
    default:
      return reason;
  }
}

function localizeNotice(notice, details) {
  const normalizedDetails = typeof details === "string" && details.trim() !== "" ? details.trim() : "unknown_error";
  switch (notice) {
    case "connectingRelay":
      return t("chat.relayConnecting");
    case "relayAttached":
      return t("chat.relayHandshake");
    case "connectionError":
      return t("chat.relayConnectionError", { reason: normalizedDetails });
    case "sessionClosed":
      return details
        ? t("chat.relaySessionClosedWithReason", { reason: normalizedDetails })
        : t("chat.relaySessionClosed");
    case "relayError":
      return t("chat.relayError", { reason: normalizedDetails });
    case "unknownRelayEvent":
      return t("chat.relayUnknownEvent", { reason: normalizedDetails });
    case "unknownPayload":
      return t("chat.relayUnknownPayload", { reason: normalizedDetails });
    case "welcome":
      return typeof details === "string" && details.trim() !== "" ? details : t("chat.welcomeFallback");
    default:
      return "";
  }
}

function getStatusLabel(status) {
  switch (status) {
    case "connecting":
      return t("chat.statusLabelConnecting");
    case "reconnecting":
      return t("chat.statusLabelReconnecting");
    case "relayAttached":
      return t("chat.statusLabelRelayAttached");
    case "active":
      return t("chat.statusLabelActive");
    case "closed":
      return t("chat.statusLabelClosed");
    case "error":
      return t("chat.statusLabelError");
    case "idle":
    default:
      return t("chat.statusLabelIdle");
  }
}

function setStatus(status, { notice = null, details = null } = {}) {
  state.status = status;
  if (notice) {
    state.statusCopy = localizeNotice(notice, details);
  } else if (status === "active") {
    state.statusCopy = t("chat.welcomeFallback");
  } else if (status === "idle") {
    state.statusCopy = t("chat.statusIdle");
  }
}

function showToast(message, { error = false } = {}) {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " error" : ""}`;
  toast.textContent = message;
  elements.toastStack.append(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function autoGrowComposer() {
  elements.composerInput.style.height = "0px";
  elements.composerInput.style.height = `${Math.min(elements.composerInput.scrollHeight, 160)}px`;
}

function clearObjectUrls() {
  for (const url of state.objectUrls.values()) {
    URL.revokeObjectURL(url);
  }
  state.objectUrls.clear();
}

function resetConversationState() {
  clearObjectUrls();
  state.messages = [];
  state.commands = [];
  state.participants = [];
  state.selectedAttachments = [];
  state.botMuted = false;
  elements.fileInput.value = "";
}

function getAttachmentUrl(attachment) {
  if (attachment.uri) {
    return attachment.uri;
  }
  if (!attachment.dataBase64) {
    return null;
  }
  const cacheKey = `${attachment.id}:${attachment.mimeType}:${attachment.sizeBytes}`;
  if (state.objectUrls.has(cacheKey)) {
    return state.objectUrls.get(cacheKey);
  }
  const bytes = decodeBase64(attachment.dataBase64);
  const blob = new Blob([bytes], { type: attachment.mimeType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  state.objectUrls.set(cacheKey, url);
  return url;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineHtml(value) {
  const escaped = escapeHtml(value);
  const markdownLinks = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
  );
  const inlineCode = markdownLinks.replace(/`([^`]+)`/g, "<code>$1</code>");
  return inlineCode.replace(
    /(?<!["'=])(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>',
  );
}

function renderRichText(text) {
  const fragment = document.createDocumentFragment();
  const source = typeof text === "string" ? text : "";
  const fencePattern = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match = fencePattern.exec(source);
  while (match) {
    if (match.index > lastIndex) {
      fragment.append(renderParagraphSection(source.slice(lastIndex, match.index)));
    }
    const language = (match[1] || "").trim().toLowerCase();
    const code = match[2] || "";
    if (language === "mermaid") {
      const card = document.createElement("div");
      card.className = "mermaid-card";
      const heading = document.createElement("strong");
      heading.textContent = "Mermaid";
      const pre = document.createElement("pre");
      const codeElement = document.createElement("code");
      codeElement.textContent = code.trim();
      pre.append(codeElement);
      card.append(heading, pre);
      fragment.append(card);
    } else {
      const pre = document.createElement("pre");
      const codeElement = document.createElement("code");
      codeElement.textContent = code.trim();
      pre.append(codeElement);
      fragment.append(pre);
    }
    lastIndex = fencePattern.lastIndex;
    match = fencePattern.exec(source);
  }
  if (lastIndex < source.length) {
    fragment.append(renderParagraphSection(source.slice(lastIndex)));
  }
  return fragment;
}

function renderParagraphSection(section) {
  const fragment = document.createDocumentFragment();
  const paragraphs = section
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  for (const paragraph of paragraphs) {
    const element = document.createElement("p");
    element.innerHTML = renderInlineHtml(paragraph).replace(/\n/g, "<br />");
    fragment.append(element);
  }
  return fragment;
}

function createPendingIndicator() {
  const dots = document.createElement("div");
  dots.className = "pending-dots";
  for (let index = 0; index < 3; index += 1) {
    dots.append(document.createElement("span"));
  }
  return dots;
}

function renderAttachments(attachments) {
  const container = document.createElement("div");
  container.className = "message-attachments";
  for (const attachment of attachments) {
    const card = document.createElement("div");
    card.className = "attachment-card";
    const url = getAttachmentUrl(attachment);

    if (url && attachment.mimeType.startsWith("image/")) {
      const image = document.createElement("img");
      image.src = url;
      image.alt = attachment.name;
      card.append(image);
    } else if (url && attachment.mimeType.startsWith("audio/")) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = url;
      card.append(audio);
    } else if (url && attachment.mimeType.startsWith("video/")) {
      const video = document.createElement("video");
      video.controls = true;
      video.playsInline = true;
      video.src = url;
      card.append(video);
    } else if (!url) {
      const fallback = document.createElement("p");
      fallback.textContent = t("chat.attachmentNoPreview");
      card.append(fallback);
    }

    const meta = document.createElement("div");
    meta.className = "attachment-meta";

    const metaCopy = document.createElement("div");
    const name = document.createElement("div");
    name.className = "attachment-name";
    name.textContent = attachment.name;
    const size = document.createElement("div");
    size.className = "attachment-size";
    size.textContent = formatBytes(attachment.sizeBytes);
    metaCopy.append(name, size);

    meta.append(metaCopy);
    if (url) {
      const download = document.createElement("a");
      download.href = url;
      download.target = "_blank";
      download.rel = "noreferrer";
      download.download = attachment.name;
      download.textContent = t("chat.downloadAttachment");
      meta.append(download);
    }
    card.append(meta);
    container.append(card);
  }
  return container;
}

function upsertMessage(message) {
  const existingIndex = state.messages.findIndex((item) => item.id === message.id);
  if (existingIndex >= 0) {
    state.messages[existingIndex] = message;
    return;
  }

  if (message.isPending) {
    state.messages.push(message);
    return;
  }

  if (message.replyTo) {
    state.messages = state.messages.filter(
      (item) => !(item.isPending && item.replyTo === message.replyTo),
    );
  }
  state.messages.push(message);
}

function renderMessages() {
  elements.messageList.replaceChildren();
  const hasMessages = state.messages.length > 0;
  elements.emptyState.classList.toggle("hidden", hasMessages);
  elements.emptyState.hidden = hasMessages;

  for (const message of state.messages) {
    const shell = document.createElement("article");
    const senderType = message.sender === "system"
      ? `system${message.severity === "error" ? " error" : ""}`
      : message.sender === "assistant"
        ? "assistant"
        : message.isOwnMessage
          ? "user own"
          : "user peer";
    shell.className = `message-shell ${senderType}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    const label = document.createElement("span");
    label.className = "message-label";
    if (message.sender === "assistant") {
      label.textContent = t("chat.assistantLabel");
    } else if (message.sender === "system") {
      label.textContent = t("chat.systemLabel");
    } else if (message.isOwnMessage) {
      label.textContent = state.identity.displayName || t("chat.youLabel");
    } else {
      label.textContent = message.senderLabel || t("chat.peerLabelFallback");
    }
    bubble.append(label);

    const body = document.createElement("div");
    body.className = "message-text";
    if (message.isPending) {
      const pendingLabel = document.createElement("p");
      pendingLabel.textContent = t("chat.pendingLabel");
      body.append(pendingLabel, createPendingIndicator());
    } else {
      body.append(renderRichText(message.text || ""));
      if (Array.isArray(message.attachments) && message.attachments.length > 0) {
        body.append(renderAttachments(message.attachments));
      }
    }
    bubble.append(body);

    const time = document.createElement("div");
    time.className = "message-time";
    time.textContent = formatDateTime(message.sentAt);

    shell.append(bubble, time);
    elements.messageList.append(shell);
  }

  elements.messagesScroll.scrollTop = elements.messagesScroll.scrollHeight;
}

function renderParticipants() {
  elements.participantChips.replaceChildren();
  for (const participant of state.participants) {
    const chip = document.createElement("div");
    chip.className = "participant-pill";
    chip.textContent = participant.displayName;
    elements.participantChips.append(chip);
  }
  elements.participantCount.textContent = String(state.participants.length);
}

function renderDraftAttachments() {
  const hasAttachments = state.selectedAttachments.length > 0;
  elements.draftStrip.classList.toggle("hidden", !hasAttachments);
  elements.draftStrip.hidden = !hasAttachments;
  elements.draftChipRow.replaceChildren();
  if (!hasAttachments) {
    return;
  }
  for (const attachment of state.selectedAttachments) {
    const chip = document.createElement("div");
    chip.className = "draft-chip";

    const label = document.createElement("span");
    label.textContent = `${attachment.name} · ${formatBytes(attachment.sizeBytes)}`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", t("chat.draftRemoveAttachment"));
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      state.selectedAttachments = state.selectedAttachments.filter((item) => item.id !== attachment.id);
      renderPage();
    });

    chip.append(label, removeButton);
    elements.draftChipRow.append(chip);
  }
}

function renderCommands() {
  elements.commandList.replaceChildren();
  for (const command of state.commands) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "command-item";

    const title = document.createElement("strong");
    title.textContent = command.slash;

    const description = document.createElement("p");
    const sourceLabel = command.source === "openclaw"
      ? t("chat.commandSourceOpenclaw")
      : command.source === "plugin"
        ? t("chat.commandSourcePlugin")
        : t("chat.commandSourcePrivateclaw");
    description.textContent = `${command.description} · ${sourceLabel}${command.acceptsArgs ? ` · ${t("chat.commandArgHint")}` : ` · ${t("chat.commandSendNow")}`}`;

    item.append(title, description);
    item.addEventListener("click", async () => {
      await selectCommand(command);
    });
    elements.commandList.append(item);
  }
}

function renderSessionMeta() {
  const hasInvite = Boolean(state.invite);
  const activeLike = ["connecting", "relayAttached", "reconnecting", "active"].includes(state.status);
  const showMeta = hasInvite && (activeLike || state.messages.length > 0 || state.participants.length > 0);

  elements.sessionMeta.classList.toggle("hidden", !showMeta);
  elements.sessionMeta.hidden = !showMeta;
  elements.disconnectButton.classList.toggle("hidden", !state.client);
  elements.disconnectButton.hidden = !state.client;
  elements.toggleInviteButton.classList.toggle("hidden", !state.client);
  elements.toggleInviteButton.hidden = !state.client;

  const shouldShowInviteForm = !state.client || state.showInviteForm;
  elements.connectForm.classList.toggle("hidden", !shouldShowInviteForm);
  elements.connectForm.hidden = !shouldShowInviteForm;

  elements.providerLabel.textContent = state.invite?.providerLabel || t("chat.providerUnknown");
  elements.expiresLabel.textContent = state.invite ? formatDateTime(state.invite.expiresAt) : t("chat.expiresUnknown");
  if (state.invite?.groupMode) {
    elements.modeLabel.textContent = state.botMuted ? t("chat.modeGroupMuted") : t("chat.modeGroup");
  } else {
    elements.modeLabel.textContent = t("chat.modePrivate");
  }
  const identityValue = state.identity.displayName || `${t("chat.identityUnknown")} · ${state.identity.appId.slice(0, 8)}`;
  elements.identityLabel.textContent = identityValue;
}

function renderStatus() {
  elements.statusPill.textContent = getStatusLabel(state.status);
  elements.statusPill.dataset.status = state.status;
  elements.statusCopy.textContent = state.statusCopy || t("chat.statusIdle");
}

function renderDesktopWarning() {
  const showWarning = !isMobileDevice();
  elements.desktopWarning.classList.toggle("hidden", !showWarning);
  elements.desktopWarning.hidden = !showWarning;
}

function renderPage() {
  applyTranslations();
  document.title = t("chat.documentTitle");
  elements.inviteInput.placeholder = t("chat.inviteInputPlaceholder");
  elements.composerInput.placeholder = t("chat.composerPlaceholder");
  elements.attachButton.setAttribute("aria-label", t("chat.attachButtonAria"));
  elements.commandButton.setAttribute("aria-label", t("chat.commandButtonAria"));
  elements.closeCommandSheet.textContent = t("chat.commandSheetClose");
  renderStatus();
  renderDesktopWarning();
  renderSessionMeta();
  renderParticipants();
  renderMessages();
  renderDraftAttachments();
  renderCommands();
  autoGrowComposer();

  const canSend = state.status === "active" && Boolean(state.client);
  elements.sendButton.disabled = !canSend;
  elements.attachButton.disabled = !canSend;
  elements.commandButton.disabled = !canSend || state.commands.length === 0;
  elements.connectButton.disabled = state.status === "connecting" || state.status === "relayAttached";
}

function openCommandSheet() {
  elements.commandSheet.classList.remove("hidden");
  elements.commandSheet.hidden = false;
}

function closeCommandSheet() {
  elements.commandSheet.classList.add("hidden");
  elements.commandSheet.hidden = true;
}

async function selectCommand(command) {
  if (!command) {
    return;
  }
  if (command.acceptsArgs) {
    elements.composerInput.value = `${command.slash} `;
    autoGrowComposer();
    elements.composerInput.focus();
    closeCommandSheet();
    showToast(t("chat.toastCommandInserted"));
    return;
  }
  elements.composerInput.value = command.slash;
  closeCommandSheet();
  await handleSend();
  showToast(t("chat.toastCommandSent"));
}

function attachClientListeners(client) {
  client.addEventListener("state", (event) => {
    const previousStatus = state.status;
    const detail = event.detail;
    if (detail.invite) {
      state.invite = detail.invite;
    }
    if (detail.status) {
      setStatus(detail.status, { notice: detail.notice, details: detail.details });
      if (!detail.notice && detail.status === "active" && previousStatus !== "active") {
        state.statusCopy = t("chat.welcomeFallback");
      }
      if (detail.status === "closed") {
        state.client = null;
        state.showInviteForm = true;
      }
    }
    if (detail.notice === "relayError" || detail.notice === "connectionError" || detail.notice === "sessionClosed") {
      showToast(state.statusCopy, { error: detail.notice !== "sessionClosed" });
    }
    renderPage();
  });

  client.addEventListener("message", (event) => {
    upsertMessage(event.detail.message);
    renderPage();
  });

  client.addEventListener("capabilities", (event) => {
    const detail = event.detail;
    const firstConnection = state.status !== "active";
    state.invite = detail.invite;
    state.commands = detail.commands;
    state.participants = detail.participants;
    state.botMuted = detail.botMuted;
    state.status = detail.status || "active";
    state.statusCopy = t("chat.welcomeFallback");
    state.showInviteForm = false;
    if (detail.identity) {
      state.identity = detail.identity;
      saveIdentity(detail.identity);
    }
    if (firstConnection) {
      showToast(t("chat.toastConnected"));
    }
    renderPage();
  });

  client.addEventListener("renewed", (event) => {
    const detail = event.detail;
    state.invite = detail.invite;
    state.status = "active";
    state.statusCopy = detail.message || t("chat.sessionRenewedNotice", { time: formatDateTime(detail.expiresAt) });
    upsertMessage({
      id: `renewed-${Date.now()}`,
      sender: "system",
      text: state.statusCopy,
      sentAt: new Date(),
      replyTo: detail.replyTo,
      severity: "info",
      attachments: [],
    });
    renderPage();
  });
}

async function connectWithInvite(rawInvite) {
  let invite;
  try {
    invite = decodeInviteString(rawInvite);
  } catch (error) {
    showToast(mapClientError(error), { error: true });
    return;
  }

  if (state.client) {
    await state.client.disconnect({ reason: "switch_invite", notifyRemote: false });
  }

  resetConversationState();
  state.invite = invite;
  state.showInviteForm = true;
  state.client = new PrivateClawWebSessionClient(invite, { identity: state.identity });
  attachClientListeners(state.client);
  setStatus("connecting", { notice: "connectingRelay" });
  renderPage();
  showToast(t("chat.toastInviteReady"));

  try {
    await state.client.connect();
  } catch (error) {
    state.client = null;
    setStatus("error", { notice: "connectionError", details: mapClientError(error) });
    showToast(mapClientError(error), { error: true });
    renderPage();
  }
}

async function handleDisconnect() {
  if (state.client) {
    await state.client.disconnect({ reason: "user_disconnect" });
  }
  state.client = null;
  state.invite = null;
  resetConversationState();
  state.showInviteForm = true;
  state.status = "idle";
  state.statusCopy = t("chat.sessionDisconnected");
  renderPage();
  showToast(t("chat.toastDisconnected"));
}

async function handleSend() {
  if (!state.client || state.status !== "active") {
    showToast(t("chat.notConnected"), { error: true });
    return;
  }

  const text = elements.composerInput.value.trim();
  const attachments = [...state.selectedAttachments];
  if (!text && attachments.length === 0) {
    showToast(t("chat.toastCopiedNothing"));
    return;
  }

  elements.composerInput.value = "";
  state.selectedAttachments = [];
  renderPage();

  try {
    await state.client.sendUserMessage(text, { attachments });
  } catch (error) {
    elements.composerInput.value = text;
    state.selectedAttachments = attachments;
    state.status = "error";
    state.statusCopy = t("chat.sendFailed", { reason: mapClientError(error) });
    showToast(state.statusCopy, { error: true });
    renderPage();
    return;
  }

  renderPage();
}

async function handleFiles(files) {
  const nextAttachments = [];
  for (const file of files) {
    if (file.size > MAX_INLINE_ATTACHMENT_BYTES) {
      showToast(t("chat.fileTooLarge", { name: file.name }), { error: true });
      continue;
    }
    try {
      nextAttachments.push(await readFileAsAttachment(file));
    } catch (error) {
      console.warn("PrivateClaw could not read an attachment.", error);
      showToast(t("chat.fileReadError", { name: file.name }), { error: true });
    }
  }
  if (nextAttachments.length > 0) {
    state.selectedAttachments = [...state.selectedAttachments, ...nextAttachments];
    renderPage();
  }
}

elements.connectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await connectWithInvite(elements.inviteInput.value);
});

elements.disconnectButton.addEventListener("click", async () => {
  await handleDisconnect();
});

elements.toggleInviteButton.addEventListener("click", () => {
  state.showInviteForm = !state.showInviteForm;
  renderPage();
});

elements.attachButton.addEventListener("click", () => {
  if (!state.client || state.status !== "active") {
    showToast(t("chat.notConnected"), { error: true });
    return;
  }
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", async () => {
  if (elements.fileInput.files) {
    await handleFiles([...elements.fileInput.files]);
  }
  elements.fileInput.value = "";
});

elements.commandButton.addEventListener("click", () => {
  if (state.commands.length === 0) {
    showToast(t("chat.noCommandsYet"));
    return;
  }
  openCommandSheet();
});

elements.closeCommandSheet.addEventListener("click", closeCommandSheet);
elements.commandSheet.addEventListener("click", (event) => {
  if (event.target === elements.commandSheet) {
    closeCommandSheet();
  }
});

elements.composerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await handleSend();
});

elements.composerInput.addEventListener("input", autoGrowComposer);
elements.composerInput.addEventListener("keydown", async (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    await handleSend();
  }
});

window.addEventListener("resize", renderPage);
window.addEventListener("beforeunload", clearObjectUrls);
onLocaleChange(renderPage);

setStatus("idle");
renderPage();
