#!/usr/bin/env node

import { EchoBridge } from "./bridges/echo-bridge.js";
import { OpenClawAgentBridge } from "./bridges/openclaw-agent-bridge.js";
import { OpenAICompatibleBridge } from "./bridges/openai-compatible-bridge.js";
import { WebhookBridge } from "./bridges/webhook-bridge.js";
import { runPairSession } from "./pair-session.js";
import { PrivateClawProvider } from "./provider.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }

  return parsed;
}

function parseBooleanFlag(value: string | undefined): boolean {
  return value != null && /^(1|true|yes|on)$/i.test(value.trim());
}

function resolveChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = "/v1/chat/completions";
  url.search = "";
  url.hash = "";
  return url.toString();
}

const relayBaseUrl = process.env.PRIVATECLAW_RELAY_BASE_URL?.trim() || "ws://127.0.0.1:8787";
const { providerWsUrl, appWsUrl } = resolveRelayEndpoints(relayBaseUrl);
const webhookUrl = process.env.PRIVATECLAW_WEBHOOK_URL?.trim();
const webhookToken = process.env.PRIVATECLAW_WEBHOOK_TOKEN?.trim();
const gatewayBaseUrl = process.env.PRIVATECLAW_GATEWAY_BASE_URL?.trim();
const gatewayChatCompletionsUrl = process.env.PRIVATECLAW_GATEWAY_CHAT_COMPLETIONS_URL?.trim();
const gatewayModel = process.env.PRIVATECLAW_GATEWAY_MODEL?.trim() || "openclaw";
const gatewayApiKey = process.env.PRIVATECLAW_GATEWAY_API_KEY?.trim();
const gatewaySystemPrompt = process.env.PRIVATECLAW_GATEWAY_SYSTEM_PROMPT?.trim();
const openClawAgentBridge = parseBooleanFlag(process.env.PRIVATECLAW_OPENCLAW_AGENT_BRIDGE);
const openClawAgentExecutable = process.env.PRIVATECLAW_OPENCLAW_AGENT_BIN?.trim();
const openClawAgentId = process.env.PRIVATECLAW_OPENCLAW_AGENT_ID?.trim();
const openClawAgentChannel = process.env.PRIVATECLAW_OPENCLAW_AGENT_CHANNEL?.trim();
const openClawAgentThinking = process.env.PRIVATECLAW_OPENCLAW_AGENT_THINKING?.trim() as
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | undefined;
const openClawAgentLocal = parseBooleanFlag(process.env.PRIVATECLAW_OPENCLAW_AGENT_LOCAL);
const openClawAgentTimeoutSeconds = process.env.PRIVATECLAW_OPENCLAW_AGENT_TIMEOUT_SECONDS
  ? parsePositiveInteger(process.env.PRIVATECLAW_OPENCLAW_AGENT_TIMEOUT_SECONDS, 600)
  : undefined;
const ttlMs = parsePositiveInteger(process.env.PRIVATECLAW_SESSION_TTL_MS, 15 * 60 * 1000);
const providerLabel = process.env.PRIVATECLAW_PROVIDER_LABEL?.trim() || "PrivateClaw";
const welcomeMessage = process.env.PRIVATECLAW_WELCOME_MESSAGE?.trim();

const bridge =
  openClawAgentBridge
    ? new OpenClawAgentBridge({
        ...(openClawAgentExecutable ? { executable: openClawAgentExecutable } : {}),
        ...(openClawAgentId ? { agentId: openClawAgentId } : {}),
        ...(openClawAgentChannel ? { channel: openClawAgentChannel } : {}),
        ...(openClawAgentThinking ? { thinking: openClawAgentThinking } : {}),
        ...(openClawAgentTimeoutSeconds ? { timeoutSeconds: openClawAgentTimeoutSeconds } : {}),
        ...(openClawAgentLocal ? { local: true } : {}),
      })
    : gatewayChatCompletionsUrl || gatewayBaseUrl
    ? new OpenAICompatibleBridge({
        endpoint: gatewayChatCompletionsUrl || resolveChatCompletionsUrl(gatewayBaseUrl!),
        model: gatewayModel,
        ...(gatewayApiKey ? { apiKey: gatewayApiKey } : {}),
        ...(gatewaySystemPrompt ? { systemPrompt: gatewaySystemPrompt } : {}),
      })
    : webhookUrl
      ? new WebhookBridge({ endpoint: webhookUrl, ...(webhookToken ? { token: webhookToken } : {}) })
      : new EchoBridge(process.env.PRIVATECLAW_ECHO_PREFIX?.trim() || "PrivateClaw demo");

const provider = new PrivateClawProvider({
  providerWsUrl,
  appWsUrl,
  bridge,
  defaultTtlMs: ttlMs,
  providerLabel,
  ...(welcomeMessage ? { welcomeMessage } : {}),
  onLog: (message) => {
    console.log(`[privateclaw-provider] ${message}`);
  },
});

await runPairSession({
  provider,
  ttlMs,
  writeLine: (line) => {
    console.log(line);
  },
});
