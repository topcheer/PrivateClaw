import type { PrivateClawAttachment } from "@privateclaw/protocol";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import type { BridgeResponse, PrivateClawAgentBridge } from "../types.js";

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

interface NormalizedBridgeMessage {
  readonly text: string;
  readonly attachments?: PrivateClawAttachment[];
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

export function parseOpenClawAgentOutput(stdout: string): BridgeResponse {
  const parsed = parseOpenClawAgentJson(stdout);
  return parseOpenClawAgentResult(parsed);
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
  return JSON.parse(stdout) as OpenClawAgentJsonResult;
}

function parseOpenClawAgentResult(parsed: OpenClawAgentJsonResult): BridgeResponse {
  const messages = extractDisplayMessages(parsed);
  return toBridgeResponse(messages);
}

function extractDisplayMessages(parsed: OpenClawAgentJsonResult): NormalizedBridgeMessage[] {
  if (parsed.status !== "ok") {
    throw new Error(
      `OpenClaw agent bridge returned status ${parsed.status ?? "unknown"}${parsed.summary ? ` (${parsed.summary})` : ""}.`,
    );
  }

  const messages =
    parsed.result?.payloads
      ?.flatMap((payload) =>
        [payload.text, payload.message, payload.summary].flatMap((candidate) =>
          typeof candidate === "string" && candidate.trim() !== ""
            ? [{ text: candidate }]
            : [],
        ),
      ) ?? [];

  if (messages.length === 0) {
    throw new OpenClawAgentNoDisplayPayloadError(parsed);
  }

  return messages;
}

export class OpenClawAgentBridge implements PrivateClawAgentBridge {
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

  async handleUserMessage(params: {
    sessionId: string;
    message: string;
    attachments?: ReadonlyArray<PrivateClawAttachment>;
  }): Promise<BridgeResponse> {
    const promptMessage = await this.buildPromptMessage(
      params.sessionId,
      params.message,
      params.attachments,
    );
    const args = this.buildArgs(params.sessionId, promptMessage);
    const sessionLogCursor = await this.captureSessionLogCursor(params.sessionId);
    const stdout = await this.execOpenClaw(args);
    const parsed = parseOpenClawAgentJson(stdout);
    const artifactMessages = await this.collectArtifactMessages(
      params.sessionId,
      sessionLogCursor,
    );
    try {
      const response = parseOpenClawAgentResult(parsed);
      return mergeBridgeResponses(response, artifactMessages);
    } catch (error) {
      if (error instanceof OpenClawAgentNoDisplayPayloadError) {
        if (artifactMessages.length > 0) {
          return toBridgeResponse(artifactMessages);
        }
        return buildNoDisplayPayloadNotice(params.message, error.parsed);
      }
      throw error;
    }
  }

  private async captureSessionLogCursor(sessionId: string): Promise<OpenClawSessionLogCursor> {
    const sessionLogPath = await this.resolveSessionLogPath(sessionId);
    if (!sessionLogPath) {
      return { sizeBytes: 0 };
    }

    const stat = await fs.stat(sessionLogPath);
    return {
      path: sessionLogPath,
      sizeBytes: stat.size,
    };
  }

  private async collectArtifactMessages(
    sessionId: string,
    cursor: OpenClawSessionLogCursor,
  ): Promise<NormalizedBridgeMessage[]> {
    const sessionLogPath = cursor.path ?? (await this.resolveSessionLogPath(sessionId));
    if (!sessionLogPath) {
      return [];
    }

    const sessionLogBuffer = await fs.readFile(sessionLogPath);
    const deltaBuffer =
      cursor.path === sessionLogPath
        ? sessionLogBuffer.subarray(Math.min(cursor.sizeBytes, sessionLogBuffer.length))
        : sessionLogBuffer;
    if (deltaBuffer.length === 0) {
      return [];
    }

    const entries = deltaBuffer
      .toString("utf8")
      .split(/\r?\n/gu)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as OpenClawSessionLogEntry);

    const seenPaths = new Set<string>();
    const attachments: PrivateClawAttachment[] = [];
    for (const entry of entries) {
      for (const mediaPath of extractMediaPaths(entry)) {
        const normalizedPath = normalizeMediaPath(mediaPath);
        if (seenPaths.has(normalizedPath)) {
          continue;
        }
        attachments.push(await buildAttachmentFromMediaPath(normalizedPath));
        seenPaths.add(normalizedPath);
      }
    }

    if (attachments.length === 0) {
      return [];
    }

    return [{ text: "", attachments }];
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

    return undefined;
  }

  private async buildPromptMessage(
    sessionId: string,
    message: string,
    attachments?: ReadonlyArray<PrivateClawAttachment>,
  ): Promise<string> {
    const trimmed = message.trim();
    const stagedAttachments = await this.stageAttachments(sessionId, attachments);

    if (stagedAttachments.length === 0) {
      return trimmed;
    }

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

    return lines.join("\n");
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

    const staged: StagedAttachment[] = [];
    for (const attachment of attachments) {
      const dataBase64 = attachment.dataBase64?.trim();
      if (!dataBase64) {
        continue;
      }

      const effectiveMimeType = resolveAttachmentMimeType(attachment);
      const uniqueFileName = `${Date.now()}-${randomUUID().slice(0, 8)}-${sanitizeFileName(attachment.name)}`;
      const absolutePath = path.join(sessionDir, uniqueFileName);
      const rawBytes = Buffer.from(dataBase64, "base64");
      await fs.writeFile(absolutePath, rawBytes);

      const workspacePath = toWorkspacePath(this.workspaceDir, absolutePath);
      const kind = classifyAttachmentKind(attachment.name, effectiveMimeType);
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
      }

      staged.push({
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
      });
    }

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
  if (supplemental.length === 0) {
    return primary;
  }

  return toBridgeResponse([
    ...normalizeBridgeResponse(primary),
    ...supplemental,
  ]);
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

function toBridgeResponse(messages: NormalizedBridgeMessage[]): BridgeResponse {
  if (messages.length === 1) {
    const [message] = messages;
    if (!message) {
      throw new Error("Bridge response did not contain any messages.");
    }
    if (!message.attachments || message.attachments.length === 0) {
      return message.text;
    }
  }

  return {
    messages: messages.map((message) =>
      message.attachments && message.attachments.length > 0
        ? message
        : { text: message.text },
    ),
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

async function buildAttachmentFromMediaPath(mediaPath: string): Promise<PrivateClawAttachment> {
  const filePath = normalizeMediaPath(mediaPath);
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

function normalizeMediaPath(mediaPath: string): string {
  const trimmed = mediaPath.trim();
  if (trimmed.startsWith("file://")) {
    return fileURLToPath(trimmed);
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(trimmed);
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

function inferMimeTypeFromFileName(fileName: string): string | undefined {
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
