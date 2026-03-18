import type { BridgeResponse, PrivateClawAgentBridge, PrivateClawConversationTurn } from "../types.js";

interface OpenAICompatibleBridgeOptions {
  endpoint: string;
  model: string;
  apiKey?: string;
  systemPrompt?: string;
}

interface OpenAICompatibleResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

type OpenAICompatibleRole = "system" | "user" | "assistant";

function normalizeRole(role: PrivateClawConversationTurn["role"]): OpenAICompatibleRole {
  switch (role) {
    case "assistant":
    case "thinking":
      return "assistant";
    case "system":
      return "system";
    case "user":
      return "user";
  }
}

function normalizeContent(
  content:
    | string
    | Array<{
        type?: string;
        text?: string;
      }>
    | undefined,
): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => (part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export class OpenAICompatibleBridge implements PrivateClawAgentBridge {
  constructor(private readonly options: OpenAICompatibleBridgeOptions) {}

  async handleUserMessage(params: {
    history: ReadonlyArray<PrivateClawConversationTurn>;
  }): Promise<BridgeResponse> {
    const messages = [
      ...(this.options.systemPrompt
        ? [{ role: "system" as const, content: this.options.systemPrompt }]
        : []),
      ...params.history.map((turn) => ({
        role: normalizeRole(turn.role),
        content: turn.text,
      })),
    ];

    const response = await fetch(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
      }),
    });

    const payload = (await response.json()) as OpenAICompatibleResponse;
    if (!response.ok) {
      throw new Error(
        payload.error?.message ??
          `OpenAI-compatible bridge responded with ${response.status} ${response.statusText}`,
      );
    }

    const text = normalizeContent(payload.choices?.[0]?.message?.content);
    if (text !== "") {
      return text;
    }

    throw new Error("OpenAI-compatible bridge did not return a text response.");
  }
}
