import assert from "node:assert/strict";
import test from "node:test";
import { resolveRelayEndpoints } from "./relay-endpoints.js";

test("resolveRelayEndpoints normalizes secure relay base URLs", () => {
  assert.deepEqual(resolveRelayEndpoints("https://relay.example.com/base?ignored=1"), {
    providerWsUrl: "wss://relay.example.com/ws/provider",
    appWsUrl: "wss://relay.example.com/ws/app",
  });
});

test("resolveRelayEndpoints accepts bare host:port values", () => {
  assert.deepEqual(resolveRelayEndpoints("127.0.0.1:8787"), {
    providerWsUrl: "ws://127.0.0.1:8787/ws/provider",
    appWsUrl: "ws://127.0.0.1:8787/ws/app",
  });
});
