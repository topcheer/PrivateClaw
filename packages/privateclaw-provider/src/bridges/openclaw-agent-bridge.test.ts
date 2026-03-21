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

test("parseOpenClawAgentOutput tolerates noisy stdout before the JSON payload", () => {
  const result = parseOpenClawAgentOutput(
    [
      "WARNING: provider fallback emitted a banner before --json output",
      JSON.stringify({
        status: "ok",
        result: {
          payloads: [{ text: "pong-after-noise" }],
        },
      }),
    ].join("\n"),
  );

  assert.equal(result, "pong-after-noise");
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

test("parseOpenClawAgentOutput preserves trimmed inline attachment sizes", () => {
  const base64Data = Buffer.from("hello").toString("base64");
  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "<privateclaw-response>",
              JSON.stringify({
                version: 1,
                messages: [
                  {
                    text: "",
                    attachments: [
                      {
                        name: "hello.txt",
                        mimeType: "text/plain",
                        dataBase64: `  ${base64Data}  `,
                      },
                    ],
                  },
                ],
              }),
              "</privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
  );

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  const [message] = result.messages;
  assert(message && typeof message !== "string");
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.equal(attachment.sizeBytes, 5);
  assert.equal(attachment.dataBase64, base64Data);
});

test("parseOpenClawAgentOutput resolves structured filePath attachments from the workspace", async (t) => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-structured-workspace-"));
  t.after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  const attachmentPath = path.join(workspaceDir, "artifact.txt");
  await fs.writeFile(attachmentPath, "hello from filePath", "utf8");

  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "<privateclaw-response>",
              JSON.stringify({
                version: 1,
                messages: [
                  {
                    text: "",
                    attachments: [
                      {
                        name: "artifact.txt",
                        mimeType: "text/plain",
                        filePath: attachmentPath,
                      },
                    ],
                  },
                ],
              }),
              "</privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
    { workspaceDir },
  );

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  const [message] = result.messages;
  assert(message && typeof message !== "string");
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.equal(attachment.name, "artifact.txt");
  assert.equal(attachment.mimeType, "text/plain");
  assert.equal(attachment.sizeBytes, Buffer.byteLength("hello from filePath"));
  assert.equal(attachment.dataBase64, Buffer.from("hello from filePath").toString("base64"));
});

test("parseOpenClawAgentOutput preserves top-level structured attachments as a follow-up message", async (t) => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-structured-workspace-"));
  t.after(async () => {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  });

  const attachmentPath = path.join(workspaceDir, "tetris.jpg");
  await fs.writeFile(attachmentPath, "top-level attachment bytes", "utf8");

  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "<privateclaw-response>",
              JSON.stringify({
                version: 1,
                messages: [{ text: "搞定啦！截图如下～" }],
                attachments: [
                  {
                    name: "tetris.jpg",
                    mimeType: "image/jpeg",
                    filePath: attachmentPath,
                  },
                ],
              }),
              "</privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
    { workspaceDir },
  );

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  assert.equal(result.messages.length, 2);
  assert.deepEqual(result.messages[0], { text: "搞定啦！截图如下～" });
  const attachmentMessage = result.messages[1];
  assert(attachmentMessage && typeof attachmentMessage !== "string");
  assert.equal(attachmentMessage.text, "");
  const [attachment] = attachmentMessage.attachments ?? [];
  assert(attachment);
  assert.equal(attachment.name, "tetris.jpg");
  assert.equal(attachment.mimeType, "image/jpeg");
  assert.equal(
    attachment.sizeBytes,
    Buffer.byteLength("top-level attachment bytes"),
  );
  assert.equal(
    attachment.dataBase64,
    Buffer.from("top-level attachment bytes").toString("base64"),
  );
});

test("parseOpenClawAgentOutput accepts structured absolute filePath attachments outside the workspace", async (t) => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-structured-workspace-"));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-structured-outside-"));
  t.after(async () => {
    await Promise.all([
      fs.rm(workspaceDir, { recursive: true, force: true }),
      fs.rm(outsideDir, { recursive: true, force: true }),
    ]);
  });

  const outsidePath = path.join(outsideDir, "outside.txt");
  await fs.writeFile(outsidePath, "should stay outside", "utf8");

  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "<privateclaw-response>",
              JSON.stringify({
                version: 1,
                messages: [
                  {
                    text: "workspace-only",
                    attachments: [
                      {
                        name: "outside.txt",
                        mimeType: "text/plain",
                        filePath: outsidePath,
                      },
                    ],
                  },
                ],
              }),
              "</privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
    { workspaceDir },
  );

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  const [message] = result.messages;
  assert(message && typeof message !== "string");
  assert.equal(message.text, "workspace-only");
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.equal(attachment.name, "outside.txt");
  assert.equal(attachment.mimeType, "text/plain");
  assert.equal(attachment.sizeBytes, Buffer.byteLength("should stay outside"));
  assert.equal(attachment.dataBase64, Buffer.from("should stay outside").toString("base64"));
});

test("parseOpenClawAgentOutput tolerates malformed closing tags and qqimg markup inside structured text", async (t) => {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-structured-workspace-"));
  const mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-structured-media-"));
  const imagePath = path.join(mediaDir, "video-frames-001.jpg");
  const imageBytes = Buffer.from("fake-jpg-binary");
  await fs.writeFile(imagePath, imageBytes);
  t.after(async () => {
    await Promise.all([
      fs.rm(workspaceDir, { recursive: true, force: true }),
      fs.rm(mediaDir, { recursive: true, force: true }),
    ]);
  });

  const result = parseOpenClawAgentOutput(
    JSON.stringify({
      status: "ok",
      result: {
        payloads: [
          {
            text: [
              "好的，这是工作区里的一张图片（视频帧提取）：",
              "",
              "<privateclaw-response>",
              JSON.stringify({
                version: 1,
                messages: [
                  {
                    text: [
                      "好的，这是工作区里的一张图片（视频帧提取）：",
                      "",
                      `<qqimg>${imagePath}</qqimg>`,
                      "",
                      "你那边收到图片了吗？🦊",
                    ].join("\n"),
                  },
                ],
                data: {},
              }),
              "<privateclaw-response>",
            ].join("\n"),
          },
        ],
      },
    }),
    { workspaceDir },
  );

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  const [message] = result.messages;
  assert(message && typeof message !== "string");
  assert.equal(message.text, "好的，这是工作区里的一张图片（视频帧提取）：\n\n你那边收到图片了吗？🦊");
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.match(attachment.id, /^structured-attachment-/u);
  assert.equal(attachment.name, "video-frames-001.jpg");
  assert.equal(attachment.mimeType, "image/jpeg");
  assert.equal(attachment.sizeBytes, imageBytes.byteLength);
  assert.equal(attachment.dataBase64, imageBytes.toString("base64"));
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
  assert.match(prompt, /Never put channel-specific markup such as <qqimg>/u);
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

test("OpenClawAgentBridge streams thinking traces from the session log while the agent is running", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-openclaw-state-"));
  const workspaceDir = path.join(stateDir, "workspace");
  const sessionLogPath = path.join(
    stateDir,
    "agents",
    "main",
    "sessions",
    "privateclaw-trace-session.jsonl",
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
        await fs.writeFile(sessionLogPath, "", "utf8");
        await fs.appendFile(
          sessionLogPath,
          JSON.stringify({
            type: "message",
            id: "trace-assistant-1",
            timestamp: "2026-01-01T00:00:00.000Z",
            message: {
              role: "assistant",
              content: [{ type: "text", text: "Planning the reply" }],
              isError: false,
            },
          }),
          "utf8",
        );
        await new Promise((resolve) => setTimeout(resolve, 220));
        await fs.appendFile(sessionLogPath, "\n", "utf8");
        await new Promise((resolve) => setTimeout(resolve, 220));
        await fs.appendFile(
          sessionLogPath,
          `${JSON.stringify({
            type: "message",
            id: "trace-tool-1",
            timestamp: "2026-01-01T00:00:01.000Z",
            message: {
              role: "toolResult",
              toolName: "read",
              content: [{ type: "text", text: "Opened README excerpt" }],
              isError: false,
            },
          })}\n`,
          "utf8",
        );
        await new Promise((resolve) => setTimeout(resolve, 220));
        callback(
          null,
          JSON.stringify({
            status: "ok",
            result: {
              payloads: [
                {
                  text: [
                    "<privateclaw-response>",
                    JSON.stringify({
                      version: 1,
                      messages: [{ text: "Bridge final answer" }],
                    }),
                    "</privateclaw-response>",
                  ].join("\n"),
                },
              ],
            },
          }),
          "",
        );
      })().catch((error) => {
        callback(error instanceof Error ? error : new Error(String(error)), "", "");
      });
    },
  });

  const snapshots: Array<{
    summary: string;
    entryCount: number;
    latestKind?: string;
  }> = [];
  const result = await bridge.handleUserMessage({
    sessionId: "privateclaw-trace-session",
    message: "Reply after reading the README.",
    onThinkingTrace: (snapshot) => {
      snapshots.push({
        summary: snapshot.summary,
        entryCount: snapshot.entries.length,
        latestKind:
          snapshot.entries[
            Math.max(0, snapshot.entries.length - 1)
          ]?.kind,
      });
    },
  });

  assert.equal(result, "Bridge final answer");
  assert.deepEqual(snapshots, [
    {
      summary: "Planning the reply",
      entryCount: 1,
      latestKind: "thought",
    },
    {
      summary: "read: Opened README excerpt",
      entryCount: 2,
      latestKind: "action",
    },
  ]);
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

test("OpenClawAgentBridge recovers structured assistant attachments from absolute media paths in the session log", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-openclaw-state-"));
  const workspaceDir = path.join(stateDir, "workspace");
  const mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-browser-media-"));
  const imagePath = path.join(mediaDir, "slide-01-cover.png");
  const imageBytes = Buffer.from("fake-png-binary");
  const sessionLogPath = path.join(
    stateDir,
    "agents",
    "main",
    "sessions",
    "privateclaw-session.jsonl",
  );
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(imagePath, imageBytes);
  t.after(async () => {
    await Promise.all([
      fs.rm(stateDir, { recursive: true, force: true }),
      fs.rm(mediaDir, { recursive: true, force: true }),
    ]);
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
            id: "assistant-message-1",
            timestamp: "2026-03-18T03:16:12.179Z",
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: [
                    "好了，截图完成！",
                    "",
                    "<privateclaw-response>",
                    JSON.stringify({
                      version: 1,
                      messages: [
                        {
                          text: "做了一个演示稿，给你看封面。",
                          attachments: [
                            {
                              name: "slide-01-cover.png",
                              mimeType: "image/png",
                              filePath: imagePath,
                            },
                          ],
                        },
                      ],
                    }),
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
    message: "Show me the generated slide preview.",
  });

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  const [message] = result.messages;
  assert(message && typeof message !== "string");
  assert.equal(message.text, "做了一个演示稿，给你看封面。");
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.match(attachment.id, /^structured-attachment-/u);
  assert.equal(attachment.name, "slide-01-cover.png");
  assert.equal(attachment.mimeType, "image/png");
  assert.equal(attachment.sizeBytes, imageBytes.byteLength);
  assert.equal(attachment.dataBase64, imageBytes.toString("base64"));
});

test("OpenClawAgentBridge prefers structured session-log replies over earlier stdout text and dedupes recovered artifacts", async (t) => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-openclaw-state-"));
  const workspaceDir = path.join(stateDir, "workspace");
  const mediaDir = await fs.mkdtemp(path.join(os.tmpdir(), "privateclaw-browser-media-"));
  const imagePath = path.join(mediaDir, "google-screenshot.png");
  const imageBytes = Buffer.from("fake-google-screenshot");
  const sessionLogPath = path.join(
    stateDir,
    "agents",
    "main",
    "sessions",
    "privateclaw-session.jsonl",
  );
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(imagePath, imageBytes);
  t.after(async () => {
    await Promise.all([
      fs.rm(stateDir, { recursive: true, force: true }),
      fs.rm(mediaDir, { recursive: true, force: true }),
    ]);
  });

  const bridge = new OpenClawAgentBridge({
    stateDir,
    workspaceDir,
    execFileImpl: (_file, _args, _options, callback) => {
      void (async () => {
        await fs.mkdir(path.dirname(sessionLogPath), { recursive: true });
        await fs.writeFile(
          sessionLogPath,
          [
            JSON.stringify({
              type: "message",
              id: "tool-result-1",
              timestamp: "2026-03-18T08:25:18.564Z",
              message: {
                role: "toolResult",
                toolName: "browser_navigate",
                content: [{ type: "text", text: `MEDIA:${imagePath}` }],
                isError: false,
              },
            }),
            JSON.stringify({
              type: "message",
              id: "assistant-message-1",
              timestamp: "2026-03-18T08:25:29.290Z",
              message: {
                role: "assistant",
                content: [
                  {
                    type: "text",
                    text: [
                      "<privateclaw-response>",
                      JSON.stringify({
                        version: 1,
                        messages: [
                          {
                            text: "已为你打开谷歌并截图",
                            attachments: [
                              {
                                name: "google-screenshot.png",
                                mimeType: "image/png",
                                filePath: imagePath,
                              },
                            ],
                          },
                        ],
                        data: {},
                      }),
                      "</privateclaw-response>",
                    ].join("\n"),
                  },
                ],
                isError: false,
              },
            }),
            "",
          ].join("\n"),
          "utf8",
        );
        callback(
          null,
          JSON.stringify({
            status: "ok",
            result: {
              payloads: [{ text: "我来帮你打开谷歌并截图。" }],
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
    message: "打开谷歌截个图给我",
  });

  if (typeof result === "string") {
    assert.fail("Expected an attachment-bearing bridge response.");
  }
  assert.equal(result.messages.length, 1);
  const [message] = result.messages;
  assert(message && typeof message !== "string");
  assert.equal(message.text, "已为你打开谷歌并截图");
  assert.equal(message.attachments?.length, 1);
  const [attachment] = message.attachments ?? [];
  assert(attachment);
  assert.equal(attachment.name, "google-screenshot.png");
  assert.equal(attachment.mimeType, "image/png");
  assert.equal(attachment.sizeBytes, imageBytes.byteLength);
  assert.equal(attachment.dataBase64, imageBytes.toString("base64"));
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
