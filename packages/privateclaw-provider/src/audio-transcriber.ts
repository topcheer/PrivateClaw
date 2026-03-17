import { execFile, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  PrivateClawAudioTranscriber,
  PrivateClawAudioTranscriptionRequest,
} from "./types.js";

export interface PrivateClawSttConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export interface PrivateClawWhisperCliConfig {
  command: string;
  model: string;
  language?: string;
  device?: string;
  modelDir?: string;
}

interface NamedAudioTranscriber {
  label: string;
  transcriber: PrivateClawAudioTranscriber;
}

interface ExecFileTextOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

type ExecFileError = NodeJS.ErrnoException & {
  stdout?: string;
  stderr?: string;
};

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function readStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).flatMap(([key, rawValue]) => {
    const resolvedValue = readString(rawValue);
    return resolvedValue ? [[key, resolvedValue] as const] : [];
  });
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

function parseHeaders(value: unknown): Record<string, string> | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return undefined;
    }
    try {
      return readStringRecord(JSON.parse(trimmed));
    } catch {
      return undefined;
    }
  }
  return readStringRecord(value);
}

function mergeHeaders(
  defaults: Record<string, string> | undefined,
  overrides: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged = {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function extensionFromMimeType(mimeType: string | undefined): string | undefined {
  switch (mimeType?.trim().toLowerCase()) {
    case "audio/mpeg":
      return ".mp3";
    case "audio/wav":
    case "audio/x-wav":
      return ".wav";
    case "audio/mp4":
    case "audio/aac":
      return ".m4a";
    case "audio/ogg":
      return ".ogg";
    case "audio/webm":
      return ".webm";
    case "audio/x-caf":
      return ".caf";
    default:
      return undefined;
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/-+/gu, "-");
}

function resolveAttachmentFileName(
  request: PrivateClawAudioTranscriptionRequest,
  index: number,
): string {
  const attachment = request.attachments[index];
  const explicitName = sanitizeFileName(path.basename(attachment?.name?.trim() || ""));
  if (explicitName !== "") {
    return explicitName;
  }
  const extension = extensionFromMimeType(attachment?.mimeType) ?? ".bin";
  return `${request.requestId || "audio"}-${index + 1}${extension}`;
}

function resolveAttachmentMimeType(
  request: PrivateClawAudioTranscriptionRequest,
  index: number,
  fileName: string,
): string {
  const explicitMimeType = readString(request.attachments[index]?.mimeType);
  if (explicitMimeType) {
    return explicitMimeType;
  }
  const derivedExtension = path.extname(fileName).toLowerCase();
  switch (derivedExtension) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".caf":
      return "audio/x-caf";
    case ".webm":
      return "audio/webm";
    default:
      return "application/octet-stream";
  }
}

function coerceText(value: string | Buffer | null | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString("utf8");
  }
  return "";
}

function truncateLogDetail(value: string, maxLength = 300): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function formatExecError(error: unknown): string {
  if (!(error instanceof Error)) {
    return truncateLogDetail(String(error));
  }
  const execError = error as ExecFileError;
  const details = [
    error.message,
    readString(execError.stderr),
    readString(execError.stdout),
  ].filter(Boolean);
  return truncateLogDetail(details.join(" | "));
}

function execFileText(
  execFileImpl: typeof execFile,
  file: string,
  args: ReadonlyArray<string>,
  options?: ExecFileTextOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFileImpl(
      file,
      [...args],
      {
        encoding: "utf8",
        ...(options ?? {}),
      },
      (error, stdout, stderr) => {
        const resolvedStdout = coerceText(stdout);
        const resolvedStderr = coerceText(stderr);
        if (error) {
          const execError = error as ExecFileError;
          execError.stdout = resolvedStdout;
          execError.stderr = resolvedStderr;
          reject(execError);
          return;
        }
        resolve({
          stdout: resolvedStdout,
          stderr: resolvedStderr,
        });
      },
    );
  });
}

function parseWhisperTranscriptJson(payload: string): string | null {
  const parsed = JSON.parse(payload) as {
    text?: unknown;
    segments?: Array<{ text?: unknown }>;
  };
  const directText = readString(parsed.text);
  if (directText) {
    return directText;
  }
  const segmentText = Array.isArray(parsed.segments)
    ? parsed.segments.flatMap((segment) => {
        const value = readString(segment?.text);
        return value ? [value] : [];
      })
    : [];
  const combined = segmentText.join("").trim();
  return combined === "" ? null : combined;
}

function buildWhisperOutputFilePath(outputDir: string, fileName: string): string {
  return path.join(
    outputDir,
    `${path.basename(fileName, path.extname(fileName))}.json`,
  );
}

export function resolvePrivateClawSttConfig(params: {
  rootConfig?: unknown;
  baseUrl?: unknown;
  apiKey?: unknown;
  headers?: unknown;
  model?: unknown;
  provider?: unknown;
}): PrivateClawSttConfig | undefined {
  const rootConfig = (params.rootConfig ?? {}) as Record<string, unknown>;
  const audioModelEntry = (
    (rootConfig.tools as Record<string, unknown> | undefined)?.media as
      | Record<string, unknown>
      | undefined
  )?.audio as Record<string, unknown> | undefined;
  const firstAudioModel = Array.isArray(audioModelEntry?.models)
    ? (audioModelEntry?.models[0] as Record<string, unknown> | undefined)
    : undefined;
  const providerId =
    readString(params.provider) ??
    readString(firstAudioModel?.provider) ??
    "openai";
  const providers = (
    rootConfig.models as Record<string, unknown> | undefined
  )?.providers as Record<string, unknown> | undefined;
  const providerConfig = (providers?.[providerId] ?? {}) as Record<string, unknown>;

  const baseUrl =
    readString(params.baseUrl) ??
    readString(firstAudioModel?.baseUrl) ??
    readString(providerConfig.baseUrl);
  const apiKey =
    readString(params.apiKey) ??
    readString(firstAudioModel?.apiKey) ??
    readString(providerConfig.apiKey);
  const headers = mergeHeaders(
    apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    parseHeaders(params.headers) ??
      parseHeaders(firstAudioModel?.headers) ??
      parseHeaders(providerConfig.headers),
  );
  const model =
    readString(params.model) ??
    readString(firstAudioModel?.model) ??
    "whisper-1";

  if (!baseUrl) {
    return undefined;
  }

  return {
    baseUrl: trimTrailingSlashes(baseUrl),
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(headers ? { headers } : {}),
  };
}

export function resolvePrivateClawWhisperCliConfig(params?: {
  env?: NodeJS.ProcessEnv;
  command?: unknown;
  model?: unknown;
  language?: unknown;
  device?: unknown;
  modelDir?: unknown;
  spawnSyncImpl?: typeof spawnSync;
}): PrivateClawWhisperCliConfig | undefined {
  const env = params?.env ?? process.env;
  const command =
    readString(params?.command) ??
    readString(env.PRIVATECLAW_WHISPER_BIN) ??
    "whisper";
  const spawnSyncImpl = params?.spawnSyncImpl ?? spawnSync;
  const probe = spawnSyncImpl(command, ["--help"], {
    encoding: "utf8",
    stdio: "pipe",
    timeout: 10_000,
    env,
  });
  if (probe.error) {
    return undefined;
  }
  const helpText = `${coerceText(probe.stdout)}\n${coerceText(probe.stderr)}`;
  if ((probe.status ?? 1) !== 0 || !/usage:\s*whisper\b/iu.test(helpText)) {
    return undefined;
  }
  const model =
    readString(params?.model) ??
    readString(env.PRIVATECLAW_WHISPER_MODEL) ??
    "turbo";
  const language =
    readString(params?.language) ??
    readString(env.PRIVATECLAW_WHISPER_LANGUAGE);
  const device =
    readString(params?.device) ??
    readString(env.PRIVATECLAW_WHISPER_DEVICE);
  const modelDir =
    readString(params?.modelDir) ??
    readString(env.PRIVATECLAW_WHISPER_MODEL_DIR);

  return {
    command,
    model,
    ...(language ? { language } : {}),
    ...(device ? { device } : {}),
    ...(modelDir ? { modelDir } : {}),
  };
}

async function transcribeSingleAttachment(params: {
  request: PrivateClawAudioTranscriptionRequest;
  index: number;
  sttConfig: PrivateClawSttConfig;
  onLog?: (message: string) => void;
}): Promise<string | null> {
  const fileName = resolveAttachmentFileName(params.request, params.index);
  const mimeType = resolveAttachmentMimeType(params.request, params.index, fileName);
  const dataBase64 = readString(params.request.attachments[params.index]?.dataBase64);
  if (!dataBase64) {
    throw new Error(`Missing base64 audio payload for ${fileName}.`);
  }
  const fileBytes = Buffer.from(dataBase64, "base64");

  const form = new FormData();
  form.append("file", new Blob([fileBytes], { type: mimeType }), fileName);
  form.append("model", params.sttConfig.model);

  params.onLog?.(
    `[stt] transcribe_start session=${params.request.sessionId} request=${params.request.requestId} file=${JSON.stringify(fileName)} mimeType=${mimeType} sizeBytes=${fileBytes.length} model=${params.sttConfig.model}`,
  );

  const response = await fetch(`${params.sttConfig.baseUrl}/audio/transcriptions`, {
    method: "POST",
    ...(params.sttConfig.headers ? { headers: params.sttConfig.headers } : {}),
    body: form,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `STT failed for ${fileName} (HTTP ${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const result = (await response.json()) as { text?: string };
  const transcript = result.text?.trim() || null;
  params.onLog?.(
    `[stt] transcribe_complete session=${params.request.sessionId} request=${params.request.requestId} file=${JSON.stringify(fileName)} transcriptChars=${transcript?.length ?? 0}`,
  );
  return transcript;
}

async function transcribeSingleAttachmentWithWhisperCli(params: {
  request: PrivateClawAudioTranscriptionRequest;
  index: number;
  whisperConfig: PrivateClawWhisperCliConfig;
  onLog?: (message: string) => void;
  execFileImpl?: typeof execFile;
}): Promise<string | null> {
  const fileName = resolveAttachmentFileName(params.request, params.index);
  const mimeType = resolveAttachmentMimeType(params.request, params.index, fileName);
  const dataBase64 = readString(params.request.attachments[params.index]?.dataBase64);
  if (!dataBase64) {
    throw new Error(`Missing base64 audio payload for ${fileName}.`);
  }
  const fileBytes = Buffer.from(dataBase64, "base64");
  const execFileImpl = params.execFileImpl ?? execFile;
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "privateclaw-whisper-stt-"));
  const inputPath = path.join(tempDir, fileName);
  const outputPath = buildWhisperOutputFilePath(tempDir, fileName);

  try {
    await writeFile(inputPath, fileBytes);
    const args = [
      inputPath,
      "--model",
      params.whisperConfig.model,
      "--output_dir",
      tempDir,
      "--output_format",
      "json",
      "--task",
      "transcribe",
      "--verbose",
      "False",
      ...(params.whisperConfig.language
        ? ["--language", params.whisperConfig.language]
        : []),
      ...(params.whisperConfig.device
        ? ["--device", params.whisperConfig.device]
        : []),
      ...(params.whisperConfig.modelDir
        ? ["--model_dir", params.whisperConfig.modelDir]
        : []),
    ];
    params.onLog?.(
      `[stt] whisper_transcribe_start session=${params.request.sessionId} request=${params.request.requestId} file=${JSON.stringify(fileName)} mimeType=${mimeType} sizeBytes=${fileBytes.length} command=${JSON.stringify(params.whisperConfig.command)} model=${JSON.stringify(params.whisperConfig.model)}`,
    );
    await execFileText(execFileImpl, params.whisperConfig.command, args, {
      maxBuffer: 64 * 1024 * 1024,
    });
    const transcriptPayload = await readFile(outputPath, "utf8");
    const transcript = parseWhisperTranscriptJson(transcriptPayload);
    params.onLog?.(
      `[stt] whisper_transcribe_complete session=${params.request.sessionId} request=${params.request.requestId} file=${JSON.stringify(fileName)} transcriptChars=${transcript?.length ?? 0}`,
    );
    return transcript;
  } catch (error) {
    throw new Error(`whisper CLI failed for ${fileName}: ${formatExecError(error)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function createFallbackAudioTranscriber(
  candidates: ReadonlyArray<NamedAudioTranscriber>,
  params?: { onLog?: (message: string) => void },
): PrivateClawAudioTranscriber {
  return {
    async transcribeAudioAttachments(
      request: PrivateClawAudioTranscriptionRequest,
    ): Promise<string> {
      const failures: string[] = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const nextCandidate = candidates[index + 1];
        params?.onLog?.(
          `[stt] provider_stt_try session=${request.sessionId} request=${request.requestId} via=${JSON.stringify(candidate.label)}`,
        );
        try {
          const transcript = (await candidate.transcriber.transcribeAudioAttachments(request))
            .trim();
          if (transcript === "") {
            throw new Error(`${candidate.label} returned an empty transcript.`);
          }
          params?.onLog?.(
            `[stt] provider_stt_success session=${request.sessionId} request=${request.requestId} via=${JSON.stringify(candidate.label)} transcriptChars=${transcript.length}`,
          );
          return transcript;
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          failures.push(`${candidate.label}: ${detail}`);
          params?.onLog?.(
            `[stt] provider_stt_failed session=${request.sessionId} request=${request.requestId} via=${JSON.stringify(candidate.label)} error=${JSON.stringify(truncateLogDetail(detail))}${nextCandidate ? ` next=${JSON.stringify(nextCandidate.label)}` : ""}`,
          );
        }
      }
      throw new Error(
        `All provider-side STT backends failed for ${request.requestId}: ${failures.join(" | ")}`,
      );
    },
  };
}

export function createOpenAICompatibleAudioTranscriber(
  sttConfig: PrivateClawSttConfig,
  params?: { onLog?: (message: string) => void },
): PrivateClawAudioTranscriber {
  return {
    async transcribeAudioAttachments(
      request: PrivateClawAudioTranscriptionRequest,
    ): Promise<string> {
      const transcripts: string[] = [];
      for (let index = 0; index < request.attachments.length; index += 1) {
        const transcript = await transcribeSingleAttachment({
          request,
          index,
          sttConfig,
          ...(params?.onLog ? { onLog: params.onLog } : {}),
        });
        if (transcript) {
          transcripts.push(transcript);
        }
      }
      return transcripts.join("\n\n").trim();
    },
  };
}

export function createWhisperCliAudioTranscriber(
  whisperConfig: PrivateClawWhisperCliConfig,
  params?: {
    onLog?: (message: string) => void;
    execFileImpl?: typeof execFile;
  },
): PrivateClawAudioTranscriber {
  return {
    async transcribeAudioAttachments(
      request: PrivateClawAudioTranscriptionRequest,
    ): Promise<string> {
      const transcripts: string[] = [];
      for (let index = 0; index < request.attachments.length; index += 1) {
        const transcript = await transcribeSingleAttachmentWithWhisperCli({
          request,
          index,
          whisperConfig,
          ...(params?.onLog ? { onLog: params.onLog } : {}),
          ...(params?.execFileImpl ? { execFileImpl: params.execFileImpl } : {}),
        });
        if (transcript) {
          transcripts.push(transcript);
        }
      }
      return transcripts.join("\n\n").trim();
    },
  };
}

export function buildPreferredAudioTranscriber(params?: {
  rootConfig?: unknown;
  env?: NodeJS.ProcessEnv;
  onLog?: (message: string) => void;
  whisperSpawnSyncImpl?: typeof spawnSync;
  whisperExecFileImpl?: typeof execFile;
}): PrivateClawAudioTranscriber | undefined {
  const env = params?.env ?? process.env;
  const candidates: NamedAudioTranscriber[] = [];
  const whisperCommand = readString(env.PRIVATECLAW_WHISPER_BIN) ?? "whisper";
  const whisperConfig = resolvePrivateClawWhisperCliConfig({
    env,
    ...(params?.whisperSpawnSyncImpl
      ? { spawnSyncImpl: params.whisperSpawnSyncImpl }
      : {}),
  });
  if (whisperConfig) {
    params?.onLog?.(
      `[stt] whisper_cli_enabled command=${JSON.stringify(whisperConfig.command)} model=${JSON.stringify(whisperConfig.model)}${whisperConfig.language ? ` language=${JSON.stringify(whisperConfig.language)}` : ""}${whisperConfig.device ? ` device=${JSON.stringify(whisperConfig.device)}` : ""}`,
    );
    candidates.push({
      label: "whisper-cli",
      transcriber: createWhisperCliAudioTranscriber(whisperConfig, {
        ...(params?.onLog ? { onLog: params.onLog } : {}),
        ...(params?.whisperExecFileImpl
          ? { execFileImpl: params.whisperExecFileImpl }
          : {}),
      }),
    });
  } else {
    params?.onLog?.(
      `[stt] whisper_cli_unavailable command=${JSON.stringify(whisperCommand)}`,
    );
  }

  const sttConfig = resolvePrivateClawSttConfig({
    rootConfig: params?.rootConfig,
    baseUrl: env.PRIVATECLAW_STT_BASE_URL,
    apiKey: env.PRIVATECLAW_STT_API_KEY,
    headers: env.PRIVATECLAW_STT_HEADERS,
    model: env.PRIVATECLAW_STT_MODEL,
    provider: env.PRIVATECLAW_STT_PROVIDER,
  });
  if (sttConfig) {
    params?.onLog?.(
      `[stt] direct_stt_enabled baseUrl=${JSON.stringify(sttConfig.baseUrl)} model=${JSON.stringify(sttConfig.model)}`,
    );
    candidates.push({
      label: "provider-config",
      transcriber: createOpenAICompatibleAudioTranscriber(sttConfig, {
        ...(params?.onLog ? { onLog: params.onLog } : {}),
      }),
    });
  }

  if (candidates.length === 0) {
    return undefined;
  }

  return createFallbackAudioTranscriber(candidates, {
    ...(params?.onLog ? { onLog: params.onLog } : {}),
  });
}
