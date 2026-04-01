#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EchoBridge } from "./bridges/echo-bridge.js";
import {
  buildPreferredAudioTranscriber,
} from "./audio-transcriber.js";
import { OpenClawAgentBridge } from "./bridges/openclaw-agent-bridge.js";
import { OpenAICompatibleBridge } from "./bridges/openai-compatible-bridge.js";
import { WebhookBridge } from "./bridges/webhook-bridge.js";
import { loadAvailableOpenClawCommands } from "./openclaw-command-discovery.js";
import {
  openInBrowserPreview,
  parsePositiveIntegerFlag,
  printPairInviteBundle,
  renderInviteBundleOutput,
  runPairSession,
} from "./pair-session.js";
import {
  handoffForegroundPairToBackground,
  spawnBackgroundPairDaemon,
} from "./pair-daemon.js";
import { resolvePrivateClawMediaDir } from "./invite-qr-files.js";
import { DEFAULT_SESSION_TTL_MS, PrivateClawProvider } from "./provider.js";
import { DEFAULT_RELAY_BASE_URL } from "./relay-defaults.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";
import {
  buildManagedSessionQrLegacyLines,
  dispatchRoutedAppMessageToPluginServiceFromStateDir,
  followManagedSessionLogFromStateDir,
  buildManagedSessionsReportLines,
  closeManagedSessionsFromStateDir,
  closeManagedSessionFromStateDir,
  getManagedSessionQrBundleFromStateDir,
  isManagedSessionQrLegacyResult,
  kickManagedParticipantFromStateDir,
  listManagedSessionsFromStateDir,
  PrivateClawSessionControlServer,
  resolvePrivateClawStateDir,
} from "./session-control.js";
import {
  parsePrivateClawSessionDurationPreset,
  runPrivateClawSetup,
} from "./setup.js";
import {
  appendPrivateClawAppInstallFooter,
  PRIVATECLAW_CLI_CONFIG_OPTION_DESCRIPTION,
  buildPrivateClawBackgroundDaemonReminder,
  formatBilingualInline,
  PRIVATECLAW_CLI_DURATION_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_NOTIFY_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_RELAY_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_SETUP_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_FOLLOW_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_KILL_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_KILLALL_DESCRIPTION,
  PRIVATECLAW_CLI_SESSIONS_QR_DESCRIPTION,
  PRIVATECLAW_CLI_SINGLE_OPTION_DESCRIPTION,
  PRIVATECLAW_CLI_VERBOSE_OPTION_DESCRIPTION,
  writePrivateClawAppInstallFooter,
} from "./text.js";
import type {
  PrivateClawProviderHandoffState,
  PrivateClawVerboseController,
} from "./types.js";

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

function parseNonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  if (!value || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, received: ${value}`);
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
  relayBaseUrl?: string;
  verboseController?: PrivateClawVerboseController;
}): {
  provider: PrivateClawProvider;
  stateDir: string;
} {
  const stateDir = resolvePrivateClawStateDir();
  const providerWsUrl = process.env.PRIVATECLAW_PROVIDER_WS_URL?.trim();
  const appWsUrl = process.env.PRIVATECLAW_APP_WS_URL?.trim();
  const relayBaseUrl =
    params?.relayBaseUrl?.trim() ||
    process.env.PRIVATECLAW_RELAY_BASE_URL?.trim() ||
    DEFAULT_RELAY_BASE_URL;
  const relayEndpoints =
    !params?.relayBaseUrl && providerWsUrl && appWsUrl
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
  const verboseController = params?.verboseController;
  const audioTranscriber = buildCliAudioTranscriber();

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
          ...(verboseController ? { verboseController } : {}),
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
  const botMode = parseBooleanFlag(process.env.PRIVATECLAW_BOT_MODE);
  const botModeSilentJoinDelayMs = process.env.PRIVATECLAW_BOT_MODE_SILENT_JOIN_DELAY_MS
    ? parseNonNegativeInteger(
        process.env.PRIVATECLAW_BOT_MODE_SILENT_JOIN_DELAY_MS,
        0,
      )
    : undefined;
  const botModeIdleDelayMs = process.env.PRIVATECLAW_BOT_MODE_IDLE_DELAY_MS
    ? parseNonNegativeInteger(process.env.PRIVATECLAW_BOT_MODE_IDLE_DELAY_MS, 0)
    : undefined;
  const providerLabel =
    process.env.PRIVATECLAW_PROVIDER_LABEL?.trim() || "PrivateClaw";
  const welcomeMessage = process.env.PRIVATECLAW_WELCOME_MESSAGE?.trim();

  return {
    provider: new PrivateClawProvider({
      providerWsUrl: relayEndpoints.providerWsUrl,
      appWsUrl: relayEndpoints.appWsUrl,
      bridge,
      ...(audioTranscriber ? { audioTranscriber } : {}),
      ...(params?.providerId ? { providerId: params.providerId } : {}),
      defaultTtlMs: ttlMs,
      providerLabel,
      ...(verboseController ? { verboseController } : {}),
      ...(botMode ? { botMode: true } : {}),
      ...(typeof botModeSilentJoinDelayMs === "number"
        ? { botModeSilentJoinDelayMs }
        : {}),
      ...(typeof botModeIdleDelayMs === "number"
        ? { botModeIdleDelayMs }
        : {}),
      commandsProvider: async () => {
        try {
          return await loadAvailableOpenClawCommands();
        } catch {
          return [];
        }
      },
      appMessageRouter: async (message) => {
        try {
          await dispatchRoutedAppMessageToPluginServiceFromStateDir({
            stateDir,
            message,
          });
          return true;
        } catch (error) {
          console.log(
            `[privateclaw-provider] [privateclaw] runtime routing unavailable, falling back to bridge for ${message.sessionId}: ${error instanceof Error ? error.message : String(error)}`,
          );
          return false;
        }
      },
      ...(welcomeMessage ? { welcomeMessage } : {}),
      onLog: (message) => {
        console.log(`[privateclaw-provider] ${message}`);
      },
    }),
    stateDir,
  };
}

function buildCliAudioTranscriber() {
  return buildPreferredAudioTranscriber({
    env: process.env,
    onLog: (message) => {
      console.log(`[privateclaw-provider] ${message}`);
    },
  });
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
  console.log(`privateclaw-provider <setup|pair|sessions|kick|killall>

setup [--group|--single] [--duration <preset>] [--ttl-ms <ms>] [--label <label>] [--relay <url>] [--config <path>] [--open] [--foreground] [--verbose]
pair [--ttl-ms <ms>] [--label <label>] [--relay <url>] [--group] [--print-only] [--open] [--foreground] [--verbose]
sessions
sessions follow <sessionId>
sessions qr <sessionId> [--open] [--notify]
sessions kill <sessionId>
sessions killall
killall
kick <sessionId> <appId>`);
  console.log(`\nsetup: ${PRIVATECLAW_CLI_SETUP_DESCRIPTION}`);
  console.log(`\n--relay <url>: ${PRIVATECLAW_CLI_RELAY_OPTION_DESCRIPTION}`);
  console.log(`--config <path>: ${PRIVATECLAW_CLI_CONFIG_OPTION_DESCRIPTION}`);
  console.log(`--duration <preset>: ${PRIVATECLAW_CLI_DURATION_OPTION_DESCRIPTION}`);
  console.log(`--single: ${PRIVATECLAW_CLI_SINGLE_OPTION_DESCRIPTION}`);
  console.log(`--verbose: ${PRIVATECLAW_CLI_VERBOSE_OPTION_DESCRIPTION}`);
  console.log(`--notify: ${PRIVATECLAW_CLI_NOTIFY_OPTION_DESCRIPTION}`);
  console.log(`sessions follow: ${PRIVATECLAW_CLI_SESSIONS_FOLLOW_DESCRIPTION}`);
  console.log(`sessions qr: ${PRIVATECLAW_CLI_SESSIONS_QR_DESCRIPTION}`);
  console.log(`sessions kill: ${PRIVATECLAW_CLI_SESSIONS_KILL_DESCRIPTION}`);
  console.log(`sessions killall: ${PRIVATECLAW_CLI_SESSIONS_KILLALL_DESCRIPTION}`);
  console.log(`killall: ${PRIVATECLAW_CLI_SESSIONS_KILLALL_DESCRIPTION}`);
  writePrivateClawAppInstallFooter((line) => console.log(line));
}

function formatCliErrorWithFooter(error: unknown): string {
  return appendPrivateClawAppInstallFooter(
    error instanceof Error ? error.message : String(error),
  );
}

async function runSetupCommand(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      group: { type: "boolean", default: false },
      single: { type: "boolean", default: false },
      duration: { type: "string" },
      "ttl-ms": { type: "string" },
      label: { type: "string" },
      relay: { type: "string", short: "r" },
      config: { type: "string" },
      open: { type: "boolean", default: parseBooleanFlag(process.env.PRIVATECLAW_OPEN_QR) },
      foreground: { type: "boolean", default: false },
      verbose: { type: "boolean", default: parseBooleanFlag(process.env.PRIVATECLAW_VERBOSE) },
      help: { type: "boolean", short: "h" },
    },
  });

  if (parsed.values.help) {
    printHelp();
    return;
  }
  if (parsed.positionals.length > 0) {
    throw new Error(
      formatBilingualInline(
        "`setup` 不接受额外参数。",
        "`setup` does not accept extra arguments.",
      ),
    );
  }
  if (parsed.values.group && parsed.values.single) {
    throw new Error(
      formatBilingualInline(
        "`setup` 不能同时使用 `--group` 和 `--single`。",
        "`setup` cannot use both `--group` and `--single` at the same time.",
      ),
    );
  }
  if (parsed.values.duration && parsed.values["ttl-ms"]) {
    throw new Error(
      formatBilingualInline(
        "`setup` 不能同时使用 `--duration` 和 `--ttl-ms`。",
        "`setup` cannot use both `--duration` and `--ttl-ms` at the same time.",
      ),
    );
  }

  const durationPreset = parsed.values.duration?.trim();
  if (durationPreset) {
    parsePrivateClawSessionDurationPreset(durationPreset);
  }
  const ttlMs = parsePositiveIntegerFlag(parsed.values["ttl-ms"], "--ttl-ms");
  const groupMode =
    parsed.values.group === true
      ? true
      : parsed.values.single === true
        ? false
        : undefined;

  await runPrivateClawSetup({
    ...(typeof groupMode === "boolean" ? { groupMode } : {}),
    ...(typeof ttlMs === "number" ? { ttlMs } : {}),
    ...(durationPreset ? { durationPreset } : {}),
    ...(parsed.values.relay?.trim()
      ? { relayBaseUrl: parsed.values.relay.trim() }
      : {}),
    ...(parsed.values.config?.trim()
      ? { configPath: parsed.values.config.trim() }
      : {}),
    ...(parsed.values.label?.trim() ? { label: parsed.values.label.trim() } : {}),
    ...(parsed.values.open ? { openInBrowser: true } : {}),
    ...(parsed.values.foreground ? { foreground: true } : {}),
    ...(parsed.values.verbose ? { verbose: true } : {}),
  });
}

async function runPairCommand(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "ttl-ms": { type: "string" },
      label: { type: "string" },
      relay: { type: "string", short: "r" },
      group: { type: "boolean", default: false },
      "print-only": { type: "boolean", default: false },
      open: { type: "boolean", default: parseBooleanFlag(process.env.PRIVATECLAW_OPEN_QR) },
      foreground: { type: "boolean", default: false },
      verbose: { type: "boolean", default: parseBooleanFlag(process.env.PRIVATECLAW_VERBOSE) },
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
  const relayBaseUrl = parsed.values.relay?.trim();
  const groupMode = parsed.values.group === true;
  const printOnly = parsed.values["print-only"] === true;
  const openInBrowser = parsed.values.open === true;
  const foreground = parsed.values.foreground === true;
  const verbose = parsed.values.verbose === true;
  const daemonChild = parsed.values["daemon-child"] === true;
  const resultFile = parsed.values["result-file"];
  const resumeSnapshotFile = parsed.values["resume-snapshot-file"];
  const verboseController = { enabled: verbose } satisfies PrivateClawVerboseController;

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
        handoffState
          ? {
              providerId: handoffState.providerId,
              ...(relayBaseUrl ? { relayBaseUrl } : {}),
              verboseController,
            }
          : relayBaseUrl
            ? { relayBaseUrl, verboseController }
            : { verboseController },
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
    const { provider, stateDir } = createProvider(
      relayBaseUrl ? { relayBaseUrl, verboseController } : { verboseController },
    );
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
                    ...(verbose ? { verbose: true } : {}),
                    env: relayBaseUrl
                      ? {
                          ...process.env,
                          PRIVATECLAW_RELAY_BASE_URL: relayBaseUrl,
                        }
                      : process.env,
                    handoffState: provider.exportHandoffState(),
                  });
                  return formatBilingualInline(
                    "当前 PrivateClaw 会话已转入后台。可使用 `privateclaw-provider sessions` 查看，必要时用 `privateclaw-provider sessions kill <sessionId>` 终止。",
                    "The current PrivateClaw session is now running in the background. Use `privateclaw-provider sessions` to inspect it, and `privateclaw-provider sessions kill <sessionId>` if you need to terminate it.",
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
    env: relayBaseUrl
      ? {
          ...process.env,
          PRIVATECLAW_RELAY_BASE_URL: relayBaseUrl,
        }
      : process.env,
    ...(typeof ttlMs === "number" ? { ttlMs } : {}),
    ...(label ? { label } : {}),
    ...(groupMode ? { groupMode: true } : {}),
    ...(openInBrowser ? { openInBrowser: true } : {}),
    ...(verbose ? { verbose: true } : {}),
  });
  printPairInviteBundle(bundle, (line) => {
    console.log(line);
  });
  console.log(
    buildPrivateClawBackgroundDaemonReminder(
      "privateclaw-provider",
      bundle.invite.sessionId,
    ),
  );
  writePrivateClawAppInstallFooter((line) => console.log(line));
}

async function runSessionsCommand(args: string[]): Promise<void> {
  if (args[0] === "follow") {
    await runSessionsFollowCommand(args.slice(1));
    return;
  }
  if (args[0] === "qr") {
    await runSessionsQrCommand(args.slice(1));
    return;
  }
  if (args[0] === "killall") {
    await runSessionsKillallCommand(args.slice(1));
    return;
  }
  if (args[0] === "kill") {
    await runSessionsKillCommand(args.slice(1));
    return;
  }
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

async function runSessionsFollowCommand(args: string[]): Promise<void> {
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
  const sessionId = parsed.positionals[0];
  if (!sessionId) {
    throw new Error(
      formatBilingualInline(
        "`sessions follow` 需要提供 sessionId。",
        "`sessions follow` requires a sessionId.",
      ),
    );
  }

  await followManagedSessionLogFromStateDir({
    stateDir: resolvePrivateClawStateDir(),
    sessionId,
    writeLine: (line: string) => {
      console.log(line);
    },
  });
}

async function runSessionsKillCommand(args: string[]): Promise<void> {
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
  const sessionId = parsed.positionals[0];
  if (!sessionId) {
    throw new Error(
      formatBilingualInline(
        "`sessions kill` 需要提供 sessionId。",
        "`sessions kill` requires a sessionId.",
      ),
    );
  }

  const result = await closeManagedSessionFromStateDir({
    stateDir: resolvePrivateClawStateDir(),
    sessionId,
    reason: "operator_terminated",
  });
  console.log(
    result.terminatedHost
      ? formatBilingualInline(
          `会话 ${result.session.sessionId} 已通过终止 legacy host ${result.host.kind}#${result.host.pid} 停止。`,
          `Session ${result.session.sessionId} was stopped by terminating the legacy host ${result.host.kind}#${result.host.pid}.`,
        )
      : formatBilingualInline(
          `会话 ${result.session.sessionId} 已终止。`,
          `Session ${result.session.sessionId} has been terminated.`,
        ),
  );
  writePrivateClawAppInstallFooter((line) => console.log(line));
}

async function runSessionsKillallCommand(args: string[]): Promise<void> {
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
  if (parsed.positionals.length > 0) {
    throw new Error(
      formatBilingualInline(
        "`sessions killall` 不接受额外参数。",
        "`sessions killall` does not accept extra arguments.",
      ),
    );
  }

  const result = await closeManagedSessionsFromStateDir({
    stateDir: resolvePrivateClawStateDir(),
    hostKinds: ["pair-daemon"],
    reason: "operator_terminated_all",
  });

  if (result.closed.length === 0 && result.failed.length === 0) {
    console.log(
      formatBilingualInline(
        "当前没有需要终止的后台 daemon 会话。",
        "There are no background daemon sessions to terminate.",
      ),
    );
    writePrivateClawAppInstallFooter((line) => console.log(line));
    return;
  }

  if (result.closed.length > 0) {
    console.log(
      formatBilingualInline(
        `已终止 ${result.closed.length} 个后台 daemon 会话。`,
        `Terminated ${result.closed.length} background daemon session(s).`,
      ),
    );
    for (const item of result.closed) {
      console.log(
        item.terminatedHost
          ? formatBilingualInline(
              `- ${item.session.sessionId}：已通过终止 legacy host ${item.host.kind}#${item.host.pid} 停止。`,
              `- ${item.session.sessionId}: stopped by terminating the legacy host ${item.host.kind}#${item.host.pid}.`,
            )
          : formatBilingualInline(
              `- ${item.session.sessionId}：已终止。`,
              `- ${item.session.sessionId}: terminated.`,
            ),
      );
    }
  }

  if (result.failed.length > 0) {
    console.error(
      formatBilingualInline(
        `${result.failed.length} 个后台 daemon 会话终止失败。`,
        `${result.failed.length} background daemon session(s) failed to terminate.`,
      ),
    );
    for (const item of result.failed) {
      console.error(
        formatBilingualInline(
          `- ${item.session.sessionId}（${item.host.kind}#${item.host.pid}）：${item.error}`,
          `- ${item.session.sessionId} (${item.host.kind}#${item.host.pid}): ${item.error}`,
        ),
      );
    }
    process.exitCode = 1;
  }
  writePrivateClawAppInstallFooter((line) => console.log(line));
}

async function runSessionsQrCommand(args: string[]): Promise<void> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      open: { type: "boolean", default: parseBooleanFlag(process.env.PRIVATECLAW_OPEN_QR) },
      notify: { type: "boolean", default: false },
      help: { type: "boolean", short: "h" },
    },
  });
  if (parsed.values.help) {
    printHelp();
    return;
  }
  const sessionId = parsed.positionals[0];
  if (!sessionId) {
    throw new Error(
      formatBilingualInline(
        "`sessions qr` 需要提供 sessionId。",
        "`sessions qr` requires a sessionId.",
      ),
    );
  }

  const result = await getManagedSessionQrBundleFromStateDir({
    stateDir: resolvePrivateClawStateDir(),
    sessionId,
    ...(parsed.values.notify ? { notifyParticipants: true } : {}),
  });
  if (isManagedSessionQrLegacyResult(result)) {
    for (const line of buildManagedSessionQrLegacyLines({
      result,
      ...(parsed.values.notify ? { notifyParticipants: true } : {}),
    })) {
      console.log(line);
    }
    if (parsed.values.open) {
      await openInBrowserPreview(pathToFileURL(result.legacyPngPath).href);
    }
    if (parsed.values.notify) {
      process.exitCode = 1;
    }
    return;
  }
  const writeLine = (line: string) => {
    console.log(line);
  };
  await renderInviteBundleOutput(result.bundle, {
    qrMediaDir: resolvePrivateClawMediaDir(),
    ...(parsed.values.open ? { openInBrowser: true } : {}),
    includeFooter: false,
    writeLine,
  });
  if (parsed.values.notify) {
    console.log(
      formatBilingualInline(
        `已向会话 ${result.session.sessionId} 中的 ${result.session.participantCount} 位参与者推送二维码。`,
        `Sent the QR code to ${result.session.participantCount} participant(s) in session ${result.session.sessionId}.`,
      ),
    );
  }
  writePrivateClawAppInstallFooter(writeLine);
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
  writePrivateClawAppInstallFooter((line) => console.log(line));
}

const argv = process.argv.slice(2);
const [command, ...rest] =
  argv.length === 0
    ? ["setup", ...argv]
    : argv[0]!.startsWith("-")
      ? ["pair", ...argv]
    : argv;

try {
  if (command === "setup") {
    await runSetupCommand(rest);
  } else if (command === "pair") {
    await runPairCommand(rest);
  } else if (command === "sessions") {
    await runSessionsCommand(rest);
  } else if (command === "killall") {
    await runSessionsKillallCommand(rest);
  } else if (command === "kick") {
    await runKickCommand(rest);
  } else if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
  } else {
    throw new Error(`Unsupported privateclaw-provider command: ${command}`);
  }
} catch (error) {
  console.error(formatCliErrorWithFooter(error));
  process.exitCode = 1;
}
