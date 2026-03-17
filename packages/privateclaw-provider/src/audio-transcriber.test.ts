import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  buildPreferredAudioTranscriber,
  createOpenAICompatibleAudioTranscriber,
  resolvePrivateClawSttConfig,
} from "./audio-transcriber.js";

test("resolvePrivateClawSttConfig reads the default OpenClaw audio model config", () => {
  const resolved = resolvePrivateClawSttConfig({
    rootConfig: {
      tools: {
        media: {
          audio: {
            models: [{ provider: "openai", model: "gpt-4o-mini-transcribe" }],
          },
        },
      },
      models: {
        providers: {
          openai: {
            baseUrl: "https://api.example.com/v1/",
            apiKey: "test-key",
          },
        },
      },
    },
  });

  assert.deepEqual(resolved, {
    baseUrl: "https://api.example.com/v1",
    apiKey: "test-key",
    headers: {
      Authorization: "Bearer test-key",
    },
    model: "gpt-4o-mini-transcribe",
  });
});

test("resolvePrivateClawSttConfig accepts inline audio-model headers", () => {
  const resolved = resolvePrivateClawSttConfig({
    rootConfig: {
      tools: {
        media: {
          audio: {
            models: [
              {
                baseUrl: "http://127.0.0.1:8090/",
                model: "whisper-1",
                headers: {
                  Authorization: "Bearer local",
                  "X-PrivateClaw-Test": "enabled",
                },
              },
            ],
          },
        },
      },
    },
  });

  assert.deepEqual(resolved, {
    baseUrl: "http://127.0.0.1:8090",
    model: "whisper-1",
    headers: {
      Authorization: "Bearer local",
      "X-PrivateClaw-Test": "enabled",
    },
  });
});

test("OpenAI-compatible audio transcriber posts audio attachments to /audio/transcriptions", async (t) => {
  const requests: Array<{
    url: string;
    authorization: string | undefined;
    privateClawTestHeader: string | undefined;
    contentType: string | undefined;
    body: string;
  }> = [];
  const server = createServer((request, response) => {
    void (async () => {
      const bodyChunks: Buffer[] = [];
      for await (const chunk of request) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      requests.push({
        url: request.url ?? "",
        authorization: request.headers.authorization,
        privateClawTestHeader: request.headers["x-privateclaw-test"] as
          | string
          | undefined,
        contentType: request.headers["content-type"],
        body: Buffer.concat(bodyChunks).toString("utf8"),
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ text: `transcript-${requests.length}` }));
    })().catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an AddressInfo from the test server.");
  }
  t.after(() => {
    server.close();
  });

  const transcriber = createOpenAICompatibleAudioTranscriber({
    baseUrl: `http://127.0.0.1:${address.port}`,
    apiKey: "audio-key",
    headers: {
      Authorization: "Bearer audio-key",
      "X-PrivateClaw-Test": "enabled",
    },
    model: "whisper-1",
  });
  const transcript = await transcriber.transcribeAudioAttachments({
    sessionId: "privateclaw-session",
    requestId: "voice-request",
    attachments: [
      {
        id: "voice-1",
        name: "voice-a.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 4,
        dataBase64: Buffer.from("AAAA").toString("base64"),
      },
      {
        id: "voice-2",
        name: "voice-b.mp3",
        mimeType: "audio/mpeg",
        sizeBytes: 4,
        dataBase64: Buffer.from("BBBB").toString("base64"),
      },
    ],
  });

  assert.equal(transcript, "transcript-1\n\ntranscript-2");
  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.url, "/audio/transcriptions");
  assert.equal(requests[0]?.authorization, "Bearer audio-key");
  assert.equal(requests[0]?.privateClawTestHeader, "enabled");
  assert.match(requests[0]?.contentType ?? "", /^multipart\/form-data; boundary=/u);
  assert.match(requests[0]?.body ?? "", /name="model"\r\n\r\nwhisper-1/u);
  assert.match(requests[0]?.body ?? "", /filename="voice-a\.m4a"/u);
  assert.match(requests[1]?.body ?? "", /filename="voice-b\.mp3"/u);
});

test("buildPreferredAudioTranscriber prefers whisper CLI over configured direct STT", async (t) => {
  let directRequestCount = 0;
  const server = createServer((request, response) => {
    void (async () => {
      directRequestCount += 1;
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ text: "direct transcript" }));
    })().catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an AddressInfo from the whisper-preference test server.");
  }
  t.after(() => {
    server.close();
  });

  const transcriber = buildPreferredAudioTranscriber({
    env: {
      PRIVATECLAW_STT_BASE_URL: `http://127.0.0.1:${address.port}`,
      PRIVATECLAW_STT_MODEL: "whisper-1",
    },
    whisperSpawnSyncImpl: (() =>
      ({
        pid: 123,
        output: [null, "usage: whisper\n", ""],
        stdout: "usage: whisper\n",
        stderr: "",
        status: 0,
        signal: null,
      }) as ReturnType<typeof import("node:child_process").spawnSync>),
    whisperExecFileImpl: (_file, args, _options, callback) => {
      const inputPath = args[0];
      const outputDirIndex = args.indexOf("--output_dir");
      const outputDir = outputDirIndex >= 0 ? args[outputDirIndex + 1] : undefined;
      if (!inputPath || !outputDir) {
        callback(new Error("Missing whisper CLI arguments."));
        return;
      }
      const outputPath = path.join(
        outputDir,
        `${path.basename(inputPath, path.extname(inputPath))}.json`,
      );
      void writeFile(outputPath, JSON.stringify({ text: "whisper transcript" }), "utf8")
        .then(() => {
          callback(null, "", "");
        })
        .catch((error) => {
          callback(error as Error, "", "");
        });
    },
  });
  assert.ok(transcriber);

  const transcript = await transcriber.transcribeAudioAttachments({
    sessionId: "privateclaw-session",
    requestId: "voice-request-whisper",
    attachments: [
      {
        id: "voice-1",
        name: "voice-a.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 4,
        dataBase64: Buffer.from("AAAA").toString("base64"),
      },
    ],
  });

  assert.equal(transcript, "whisper transcript");
  assert.equal(directRequestCount, 0);
});

test("buildPreferredAudioTranscriber falls back from whisper CLI to configured direct STT", async (t) => {
  let directRequestCount = 0;
  const server = createServer((request, response) => {
    void (async () => {
      const bodyChunks: Buffer[] = [];
      for await (const chunk of request) {
        bodyChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      directRequestCount += 1;
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ text: "direct transcript" }));
    })().catch((error) => {
      response.statusCode = 500;
      response.end(String(error));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected an AddressInfo from the whisper-fallback test server.");
  }
  t.after(() => {
    server.close();
  });

  const transcriber = buildPreferredAudioTranscriber({
    env: {
      PRIVATECLAW_STT_BASE_URL: `http://127.0.0.1:${address.port}`,
      PRIVATECLAW_STT_MODEL: "whisper-1",
    },
    whisperSpawnSyncImpl: (() =>
      ({
        pid: 123,
        output: [null, "usage: whisper\n", ""],
        stdout: "usage: whisper\n",
        stderr: "",
        status: 0,
        signal: null,
      }) as ReturnType<typeof import("node:child_process").spawnSync>),
    whisperExecFileImpl: (_file, _args, _options, callback) => {
      callback(new Error("whisper crashed"), "", "whisper crashed");
    },
  });
  assert.ok(transcriber);

  const transcript = await transcriber.transcribeAudioAttachments({
    sessionId: "privateclaw-session",
    requestId: "voice-request-fallback",
    attachments: [
      {
        id: "voice-1",
        name: "voice-a.m4a",
        mimeType: "audio/mp4",
        sizeBytes: 4,
        dataBase64: Buffer.from("AAAA").toString("base64"),
      },
    ],
  });

  assert.equal(transcript, "direct transcript");
  assert.equal(directRequestCount, 1);
});
