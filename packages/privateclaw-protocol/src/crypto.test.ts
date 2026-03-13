import assert from "node:assert/strict";
import test from "node:test";
import { decryptPayload, encodeInviteToUri, generateSessionKey, decodeInviteString, encryptPayload } from "./index.js";

test("encryptPayload and decryptPayload round-trip PrivateClaw messages", () => {
  const sessionId = "session-123";
  const sessionKey = generateSessionKey();
  const envelope = encryptPayload({
    sessionId,
    sessionKey,
    payload: {
      kind: "user_message",
      text: "hello privateclaw",
      clientMessageId: "client-1",
      sentAt: new Date().toISOString(),
    },
  });

  const decrypted = decryptPayload({ sessionId, sessionKey, envelope });
  assert.equal(decrypted.kind, "user_message");
  assert.equal(decrypted.text, "hello privateclaw");
});

test("encodeInviteToUri and decodeInviteString round-trip invites", () => {
  const invite = {
    version: 1 as const,
    sessionId: "session-abc",
    sessionKey: generateSessionKey(),
    appWsUrl: "ws://127.0.0.1:8787/ws/app?sessionId=session-abc",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    providerLabel: "PrivateClaw",
  };

  const decoded = decodeInviteString(encodeInviteToUri(invite));
  assert.deepEqual(decoded, invite);
});
