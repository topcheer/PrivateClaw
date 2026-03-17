import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { zipSync } from "fflate";
import {
  OpenClawAgentBridge,
  parseOpenClawAgentOutput,
  resolveOpenClawLaunchCommand,
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

test("parseOpenClawAgentOutput accepts alternate text-bearing payload fields", () => {
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [{ message: "pong-from-message" }, { summary: "pong-from-summary" }],
      },
    }),
  );

  assert.deepEqual(result, {
    messages: [{ text: "pong-from-message" }, { text: "pong-from-summary" }],
  });
});

test("parseOpenClawAgentOutput accepts top-level payload arrays from alternate OpenClaw JSON shapes", () => {
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      payloads: [{ text: "pong-from-top-level" }],
      meta: {
        durationMs: 123,
      },
    }),
  );

  assert.equal(result, "pong-from-top-level");
});

test("parseOpenClawAgentOutput prefers tagged structured PrivateClaw responses", () => {
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "Draft text that should not be shown.",
              "<privateclaw-response>",
              JSON.stringify({
                version: 1,
                messages: [{ text: "first-structured" }, { text: "second-structured" }],
                data: { intent: "future-file-pipeline" },
              }),
              "</privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
  );

  assert.deepEqual(result, {
    messages: [{ text: "first-structured" }, { text: "second-structured" }],
    data: { intent: "future-file-pipeline" },
  });
});

test("parseOpenClawAgentOutput tolerates trailing commas inside structured responses", () => {
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "<privateclaw-response>",
              '{"version":1,"messages":[{"text":"voice-reply"},],"data":{}}',
              "</privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
  );

  assert.equal(result, "voice-reply");
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
  const prompt = invokedArgs[4] ?? "";
  assert.deepEqual(invokedArgs.slice(0, 4), [
    "agent",
    "--session-id",
    "privateclaw-session",
    "--message",
  ]);
  assert.match(prompt, /^hello\b/u);
  assert.match(prompt, /PrivateClaw response contract:/u);
  assert.match(prompt, /<privateclaw-response>/u);
  assert.deepEqual(invokedArgs.slice(5), [
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

test("OpenClawAgentBridge emits verbose execution logs when enabled", async () => {
  const logs: string[] = [];

  const bridge = new OpenClawAgentBridge({
    verboseController: { enabled: true },
    onLog: (message) => {
      logs.push(message);
    },
    execFileImpl: (_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify({
          status: "ok",
          result: {
            payloads: [{ text: "verbose-ok" }],
          },
        }),
        "",
      );
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "verbose-session",
    message: "hello",
    history: [],
    invite: {
      version: 1,
      sessionId: "verbose-session",
      sessionKey: "test",
      appWsUrl: "ws://127.0.0.1/app?sessionId=verbose-session",
      expiresAt: new Date().toISOString(),
    },
  });

  assert.equal(result, "verbose-ok");
  assert.ok(
    logs.some((message) => message.includes("[bridge][verbose] exec_start session=verbose-session")),
    "verbose bridge logging should include exec_start details",
  );
  assert.ok(
    logs.some((message) =>
      message.includes("[bridge][verbose] prompt_body_ready session=verbose-session"),
    ),
    "verbose bridge logging should include prompt preparation details",
  );
});

test("resolveOpenClawLaunchCommand reuses the current OpenClaw CLI script on Windows", () => {
  const command = resolveOpenClawLaunchCommand({
    platform: "win32",
    nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
    processArgv: [
      "C:\\Program Files\\nodejs\\node.exe",
      "C:\\Users\\tester\\AppData\\Roaming\\npm\\node_modules\\openclaw\\dist\\cli.js",
    ],
  });

  assert.equal(command.file, "C:\\Program Files\\nodejs\\node.exe");
  assert.deepEqual(command.args, [
    "C:\\Users\\tester\\AppData\\Roaming\\npm\\node_modules\\openclaw\\dist\\cli.js",
  ]);
  assert.equal(command.shell, false);
});

test("OpenClawAgentBridge reports a helpful error when the OpenClaw CLI is missing", async () => {
  const bridge = new OpenClawAgentBridge({
    executable: "missing-openclaw",
    execFileImpl: (_file, _args, _options, callback) => {
      const error = Object.assign(new Error("spawn missing-openclaw ENOENT"), {
        code: "ENOENT",
      });
      callback(error, "", "");
    },
  });

  await assert.rejects(
    bridge.handleUserMessage({
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
    }),
    /Set openclawAgentExecutable or PRIVATECLAW_OPENCLAW_AGENT_BIN/u,
  );
});

test("OpenClawAgentBridge converts side-effect-only slash commands into a friendly note", async () => {
  const bridge = new OpenClawAgentBridge({
    execFileImpl: (_file, _args, _options, callback) => {
      callback(
        null,
        JSON.stringify({
          status: "ok",
          summary: "completed",
          result: {
            payloads: [],
          },
        }),
        "",
      );
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "/tts hello from privateclaw",
    history: [],
    invite: {
      version: 1,
      sessionId: "privateclaw-session",
      sessionKey: "test",
      appWsUrl: "ws://127.0.0.1/app?sessionId=privateclaw-session",
      expiresAt: new Date().toISOString(),
    },
  });

  assert.equal(
    result,
    "OpenClaw completed /tts, but it did not return a text reply through the agent bridge. If the command generated audio, the current PrivateClaw bridge does not surface that audio back into the chat yet.",
  );
});

test("OpenClawAgentBridge recovers assistant text from the session log when agent stdout is incomplete", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-openclaw-state-"));
  const workspaceDir = path.join(stateDir, "workspace");
  const sessionLogPath = path.join(
    stateDir,
    "agents",
    "main",
    "sessions",
    "privateclaw-session.jsonl",
  );
  await fs.mkdir(workspaceDir, { recursive: true });
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const bridge = new OpenClawAgentBridge({
    stateDir,
    workspaceDir,
    execFileImpl: (_file, _args, _options, callback) => {
      void (async () => {
        await fs.mkdir(path.dirname(sessionLogPath), { recursive: true });
        await fs.writeFile(
          sessionLogPath,
          `${JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "pixel.png" }],
              isError: false,
            },
          })}\n`,
          "utf8",
        );
        callback(
          null,
          JSON.stringify({
            result: {
              payloads: [],
            },
          }),
          "",
        );
      })().catch((error) => {
        callback(error instanceof Error ? error : new Error(String(error)), "", "");
      });
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "Reply with the exact filename.",
  });

  assert.equal(result, "pixel.png");
});

test("OpenClawAgentBridge recovers structured assistant text from the session log", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-openclaw-state-"));
  const workspaceDir = path.join(stateDir, "workspace");
  const sessionLogPath = path.join(
    stateDir,
    "agents",
    "main",
    "sessions",
    "privateclaw-session.jsonl",
  );
  await fs.mkdir(workspaceDir, { recursive: true });
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
  });

  const bridge = new OpenClawAgentBridge({
    stateDir,
    workspaceDir,
    execFileImpl: (_file, _args, _options, callback) => {
      void (async () => {
        await fs.mkdir(path.dirname(sessionLogPath), { recursive: true });
        await fs.writeFile(
          sessionLogPath,
          `${JSON.stringify({
            type: "message",
            message: {
              role: "assistant",
              content: [
                 {
                   type: "text",
                   text: [
                     "Interim text that should be ignored.",
                     "<privateclaw-response>",
                     '{"version":1,"messages":[{"text":"pixel.png"},],"data":{"filename":"pixel.png"}}',
                     "</privateclaw-response>",
                   ].join("\n"),
                 },
              ],
              isError: false,
            },
          })}\n`,
          "utf8",
        );
        callback(
          null,
          JSON.stringify({
            result: {
              payloads: [],
            },
          }),
          "",
        );
      })().catch((error) => {
        callback(error instanceof Error ? error : new Error(String(error)), "", "");
      });
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "Reply with the exact filename.",
  });

  assert.deepEqual(result, {
    messages: [{ text: "pixel.png" }],
    data: { filename: "pixel.png" },
  });
});

test("OpenClawAgentBridge bridges TTS audio artifacts from the session log", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-openclaw-state-"));
  const workspaceDir = path.join(stateDir, "workspace");
  const audioDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-tts-audio-"));
  const audioPath = path.join(audioDir, "voice-output.mp3");
  const audioBytes = Buffer.from("ID3-privateclaw-audio");
  const sessionLogPath = path.join(
    stateDir,
    "agents",
    "main",
    "sessions",
    "privateclaw-session.jsonl",
  );
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(audioPath, audioBytes);
  t.after(async () => {
    await fs.rm(stateDir, { recursive: true, force: true });
    await fs.rm(audioDir, { recursive: true, force: true });
  });

  const bridge = new OpenClawAgentBridge({
    stateDir,
    workspaceDir,
    execFileImpl: (_file, _args, _options, callback) => {
      void (async () => {
        await fs.mkdir(path.dirname(sessionLogPath), { recursive: true });
        await fs.writeFile(
          sessionLogPath,
          `${JSON.stringify({
            type: "message",
            message: {
              role: "toolResult",
              toolName: "tts",
              content: [{ type: "text", text: `[[audio_as_voice]]\nMEDIA:${audioPath}` }],
              details: { audioPath },
              isError: false,
            },
          })}\n`,
          "utf8",
        );
        callback(
          null,
          JSON.stringify({
            status: "ok",
            summary: "completed",
            result: {
              payloads: [],
            },
          }),
          "",
        );
      })().catch((error) => {
        callback(error instanceof Error ? error : new Error(String(error)), "", "");
      });
    },
  });

  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-session",
    message: "/tts hello from privateclaw",
    history: [],
    invite: {
      version: 1,
      sessionId: "privateclaw-session",
      sessionKey: "test",
      appWsUrl: "ws://127.0.0.1/app?sessionId=privateclaw-session",
      expiresAt: new Date().toISOString(),
    },
  });

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  assert.equal(result.messages.length, 1);
  const [message] = result.messages;
  assert.equal(typeof message, "object");
  assert(message);
  if (typeof message === "string") {
    assert.fail("Expected an attachment-bearing bridge message.");
  }
  assert.equal(message.text, "");
  assert.equal(message.attachments?.length, 1);
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.equal(attachment.name, "voice-output.mp3");
  assert.equal(attachment.mimeType, "audio/mpeg");
  assert.equal(attachment.sizeBytes, audioBytes.length);
  assert.equal(attachment.dataBase64, audioBytes.toString("base64"));
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
  assert.match(prompt ?? "", /PrivateClaw response contract:/u);
  assert.match(prompt ?? "", /<privateclaw-response>/u);
  assert.equal(result, "attachment-ok");

  const stagedDir = path.join(workspaceDir, "privateclaw", "privateclaw-session");
  const stagedNames = await fs.readdir(stagedDir);
  assert.equal(stagedNames.length, 2);
  assert(stagedNames.some((name) => name.endsWith("-photo.png")));
  assert(stagedNames.some((name) => name.endsWith("-report.pdf")));
});

test("OpenClawAgentBridge transcribes audio attachments through a dedicated STT prompt", async (t) => {
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
            payloads: [{ text: "今天天气不错" }],
          },
        }),
        "",
      );
    },
  });

  const transcript = await bridge.transcribeAudioAttachments({
    sessionId: "privateclaw-session",
    requestId: "voice-message-1",
    attachments: [
      {
        id: "voice-1",
        name: "voice.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 16,
        dataBase64: Buffer.from("audio-bytes").toString("base64"),
      },
    ],
  });

  assert.equal(transcript, "今天天气不错");
  assert.equal(invokedArgs[0], "agent");
  assert.equal(invokedArgs[1], "--session-id");
  assert.match(
    invokedArgs[2] ?? "",
    /^privateclaw-voice-stt-privateclaw-session-voice-message-1$/u,
  );
  assert.equal(invokedArgs[3], "--message");
  const prompt = invokedArgs[4] ?? "";
  assert.match(prompt, /PrivateClaw voice transcription request\./u);
  assert.match(prompt, /Return only the recognized spoken content/u);
  assert.match(
    prompt,
    /workspacePath: privateclaw\/privateclaw-voice-stt-privateclaw-session-voice-message-1\//u,
  );
  assert.match(prompt, /PrivateClaw response contract:/u);
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
