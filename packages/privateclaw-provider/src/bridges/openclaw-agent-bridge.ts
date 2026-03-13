import type { PrivateClawAttachment } from "@privateclaw/protocol";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";
import type { BridgeResponse, PrivateClawAgentBridge } from "../types.js";

type OpenClawThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

interface OpenClawAgentBridgeExecOptions {
  maxBuffer: number;
}

type OpenClawAgentExecFile = (
  file: string,
  args: string[],
  options: OpenClawAgentBridgeExecOptions,
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => void;

interface OpenClawAgentPayload {
  text?: string | null;
}

interface OpenClawAgentJsonResult {
  status?: string;
  summary?: string;
  result?: {
    payloads?: OpenClawAgentPayload[];
  };
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
  workspaceDir?: string;
  execFileImpl?: OpenClawAgentExecFile;
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
  const parsed = JSON.parse(stdout) as OpenClawAgentJsonResult;
  return parseOpenClawAgentResult(parsed);
}

function parseOpenClawAgentResult(parsed: OpenClawAgentJsonResult): BridgeResponse {
  if (parsed.status !== "ok") {
    throw new Error(
      `OpenClaw agent bridge returned status ${parsed.status ?? "unknown"}${parsed.summary ? ` (${parsed.summary})` : ""}.`,
    );
  }

  const messages =
    parsed.result?.payloads
      ?.flatMap((payload) =>
        typeof payload.text === "string" && payload.text.trim() !== ""
          ? [{ text: payload.text }]
          : [],
      ) ?? [];

  if (messages.length === 0) {
    throw new Error("OpenClaw agent bridge returned no text payloads.");
  }

  if (messages.length === 1) {
    const [message] = messages;
    if (!message) {
      throw new Error("OpenClaw agent bridge returned no text payloads.");
    }
    return message.text;
  }

  return { messages };
}

export class OpenClawAgentBridge implements PrivateClawAgentBridge {
  private readonly executable: string;
  private readonly execFileImpl: OpenClawAgentExecFile;
  private readonly workspaceDir: string;

  constructor(private readonly options: OpenClawAgentBridgeOptions = {}) {
    this.executable = options.executable ?? "openclaw";
    this.execFileImpl = options.execFileImpl ?? execFile;
    this.workspaceDir = options.workspaceDir ?? DEFAULT_WORKSPACE_DIR;
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
    const stdout = await this.execOpenClaw(args);
    return parseOpenClawAgentOutput(stdout);
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
        args,
        { maxBuffer: DEFAULT_MAX_BUFFER },
        (error, stdout, stderr) => {
          if (error) {
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
