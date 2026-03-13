import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import type { EncryptedEnvelope, PrivateClawPayload } from "./types.js";

const SESSION_KEY_BYTES = 32;
const ENVELOPE_VERSION = 1 as const;

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function decodeSessionKey(sessionKey: string): Buffer {
  const decoded = decodeBase64Url(sessionKey);
  if (decoded.length !== SESSION_KEY_BYTES) {
    throw new Error(`PrivateClaw session key must be ${SESSION_KEY_BYTES} bytes.`);
  }
  return decoded;
}

export function generateSessionKey(): string {
  return randomBytes(SESSION_KEY_BYTES).toString("base64url");
}

export function encryptPayload<T extends PrivateClawPayload>(params: {
  sessionId: string;
  sessionKey: string;
  payload: T;
}): EncryptedEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", decodeSessionKey(params.sessionKey), iv);
  cipher.setAAD(Buffer.from(params.sessionId, "utf8"));

  const plaintext = Buffer.from(JSON.stringify(params.payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: ENVELOPE_VERSION,
    messageId: randomUUID(),
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: tag.toString("base64url"),
    sentAt: new Date().toISOString(),
  };
}

export function decryptPayload<T extends PrivateClawPayload>(params: {
  sessionId: string;
  sessionKey: string;
  envelope: EncryptedEnvelope;
}): T {
  if (params.envelope.version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported PrivateClaw envelope version: ${params.envelope.version}`);
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    decodeSessionKey(params.sessionKey),
    decodeBase64Url(params.envelope.iv),
  );
  decipher.setAAD(Buffer.from(params.sessionId, "utf8"));
  decipher.setAuthTag(decodeBase64Url(params.envelope.tag));

  const plaintext = Buffer.concat([
    decipher.update(decodeBase64Url(params.envelope.ciphertext)),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as T;
}
