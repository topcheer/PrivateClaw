import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zipSync } from "fflate";
import {
  OpenClawAgentBridge,
  parseOpenClawAgentOutput,
} from "./openclaw-agent-bridge.js";

test("parseOpenClawAgentOutput returns a string for a single payload", () => {
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [{ text: "pong" }],
      },
    }),
  );

  assert.equal(result, "pong");
});

test("parseOpenClawAgentOutput returns multi-message response for multiple payloads", () => {
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [{ text: "first" }, { text: "second" }],
      },
    }),
  );

  assert.deepEqual(result, { messages: [{ text: "first" }, { text: "second" }] });
});

test("OpenClawAgentBridge invokes openclaw agent with session-aware arguments", async () => {
  let invokedFile = "";
  let invokedArgs: string[] = [];

  const bridge = new OpenClawAgentBridge({
    executable: "openclaw-custom",
    agentId: "ops",
    channel: "discord",
    thinking: "low",
    timeoutSeconds: 30,
    execFileImpl: (file, args, _options, callback) => {
      invokedFile = file;
      invokedArgs = args;
      callback(
        null,
        JSON.stringify({
          status: "ok",
          result: {
            payloads: [{ text: "bridge-ok" }],
          },
        }),
        "",
      );
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "hello",
    history: [],
    invite: {
      version: 1,
      sessionId: "privateclaw-session",
      sessionKey: "test",
      appWsUrl: "ws://127.0.0.1/app?sessionId=privateclaw-session",
      expiresAt: new Date().toISOString(),
    },
  });

  assert.equal(invokedFile, "openclaw-custom");
  assert.deepEqual(invokedArgs, [
    "agent",
    "--session-id",
    "privateclaw-session",
    "--message",
    "hello",
    "--json",
    "--agent",
    "ops",
    "--channel",
    "discord",
    "--thinking",
    "low",
    "--timeout",
    "30",
  ]);
  assert.equal(result, "bridge-ok");
});

test("OpenClawAgentBridge stages image and PDF attachments with tool hints", async (t) => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-bridge-"));
  t.after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  let invokedArgs: string[] = [];
  const bridge = new OpenClawAgentBridge({
    workspaceDir,
    execFileImpl: (_file, args, _options, callback) => {
      invokedArgs = args;
      callback(
        null,
        JSON.stringify({
          status: "ok",
          result: {
            payloads: [{ text: "attachment-ok" }],
          },
        }),
        "",
      );
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "Please inspect these files.",
    attachments: [
      {
        id: "image-1",
        name: "photo.png",
        mimeType: "image/png",
        sizeBytes: 16,
        dataBase64: Buffer.from("image-bytes").toString("base64"),
      },
      {
        id: "pdf-1",
        name: "report.pdf",
        mimeType: "application/pdf",
        sizeBytes: 16,
        dataBase64: Buffer.from("%PDF-1.7").toString("base64"),
      },
    ],
    history: [],
    invite: {
      version: 1,
      sessionId: "privateclaw-session",
      sessionKey: "test",
      appWsUrl: "ws://127.0.0.1/app?sessionId=privateclaw-session",
      expiresAt: new Date().toISOString(),
    },
  });

  const prompt = invokedArgs[4];
  assert.equal(invokedArgs[0], "agent");
  assert.equal(invokedArgs[1], "--session-id");
  assert.equal(invokedArgs[2], "privateclaw-session");
  assert.equal(invokedArgs[3], "--message");
  assert.match(prompt ?? "", /PrivateClaw staged the attachments into the OpenClaw workspace\./u);
  assert.match(prompt ?? "", /Use the image tool with "privateclaw\/privateclaw-session\//u);
  assert.match(prompt ?? "", /Use the pdf tool with "privateclaw\/privateclaw-session\//u);
  assert.equal(result, "attachment-ok");

  const stagedDir = path.join(workspaceDir, "privateclaw", "privateclaw-session");
  const stagedNames = await fs.readdir(stagedDir);
  assert.equal(stagedNames.length, 2);
  assert(stagedNames.some((name) => name.endsWith("-photo.png")));
  assert(stagedNames.some((name) => name.endsWith("-report.pdf")));
});

test("OpenClawAgentBridge extracts DOCX text and points the agent at the staged text file", async (t) => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-bridge-"));
  t.after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  let invokedArgs: string[] = [];
  const bridge = new OpenClawAgentBridge({
    workspaceDir,
    execFileImpl: (_file, args, _options, callback) => {
      invokedArgs = args;
      callback(
        null,
        JSON.stringify({
          status: "ok",
          result: {
            payloads: [{ text: "docx-ok" }],
          },
        }),
        "",
      );
    },
  });

  const docxBytes = buildMinimalDocx("Hello from DOCX");
  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "",
    attachments: [
      {
        id: "docx-1",
        name: "spec.docx",
        mimeType: "application/octet-stream",
        sizeBytes: docxBytes.length,
        dataBase64: docxBytes.toString("base64"),
      },
    ],
    history: [],
    invite: {
      version: 1,
      sessionId: "privateclaw-session",
      sessionKey: "test",
      appWsUrl: "ws://127.0.0.1/app?sessionId=privateclaw-session",
      expiresAt: new Date().toISOString(),
    },
  });

  const prompt = invokedArgs[4] ?? "";
  assert.match(
    prompt,
    /The user sent one or more file attachments without additional text\./u,
  );
  assert.match(prompt, /extractedTextPath: privateclaw\/privateclaw-session\//u);
  assert.match(prompt, /Read "privateclaw\/privateclaw-session\/.*\.extracted\.txt" first/u);

  const stagedDir = path.join(workspaceDir, "privateclaw", "privateclaw-session");
  const stagedNames = await fs.readdir(stagedDir);
  const extractedTextName = stagedNames.find((name) => name.endsWith(".extracted.txt"));
  assert.ok(extractedTextName);
  const extractedText = await fs.readFile(path.join(stagedDir, extractedTextName), "utf8");
  assert.match(extractedText, /Hello from DOCX/u);
  assert.equal(result, "docx-ok");
});

function buildMinimalDocx(text: string): Buffer {
  const archive = zipSync({
    "word/document.xml": strToBytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>
        </w:body>
      </w:document>`),
  });
  return Buffer.from(archive);
}

function strToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
