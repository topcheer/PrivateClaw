import type { PrivateClawAttachment } from "@privateclaw/protocol";
import type { BridgeResponse, PrivateClawAgentBridge } from "../types.js";

interface WebhookBridgeOptions {
  endpoint: string;
  token?: string;
}

interface WebhookResponseShape {
  reply?: string;
  messages?: Array<string | { text: string; attachments?: PrivateClawAttachment[] }>;
}

export class WebhookBridge implements PrivateClawAgentBridge {
  constructor(private readonly options: WebhookBridgeOptions) {}

  async handleUserMessage(params: {
    sessionId: string;
    message: string;
    history: ReadonlyArray<{ role: string; text: string; sentAt: string }>;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
  }): Promise<BridgeResponse> {
    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.token ? { authorization: `Bearer ${this.options.token}` } : {}),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`Webhook bridge responded with ${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as WebhookResponseShape;
    if (Array.isArray(payload.messages) && payload.messages.length > 0) {
      return { messages: payload.messages };
    }
    if (typeof payload.reply === "string" && payload.reply.trim() !== "") {
      return payload.reply;
    }
    throw new Error("Webhook bridge must return either reply or messages.");
  }
}
