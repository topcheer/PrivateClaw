import type { PrivateClawInvite } from "./types.js";

export const PRIVATECLAW_INVITE_SCHEME = "privateclaw://connect";

function assertInvite(value: unknown): asserts value is PrivateClawInvite {
  if (typeof value !== "object" || value === null) {
    throw new Error("PrivateClaw invite must be a JSON object.");
  }

  const invite = value as Record<string, unknown>;
  const requiredStringFields = ["sessionId", "sessionKey", "appWsUrl", "expiresAt"];
  for (const field of requiredStringFields) {
    if (typeof invite[field] !== "string" || invite[field] === "") {
      throw new Error(`PrivateClaw invite is missing a valid ${field} field.`);
    }
  }

  if (invite.version !== 1) {
    throw new Error("Unsupported PrivateClaw invite version.");
  }
}

function parseInviteJson(serialized: string): PrivateClawInvite {
  const parsed = JSON.parse(serialized) as unknown;
  assertInvite(parsed);
  return parsed;
}

export function encodeInviteToUri(invite: PrivateClawInvite): string {
  const payload = Buffer.from(JSON.stringify(invite), "utf8").toString("base64url");
  return `${PRIVATECLAW_INVITE_SCHEME}?payload=${payload}`;
}

export function decodeInviteString(input: string): PrivateClawInvite {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("PrivateClaw invite string is empty.");
  }

  if (trimmed.startsWith(PRIVATECLAW_INVITE_SCHEME)) {
    const url = new URL(trimmed);
    const payload = url.searchParams.get("payload");
    if (!payload) {
      throw new Error("PrivateClaw invite URI is missing the payload query parameter.");
    }
    return parseInviteJson(Buffer.from(payload, "base64url").toString("utf8"));
  }

  if (trimmed.startsWith("{")) {
    return parseInviteJson(trimmed);
  }

  return parseInviteJson(Buffer.from(trimmed, "base64url").toString("utf8"));
}
