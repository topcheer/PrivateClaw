import { applyTranslations, bindLocaleSelect, onLocaleChange, t } from "./i18n.js?v=20260318-1";
import {
  createIdentity,
  decodeBase64,
  decodeInviteString,
  getInviteRelayLabel,
  inviteUsesNonDefaultRelay,
  readFileAsAttachment,
} from "./protocol-web.js?v=20260316-1";
import { PrivateClawWebSessionClient } from "./session-client.js?v=20260318-1";

const MAX_INLINE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const QR_SCAN_MAX_DIMENSION = 1440;
const IDENTITY_STORAGE_KEY = "privateclaw.web.identity";

const elements = {
  localeSelect: document.getElementById("chat-locale-select"),
  statusPill: document.getElementById("status-pill"),
  disconnectButton: document.getElementById("disconnect-button"),
  desktopNote: document.getElementById("desktop-note"),
  toggleInviteButton: document.getElementById("toggle-invite-button"),
  statusCopy: document.getElementById("status-copy"),
  connectForm: document.getElementById("connect-form"),
  inviteInput: document.getElementById("invite-input"),
  scanButton: document.getElementById("scan-button"),
  scanImageButton: document.getElementById("scan-image-button"),
  inviteScanInput: document.getElementById("invite-scan-input"),
  connectButton: document.getElementById("connect-button"),
  sessionMeta: document.getElementById("session-meta"),
  providerLabel: document.getElementById("provider-label"),
  expiresLabel: document.getElementById("expires-label"),
  modeLabel: document.getElementById("mode-label"),
  relayLabel: document.getElementById("relay-label"),
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
  scannerSheet: document.getElementById("scanner-sheet"),
  closeScannerSheet: document.getElementById("close-scanner-sheet"),
  scannerVideo: document.getElementById("scanner-video"),
  scannerStatus: document.getElementById("scanner-status"),
  scannerUploadButton: document.getElementById("scanner-upload-button"),
  toastStack: document.getElementById("toast-stack"),
};

const state = {
  client: null,
  invite: null,
  messages: [],
  expandedThinkingTraceIds: new Set(),
  commands: [],
  participants: [],
  selectedAttachments: [],
  status: "idle",
  statusCopy: "",
  showInviteForm: true,
  botMuted: false,
  identity: loadIdentity(),
  objectUrls: new Map(),
  scanner: {
    stream: null,
    frameHandle: null,
    active: false,
    detecting: false,
  },
};

let qrDetectorPromise = null;
let jsQrDecoderPromise = null;

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

async function getQrDetector() {
  if (qrDetectorPromise) {
    return qrDetectorPromise;
  }

  qrDetectorPromise = (async () => {
    const Detector = globalThis.BarcodeDetector;
    if (typeof Detector !== "function") {
      return null;
    }

    try {
      if (typeof Detector.getSupportedFormats === "function") {
        const supportedFormats = await Detector.getSupportedFormats();
        if (Array.isArray(supportedFormats) && !supportedFormats.includes("qr_code")) {
          return null;
        }
      }
    } catch (error) {
      console.warn("PrivateClaw could not query supported barcode formats.", error);
    }

    try {
      return new Detector({ formats: ["qr_code"] });
    } catch (error) {
      console.warn("PrivateClaw could not initialize the QR detector.", error);
      return null;
    }
  })();

  return qrDetectorPromise;
}

async function getJsQrDecoder() {
  if (typeof globalThis.jsQR === "function") {
    return globalThis.jsQR;
  }

  if (!jsQrDecoderPromise) {
    jsQrDecoderPromise = import("./vendor/jsQR.js")
      .then(() => {
        if (typeof globalThis.jsQR !== "function") {
          throw new Error("jsQR decoder did not initialize.");
        }
        return globalThis.jsQR;
      })
      .catch((error) => {
        jsQrDecoderPromise = null;
        throw error;
      });
  }

  return jsQrDecoderPromise;
}

function updateScannerStatus(message) {
  elements.scannerStatus.textContent = message;
}

function openScannerSheet() {
  elements.scannerSheet.classList.remove("hidden");
  elements.scannerSheet.hidden = false;
}

async function stopScanner() {
  state.scanner.active = false;
  state.scanner.detecting = false;
  if (state.scanner.frameHandle) {
    cancelAnimationFrame(state.scanner.frameHandle);
    state.scanner.frameHandle = null;
  }
  if (state.scanner.stream) {
    for (const track of state.scanner.stream.getTracks()) {
      track.stop();
    }
    state.scanner.stream = null;
  }
  elements.scannerVideo.pause();
  elements.scannerVideo.srcObject = null;
}

async function closeScannerSheet() {
  await stopScanner();
  elements.scannerSheet.classList.add("hidden");
  elements.scannerSheet.hidden = true;
  updateScannerStatus(t("chat.scannerStatusStarting"));
}

function createScratchContext(width, height) {
  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return context || null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d", { willReadFrequently: true });
}

function getImageSourceDimensions(source) {
  if (typeof source.videoWidth === "number" && source.videoWidth > 0 && typeof source.videoHeight === "number" && source.videoHeight > 0) {
    return { width: source.videoWidth, height: source.videoHeight };
  }
  if (typeof source.naturalWidth === "number" && source.naturalWidth > 0 && typeof source.naturalHeight === "number" && source.naturalHeight > 0) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  if (typeof source.width === "number" && source.width > 0 && typeof source.height === "number" && source.height > 0) {
    return { width: source.width, height: source.height };
  }
  return null;
}

function getImageDataForQrSource(source, maxDimension = QR_SCAN_MAX_DIMENSION) {
  const dimensions = getImageSourceDimensions(source);
  if (!dimensions) {
    return null;
  }

  const scale = Math.min(1, maxDimension / Math.max(dimensions.width, dimensions.height));
  const canvasWidth = Math.max(1, Math.round(dimensions.width * scale));
  const canvasHeight = Math.max(1, Math.round(dimensions.height * scale));
  const context = createScratchContext(canvasWidth, canvasHeight);
  if (!context) {
    return null;
  }

  context.drawImage(source, 0, 0, canvasWidth, canvasHeight);
  return context.getImageData(0, 0, canvasWidth, canvasHeight);
}

function extractDetectedInvite(detections) {
  if (!Array.isArray(detections)) {
    return null;
  }
  for (const detection of detections) {
    const rawValue = typeof detection?.rawValue === "string" ? detection.rawValue.trim() : "";
    if (rawValue) {
      return rawValue;
    }
  }
  return null;
}

async function completeScannedInvite(rawValue) {
  elements.inviteInput.value = rawValue;
  updateScannerStatus(t("chat.scannerStatusFound"));
  await closeScannerSheet();
  await connectWithInvite(rawValue);
}

async function loadQrImageSource(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      source: bitmap,
      dispose() {
        if (typeof bitmap.close === "function") {
          bitmap.close();
        }
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";

  try {
    await new Promise((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Image failed to load."));
      image.src = objectUrl;
    });
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  return {
    source: image,
    dispose() {
      URL.revokeObjectURL(objectUrl);
    },
  };
}

async function detectQrValue(source, { maxDimension = QR_SCAN_MAX_DIMENSION } = {}) {
  const detector = await getQrDetector();
  if (detector) {
    try {
      const detections = await detector.detect(source);
      const rawValue = extractDetectedInvite(detections);
      if (rawValue) {
        return rawValue;
      }
    } catch (error) {
      console.warn("PrivateClaw native QR detection failed; falling back to jsQR.", error);
    }
  }

  const imageData = getImageDataForQrSource(source, maxDimension);
  if (!imageData) {
    return null;
  }

  try {
    const jsQr = await getJsQrDecoder();
    const result = jsQr(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    return typeof result?.data === "string" ? result.data.trim() : null;
  } catch (error) {
    console.warn("PrivateClaw fallback QR detection failed.", error);
    return null;
  }
}

async function scanFromImageFile(file) {
  try {
    const image = await loadQrImageSource(file);
    try {
      const rawValue = await detectQrValue(image.source);
      if (!rawValue) {
        showToast(t("chat.scanNoCodeFound"), { error: true });
        return;
      }
      await completeScannedInvite(rawValue);
    } finally {
      image.dispose();
    }
  } catch (error) {
    console.warn("PrivateClaw could not read a QR image.", error);
    showToast(t("chat.scanReadFailed"), { error: true });
  }
}

async function scanVideoFrame() {
  if (!state.scanner.active) {
    return;
  }

  if (state.scanner.detecting) {
    state.scanner.frameHandle = requestAnimationFrame(() => {
      void scanVideoFrame();
    });
    return;
  }

  if (elements.scannerVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    state.scanner.frameHandle = requestAnimationFrame(() => {
      void scanVideoFrame();
    });
    return;
  }

  state.scanner.detecting = true;
  try {
    const rawValue = await detectQrValue(elements.scannerVideo, { maxDimension: 960 });
    if (rawValue) {
      await completeScannedInvite(rawValue);
      return;
    }
  } catch (error) {
    console.warn("PrivateClaw camera scan frame failed.", error);
  } finally {
    state.scanner.detecting = false;
  }

  if (state.scanner.active) {
    state.scanner.frameHandle = requestAnimationFrame(() => {
      void scanVideoFrame();
    });
  }
}

function openScanImagePicker({ preferCamera = false } = {}) {
  if (preferCamera) {
    elements.inviteScanInput.setAttribute("capture", "environment");
  } else {
    elements.inviteScanInput.removeAttribute("capture");
  }
  elements.inviteScanInput.click();
}

async function startScanner() {
  if (!navigator.mediaDevices?.getUserMedia) {
    openScanImagePicker({ preferCamera: isMobileDevice() });
    showToast(t("chat.scanPickerFallback"));
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
      },
      audio: false,
    });
    await stopScanner();
    state.scanner.stream = stream;
    openScannerSheet();
    updateScannerStatus(t("chat.scannerStatusStarting"));
    elements.scannerVideo.srcObject = stream;
    await elements.scannerVideo.play();
    state.scanner.active = true;
    updateScannerStatus(t("chat.scannerStatusScanning"));
    void scanVideoFrame();
  } catch (error) {
    console.warn("PrivateClaw could not start camera scanning.", error);
    await closeScannerSheet();
    const errorName = error instanceof DOMException ? error.name : "";
    const messageKey =
      errorName === "NotAllowedError" || errorName === "SecurityError"
        ? "chat.scanPermissionDenied"
        : "chat.scanCameraUnsupported";
    showToast(t(messageKey), { error: true });
  }
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
  state.expandedThinkingTraceIds.clear();
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

function isThinkingTraceMessage(message) {
  return typeof message?.thinkingStatus === "string";
}

function isThinkingTraceActive(message) {
  return message?.thinkingStatus === "started" || message?.thinkingStatus === "streaming";
}

function createThinkingTraceBadge({ label, tone = "neutral" }) {
  const badge = document.createElement("span");
  badge.className = `thinking-trace-badge ${tone}`;
  badge.textContent = label;
  return badge;
}

function getThinkingTraceIcon(kind, { active = false, failed = false } = {}) {
  if (failed || kind === "error") {
    return "!";
  }
  if (active || kind === "thought") {
    return "◎";
  }
  if (kind === "result") {
    return "✓";
  }
  return "⚙";
}

function renderThinkingTraceEntry(entry) {
  const card = document.createElement("div");
  card.className = `thinking-trace-entry ${entry.kind || "thought"}`;

  const header = document.createElement("div");
  header.className = "thinking-trace-entry-header";

  const icon = document.createElement("span");
  icon.className = `thinking-trace-icon ${entry.kind || "thought"}`;
  icon.textContent = getThinkingTraceIcon(entry.kind);

  const title = document.createElement("strong");
  title.textContent = entry.title || t("chat.thinkingTraceFallbackTitle");

  header.append(icon, title);
  if (entry.toolName) {
    header.append(createThinkingTraceBadge({ label: entry.toolName, tone: "tool" }));
  }

  card.append(header);
  if (typeof entry.text === "string" && entry.text.trim() !== "") {
    const body = document.createElement("div");
    body.className = "thinking-trace-entry-body";
    body.append(renderRichText(entry.text));
    card.append(body);
  }
  return card;
}

function renderThinkingTrace(message) {
  const entries = Array.isArray(message.thinkingEntries) ? message.thinkingEntries : [];
  const latestEntry = entries[entries.length - 1] || null;
  const active = isThinkingTraceActive(message);
  const failed = message.thinkingStatus === "failed";
  const title = latestEntry?.title || t("chat.thinkingTraceFallbackTitle");
  const previewSource =
    (typeof message.thinkingSummary === "string" && message.thinkingSummary.trim()) ||
    (typeof latestEntry?.text === "string" && latestEntry.text.trim()) ||
    t("chat.pendingLabel");

  const card = document.createElement(entries.length > 0 ? "details" : "div");
  card.className = `thinking-trace-card${active ? " active" : ""}${failed ? " failed" : ""}`;
  if (card instanceof HTMLDetailsElement) {
    card.open = active && state.expandedThinkingTraceIds.has(message.id);
    card.addEventListener("toggle", () => {
      if (card.open && active) {
        state.expandedThinkingTraceIds.add(message.id);
      } else {
        state.expandedThinkingTraceIds.delete(message.id);
      }
    });
  }

  const summary = document.createElement(entries.length > 0 ? "summary" : "div");
  summary.className = "thinking-trace-summary";

  const header = document.createElement("div");
  header.className = "thinking-trace-header";

  const headerMain = document.createElement("div");
  headerMain.className = "thinking-trace-header-main";

  const icon = document.createElement("span");
  icon.className = `thinking-trace-icon ${failed ? "error" : latestEntry?.kind || "thought"}${active ? " active" : ""}`;
  icon.textContent = getThinkingTraceIcon(latestEntry?.kind, { active, failed });

  const heading = document.createElement("strong");
  heading.textContent = title;

  headerMain.append(icon, heading);
  header.append(headerMain);

  const badges = document.createElement("div");
  badges.className = "thinking-trace-badges";
  badges.append(
    createThinkingTraceBadge({
      label: active
        ? t("chat.thinkingTraceLive")
        : failed
          ? t("chat.thinkingTraceFailed")
          : t("chat.thinkingTraceDone"),
      tone: failed ? "error" : active ? "live" : "done",
    }),
  );
  if (latestEntry?.toolName) {
    badges.append(createThinkingTraceBadge({ label: latestEntry.toolName, tone: "tool" }));
  }
  badges.append(createThinkingTraceBadge({
    label: t("chat.thinkingTraceSteps", { count: String(entries.length) }),
  }));
  header.append(badges);

  const preview = document.createElement("p");
  preview.className = "thinking-trace-preview";
  preview.textContent = previewSource;

  summary.append(header, preview);
  card.append(summary);

  if (entries.length > 0) {
    const history = document.createElement("div");
    history.className = "thinking-trace-history";
    for (const entry of entries) {
      history.append(renderThinkingTraceEntry(entry));
    }
    card.append(history);
  }

  return card;
}

function upsertMessage(message) {
  if (message.isPending && message.replyTo) {
    const repliedIndex = state.messages.findIndex(
      (item) => item.id === message.replyTo && item.sender === "user",
    );
    if (repliedIndex >= 0) {
      state.messages[repliedIndex] = {
        ...state.messages[repliedIndex],
        isPending: true,
      };
      state.messages = state.messages.filter(
        (item) => !(item.sender === "assistant" && item.isPending && item.replyTo === message.replyTo),
      );
      return;
    }
  }

  const existingIndex = state.messages.findIndex((item) => item.id === message.id);
  if (existingIndex >= 0) {
    if (isThinkingTraceMessage(message) && !isThinkingTraceActive(message) && !(message.thinkingEntries?.length > 0)) {
      state.messages.splice(existingIndex, 1);
      state.expandedThinkingTraceIds.delete(message.id);
      return;
    }
    if (isThinkingTraceMessage(message) && !isThinkingTraceActive(message)) {
      state.expandedThinkingTraceIds.delete(message.id);
    }
    const existingMessage = state.messages[existingIndex];
    state.messages[existingIndex] = {
      ...message,
      isPending:
        existingMessage.sender === "user" &&
        existingMessage.id === message.id &&
        existingMessage.isPending
          ? true
          : Boolean(message.isPending),
    };
    return;
  }

  if (isThinkingTraceMessage(message) && !isThinkingTraceActive(message) && !(message.thinkingEntries?.length > 0)) {
    state.expandedThinkingTraceIds.delete(message.id);
    return;
  }

  if (message.isPending) {
    state.messages.push(message);
    return;
  }

  if (message.replyTo && !isThinkingTraceMessage(message)) {
    const repliedIndex = state.messages.findIndex(
      (item) => item.id === message.replyTo && item.sender === "user",
    );
    if (repliedIndex >= 0 && state.messages[repliedIndex].isPending) {
      state.messages[repliedIndex] = {
        ...state.messages[repliedIndex],
        isPending: false,
      };
    }
    state.messages = state.messages.filter(
      (item) => !(item.sender === "assistant" && item.isPending && item.replyTo === message.replyTo),
    );
  }
  if (isThinkingTraceMessage(message) && !isThinkingTraceActive(message)) {
    state.expandedThinkingTraceIds.delete(message.id);
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
    if (isThinkingTraceMessage(message)) {
      bubble.classList.add("thinking-bubble");
    }

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
    if (isThinkingTraceMessage(message)) {
      body.append(renderThinkingTrace(message));
    } else if (message.isPending && message.sender !== "user") {
      const pendingLabel = document.createElement("p");
      pendingLabel.textContent = t("chat.pendingLabel");
      body.append(pendingLabel, createPendingIndicator());
    } else {
      body.append(renderRichText(message.text || ""));
      if (Array.isArray(message.attachments) && message.attachments.length > 0) {
        body.append(renderAttachments(message.attachments));
      }
      if (message.isPending && message.sender === "user") {
        body.append(createPendingIndicator());
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
  elements.relayLabel.textContent = getInviteRelayLabel(state.invite) || t("chat.relayUnknown");
  const identityValue = state.identity.displayName || `${t("chat.identityUnknown")} · ${state.identity.appId.slice(0, 8)}`;
  elements.identityLabel.textContent = identityValue;
}

async function confirmRelayOverride(invite) {
  if (!inviteUsesNonDefaultRelay(invite)) {
    return true;
  }
  const relayLabel = getInviteRelayLabel(invite) || String(invite?.appWsUrl || "");
  return window.confirm(
    `${t("chat.customRelayWarningTitle")}\n\n${t("chat.customRelayWarningBody", {
      relayLabel,
    })}`,
  );
}

function renderStatus() {
  elements.statusPill.textContent = getStatusLabel(state.status);
  elements.statusPill.dataset.status = state.status;
  elements.statusCopy.textContent = state.statusCopy || t("chat.statusIdle");
}

function renderDesktopNote() {
  const showWarning = !isMobileDevice();
  elements.desktopNote.classList.toggle("hidden", !showWarning);
  elements.desktopNote.hidden = !showWarning;
}

function renderPage() {
  applyTranslations();
  document.title = t("chat.documentTitle");
  elements.inviteInput.placeholder = t("chat.inviteInputPlaceholder");
  elements.composerInput.placeholder = t("chat.composerPlaceholder");
  elements.attachButton.setAttribute("aria-label", t("chat.attachButtonAria"));
  elements.commandButton.setAttribute("aria-label", t("chat.commandButtonAria"));
  elements.closeCommandSheet.textContent = t("chat.commandSheetClose");
  if (state.scanner.active) {
    updateScannerStatus(t("chat.scannerStatusScanning"));
  } else if (elements.scannerSheet.hidden) {
    updateScannerStatus(t("chat.scannerStatusStarting"));
  }
  renderStatus();
  renderDesktopNote();
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

  if (!(await confirmRelayOverride(invite))) {
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

function consumeInviteFromLocation() {
  const currentUrl = new URL(window.location.href);
  const invite = currentUrl.searchParams.get("invite")?.trim();
  if (!invite) {
    return null;
  }
  currentUrl.searchParams.delete("invite");
  window.history.replaceState({}, document.title, currentUrl.toString());
  return invite;
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

elements.scanButton.addEventListener("click", async () => {
  await startScanner();
});

elements.scanImageButton.addEventListener("click", () => {
  void openScanImagePicker();
});

elements.inviteScanInput.addEventListener("change", async () => {
  const [file] = elements.inviteScanInput.files || [];
  if (file) {
    await scanFromImageFile(file);
  }
  elements.inviteScanInput.value = "";
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

elements.closeScannerSheet.addEventListener("click", async () => {
  await closeScannerSheet();
});
elements.scannerSheet.addEventListener("click", async (event) => {
  if (event.target === elements.scannerSheet) {
    await closeScannerSheet();
  }
});
elements.scannerUploadButton.addEventListener("click", () => {
  void openScanImagePicker();
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
window.addEventListener("beforeunload", () => {
  clearObjectUrls();
  void stopScanner();
});
onLocaleChange(renderPage);

setStatus("idle");
renderPage();

const inviteFromLocation = consumeInviteFromLocation();
if (inviteFromLocation) {
  elements.inviteInput.value = inviteFromLocation;
  void connectWithInvite(inviteFromLocation);
}
