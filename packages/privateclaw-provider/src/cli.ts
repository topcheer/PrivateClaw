#!/usr/bin/env node

import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EchoBridge } from "./bridges/echo-bridge.js";
import { OpenClawAgentBridge } from "./bridges/openclaw-agent-bridge.js";
import { OpenAICompatibleBridge } from "./bridges/openai-compatible-bridge.js";
import { WebhookBridge } from "./bridges/webhook-bridge.js";
import { loadAvailableOpenClawCommands } from "./openclaw-command-discovery.js";
import {
  parsePositiveIntegerFlag,
  printPairInviteBundle,
  runPairSession,
} from "./pair-session.js";
import {
  handoffForegroundPairToBackground,
  spawnBackgroundPairDaemon,
} from "./pair-daemon.js";
import { DEFAULT_SESSION_TTL_MS, PrivateClawProvider } from "./provider.js";
import { DEFAULT_RELAY_BASE_URL } from "./relay-defaults.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";
import {
  buildManagedSessionsReportLines,
  kickManagedParticipantFromStateDir,
  listManagedSessionsFromStateDir,
  PrivateClawSessionControlServer,
  resolvePrivateClawStateDir,
} from "./session-control.js";
import { formatBilingualInline } from "./text.js";
import type { PrivateClawProviderHandoffState } from "./types.js";

type BridgeMode =
  | "echo"
  | "webhook"
  | "openclaw-agent"
  | "openai-compatible";

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

function detectBridgeMode(): BridgeMode {
  const explicit = process.env.PRIVATECLAW_BRIDGE_MODE?.trim().toLowerCase();
  if (
    explicit === "echo" ||
    explicit === "webhook" ||
    explicit === "openclaw-agent" ||
    explicit === "openai-compatible"
  ) {
    return explicit;
  }

  const hasOpenClawAgentConfig =
    parseBooleanFlag(process.env.PRIVATECLAW_OPENCLAW_AGENT_BRIDGE) ||
    Boolean(process.env.PRIVATECLAW_OPENCLAW_AGENT_BIN?.trim()) ||
    Boolean(process.env.PRIVATECLAW_OPENCLAW_AGENT_ID?.trim()) ||
    Boolean(process.env.PRIVATECLAW_OPENCLAW_AGENT_CHANNEL?.trim());
  if (hasOpenClawAgentConfig) {
    return "openclaw-agent";
  }
  if (
    process.env.PRIVATECLAW_GATEWAY_CHAT_COMPLETIONS_URL?.trim() ||
    process.env.PRIVATECLAW_GATEWAY_BASE_URL?.trim()
  ) {
    return "openai-compatible";
  }
  if (process.env.PRIVATECLAW_WEBHOOK_URL?.trim()) {
    return "webhook";
  }
  return "echo";
}

function createProvider(params?: {
  providerId?: string;
}): {
  provider: PrivateClawProvider;
  stateDir: string;
} {
  const providerWsUrl = process.env.PRIVATECLAW_PROVIDER_WS_URL?.trim();
  const appWsUrl = process.env.PRIVATECLAW_APP_WS_URL?.trim();
  const relayBaseUrl =
    process.env.PRIVATECLAW_RELAY_BASE_URL?.trim() || DEFAULT_RELAY_BASE_URL;
  const relayEndpoints =
    providerWsUrl && appWsUrl
      ? { providerWsUrl, appWsUrl }
      : resolveRelayEndpoints(relayBaseUrl);
  const bridgeMode = detectBridgeMode();

  const webhookUrl = process.env.PRIVATECLAW_WEBHOOK_URL?.trim();
  const webhookToken = process.env.PRIVATECLAW_WEBHOOK_TOKEN?.trim();
  const gatewayBaseUrl = process.env.PRIVATECLAW_GATEWAY_BASE_URL?.trim();
  const gatewayChatCompletionsUrl =
    process.env.PRIVATECLAW_GATEWAY_CHAT_COMPLETIONS_URL?.trim();
  const gatewayModel =
    process.env.PRIVATECLAW_GATEWAY_MODEL?.trim() || "openclaw";
  const gatewayApiKey = process.env.PRIVATECLAW_GATEWAY_API_KEY?.trim();
  const gatewaySystemPrompt =
    process.env.PRIVATECLAW_GATEWAY_SYSTEM_PROMPT?.trim();
  const openClawAgentExecutable =
    process.env.PRIVATECLAW_OPENCLAW_AGENT_BIN?.trim();
  const openClawAgentId = process.env.PRIVATECLAW_OPENCLAW_AGENT_ID?.trim();
  const openClawAgentChannel =
    process.env.PRIVATECLAW_OPENCLAW_AGENT_CHANNEL?.trim();
  const openClawAgentThinking = process.env.PRIVATECLAW_OPENCLAW_AGENT_THINKING
    ?.trim() as
    | "off"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | undefined;
  const openClawAgentLocal = parseBooleanFlag(
    process.env.PRIVATECLAW_OPENCLAW_AGENT_LOCAL,
  );
  const openClawAgentTimeoutSeconds =
    process.env.PRIVATECLAW_OPENCLAW_AGENT_TIMEOUT_SECONDS
      ? parsePositiveInteger(
          process.env.PRIVATECLAW_OPENCLAW_AGENT_TIMEOUT_SECONDS,
          600,
        )
      : undefined;

  const bridge =
    bridgeMode === "openclaw-agent"
      ? new OpenClawAgentBridge({
          ...(openClawAgentExecutable
            ? { executable: openClawAgentExecutable }
            : {}),
          ...(openClawAgentId ? { agentId: openClawAgentId } : {}),
          ...(openClawAgentChannel ? { channel: openClawAgentChannel } : {}),
          ...(openClawAgentThinking ? { thinking: openClawAgentThinking } : {}),
          ...(openClawAgentTimeoutSeconds
            ? { timeoutSeconds: openClawAgentTimeoutSeconds }
            : {}),
          ...(openClawAgentLocal ? { local: true } : {}),
          onLog: (message) => {
            console.log(`[privateclaw-provider] ${message}`);
          },
        })
      : bridgeMode === "openai-compatible"
        ? new OpenAICompatibleBridge({
            endpoint:
              gatewayChatCompletionsUrl ||
              resolveChatCompletionsUrl(gatewayBaseUrl!),
            model: gatewayModel,
            ...(gatewayApiKey ? { apiKey: gatewayApiKey } : {}),
            ...(gatewaySystemPrompt
              ? { systemPrompt: gatewaySystemPrompt }
              : {}),
          })
        : bridgeMode === "webhook"
          ? new WebhookBridge({
              endpoint: webhookUrl!,
              ...(webhookToken ? { token: webhookToken } : {}),
            })
          : new EchoBridge(
              process.env.PRIVATECLAW_ECHO_PREFIX?.trim() || "PrivateClaw demo",
            );

  const ttlMs = parsePositiveInteger(
    process.env.PRIVATECLAW_SESSION_TTL_MS,
    DEFAULT_SESSION_TTL_MS,
  );
  const providerLabel =
    process.env.PRIVATECLAW_PROVIDER_LABEL?.trim() || "PrivateClaw";
  const welcomeMessage = process.env.PRIVATECLAW_WELCOME_MESSAGE?.trim();

  return {
    provider: new PrivateClawProvider({
      providerWsUrl: relayEndpoints.providerWsUrl,
      appWsUrl: relayEndpoints.appWsUrl,
      bridge,
      ...(params?.providerId ? { providerId: params.providerId } : {}),
      defaultTtlMs: ttlMs,
      providerLabel,
      commandsProvider: async () => {
        try {
          return await loadAvailableOpenClawCommands();
        } catch {
          return [];
        }
      },
      ...(welcomeMessage ? { welcomeMessage } : {}),
      onLog: (message) => {
        console.log(`[privateclaw-provider] ${message}`);
      },
    }),
    stateDir: resolvePrivateClawStateDir(),
  };
}

async function waitForSessionsToDrain(
  provider: PrivateClawProvider,
): Promise<void> {
  while (provider.listActiveSessions().length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

async function writeDaemonResult(
  resultFile: string,
  payload: unknown,
): Promise<void> {
  await mkdir(path.dirname(resultFile), { recursive: true });
  await writeFile(resultFile, JSON.stringify(payload), "utf8");
}

async function readHandoffState(
  snapshotFile: string,
): Promise<PrivateClawProviderHandoffState> {
  return JSON.parse(await readFile(snapshotFile, "utf8")) as PrivateClawProviderHandoffState;
}

function printHelp(): void {
  console.log(`privateclaw-provider <pair|sessions|kick>

pair [--ttl-ms <ms>] [--label <label>] [--group] [--print-only] [--open] [--foreground]
sessions
kick <sessionId> <appId>`);
}

async function runPairCommand(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "ttl-ms": { type: "string" },
      label: { type: "string" },
      group: { type: "boolean", default: false },
      "print-only": { type: "boolean", default: false },
      open: { type: "boolean", default: parseBooleanFlag(process.env.PRIVATECLAW_OPEN_QR) },
      foreground: { type: "boolean", default: false },
      "daemon-child": { type: "boolean", default: false },
      "result-file": { type: "string" },
      "resume-snapshot-file": { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (parsed.values.help) {
    printHelp();
    return;
  }

  const ttlMs = parsePositiveIntegerFlag(parsed.values["ttl-ms"], "--ttl-ms");
  const label = parsed.values.label?.trim();
  const groupMode = parsed.values.group === true;
  const printOnly = parsed.values["print-only"] === true;
  const openInBrowser = parsed.values.open === true;
  const foreground = parsed.values.foreground === true;
  const daemonChild = parsed.values["daemon-child"] === true;
  const resultFile = parsed.values["result-file"];
  const resumeSnapshotFile = parsed.values["resume-snapshot-file"];

  if (daemonChild) {
    if (!resultFile) {
      throw new Error("--daemon-child requires --result-file.");
    }
    let provider: PrivateClawProvider | undefined;
    let controlServer: PrivateClawSessionControlServer | undefined;
    try {
      const handoffState = resumeSnapshotFile
        ? await readHandoffState(resumeSnapshotFile)
        : undefined;
      const resolved = createProvider(
        handoffState ? { providerId: handoffState.providerId } : undefined,
      );
      provider = resolved.provider;
      if (handoffState) {
        provider.importHandoffState(handoffState);
        await provider.connect();
      }
      controlServer = new PrivateClawSessionControlServer({
        provider,
        stateDir: resolved.stateDir,
        kind: "pair-daemon",
        onLog: (message) => {
          console.log(`[privateclaw-provider] ${message}`);
        },
      });
      await controlServer.start();
      if (handoffState) {
        await writeDaemonResult(resultFile, {
          ok: true,
          resumedSessionCount: handoffState.sessions.length,
        });
      } else {
        const bundle = await runPairSession({
          provider,
          ...(typeof ttlMs === "number" ? { ttlMs } : {}),
          ...(label ? { label } : {}),
          ...(groupMode ? { groupMode: true } : {}),
          ...(openInBrowser ? { openInBrowser: true } : {}),
          foreground: false,
          writeLine: () => undefined,
        });
        await writeDaemonResult(resultFile, { ok: true, bundle });
      }
      await waitForSessionsToDrain(provider);
    } catch (error) {
      await writeDaemonResult(resultFile, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      await controlServer?.stop();
      await provider?.dispose();
    }
    return;
  }

  if (printOnly || foreground) {
    const { provider, stateDir } = createProvider();
    const controlServer =
      printOnly
        ? undefined
        : new PrivateClawSessionControlServer({
            provider,
            stateDir,
            kind: "pair-foreground",
            onLog: (message) => {
              console.log(`[privateclaw-provider] ${message}`);
            },
          });
    try {
      await controlServer?.start();
      await runPairSession({
        provider,
        ...(typeof ttlMs === "number" ? { ttlMs } : {}),
        ...(label ? { label } : {}),
        ...(groupMode ? { groupMode: true } : {}),
        ...(printOnly ? { printOnly: true } : {}),
        ...(openInBrowser ? { openInBrowser: true } : {}),
        foreground: true,
        ...(printOnly
          ? {}
          : {
              handoffToBackground: async () => {
                provider.suppressReconnectsForHandoff();
                try {
                  await handoffForegroundPairToBackground({
                    cliModuleUrl: import.meta.url,
                    stateDir,
                    env: process.env,
                    handoffState: provider.exportHandoffState(),
                  });
                  return formatBilingualInline(
                    "当前 PrivateClaw 会话已转入后台。可使用 `privateclaw-provider sessions` 查看。",
                    "The current PrivateClaw session is now running in the background. Use `privateclaw-provider sessions` to inspect it.",
                  );
                } catch (error) {
                  provider.resumeReconnectsAfterHandoffFailure();
                  throw error;
                }
              },
            }),
      });
    } finally {
      await controlServer?.stop();
    }
    return;
  }

  const bundle = await spawnBackgroundPairDaemon({
    cliModuleUrl: import.meta.url,
    stateDir: resolvePrivateClawStateDir(),
    env: process.env,
    ...(typeof ttlMs === "number" ? { ttlMs } : {}),
    ...(label ? { label } : {}),
    ...(groupMode ? { groupMode: true } : {}),
    ...(openInBrowser ? { openInBrowser: true } : {}),
  });
  printPairInviteBundle(bundle, (line) => {
    console.log(line);
  });
}

async function runSessionsCommand(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
    },
  });
  if (parsed.values.help) {
    printHelp();
    return;
  }

  const listings = await listManagedSessionsFromStateDir(resolvePrivateClawStateDir());
  for (const line of buildManagedSessionsReportLines(listings)) {
    console.log(line);
  }
}

async function runKickCommand(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
    },
  });
  if (parsed.values.help) {
    printHelp();
    return;
  }
  if (parsed.positionals.length < 2) {
    throw new Error(
      formatBilingualInline(
        "kick 需要提供 sessionId 和 appId。",
        "kick requires both a sessionId and appId.",
      ),
    );
  }

  const [sessionIdRaw, appIdRaw] = parsed.positionals;
  if (!sessionIdRaw || !appIdRaw) {
    throw new Error(
      formatBilingualInline(
        "kick 需要提供 sessionId 和 appId。",
        "kick requires both a sessionId and appId.",
      ),
    );
  }
  const sessionId = sessionIdRaw;
  const appId = appIdRaw;
  const result = await kickManagedParticipantFromStateDir({
    stateDir: resolvePrivateClawStateDir(),
    sessionId,
    appId,
    reason: "participant_removed",
  });
  console.log(
    formatBilingualInline(
      `已从会话 ${result.session.sessionId} 中移除 ${result.participant.displayName} (${result.participant.appId})。`,
      `Removed ${result.participant.displayName} (${result.participant.appId}) from session ${result.session.sessionId}.`,
    ),
  );
}

const argv = process.argv.slice(2);
const [command, ...rest] =
  argv.length === 0 || argv[0]!.startsWith("-")
    ? ["pair", ...argv]
    : argv;

if (command === "pair") {
  await runPairCommand(rest);
} else if (command === "sessions") {
  await runSessionsCommand(rest);
} else if (command === "kick") {
  await runKickCommand(rest);
} else if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else {
  throw new Error(`Unsupported privateclaw-provider command: ${command}`);
}
