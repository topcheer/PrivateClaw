import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import WebSocket, { WebSocketServer } from "ws";
import { RelayProviderClient } from "./relay-provider-client.js";

async function createRelayProviderTestServer(): Promise<{
  server: WebSocketServer;
  providerWsUrl: string;
}> {
  const server = new WebSocketServer({ port: 0 });
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected test WebSocket server to expose a TCP port.");
  }
  return {
    server,
    providerWsUrl: `ws://127.0.0.1:${(address as AddressInfo).port}`,
  };
}

async function closeRelayProviderTestServer(server: WebSocketServer): Promise<void> {
  for (const client of server.clients) {
    client.close();
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function nextClientMessage(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    socket.once("message", (data) => {
      resolve(JSON.parse(data.toString()) as Record<string, unknown>);
    });
    socket.once("error", reject);
  });
}

test("RelayProviderClient createSession resolves when the relay replies", async (t) => {
  const { server, providerWsUrl } = await createRelayProviderTestServer();
  const client = new RelayProviderClient({
    providerWsUrl,
    requestTimeoutMs: 200,
  });

  t.after(async () => {
    await client.dispose();
    await closeRelayProviderTestServer(server);
  });

  server.once("connection", (socket) => {
    socket.send(JSON.stringify({ type: "relay:provider_ready" }));
    socket.once("message", (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      socket.send(
        JSON.stringify({
          type: "relay:session_created",
          requestId: message.requestId,
          sessionId: "session-123",
          expiresAt: "2026-03-20T10:00:00.000Z",
        }),
      );
    });
  });

  const created = await client.createSession(60_000, "demo", false);
  assert.deepEqual(created, {
    sessionId: "session-123",
    expiresAt: "2026-03-20T10:00:00.000Z",
  });
});

test("RelayProviderClient createSession rejects when the relay never replies", async (t) => {
  const { server, providerWsUrl } = await createRelayProviderTestServer();
  const client = new RelayProviderClient({
    providerWsUrl,
    requestTimeoutMs: 30,
  });

  t.after(async () => {
    await client.dispose();
    await closeRelayProviderTestServer(server);
  });

  server.once("connection", (socket) => {
    socket.send(JSON.stringify({ type: "relay:provider_ready" }));
    socket.on("message", () => {
      // Intentionally ignore the request to exercise the timeout path.
    });
  });

  await assert.rejects(
    client.createSession(),
    /Timed out waiting for relay to create a session after 30ms\./,
  );
});

test("RelayProviderClient renewSession rejects when the relay never replies", async (t) => {
  const { server, providerWsUrl } = await createRelayProviderTestServer();
  const client = new RelayProviderClient({
    providerWsUrl,
    requestTimeoutMs: 30,
  });

  t.after(async () => {
    await client.dispose();
    await closeRelayProviderTestServer(server);
  });

  server.once("connection", (socket) => {
    socket.send(JSON.stringify({ type: "relay:provider_ready" }));
    socket.on("message", () => {
      // Intentionally ignore the request to exercise the timeout path.
    });
  });

  await assert.rejects(
    client.renewSession("session-timeout", 60_000),
    /Timed out waiting for relay to renew session session-timeout after 30ms\./,
  );
});

test("RelayProviderClient clears pending request timeouts when the socket closes", async (t) => {
  const { server, providerWsUrl } = await createRelayProviderTestServer();
  const client = new RelayProviderClient({
    providerWsUrl,
    requestTimeoutMs: 1_000,
  });

  t.after(async () => {
    await client.dispose();
    await closeRelayProviderTestServer(server);
  });

  server.once("connection", (socket) => {
    socket.send(JSON.stringify({ type: "relay:provider_ready" }));
    void nextClientMessage(socket).then(() => {
      socket.close();
    });
  });

  await assert.rejects(
    client.createSession(),
    /Relay provider socket closed\./,
  );
});
