import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import {
  applyRelayCliOverrides,
  parseRelayCliArgs,
  renderRelayCliHelp,
  shouldAllowRelayCliPortFallback,
  startRelayServerWithPortFallback,
} from "./relay-cli.js";

test("parseRelayCliArgs accepts serve defaults and public tunnel", () => {
  const parsed = parseRelayCliArgs([
    "serve",
    "--port",
    "9999",
    "--host",
    "0.0.0.0",
    "--web",
    "--public",
    "cloudflare",
  ]);

  assert.equal(parsed.showHelp, false);
  assert.equal(parsed.serveWeb, true);
  assert.equal(parsed.configOverrides.host, "0.0.0.0");
  assert.equal(parsed.configOverrides.port, 9999);
  assert.equal(parsed.publicTunnel, "cloudflare");
});

test("parseRelayCliArgs rejects unsupported public tunnel providers", () => {
  assert.throws(
    () => {
      parseRelayCliArgs(["--public", "ngrok"]);
    },
    /tailscale|cloudflare/,
  );
});

test("applyRelayCliOverrides merges env config with CLI overrides", () => {
  const merged = applyRelayCliOverrides(
    {
      host: "127.0.0.1",
      port: 8787,
      sessionTtlMs: 900_000,
      frameCacheSize: 25,
    },
    {
      port: 9999,
      redisUrl: "redis://127.0.0.1:6379",
    },
  );

  assert.equal(merged.host, "127.0.0.1");
  assert.equal(merged.port, 9999);
  assert.equal(merged.redisUrl, "redis://127.0.0.1:6379");
});

test("renderRelayCliHelp documents the public tunnel flag", () => {
  assert.match(renderRelayCliHelp(), /--web/);
  assert.match(renderRelayCliHelp(), /--public <tailscale\|cloudflare>/);
  assert.match(renderRelayCliHelp(), /privateclaw-relay --web/);
  assert.match(renderRelayCliHelp(), /privateclaw-relay --port 8787 --public tailscale/);
  assert.match(renderRelayCliHelp(), /automatically retries the next free port/);
});

test("shouldAllowRelayCliPortFallback only for the default local port", () => {
  assert.equal(
    shouldAllowRelayCliPortFallback(parseRelayCliArgs([]), {}),
    true,
  );
  assert.equal(
    shouldAllowRelayCliPortFallback(parseRelayCliArgs(["--port", "9999"]), {}),
    false,
  );
  assert.equal(
    shouldAllowRelayCliPortFallback(
      parseRelayCliArgs([]),
      { PRIVATECLAW_RELAY_PORT: "9999" },
    ),
    false,
  );
});

test("startRelayServerWithPortFallback retries the next port when the default is busy", async (t) => {
  const blocker = createServer();
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, "127.0.0.1", () => {
      blocker.removeListener("error", reject);
      resolve();
    });
  });
  const blockerPort = (blocker.address() as AddressInfo).port;

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      blocker.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  const logs: string[] = [];
  const started = await startRelayServerWithPortFallback({
    config: {
      host: "127.0.0.1",
      port: blockerPort,
      sessionTtlMs: 60_000,
      frameCacheSize: 8,
    },
    allowPortFallback: true,
    onLog: (line) => {
      logs.push(line);
    },
  });

  t.after(async () => {
    await started.relayServer.stop();
  });

  assert.notEqual(started.port, blockerPort);
  assert.ok(started.port > blockerPort);
  assert.match(logs.join("\n"), /retrying on/);
});
