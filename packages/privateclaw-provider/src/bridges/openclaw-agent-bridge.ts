import type {
  PrivateClawAttachment,
  PrivateClawThinkingEntry,
} from "@privateclaw/protocol";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import type {
  BridgeResponse,
  PrivateClawAgentBridge,
  PrivateClawAudioTranscriptionRequest,
  PrivateClawThinkingTraceSnapshot,
  PrivateClawVerboseController,
} from "../types.js";

type OpenClawThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

interface OpenClawAgentBridgeExecOptions {
  maxBuffer: number;
  shell?: boolean;
  windowsHide?: boolean;
}

type OpenClawAgentExecFile = (
  file: string,
  args: string[],
  options: OpenClawAgentBridgeExecOptions,
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

interface OpenClawAgentPayload {
  text?: string | null;
  message?: string | null;
  summary?: string | null;
}

interface OpenClawAgentJsonResult {
  status?: string;
  summary?: string;
  payloads?: OpenClawAgentPayload[];
  meta?: Record<string, unknown>;
  result?: {
    payloads?: OpenClawAgentPayload[];
  };
}

interface OpenClawSessionLogCursor {
  readonly path?: string;
  readonly sizeBytes: number;
}

interface OpenClawSessionLogEntry {
  type?: string;
  id?: string;
  timestamp?: string;
  message?: {
    role?: string;
    toolName?: string;
    content?: Array<{
      type?: string;
      text?: string | null;
    }>;
    details?: {
      audioPath?: string | null;
    };
    isError?: boolean;
  };
}

interface PrivateClawStructuredMessageAttachment {
  name?: string;
  mimeType?: string;
  dataBase64?: string;
  filePath?: string;
}

interface PrivateClawStructuredMessage {
  text?: string | null;
  attachments?: PrivateClawStructuredMessageAttachment[];
}

interface PrivateClawStructuredResponse {
  version?: number;
  messages?: PrivateClawStructuredMessage[];
  attachments?: PrivateClawStructuredMessageAttachment[];
  data?: unknown;
}

interface NormalizedBridgeResult {
  readonly messages: NormalizedBridgeMessage[];
  readonly data?: unknown;
}

interface NormalizedBridgeMessage {
  readonly text: string;
  readonly attachments?: PrivateClawAttachment[];
}

interface ExtractedAssistantDisplayResult {
  readonly result: NormalizedBridgeResult;
  readonly isStructured: boolean;
}

interface CollectedSessionMessages {
  readonly assistantMessages: NormalizedBridgeMessage[];
  readonly structuredAssistantMessages: NormalizedBridgeMessage[];
  readonly assistantData?: unknown;
  readonly artifactMessages: NormalizedBridgeMessage[];
  readonly nextCursor: OpenClawSessionLogCursor;
  readonly traceEntries: PrivateClawThinkingEntry[];
}

interface SessionLogEntriesResult {
  readonly entries: OpenClawSessionLogEntry[];
  readonly nextCursor: OpenClawSessionLogCursor;
}

class OpenClawAgentNoDisplayPayloadError extends Error {
  constructor(readonly parsed: OpenClawAgentJsonResult) {
    super("OpenClaw agent bridge returned no displayable payloads.");
  }
}

interface StagedAttachment {
  readonly name: string;
  readonly effectiveMimeType: string;
  readonly kind: "image" | "pdf" | "docx" | "text" | "file";
  readonly absolutePath: string;
  readonly workspacePath: string;
  readonly sizeBytes: number;
  readonly extractedTextAbsolutePath?: string;
  readonly extractedTextWorkspacePath?: string;
  readonly instruction: string;
}

export interface OpenClawAgentBridgeOptions {
  executable?: string;
  agentId?: string;
  channel?: string;
  local?: boolean;
  thinking?: OpenClawThinkingLevel;
  timeoutSeconds?: number;
  stateDir?: string;
  workspaceDir?: string;
  verboseController?: PrivateClawVerboseController;
  onLog?: (message: string) => void;
  execFileImpl?: OpenClawAgentExecFile;
}

interface OpenClawLaunchCommand {
  readonly file: string;
  readonly args: string[];
  readonly shell: boolean;
}

const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;
const DEFAULT_STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const DEFAULT_WORKSPACE_DIR = path.join(DEFAULT_STATE_DIR, "workspace");
const GENERIC_BINARY_MIME = "application/octet-stream";
const XML_ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/giu;
const PRIVATECLAW_RESPONSE_CONTRACT_VERSION = 1;
const PRIVATECLAW_RESPONSE_TAG_START = "<privateclaw-response>";
const PRIVATECLAW_RESPONSE_TAG_END = "</privateclaw-response>";
const LIVE_TRACE_POLL_INTERVAL_MS = 150;
const MAX_TRACE_ENTRY_CHARS = 3200;
const MAX_TRACE_SUMMARY_CHARS = 180;
const DOCX_MIME_TYPES = new Set<string>([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const TEXT_LIKE_MIME_TYPES = new Set<string>([
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-typescript",
  "image/svg+xml",
]);

export function parseOpenClawAgentOutput(
  stdout: string,
  options?: {
    workspaceDir?: string;
  },
): BridgeResponse {
  const parsed = parseOpenClawAgentJson(stdout);
  return parseOpenClawAgentResult(parsed, options);
}

export function resolveOpenClawLaunchCommand(options: {
  executable?: string;
  platform?: NodeJS.Platform;
  nodeExecutable?: string;
  processArgv?: string[];
} = {}): OpenClawLaunchCommand {
  const platform = options.platform ?? process.platform;
  const executable = options.executable?.trim();
  if (executable) {
    return {
      file: executable,
      args: [],
      shell: shouldUseShellForExecutable(executable, platform),
    };
  }

  const processArgv = options.processArgv ?? process.argv;
  const currentCliScript = processArgv[1];
  if (looksLikeOpenClawCliScript(currentCliScript)) {
    return {
      file: options.nodeExecutable ?? process.execPath,
      args: [currentCliScript],
      shell: false,
    };
  }

  return {
    file: "openclaw",
    args: [],
    shell: platform === "win32",
  };
}

function parseOpenClawAgentJson(stdout: string): OpenClawAgentJsonResult {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed) as OpenClawAgentJsonResult;
  } catch (error) {
    const embeddedPayload = extractEmbeddedJsonPayload(trimmed);
    if (!embeddedPayload) {
      throw error;
    }
    return JSON.parse(embeddedPayload) as OpenClawAgentJsonResult;
  }
}

function parseOpenClawAgentResult(
  parsed: OpenClawAgentJsonResult,
  options?: {
    workspaceDir?: string;
  },
): BridgeResponse {
  const result = extractDisplayResult(parsed, options);
  return toBridgeResponse(result.messages, result.data);
}

function extractDisplayResult(
  parsed: OpenClawAgentJsonResult,
  options?: {
    workspaceDir?: string;
  },
): NormalizedBridgeResult {
  const payloads = parsed.result?.payloads ?? parsed.payloads ?? [];
  const hasAlternatePayloadShape = !parsed.status && payloads.length > 0;
  if (parsed.status && parsed.status !== "ok") {
    throw new Error(
      `OpenClaw agent bridge returned status ${parsed.status ?? "unknown"}${parsed.summary ? ` (${parsed.summary})` : ""}.`,
    );
  }
  if (!parsed.status && !hasAlternatePayloadShape) {
    throw new Error(
      `OpenClaw agent bridge returned status ${parsed.status ?? "unknown"}${parsed.summary ? ` (${parsed.summary})` : ""}.`,
    );
  }

  const structuredResults = payloads.flatMap((payload) =>
    [payload.text, payload.message, payload.summary].flatMap((candidate) => {
      if (typeof candidate !== "string") {
        return [];
      }
      const result = parseStructuredResponseResult(candidate, options);
      return result ? [result] : [];
    }),
  );
  if (structuredResults.length > 0) {
    return {
      messages: structuredResults.flatMap((result) => result.messages),
      ...combineStructuredData(structuredResults),
    };
  }

  const messages =
    payloads.flatMap((payload) =>
      [payload.text, payload.message, payload.summary].flatMap((candidate) => {
        if (typeof candidate !== "string") {
          return [];
        }
        const normalized = normalizePlainBridgeTextMessage(
          candidate,
          options?.workspaceDir ? { workspaceDir: options.workspaceDir } : undefined,
        );
        return normalized ? [normalized] : [];
      }),
    ) ?? [];

  if (messages.length === 0) {
    throw new OpenClawAgentNoDisplayPayloadError(parsed);
  }

  return { messages };
}

export class OpenClawAgentBridge implements PrivateClawAgentBridge {
  readonly supportsThinkingTrace = true;
  private readonly executable: string;
  private readonly executableArgs: string[];
  private readonly executableUsesShell: boolean;
  private readonly execFileImpl: OpenClawAgentExecFile;
  private readonly stateDir: string;
  private readonly workspaceDir: string;

  constructor(private readonly options: OpenClawAgentBridgeOptions = {}) {
    const launchCommand = resolveOpenClawLaunchCommand({
      ...(options.executable ? { executable: options.executable } : {}),
    });
    this.executable = launchCommand.file;
    this.executableArgs = launchCommand.args;
    this.executableUsesShell = launchCommand.shell;
    this.execFileImpl = options.execFileImpl ?? defaultExecFileImpl;
    this.stateDir = options.stateDir ?? DEFAULT_STATE_DIR;
    this.workspaceDir = options.workspaceDir ?? path.join(this.stateDir, "workspace");
  }

  private log(message: string): void {
    this.options.onLog?.(`[bridge] ${message}`);
  }

  private isVerboseLoggingEnabled(): boolean {
    return this.options.verboseController?.enabled === true;
  }

  private verboseLog(message: string): void {
    if (!this.isVerboseLoggingEnabled()) {
      return;
    }
    this.options.onLog?.(`[bridge][verbose] ${message}`);
  }

  async handleUserMessage(params: {
    sessionId: string;
    message: string;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
    onThinkingTrace?: (
      snapshot: PrivateClawThinkingTraceSnapshot,
    ) => void | Promise<void>;
  }): Promise<BridgeResponse> {
    const promptMessage = await this.buildPromptMessage(
      params.sessionId,
      params.message,
      params.attachments,
    );
    this.log(
      `handle_user_message session=${params.sessionId} textChars=${params.message.length} attachments=${params.attachments?.length ?? 0} promptChars=${promptMessage.length}`,
    );
    return this.executePrompt(params.sessionId, promptMessage, {
      includeArtifacts: true,
      noDisplayFallbackMessage: params.message,
      ...(params.onThinkingTrace
        ? { onThinkingTrace: params.onThinkingTrace }
        : {}),
    });
  }

  async transcribeAudioAttachments(
    params: PrivateClawAudioTranscriptionRequest,
  ): Promise<string> {
    const transcriptionSessionId = buildVoiceTranscriptionSessionId(
      params.sessionId,
      params.requestId,
    );
    this.log(
      `voice_transcription_start session=${params.sessionId} request=${params.requestId} attachments=${params.attachments.length} sttSession=${transcriptionSessionId}`,
    );
    const stagedAttachments = await this.stageAttachments(
      transcriptionSessionId,
      params.attachments,
    );
    if (stagedAttachments.length === 0) {
      throw new Error(
        "OpenClaw voice transcription requires at least one inline audio attachment.",
      );
    }
    const promptMessage = appendStructuredResponseContract(
      buildAudioTranscriptionPrompt(stagedAttachments),
    );
    const response = await this.executePrompt(transcriptionSessionId, promptMessage, {
      includeArtifacts: false,
    });
    const transcript = extractTextFromBridgeResponse(response).trim();
    if (transcript === "") {
      throw new Error("OpenClaw voice transcription returned an empty transcript.");
    }
    this.log(
      `voice_transcription_complete session=${params.sessionId} request=${params.requestId} transcriptChars=${transcript.length} attachments=${stagedAttachments.length}`,
    );
    return transcript;
  }

  private async executePrompt(
    sessionId: string,
    promptMessage: string,
    options?: {
      includeArtifacts?: boolean;
      noDisplayFallbackMessage?: string;
      onThinkingTrace?: (
        snapshot: PrivateClawThinkingTraceSnapshot,
      ) => void | Promise<void>;
    },
  ): Promise<BridgeResponse> {
    const args = this.buildArgs(sessionId, promptMessage);
    this.verboseLog(
      `exec_start session=${sessionId} promptChars=${promptMessage.length} argCount=${args.length} includeArtifacts=${options?.includeArtifacts !== false} agent=${JSON.stringify(this.options.agentId ?? "default")} channel=${JSON.stringify(this.options.channel ?? "default")} local=${this.options.local === true} thinking=${JSON.stringify(this.options.thinking ?? "default")} timeoutSeconds=${this.options.timeoutSeconds ?? "default"}`,
    );
    let sessionLogCursor = await this.captureSessionLogCursor(sessionId);
    let latestTraceEntries: PrivateClawThinkingEntry[] = [];
    const emitThinkingTrace = async (
      newEntries: ReadonlyArray<PrivateClawThinkingEntry>,
    ): Promise<void> => {
      if (!options?.onThinkingTrace || newEntries.length === 0) {
        return;
      }
      latestTraceEntries = [...latestTraceEntries, ...newEntries];
      await options.onThinkingTrace({
        entries: latestTraceEntries.map((entry) => ({ ...entry })),
        sentAt: latestTraceEntries[latestTraceEntries.length - 1]?.sentAt ?? nowIso(),
        summary: summarizeThinkingTrace(latestTraceEntries),
      });
    };
    const stdoutPromise = this.execOpenClaw(args);
    if (options?.onThinkingTrace) {
      let pending = true;
      void stdoutPromise.then(
        () => {
          pending = false;
        },
        () => {
          pending = false;
        },
      );
      while (pending) {
        await delay(LIVE_TRACE_POLL_INTERVAL_MS);
        if (!pending) {
          break;
        }
        const liveMessages = await this.collectSessionMessages(sessionId, sessionLogCursor, {
          allowTrailingPartial: false,
        });
        sessionLogCursor = liveMessages.nextCursor;
        await emitThinkingTrace(liveMessages.traceEntries);
      }
    }
    let stdout: string;
    try {
      stdout = await stdoutPromise;
    } catch (error) {
      if (options?.onThinkingTrace) {
        const finalTraceDelta = await this.collectSessionMessages(sessionId, sessionLogCursor, {
          allowTrailingPartial: true,
        });
        sessionLogCursor = finalTraceDelta.nextCursor;
        await emitThinkingTrace(finalTraceDelta.traceEntries);
      }
      throw error;
    }
    this.verboseLog(`exec_complete session=${sessionId} stdoutChars=${stdout.length}`);
    let parsed: OpenClawAgentJsonResult | undefined;
    let parseError: unknown;
    try {
      parsed = parseOpenClawAgentJson(stdout);
      this.log(
        `openclaw_agent_complete session=${sessionId} status=${parsed.status ?? "unknown"} summary=${JSON.stringify(parsed.summary ?? "")}`,
      );
      if (!parsed.status) {
        this.log(
          `openclaw_agent_missing_status session=${sessionId} topLevelKeys=${Object.keys(parsed).join(",") || "none"}`,
        );
      }
    } catch (error) {
      parseError = error;
      this.log(
        `openclaw_agent_parse_failed session=${sessionId} stdoutChars=${stdout.length} stdoutPreview=${JSON.stringify(stdout.slice(0, 400))}`,
      );
    }
    const collectedMessages = await this.collectSessionMessages(sessionId, sessionLogCursor, {
      allowTrailingPartial: true,
    });
    await emitThinkingTrace(collectedMessages.traceEntries);
    const recoveredMessages = [
      ...collectedMessages.assistantMessages,
      ...(options?.includeArtifacts === false ? [] : collectedMessages.artifactMessages),
    ];
    this.verboseLog(
      `session_log_delta session=${sessionId} assistantRecovered=${collectedMessages.assistantMessages.length} artifactRecovered=${collectedMessages.artifactMessages.length} includeArtifacts=${options?.includeArtifacts !== false}`,
    );
    if (!parsed) {
      if (recoveredMessages.length > 0) {
        this.log(
          `session_log_fallback session=${sessionId} reason=parse_failed recoveredMessages=${recoveredMessages.length}`,
        );
        return toBridgeResponse(recoveredMessages, collectedMessages.assistantData);
      }
      throw parseError;
    }
    try {
      const response = parseOpenClawAgentResult(parsed, {
        workspaceDir: this.workspaceDir,
      });
      const authoritativeResponse =
        collectedMessages.structuredAssistantMessages.length > 0
          ? toBridgeResponse(
              collectedMessages.structuredAssistantMessages,
              collectedMessages.assistantData,
            )
          : response;
      if (collectedMessages.structuredAssistantMessages.length > 0) {
        this.log(
          `session_log_structured_override session=${sessionId} directMessages=${typeof response === "string" ? 1 : response.messages.length} recoveredMessages=${collectedMessages.structuredAssistantMessages.length}`,
        );
      }
      this.verboseLog(
        `response_ready session=${sessionId} directMessages=${typeof response === "string" ? 1 : response.messages.length} authoritativeMessages=${typeof authoritativeResponse === "string" ? 1 : authoritativeResponse.messages.length} artifactMessages=${options?.includeArtifacts === false ? 0 : collectedMessages.artifactMessages.length}`,
      );
      return options?.includeArtifacts === false
        ? authoritativeResponse
        : mergeBridgeResponses(
            authoritativeResponse,
            collectedMessages.artifactMessages,
          );
    } catch (error) {
      if (recoveredMessages.length > 0) {
        this.log(
          `session_log_fallback session=${sessionId} reason=${JSON.stringify(error instanceof Error ? error.message : String(error))} recoveredMessages=${recoveredMessages.length}`,
        );
        return toBridgeResponse(recoveredMessages, collectedMessages.assistantData);
      }
      if (error instanceof OpenClawAgentNoDisplayPayloadError) {
        if (options?.noDisplayFallbackMessage) {
          return buildNoDisplayPayloadNotice(options.noDisplayFallbackMessage, error.parsed);
        }
        throw new Error("OpenClaw returned no displayable voice transcription.");
      }
      throw error;
    }
  }

  private async captureSessionLogCursor(sessionId: string): Promise<OpenClawSessionLogCursor> {
    const sessionLogPath = await this.resolveSessionLogPath(sessionId);
    if (!sessionLogPath) {
      this.verboseLog(`session_log_cursor_missing session=${sessionId}`);
      return { sizeBytes: 0 };
    }

    const stat = await fs.stat(sessionLogPath);
    this.verboseLog(
      `session_log_cursor session=${sessionId} logPath=${JSON.stringify(sessionLogPath)} sizeBytes=${stat.size}`,
    );
    return {
      path: sessionLogPath,
      sizeBytes: stat.size,
    };
  }

  private async collectSessionMessages(
    sessionId: string,
    cursor: OpenClawSessionLogCursor,
    options?: {
      allowTrailingPartial?: boolean;
    },
  ): Promise<CollectedSessionMessages> {
    const { entries, nextCursor } = await this.readSessionLogEntries(sessionId, cursor, options);
    if (entries.length === 0) {
      if (!nextCursor.path) {
        this.log(`artifact_log_missing session=${sessionId}`);
      }
      return {
        assistantMessages: [],
        structuredAssistantMessages: [],
        artifactMessages: [],
        nextCursor,
        traceEntries: [],
      };
    }

    const assistantResults = entries.map((entry) =>
      extractAssistantDisplayResult(entry, {
        workspaceDir: this.workspaceDir,
      }),
    );
    const assistantMessages = assistantResults.flatMap(
      (result) => result.result.messages,
    );
    const structuredAssistantMessages = assistantResults
      .filter((result) => result.isStructured)
      .flatMap((result) => result.result.messages);
    const traceEntries = entries.flatMap((entry) => {
      const traceEntry = extractThinkingTraceEntry(entry);
      return traceEntry ? [traceEntry] : [];
    });

    const seenPaths = new Set<string>();
    const attachments: PrivateClawAttachment[] = [];
    for (const entry of entries) {
      for (const mediaPath of extractMediaPaths(entry)) {
        const normalizedPath = normalizeMediaPath(mediaPath, this.workspaceDir);
        if (seenPaths.has(normalizedPath)) {
          continue;
        }
        const attachment = await buildAttachmentFromMediaPath(normalizedPath, this.workspaceDir);
        this.log(
          `artifact_recovered session=${sessionId} mediaPath=${JSON.stringify(mediaPath)} normalizedPath=${JSON.stringify(normalizedPath)} name=${JSON.stringify(attachment.name)} mimeType=${attachment.mimeType} sizeBytes=${attachment.sizeBytes}`,
        );
        attachments.push(attachment);
        seenPaths.add(normalizedPath);
      }
    }

    const artifactMessages =
      attachments.length > 0
        ? [{ text: "", attachments } satisfies NormalizedBridgeMessage]
        : [];
    const assistantData = combineStructuredData(
      assistantResults
        .filter((result) => result.isStructured)
        .map((result) => result.result),
    ).data;

    if (attachments.length === 0) {
      this.log(
        `artifact_scan_complete session=${sessionId} entries=${entries.length} assistantRecovered=${assistantMessages.length} recovered=0 logPath=${JSON.stringify(nextCursor.path ?? "missing")}`,
      );
      return {
        assistantMessages,
        structuredAssistantMessages,
        ...(assistantData !== undefined ? { assistantData } : {}),
        artifactMessages,
        nextCursor,
        traceEntries,
      };
    }

    this.log(
      `artifact_scan_complete session=${sessionId} entries=${entries.length} assistantRecovered=${assistantMessages.length} recovered=${attachments.length} logPath=${JSON.stringify(nextCursor.path ?? "missing")}`,
    );
    return {
      assistantMessages,
      structuredAssistantMessages,
      ...(assistantData !== undefined ? { assistantData } : {}),
      artifactMessages,
      nextCursor,
      traceEntries,
    };
  }

  private async readSessionLogEntries(
    sessionId: string,
    cursor: OpenClawSessionLogCursor,
    options?: {
      allowTrailingPartial?: boolean;
    },
  ): Promise<SessionLogEntriesResult> {
    const sessionLogPath = cursor.path ?? (await this.resolveSessionLogPath(sessionId));
    if (!sessionLogPath) {
      return {
        entries: [],
        nextCursor: cursor,
      };
    }

    const sessionLogBuffer = await fs.readFile(sessionLogPath);
    const startOffset =
      cursor.path === sessionLogPath
        ? Math.min(cursor.sizeBytes, sessionLogBuffer.length)
        : 0;
    const deltaBuffer = sessionLogBuffer.subarray(startOffset);
    if (deltaBuffer.length === 0) {
      return {
        entries: [],
        nextCursor: {
          path: sessionLogPath,
          sizeBytes: sessionLogBuffer.length,
        },
      };
    }

    const deltaText = deltaBuffer.toString("utf8");
    let parseText = deltaText;
    let nextSize = sessionLogBuffer.length;
    if (!options?.allowTrailingPartial && !deltaText.endsWith("\n")) {
      const lastNewlineIndex = deltaText.lastIndexOf("\n");
      if (lastNewlineIndex < 0) {
        return {
          entries: [],
          nextCursor: {
            path: sessionLogPath,
            sizeBytes: startOffset,
          },
        };
      }
      parseText = deltaText.slice(0, lastNewlineIndex + 1);
      nextSize = startOffset + Buffer.byteLength(parseText, "utf8");
    }

    const entries = parseText
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as OpenClawSessionLogEntry);
    return {
      entries,
      nextCursor: {
        path: sessionLogPath,
        sizeBytes: nextSize,
      },
    };
  }

  private async resolveSessionLogPath(sessionId: string): Promise<string | undefined> {
    const agentsDir = path.join(this.stateDir, "agents");
    try {
      const agentEntries = await fs.readdir(agentsDir, { withFileTypes: true });
      for (const entry of agentEntries) {
        if (!entry.isDirectory()) {
          continue;
        }
        const candidate = path.join(agentsDir, entry.name, "sessions", `${sessionId}.jsonl`);
        try {
          await fs.access(candidate);
          this.verboseLog(
            `session_log_resolved session=${sessionId} logPath=${JSON.stringify(candidate)}`,
          );
          return candidate;
        } catch (error) {
          if (isNodeError(error) && error.code === "ENOENT") {
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }

    this.verboseLog(`session_log_not_found session=${sessionId}`);
    return undefined;
  }

  private async buildPromptMessage(
    sessionId: string,
    message: string,
    attachments?: ReadonlyArray<PrivateClawAttachment>,
  ): Promise<string> {
    const trimmed = message.trim();
    const stagedAttachments = await this.stageAttachments(sessionId, attachments);
    let promptBody = trimmed;

    if (stagedAttachments.length > 0) {
      const lines = [
        trimmed !== ""
          ? trimmed
          : "The user sent one or more file attachments without additional text.",
        "",
        "PrivateClaw staged the attachments into the OpenClaw workspace.",
        "Inspect the staged files before answering, and use the exact paths below instead of guessing a workspace-root filename.",
        "",
        "Staged attachments:",
      ];

      for (const attachment of stagedAttachments) {
        lines.push(`- ${attachment.name}`);
        lines.push(`  mimeType: ${attachment.effectiveMimeType}`);
        lines.push(`  kind: ${attachment.kind}`);
        lines.push(`  workspacePath: ${attachment.workspacePath}`);
        if (attachment.extractedTextWorkspacePath) {
          lines.push(`  extractedTextPath: ${attachment.extractedTextWorkspacePath}`);
        }
        lines.push(`  instruction: ${attachment.instruction}`);
      }

      promptBody = lines.join("\n");
    }

    const promptMessage = appendStructuredResponseContract(
      promptBody !== "" ? promptBody : "The user sent a message that requires a reply.",
    );
    this.log(
      `prompt_ready session=${sessionId} stagedAttachments=${stagedAttachments.length} textChars=${trimmed.length} contractVersion=${PRIVATECLAW_RESPONSE_CONTRACT_VERSION}`,
    );
    this.verboseLog(
      `prompt_body_ready session=${sessionId} promptChars=${promptMessage.length} trimmedTextChars=${trimmed.length} stagedAttachments=${stagedAttachments.length}`,
    );
    return promptMessage;
  }

  private async stageAttachments(
    sessionId: string,
    attachments?: ReadonlyArray<PrivateClawAttachment>,
  ): Promise<StagedAttachment[]> {
    if (!attachments || attachments.length === 0) {
      return [];
    }

    const sessionDir = path.join(this.workspaceDir, "privateclaw", sessionId);
    await fs.mkdir(sessionDir, { recursive: true });
    this.log(
      `stage_start session=${sessionId} count=${attachments.length} sessionDir=${JSON.stringify(sessionDir)}`,
    );

    const staged: StagedAttachment[] = [];
    for (const attachment of attachments) {
      const dataBase64 = attachment.dataBase64?.trim();
      if (!dataBase64) {
        this.log(
          `stage_skip_missing_data session=${sessionId} name=${JSON.stringify(attachment.name)} mimeType=${attachment.mimeType} sizeBytes=${attachment.sizeBytes}`,
        );
        continue;
      }

      const effectiveMimeType = resolveAttachmentMimeType(attachment);
      const kind = classifyAttachmentKind(attachment.name, effectiveMimeType);
      const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(attachment.name)}`;
      const absolutePath = path.join(sessionDir, uniqueFileName);
      const rawBytes = Buffer.from(dataBase64, "base64");
      await fs.writeFile(absolutePath, rawBytes);

      const workspacePath = toWorkspacePath(this.workspaceDir, absolutePath);
      let extractedTextAbsolutePath: string | undefined;
      let extractedTextWorkspacePath: string | undefined;

      if (kind === "docx") {
        const extractedText = extractDocxText(rawBytes);
        if (extractedText.trim() !== "") {
          extractedTextAbsolutePath = `${absolutePath}.extracted.txt`;
          await fs.writeFile(extractedTextAbsolutePath, extractedText, "utf8");
          extractedTextWorkspacePath = toWorkspacePath(
            this.workspaceDir,
            extractedTextAbsolutePath,
          );
        }
        this.log(
          `stage_docx_extraction session=${sessionId} name=${JSON.stringify(attachment.name)} extracted=${Boolean(extractedTextWorkspacePath)} extractedChars=${extractedText.length}`,
        );
      }

      const stagedAttachment = {
        name: attachment.name,
        effectiveMimeType,
        kind,
        absolutePath,
        workspacePath,
        sizeBytes: attachment.sizeBytes,
        ...(extractedTextAbsolutePath ? { extractedTextAbsolutePath } : {}),
        ...(extractedTextWorkspacePath ? { extractedTextWorkspacePath } : {}),
        instruction: buildAttachmentInstruction({
          kind,
          workspacePath,
          ...(extractedTextWorkspacePath ? { extractedTextWorkspacePath } : {}),
        }),
      } satisfies StagedAttachment;
      this.log(
        `stage_complete session=${sessionId} name=${JSON.stringify(stagedAttachment.name)} kind=${stagedAttachment.kind} mimeType=${stagedAttachment.effectiveMimeType} sizeBytes=${stagedAttachment.sizeBytes} absolutePath=${JSON.stringify(stagedAttachment.absolutePath)} workspacePath=${JSON.stringify(stagedAttachment.workspacePath)}${stagedAttachment.extractedTextWorkspacePath ? ` extractedTextPath=${JSON.stringify(stagedAttachment.extractedTextWorkspacePath)}` : ""}`,
      );
      staged.push(stagedAttachment);
    }

    this.log(`stage_summary session=${sessionId} staged=${staged.length}`);
    return staged;
  }

  private buildArgs(sessionId: string, message: string): string[] {
    const args = ["agent", "--session-id", sessionId, "--message", message, "--json"];

    if (this.options.agentId) {
      args.push("--agent", this.options.agentId);
    }
    if (this.options.channel) {
      args.push("--channel", this.options.channel);
    }
    if (this.options.local) {
      args.push("--local");
    }
    if (this.options.thinking) {
      args.push("--thinking", this.options.thinking);
    }
    if (this.options.timeoutSeconds) {
      args.push("--timeout", String(this.options.timeoutSeconds));
    }

    return args;
  }

  private execOpenClaw(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      this.execFileImpl(
        this.executable,
        [...this.executableArgs, ...args],
        {
          maxBuffer: DEFAULT_MAX_BUFFER,
          ...(this.executableUsesShell ? { shell: true } : {}),
          ...(process.platform === "win32" ? { windowsHide: true } : {}),
        },
        (error, stdout, stderr) => {
          if (error) {
            if (isNodeError(error) && error.code === "ENOENT") {
              reject(
                new Error(
                  `Failed to run OpenClaw agent bridge: OpenClaw CLI was not found (${this.executable}). Set openclawAgentExecutable or PRIVATECLAW_OPENCLAW_AGENT_BIN if OpenClaw is not on PATH.`,
                ),
              );
              return;
            }
            const suffix = stderr.trim() !== "" ? ` ${stderr.trim()}` : "";
            reject(new Error(`Failed to run OpenClaw agent bridge:${suffix || ` ${error.message}`}`));
            return;
          }

          resolve(stdout);
        },
      );
    });
  }
}

function defaultExecFileImpl(
  file: string,
  args: string[],
  options: OpenClawAgentBridgeExecOptions,
  callback: (error: Error | null, stdout: string, stderr: string) => void,
): void {
  let finished = false;
  let stdout = "";
  let stderr = "";
  let bufferedBytes = 0;

  const finish = (error: Error | null) => {
    if (finished) {
      return;
    }
    finished = true;
    callback(error, stdout, stderr);
  };

  const child = spawn(file, args, {
    shell: options.shell,
    ...(typeof options.windowsHide === "boolean" ? { windowsHide: options.windowsHide } : {}),
    stdio: ["ignore", "pipe", "pipe"],
  });

  const append = (chunk: Buffer | string, target: "stdout" | "stderr") => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    bufferedBytes += Buffer.byteLength(text);
    if (bufferedBytes > options.maxBuffer) {
      child.kill();
      finish(new Error(`OpenClaw agent bridge output exceeded ${options.maxBuffer} bytes.`));
      return;
    }
    if (target === "stdout") {
      stdout += text;
      return;
    }
    stderr += text;
  };

  child.stdout?.on("data", (chunk) => {
    append(chunk, "stdout");
  });
  child.stderr?.on("data", (chunk) => {
    append(chunk, "stderr");
  });
  child.once("error", (error) => {
    finish(error instanceof Error ? error : new Error(String(error)));
  });
  child.once("close", (code, signal) => {
    if (finished) {
      return;
    }
    if (code === 0) {
      finish(null);
      return;
    }
    finish(
      new Error(
        signal
          ? `OpenClaw agent bridge exited via ${signal}.`
          : `OpenClaw agent bridge exited with code ${code ?? "unknown"}.`,
      ),
    );
  });
}

function looksLikeOpenClawCliScript(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  const normalized = value.replace(/\\/gu, "/").toLowerCase();
  return (
    normalized.includes("/node_modules/openclaw/") ||
    normalized.endsWith("/openclaw") ||
    normalized.endsWith("/openclaw.js") ||
    normalized.endsWith("/openclaw.cjs")
  );
}

function shouldUseShellForExecutable(
  executable: string,
  platform: NodeJS.Platform,
): boolean {
  if (platform !== "win32") {
    return false;
  }
  return !/\.(?:exe|com)$/iu.test(path.basename(executable));
}

function buildNoDisplayPayloadNotice(
  message: string,
  parsed: OpenClawAgentJsonResult,
): string {
  const command = message.trim().match(/^\/[A-Za-z0-9_-]+/u)?.[0];
  const summary = parsed.summary?.trim();
  const extraSummary =
    summary && summary !== "" && !/^(completed|ok)$/iu.test(summary)
      ? ` Summary: ${summary}.`
      : "";

  if (command === "/tts") {
    return `OpenClaw completed ${command}, but it did not return a text reply through the agent bridge. If the command generated audio, the current PrivateClaw bridge does not surface that audio back into the chat yet.${extraSummary}`;
  }

  if (command) {
    return `OpenClaw completed ${command}, but it did not return a text reply through the agent bridge.${extraSummary}`;
  }

  return `OpenClaw completed the request, but it did not return a text reply through the agent bridge.${extraSummary}`;
}

function mergeBridgeResponses(
  primary: BridgeResponse,
  supplemental: NormalizedBridgeMessage[],
): BridgeResponse {
  const dedupedSupplemental = dedupeSupplementalMessages(primary, supplemental);
  if (dedupedSupplemental.length === 0) {
    return primary;
  }

  return toBridgeResponse(
    [
      ...normalizeBridgeResponse(primary),
      ...dedupedSupplemental,
    ],
    extractBridgeResponseData(primary),
  );
}

function dedupeSupplementalMessages(
  primary: BridgeResponse,
  supplemental: NormalizedBridgeMessage[],
): NormalizedBridgeMessage[] {
  if (supplemental.length === 0) {
    return supplemental;
  }

  const seenInlineData = new Set<string>();
  const seenUris = new Set<string>();
  for (const message of normalizeBridgeResponse(primary)) {
    for (const attachment of message.attachments ?? []) {
      const inlineData = attachment.dataBase64?.trim();
      if (inlineData) {
        seenInlineData.add(
          `${attachment.mimeType}:${attachment.sizeBytes}:${inlineData}`,
        );
      }
      const uri = attachment.uri?.trim();
      if (uri) {
        seenUris.add(uri);
      }
    }
  }

  return supplemental.flatMap((message) => {
    const dedupedAttachments = (message.attachments ?? []).filter((attachment) => {
      const inlineData = attachment.dataBase64?.trim();
      if (inlineData) {
        const key = `${attachment.mimeType}:${attachment.sizeBytes}:${inlineData}`;
        if (seenInlineData.has(key)) {
          return false;
        }
        seenInlineData.add(key);
        return true;
      }

      const uri = attachment.uri?.trim();
      if (uri) {
        if (seenUris.has(uri)) {
          return false;
        }
        seenUris.add(uri);
      }
      return true;
    });

    if (message.text.trim() === "" && dedupedAttachments.length === 0) {
      return [];
    }

    return [
      {
        text: message.text,
        ...(dedupedAttachments.length > 0
          ? { attachments: dedupedAttachments }
          : {}),
      } satisfies NormalizedBridgeMessage,
    ];
  });
}

function normalizeBridgeResponse(response: BridgeResponse): NormalizedBridgeMessage[] {
  if (typeof response === "string") {
    return [{ text: response }];
  }

  return response.messages.map((message) =>
    typeof message === "string"
      ? { text: message }
      : {
          text: message.text,
          ...(message.attachments ? { attachments: message.attachments } : {}),
        },
  );
}

function extractTextFromBridgeResponse(response: BridgeResponse): string {
  return normalizeBridgeResponse(response)
    .map((message) => message.text.trim())
    .filter((text) => text !== "")
    .join("\n\n");
}

function toBridgeResponse(
  messages: NormalizedBridgeMessage[],
  data?: unknown,
): BridgeResponse {
  if (messages.length === 1) {
    const [message] = messages;
    if (!message) {
      throw new Error("Bridge response did not contain any messages.");
    }
    if ((!message.attachments || message.attachments.length === 0) && data === undefined) {
      return message.text;
    }
  }

  return {
    messages: messages.map((message) =>
      message.attachments && message.attachments.length > 0
        ? message
        : { text: message.text },
    ),
    ...(data !== undefined ? { data } : {}),
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function truncateThinkingTraceText(text: string): string {
  if (text.length <= MAX_TRACE_ENTRY_CHARS) {
    return text;
  }
  const hiddenChars = text.length - MAX_TRACE_ENTRY_CHARS;
  return [
    text.slice(0, MAX_TRACE_ENTRY_CHARS).trimEnd(),
    "",
    `… truncated ${hiddenChars} more characters`,
  ].join("\n");
}

function truncateThinkingSummary(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_TRACE_SUMMARY_CHARS) {
    return trimmed;
  }
  return `${trimmed.slice(0, MAX_TRACE_SUMMARY_CHARS - 1).trimEnd()}…`;
}

function readEntryTextContent(entry: OpenClawSessionLogEntry): string {
  return (entry.message?.content ?? [])
    .flatMap((contentItem) =>
      contentItem.type === "text" && typeof contentItem.text === "string"
        ? [contentItem.text.trim()]
        : [],
    )
    .filter((text) => text !== "")
    .join("\n\n");
}

function summarizeThinkingTrace(entries: ReadonlyArray<PrivateClawThinkingEntry>): string {
  const latestEntry = entries[entries.length - 1];
  if (!latestEntry) {
    return "";
  }
  const firstLine =
    latestEntry.text
      .split(/\r?\n/gu)
      .map((line: string) => line.trim())
      .find((line: string) => line !== "") ??
    latestEntry.title;
  if (latestEntry.kind === "action" && latestEntry.toolName) {
    return truncateThinkingSummary(`${latestEntry.toolName}: ${firstLine}`);
  }
  return truncateThinkingSummary(firstLine);
}

function extractThinkingTraceEntry(
  entry: OpenClawSessionLogEntry,
): PrivateClawThinkingEntry | undefined {
  if (entry.type !== "message" || !entry.message) {
    return undefined;
  }
  const entryId = entry.id?.trim() || `trace-${randomUUID()}`;
  const sentAt = entry.timestamp?.trim() || nowIso();
  if (entry.message.role === "assistant") {
    const text = truncateThinkingTraceText(
      stripStructuredResponseBlock(readEntryTextContent(entry)),
    );
    if (text === "") {
      return undefined;
    }
    return {
      id: entryId,
      kind: entry.message.isError ? "error" : "thought",
      title: entry.message.isError ? "Assistant error" : "Thinking",
      text,
      sentAt,
    };
  }
  if (entry.message.role !== "toolResult") {
    return undefined;
  }
  const toolName = entry.message.toolName?.trim();
  const toolText = readEntryTextContent(entry).replace(/^MEDIA:.+$/gmu, "").trim();
  return {
    id: entryId,
    kind: entry.message.isError ? "error" : "action",
    title: toolName ? `Tool • ${toolName}` : entry.message.isError ? "Tool error" : "Tool",
    text: truncateThinkingTraceText(
      toolText ||
        (entry.message.isError
          ? "The tool call failed."
          : toolName
            ? `Tool ${toolName} completed.`
            : "Tool completed."),
    ),
    sentAt,
    ...(toolName ? { toolName } : {}),
  };
}

function extractMediaPaths(entry: OpenClawSessionLogEntry): string[] {
  if (entry.type !== "message" || entry.message?.role !== "toolResult" || entry.message.isError) {
    return [];
  }

  const mediaPaths = new Set<string>();
  const detailsAudioPath = entry.message.details?.audioPath?.trim();
  if (detailsAudioPath) {
    mediaPaths.add(detailsAudioPath);
  }

  for (const contentItem of entry.message.content ?? []) {
    if (contentItem.type !== "text" || typeof contentItem.text !== "string") {
      continue;
    }
    for (const match of contentItem.text.matchAll(/^MEDIA:(.+)$/gmu)) {
      const mediaPath = match[1]?.trim();
      if (mediaPath) {
        mediaPaths.add(mediaPath);
      }
    }
  }

  return [...mediaPaths];
}

function extractAssistantDisplayResult(
  entry: OpenClawSessionLogEntry,
  options?: {
    workspaceDir?: string;
  },
): ExtractedAssistantDisplayResult {
  if (entry.type !== "message" || entry.message?.role !== "assistant" || entry.message.isError) {
    return { result: { messages: [] }, isStructured: false };
  }

  const rawText = readEntryTextContent(entry);
  if (rawText === "") {
    return { result: { messages: [] }, isStructured: false };
  }
  const structuredResult = parseStructuredResponseResult(
    rawText,
    options?.workspaceDir ? { workspaceDir: options.workspaceDir } : undefined,
  );
  if (structuredResult) {
    return { result: structuredResult, isStructured: true };
  }

  const fallbackMessage = normalizePlainBridgeTextMessage(
    rawText,
    options?.workspaceDir ? { workspaceDir: options.workspaceDir } : undefined,
  );
  return fallbackMessage
    ? { result: { messages: [fallbackMessage] }, isStructured: false }
    : { result: { messages: [] }, isStructured: false };
}

function appendStructuredResponseContract(prompt: string): string {
  return `${prompt}\n\n${buildStructuredResponseContractPrompt()}`;
}

function buildAudioTranscriptionPrompt(
  stagedAttachments: ReadonlyArray<StagedAttachment>,
): string {
  const lines = [
    "PrivateClaw voice transcription request.",
    "Use OpenClaw's speech-to-text or audio understanding capabilities on the exact staged files below.",
    "Return only the recognized spoken content from the user's audio message.",
    "- Do not answer the user's request.",
    "- Do not summarize, explain, or translate unless the speech itself says to do so.",
    "- Preserve the original language and natural punctuation.",
    "- If multiple audio attachments are present, transcribe them in order and separate each transcript with a blank line.",
    "",
    "Staged audio attachments:",
  ];
  for (const attachment of stagedAttachments) {
    lines.push(`- ${attachment.name}`);
    lines.push(`  mimeType: ${attachment.effectiveMimeType}`);
    lines.push(`  workspacePath: ${attachment.workspacePath}`);
  }
  return lines.join("\n");
}

function buildStructuredResponseContractPrompt(): string {
  return [
    "PrivateClaw response contract:",
    `- After you finish your reasoning and tool usage, put the final user-visible result inside exactly one ${PRIVATECLAW_RESPONSE_TAG_START}...${PRIVATECLAW_RESPONSE_TAG_END} block.`,
    "- The block content must be valid JSON.",
    `- Use this JSON shape: {\"version\":${PRIVATECLAW_RESPONSE_CONTRACT_VERSION},\"messages\":[{\"text\":\"...\"}],\"data\":{}}`,
    "- Always include at least one messages entry.",
    "- Put user-visible text only in messages[].text.",
    "- To send images/files, add an attachments array to the message: {\"text\":\"...\",\"attachments\":[{\"name\":\"file.png\",\"mimeType\":\"image/png\",\"filePath\":\"relative/path/in/current/workspace/or/absolute/local/path\"}]}",
    "- Or use dataBase64 for inline binary: {\"name\":\"file.png\",\"mimeType\":\"image/png\",\"dataBase64\":\"...\"}",
    "- Never put attachments at the top level of the response object. Files must live inside messages[].attachments.",
    "- Never put channel-specific markup such as <qqimg>...</qqimg>, <qqvoice>...</qqvoice>, <qqvideo>...</qqvideo>, or <qqfile>...</qqfile>, markdown image syntax, or raw local file paths inside messages[].text. Put files only in messages[].attachments.",
    "- Use data for optional machine-readable extraction results that PrivateClaw may consume in future file-processing flows.",
    "- Do not wrap the JSON in markdown fences.",
  ].join("\n");
}

function resolveStructuredAttachments(
  rawAttachments?: PrivateClawStructuredMessageAttachment[],
  options?: {
    workspaceDir?: string;
  },
): PrivateClawAttachment[] {
  if (!rawAttachments || rawAttachments.length === 0) {
    return [];
  }
  const workspaceDir = path.resolve(options?.workspaceDir ?? DEFAULT_WORKSPACE_DIR);
  const attachments: PrivateClawAttachment[] = [];
  for (const raw of rawAttachments) {
    if (raw.dataBase64?.trim()) {
      const trimmedData = raw.dataBase64.trim();
      attachments.push({
        id: `structured-attachment-${randomUUID()}`,
        name: raw.name ?? "attachment",
        mimeType: raw.mimeType ?? GENERIC_BINARY_MIME,
        sizeBytes: Buffer.byteLength(trimmedData, "base64"),
        dataBase64: trimmedData,
      });
    } else if (raw.filePath) {
      try {
        const filePath = resolveStructuredAttachmentFilePath(raw.filePath, workspaceDir);
        if (!filePath) {
          continue;
        }
        const fileBytes = readFileSync(filePath);
        attachments.push({
          id: `structured-attachment-${randomUUID()}`,
          name: raw.name ?? path.basename(filePath) ?? "attachment",
          mimeType: raw.mimeType ?? inferMimeTypeFromFileName(raw.name ?? filePath) ?? GENERIC_BINARY_MIME,
          sizeBytes: fileBytes.byteLength,
          dataBase64: fileBytes.toString("base64"),
        });
      } catch {
        // Skip unreadable files
      }
    }
  }
  return attachments;
}

function resolveStructuredAttachmentFilePath(
  rawFilePath: string,
  workspaceDir: string,
): string | undefined {
  const trimmedPath = rawFilePath.trim();
  if (trimmedPath === "") {
    return undefined;
  }

  if (path.isAbsolute(trimmedPath)) {
    return path.normalize(trimmedPath);
  }

  const resolvedPath = normalizeMediaPath(trimmedPath, workspaceDir);
  return isPathInsideDirectory(workspaceDir, resolvedPath) ? resolvedPath : undefined;
}

function parseStructuredResponseResult(
  raw: string,
  options?: {
    workspaceDir?: string;
  },
): NormalizedBridgeResult | undefined {
  const structured = parseStructuredResponseBlock(raw);
  if (!structured) {
    return undefined;
  }

  const messages: NormalizedBridgeMessage[] = [];
  for (const message of structured.messages ?? []) {
    const text = typeof message.text === "string" ? message.text.trim() : "";
    const qqMediaResult = extractInlineQqMediaAttachments(text, options);
    const attachments = [
      ...resolveStructuredAttachments(message.attachments, options),
      ...qqMediaResult.attachments,
    ];
    if (qqMediaResult.text !== "" || attachments.length > 0) {
      messages.push({
        text: qqMediaResult.text,
        ...(attachments.length > 0 ? { attachments } : {}),
      });
    }
  }
  const topLevelAttachments = resolveStructuredAttachments(structured.attachments, options);
  if (topLevelAttachments.length > 0) {
    messages.push({
      text: "",
      attachments: topLevelAttachments,
    });
  }
  if (messages.length === 0) {
    return undefined;
  }

  return {
    messages,
    ...combineStructuredData([{ data: structured.data }]),
  };
}

function parseStructuredResponseBlock(raw: string): PrivateClawStructuredResponse | undefined {
  const payload = extractStructuredResponsePayload(raw);
  if (!payload) {
    return undefined;
  }

  const parsed = parseStructuredResponseJson(payload);
  if (
    !parsed ||
    parsed.version !== PRIVATECLAW_RESPONSE_CONTRACT_VERSION ||
    !Array.isArray(parsed.messages)
  ) {
    return undefined;
  }
  return parsed;
}

function stripStructuredResponseBlock(raw: string): string {
  let stripped = raw;
  for (const pattern of buildStructuredResponseBlockPatterns("gu")) {
    stripped = stripped.replace(pattern, "");
  }
  return stripped.trim();
}

function buildStructuredResponseBlockPattern(flags: string): RegExp {
  return new RegExp(
    `${escapeRegExpLiteral(PRIVATECLAW_RESPONSE_TAG_START)}([\\s\\S]*?)${escapeRegExpLiteral(PRIVATECLAW_RESPONSE_TAG_END)}`,
    flags,
  );
}

function buildStructuredResponseBlockPatterns(flags: string): RegExp[] {
  const startTag = escapeRegExpLiteral(PRIVATECLAW_RESPONSE_TAG_START);
  return [
    buildStructuredResponseBlockPattern(flags),
    new RegExp(`${startTag}([\\s\\S]*?)${startTag}`, flags),
  ];
}

function extractStructuredResponsePayload(raw: string): string | undefined {
  for (const pattern of buildStructuredResponseBlockPatterns("u")) {
    const payload = raw.match(pattern)?.[1]?.trim();
    if (payload) {
      return payload;
    }
  }
  return undefined;
}

function normalizePlainBridgeTextMessage(
  rawText: string,
  options?: {
    workspaceDir?: string;
  },
): NormalizedBridgeMessage | undefined {
  const strippedText = stripStructuredResponseBlock(rawText);
  if (strippedText === "") {
    return undefined;
  }

  const mediaResult = extractInlineQqMediaAttachments(strippedText, options);
  if (mediaResult.text === "" && mediaResult.attachments.length === 0) {
    return undefined;
  }

  return {
    text: mediaResult.text,
    ...(mediaResult.attachments.length > 0
      ? { attachments: mediaResult.attachments }
      : {}),
  };
}

export function extractInlineQqMediaAttachments(
  text: string,
  options?: {
    workspaceDir?: string;
  },
): {
  text: string;
  attachments: PrivateClawAttachment[];
} {
  if (!text.includes("<qq")) {
    return { text, attachments: [] };
  }

  const attachments: PrivateClawAttachment[] = [];
  const mediaTagPattern = /<(qqimg|qqvoice|qqvideo|qqfile)>([\s\S]*?)<\/(?:qqimg|qqvoice|qqvideo|qqfile|img)>/giu;
  for (const match of text.matchAll(mediaTagPattern)) {
    const rawTagName = match[1]?.trim().toLowerCase();
    const rawValue = match[2]?.trim();
    if (
      !rawTagName ||
      !isInlineQqMediaTag(rawTagName) ||
      !rawValue ||
      rawValue === ""
    ) {
      continue;
    }
    const attachment = resolveInlineQqMediaAttachment(
      rawValue,
      rawTagName,
      options,
    );
    if (attachment) {
      attachments.push(attachment);
    }
  }

  return {
    text: text
      .replace(mediaTagPattern, "")
      .replace(/\n{3,}/gu, "\n\n")
      .trim(),
    attachments,
  };
}

function isInlineQqMediaTag(value: string): value is "qqimg" | "qqvoice" | "qqvideo" | "qqfile" {
  return value === "qqimg" || value === "qqvoice" || value === "qqvideo" || value === "qqfile";
}

function inferInlineQqMediaMimeType(
  fileName: string,
  tagName: "qqimg" | "qqvoice" | "qqvideo" | "qqfile",
): string {
  const inferred = inferMimeTypeFromFileName(fileName);
  if (inferred) {
    return inferred;
  }
  switch (tagName) {
    case "qqimg":
      return "image/*";
    case "qqvoice":
      return "audio/*";
    case "qqvideo":
      return "video/*";
    case "qqfile":
      return GENERIC_BINARY_MIME;
  }
}

function resolveInlineQqMediaAttachment(
  rawValue: string,
  tagName: "qqimg" | "qqvoice" | "qqvideo" | "qqfile",
  options?: {
    workspaceDir?: string;
  },
): PrivateClawAttachment | undefined {
  const workspaceDir = path.resolve(options?.workspaceDir ?? DEFAULT_WORKSPACE_DIR);

  if (!path.isAbsolute(rawValue)) {
    try {
      const parsedUrl = new URL(rawValue);
      if (parsedUrl.protocol === "file:") {
        const filePath = fileURLToPath(parsedUrl);
        const fileBytes = readFileSync(filePath);
        const fileName = path.basename(filePath) || "attachment";
        return {
          id: `structured-attachment-${randomUUID()}`,
          name: fileName,
          mimeType: inferInlineQqMediaMimeType(fileName, tagName),
          sizeBytes: fileBytes.byteLength,
          dataBase64: fileBytes.toString("base64"),
        };
      }
      const fileName = path.basename(parsedUrl.pathname) || "attachment";
      return {
        id: `structured-attachment-${randomUUID()}`,
        name: fileName,
        mimeType: inferInlineQqMediaMimeType(fileName, tagName),
        sizeBytes: 0,
        uri: parsedUrl.toString(),
      };
    } catch {
      // Not a URL. Fall through to local file handling.
    }
  }

  try {
    const filePath = resolveStructuredAttachmentFilePath(rawValue, workspaceDir);
    if (!filePath) {
      return undefined;
    }
    const fileBytes = readFileSync(filePath);
    const fileName = path.basename(filePath) || "attachment";
    return {
      id: `structured-attachment-${randomUUID()}`,
      name: fileName,
      mimeType: inferInlineQqMediaMimeType(fileName, tagName),
      sizeBytes: fileBytes.byteLength,
      dataBase64: fileBytes.toString("base64"),
    };
  } catch {
    return undefined;
  }
}

function parseStructuredResponseJson(
  payload: string,
): PrivateClawStructuredResponse | undefined {
  try {
    return JSON.parse(payload) as PrivateClawStructuredResponse;
  } catch {
    const normalizedPayload = stripJsonTrailingCommas(payload);
    if (normalizedPayload === payload) {
      return undefined;
    }
    try {
      return JSON.parse(normalizedPayload) as PrivateClawStructuredResponse;
    } catch {
      return undefined;
    }
  }
}

function extractEmbeddedJsonPayload(text: string): string | undefined {
  for (let startIndex = 0; startIndex < text.length; startIndex += 1) {
    const character = text[startIndex];
    if (character !== "{" && character !== "[") {
      continue;
    }
    const candidate = sliceBalancedJsonPayload(text, startIndex);
    if (!candidate) {
      continue;
    }
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return undefined;
}

function sliceBalancedJsonPayload(text: string, startIndex: number): string | undefined {
  const expectedClosers: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const character = text[index]!;
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (character === "{") {
      expectedClosers.push("}");
      continue;
    }
    if (character === "[") {
      expectedClosers.push("]");
      continue;
    }
    if (character === "}" || character === "]") {
      const expected = expectedClosers.pop();
      if (expected !== character) {
        return undefined;
      }
      if (expectedClosers.length === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }
  return undefined;
}

function stripJsonTrailingCommas(payload: string): string {
  let normalized = "";
  let inString = false;
  let escaped = false;

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index]!;

    if (escaped) {
      normalized += character;
      escaped = false;
      continue;
    }

    if (inString) {
      normalized += character;
      if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      normalized += character;
      inString = true;
      continue;
    }

    if (character === ",") {
      let lookahead = index + 1;
      while (
        lookahead < payload.length &&
        /\s/u.test(payload[lookahead]!)
      ) {
        lookahead += 1;
      }
      const nextCharacter = payload[lookahead];
      if (nextCharacter === "]" || nextCharacter === "}") {
        continue;
      }
    }

    normalized += character;
  }

  return normalized;
}

function escapeRegExpLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function combineStructuredData(
  results: ReadonlyArray<{ data?: unknown }>,
): { data?: unknown } {
  const data = [...results]
    .reverse()
    .map((result) => normalizeStructuredData(result.data))
    .find((candidate) => candidate !== undefined);
  return data === undefined ? {} : { data };
}

function normalizeStructuredData(value: unknown): unknown | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0 ? value : undefined;
  }
  return value;
}

function extractBridgeResponseData(response: BridgeResponse): unknown {
  return typeof response === "string" ? undefined : response.data;
}

async function buildAttachmentFromMediaPath(
  mediaPath: string,
  workspaceDir: string = DEFAULT_WORKSPACE_DIR,
): Promise<PrivateClawAttachment> {
  const filePath = normalizeMediaPath(mediaPath, workspaceDir);
  const fileBytes = await fs.readFile(filePath);
  const fileName = path.basename(filePath) || `media-${randomUUID()}`;
  return {
    id: `bridge-attachment-${randomUUID()}`,
    name: fileName,
    mimeType: inferMimeTypeFromFileName(fileName) ?? GENERIC_BINARY_MIME,
    sizeBytes: fileBytes.byteLength,
    dataBase64: fileBytes.toString("base64"),
  };
}

function normalizeMediaPath(mediaPath: string, workspaceDir: string = DEFAULT_WORKSPACE_DIR): string {
  const trimmed = mediaPath.trim();
  if (trimmed.startsWith("file://")) {
    return path.resolve(fileURLToPath(trimmed));
  }
  return path.isAbsolute(trimmed) ? path.resolve(trimmed) : path.resolve(workspaceDir, trimmed);
}

function isPathInsideDirectory(directory: string, targetPath: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(targetPath));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function buildVoiceTranscriptionSessionId(sessionId: string, requestId: string): string {
  return [
    "privateclaw-voice-stt",
    sanitizeSessionIdSegment(sessionId),
    sanitizeSessionIdSegment(requestId),
  ].join("-");
}

function sanitizeSessionIdSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9_-]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  return sanitized === "" ? randomUUID().slice(0, 8) : sanitized;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function buildAttachmentInstruction(params: {
  kind: StagedAttachment["kind"];
  workspacePath: string;
  extractedTextWorkspacePath?: string;
}): string {
  switch (params.kind) {
    case "image":
      return `Use the image tool with "${params.workspacePath}" before answering.`;
    case "pdf":
      return `Use the pdf tool with "${params.workspacePath}" before answering.`;
    case "docx":
      if (params.extractedTextWorkspacePath) {
        return `Read "${params.extractedTextWorkspacePath}" first because it contains extracted text from the Word document.`;
      }
      return `The Word document is staged at "${params.workspacePath}", but automatic text extraction was unavailable.`;
    case "text":
      return `Use the read tool with "${params.workspacePath}" before answering.`;
    case "file":
      return `The raw file is staged at "${params.workspacePath}". If you need to inspect it, use an appropriate tool on that exact path.`;
  }
}

function classifyAttachmentKind(
  fileName: string,
  mimeType: string,
): StagedAttachment["kind"] {
  if (mimeType.startsWith("image/")) {
    return "image";
  }
  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (DOCX_MIME_TYPES.has(mimeType) || fileName.toLowerCase().endsWith(".docx")) {
    return "docx";
  }
  if (isTextLikeMimeType(mimeType) || isTextLikeExtension(fileName)) {
    return "text";
  }
  return "file";
}

function resolveAttachmentMimeType(attachment: PrivateClawAttachment): string {
  const explicitMimeType = attachment.mimeType.trim().toLowerCase();
  if (explicitMimeType !== "" && explicitMimeType !== GENERIC_BINARY_MIME) {
    return explicitMimeType;
  }

  return inferMimeTypeFromFileName(attachment.name) ?? (explicitMimeType || GENERIC_BINARY_MIME);
}

export function inferMimeTypeFromFileName(fileName: string): string | undefined {
  const extension = getFileExtension(fileName);
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
    case "svg":
      return "image/svg+xml";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "ogg":
    case "opus":
      return "audio/ogg";
    case "caf":
      return "audio/x-caf";
    case "mp4":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "pdf":
      return "application/pdf";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
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
    case "yaml":
    case "yml":
      return "application/yaml";
    case "html":
      return "text/html";
    case "js":
    case "mjs":
      return "application/javascript";
    case "ts":
      return "application/typescript";
    default:
      return undefined;
  }
}

function extractDocxText(buffer: Buffer): string {
  try {
    const archive = unzipSync(new Uint8Array(buffer));
    const sectionNames = Object.keys(archive)
      .filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/u.test(name))
      .sort((left, right) => {
        if (left === "word/document.xml") {
          return -1;
        }
        if (right === "word/document.xml") {
          return 1;
        }
        return left.localeCompare(right);
      });

    const sections = sectionNames
      .map((name) => {
        const entry = archive[name];
        if (!entry) {
          return "";
        }
        return extractWordXmlText(Buffer.from(entry).toString("utf8"));
      })
      .filter((section) => section.trim() !== "");

    return sections.join("\n\n").trim();
  } catch {
    return "";
  }
}

function extractWordXmlText(xml: string): string {
  const paragraphs = xml
    .split(/<w:p\b[^>]*>/u)
    .slice(1)
    .map((paragraphXml) => {
      const withinParagraph = paragraphXml.split(/<\/w:p>/u, 1)[0] ?? paragraphXml;
      const normalized = withinParagraph
        .replace(/<w:tab\/>/gu, "\t")
        .replace(/<w:br(?:\s[^>]*)?\/>/gu, "\n")
        .replace(/<\/w:tr>/gu, "\n")
        .replace(/<\/w:tc>/gu, "\t");

      const textRuns = [...normalized.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gu)]
        .map((match) => decodeXmlEntities(match[1] ?? ""))
        .join("");

      return textRuns.replace(/\r\n/gu, "\n").trim();
    })
    .filter((paragraph) => paragraph !== "");

  return paragraphs.join("\n");
}

function decodeXmlEntities(value: string): string {
  return value.replace(XML_ENTITY_PATTERN, (entity, rawName: string) => {
    switch (rawName) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        if (rawName.startsWith("#x")) {
          return String.fromCodePoint(parseInt(rawName.slice(2), 16));
        }
        if (rawName.startsWith("#")) {
          return String.fromCodePoint(parseInt(rawName.slice(1), 10));
        }
        return entity;
    }
  });
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  const fallback = trimmed === "" ? "attachment" : trimmed;
  return fallback.replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "_");
}

function toWorkspacePath(workspaceDir: string, absolutePath: string): string {
  return path.relative(workspaceDir, absolutePath).split(path.sep).join("/");
}

function getFileExtension(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  return extension.startsWith(".") ? extension.slice(1) : extension;
}

function isTextLikeMimeType(mimeType: string): boolean {
  return mimeType.startsWith("text/") || TEXT_LIKE_MIME_TYPES.has(mimeType);
}

function isTextLikeExtension(fileName: string): boolean {
  const extension = getFileExtension(fileName);
  return new Set([
    "txt",
    "md",
    "markdown",
    "csv",
    "json",
    "xml",
    "yaml",
    "yml",
    "html",
    "js",
    "mjs",
    "ts",
  ]).has(extension);
}
