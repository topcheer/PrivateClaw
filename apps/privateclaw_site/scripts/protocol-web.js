export const PRIVATECLAW_INVITE_SCHEME = "privateclaw://connect";
export const DEFAULT_PRIVATECLAW_RELAY_HOST = "relay.privateclaw.us";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function assertWebCrypto() {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error("browser_crypto_unavailable");
  }
}

export function bytesToBase64Url(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64UrlToBytes(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("invalid_base64url");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function decodeUtf8(bytes) {
  return decoder.decode(bytes);
}

export function encodeUtf8(value) {
  return encoder.encode(value);
}

function assertInviteShape(value) {
  if (!value || typeof value !== "object") {
    throw new Error("malformed_invite");
  }
  const invite = value;
  const requiredFields = ["sessionId", "sessionKey", "appWsUrl", "expiresAt"];
  for (const field of requiredFields) {
    if (typeof invite[field] !== "string" || invite[field].trim() === "") {
      throw new Error(`invite_missing_${field}`);
    }
  }
  if (invite.version !== 1) {
    throw new Error("unsupported_invite_version");
  }
}

function parseInviteJson(serialized) {
  const parsed = JSON.parse(serialized);
  assertInviteShape(parsed);
  return parsed;
}

function decodeInvitePayload(payload) {
  return parseInviteJson(decodeUtf8(base64UrlToBytes(payload)));
}

export function decodeInviteString(input) {
  if (typeof input !== "string" || input.trim() === "") {
    throw new Error("empty_invite");
  }

  const trimmed = input.trim();
  const embeddedMatch = trimmed.match(/privateclaw:\/\/connect\?payload=[A-Za-z0-9_-]+/);
  if (embeddedMatch && embeddedMatch[0] !== trimmed) {
    return decodeInviteString(embeddedMatch[0]);
  }

  if (trimmed.startsWith(PRIVATECLAW_INVITE_SCHEME)) {
    const url = new URL(trimmed);
    const payload = url.searchParams.get("payload");
    if (!payload) {
      throw new Error("missing_payload");
    }
    return decodeInvitePayload(payload);
  }

  if (trimmed.startsWith("{")) {
    return parseInviteJson(trimmed);
  }

  return decodeInvitePayload(trimmed);
}

export function encodeInviteToUri(invite) {
  assertInviteShape(invite);
  const payload = bytesToBase64Url(encodeUtf8(JSON.stringify(invite)));
  return `${PRIVATECLAW_INVITE_SCHEME}?payload=${payload}`;
}

export function getInviteRelayLabel(invite) {
  const explicitLabel =
    typeof invite?.relayLabel === "string" ? invite.relayLabel.trim() : "";
  if (explicitLabel) {
    return explicitLabel;
  }

  try {
    const relayUrl = new URL(String(invite?.appWsUrl || ""));
    if (!relayUrl.host) {
      return null;
    }
    const useDefaultPort =
      relayUrl.port === "" ||
      (relayUrl.protocol === "wss:" && relayUrl.port === "443") ||
      (relayUrl.protocol === "ws:" && relayUrl.port === "80");
    return useDefaultPort ? relayUrl.host : `${relayUrl.hostname}:${relayUrl.port}`;
  } catch {
    return null;
  }
}

export function inviteUsesDefaultRelay(invite) {
  try {
    const relayUrl = new URL(String(invite?.appWsUrl || ""));
    if (!relayUrl.host) {
      return getInviteRelayLabel(invite) === DEFAULT_PRIVATECLAW_RELAY_HOST;
    }
    const useDefaultPort =
      relayUrl.port === "" ||
      (relayUrl.protocol === "wss:" && relayUrl.port === "443") ||
      (relayUrl.protocol === "ws:" && relayUrl.port === "80");
    return relayUrl.hostname === DEFAULT_PRIVATECLAW_RELAY_HOST && useDefaultPort;
  } catch {
    return getInviteRelayLabel(invite) === DEFAULT_PRIVATECLAW_RELAY_HOST;
  }
}

export function inviteUsesNonDefaultRelay(invite) {
  return !inviteUsesDefaultRelay(invite);
}

export function createMessageId(prefix = "client") {
  assertWebCrypto();
  const randomBytes = new Uint32Array(2);
  globalThis.crypto.getRandomValues(randomBytes);
  return `${prefix}-${Date.now()}-${randomBytes[0].toString(16)}${randomBytes[1].toString(16)}`;
}

export function createIdentity() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return {
      appId: globalThis.crypto.randomUUID(),
      displayName: null,
    };
  }

  return {
    appId: createMessageId("app"),
    displayName: null,
  };
}

export async function createCryptoContext({ sessionId, sessionKey }) {
  assertWebCrypto();
  if (typeof sessionId !== "string" || sessionId.trim() === "") {
    throw new Error("invalid_session_id");
  }

  const rawKey = base64UrlToBytes(sessionKey);
  if (rawKey.byteLength !== 32) {
    throw new Error("invalid_session_key_length");
  }

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  const aad = encodeUtf8(sessionId);

  return {
    async encrypt(payload) {
      const iv = new Uint8Array(12);
      globalThis.crypto.getRandomValues(iv);
      const plaintext = encodeUtf8(JSON.stringify(payload));
      const combined = new Uint8Array(
        await globalThis.crypto.subtle.encrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: aad,
            tagLength: 128,
          },
          cryptoKey,
          plaintext,
        ),
      );
      const tagLength = 16;
      const ciphertext = combined.subarray(0, combined.length - tagLength);
      const tag = combined.subarray(combined.length - tagLength);
      return {
        version: 1,
        messageId: createMessageId("envelope"),
        iv: bytesToBase64Url(iv),
        ciphertext: bytesToBase64Url(ciphertext),
        tag: bytesToBase64Url(tag),
        sentAt: new Date().toISOString(),
      };
    },
    async decrypt(envelope) {
      if (!envelope || typeof envelope !== "object" || envelope.version !== 1) {
        throw new Error("unsupported_envelope_version");
      }
      const iv = base64UrlToBytes(String(envelope.iv || ""));
      const ciphertext = base64UrlToBytes(String(envelope.ciphertext || ""));
      const tag = base64UrlToBytes(String(envelope.tag || ""));
      const combined = new Uint8Array(ciphertext.length + tag.length);
      combined.set(ciphertext, 0);
      combined.set(tag, ciphertext.length);
      const plaintext = new Uint8Array(
        await globalThis.crypto.subtle.decrypt(
          {
            name: "AES-GCM",
            iv,
            additionalData: aad,
            tagLength: 128,
          },
          cryptoKey,
          combined,
        ),
      );
      const decoded = JSON.parse(decodeUtf8(plaintext));
      if (!decoded || typeof decoded !== "object") {
        throw new Error("invalid_payload_shape");
      }
      return decoded;
    },
  };
}

export function inferMimeType(filename) {
  const extension = filename.includes(".") ? filename.split(".").pop().toLowerCase() : "";
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "txt":
      return "text/plain";
    case "md":
    case "markdown":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "xml":
      return "application/xml";
    default:
      return "application/octet-stream";
  }
}

export async function readFileAsAttachment(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return {
    id: createMessageId("attachment"),
    name: file.name,
    mimeType: file.type || inferMimeType(file.name),
    sizeBytes: file.size,
    dataBase64: bytesToBase64(bytes),
  };
}

export function decodeBase64(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4 || 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
