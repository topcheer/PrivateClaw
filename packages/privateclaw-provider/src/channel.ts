import { randomUUID } from "node:crypto";
import type {
  OpenClawChannelPluginCompat,
  OpenClawOutboundDeliveryResultCompat,
  ReplyPayloadCompat,
} from "./compat/openclaw.js";
import type { PrivateClawOpenClawOutboundMessage } from "./types.js";

export const PRIVATECLAW_OPENCLAW_CHANNEL_ID = "privateclaw";
export const PRIVATECLAW_OPENCLAW_ACCOUNT_ID = "default";

interface PrivateClawVirtualAccount {
  accountId: string;
  name: string;
  enabled: true;
  configured: true;
}

function resolvePrivateClawAccountId(accountId?: string | null): string {
  const normalized = accountId?.trim();
  return normalized ? normalized : PRIVATECLAW_OPENCLAW_ACCOUNT_ID;
}

function toOutboundMessage(
  payload: ReplyPayloadCompat,
): PrivateClawOpenClawOutboundMessage {
  return {
    ...(payload.text?.trim() ? { text: payload.text.trim() } : {}),
    ...(payload.mediaUrl?.trim() ? { mediaUrl: payload.mediaUrl.trim() } : {}),
    ...(payload.mediaUrls?.length ? { mediaUrls: payload.mediaUrls } : {}),
    ...(typeof payload.replyToId === "string" || payload.replyToId === null
      ? { replyToId: payload.replyToId }
      : {}),
  };
}

function buildDeliveryResult(
  sessionId: string,
): OpenClawOutboundDeliveryResultCompat {
  return {
    channel: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
    messageId: `privateclaw-outbound-${randomUUID()}`,
    chatId: sessionId,
    timestamp: Date.now(),
  };
}

export function createPrivateClawChannelPlugin(params: {
  deliverOutboundMessage(
    sessionId: string,
    payload: PrivateClawOpenClawOutboundMessage,
  ): Promise<void>;
}): OpenClawChannelPluginCompat<PrivateClawVirtualAccount> {
  return {
    id: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
    meta: {
      id: PRIVATECLAW_OPENCLAW_CHANNEL_ID,
      label: "PrivateClaw",
      selectionLabel: "PrivateClaw",
      docsPath: "https://privateclaw.us",
      docsLabel: "PrivateClaw docs",
      blurb:
        "Routes paired PrivateClaw app conversations back through the encrypted relay session.",
      showConfigured: false,
      quickstartAllowFrom: false,
      preferSessionLookupForAnnounceTarget: true,
    },
    capabilities: {
      chatTypes: ["direct", "group"],
      reply: true,
      threads: false,
      media: true,
      nativeCommands: false,
    },
    config: {
      listAccountIds: () => [PRIVATECLAW_OPENCLAW_ACCOUNT_ID],
      resolveAccount: (_cfg, accountId) => ({
        accountId: resolvePrivateClawAccountId(accountId),
        name: "PrivateClaw virtual account",
        enabled: true,
        configured: true,
      }),
      defaultAccountId: () => PRIVATECLAW_OPENCLAW_ACCOUNT_ID,
      isEnabled: () => true,
      isConfigured: () => true,
      describeAccount: (account) => ({
        accountId: account.accountId,
        name: account.name,
        enabled: true,
        configured: true,
        linked: true,
        running: true,
        connected: true,
      }),
    },
    commands: {
      skipWhenConfigEmpty: false,
    },
    threading: {
      resolveReplyToMode: () => "all",
    },
    outbound: {
      deliveryMode: "direct",
      sendPayload: async (ctx) => {
        await params.deliverOutboundMessage(ctx.to, toOutboundMessage(ctx.payload));
        return buildDeliveryResult(ctx.to);
      },
      sendText: async (ctx) => {
        await params.deliverOutboundMessage(ctx.to, {
          ...(ctx.text.trim() ? { text: ctx.text } : {}),
          ...(ctx.mediaUrl?.trim() ? { mediaUrl: ctx.mediaUrl.trim() } : {}),
          ...(typeof ctx.replyToId === "string" || ctx.replyToId === null
            ? { replyToId: ctx.replyToId }
            : {}),
        });
        return buildDeliveryResult(ctx.to);
      },
      sendMedia: async (ctx) => {
        await params.deliverOutboundMessage(ctx.to, {
          ...(ctx.text.trim() ? { text: ctx.text } : {}),
          ...(ctx.mediaUrl?.trim() ? { mediaUrl: ctx.mediaUrl.trim() } : {}),
          ...(typeof ctx.replyToId === "string" || ctx.replyToId === null
            ? { replyToId: ctx.replyToId }
            : {}),
        });
        return buildDeliveryResult(ctx.to);
      },
    },
  };
}
