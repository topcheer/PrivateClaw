import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryRelayClusterClient,
  createInMemoryRelayClusterSharedState,
  type RelayClusterCallbacks,
} from "./relay-cluster.js";

class TestRelayClusterClient extends InMemoryRelayClusterClient {
  async deliver(channel: string, payload: string): Promise<void> {
    await this.handleChannelMessage(channel, payload);
  }
}

function createCallbacks(callLog: string[]): RelayClusterCallbacks {
  return {
    onRemoteAppFrame: async () => {
      callLog.push("app-frame");
    },
    onRemoteProviderFrame: async () => {
      callLog.push("provider-frame");
    },
    onRemoteSessionClosed: async () => {
      callLog.push("session-closed");
    },
    onRemoteAppClosed: async () => {
      callLog.push("app-closed");
    },
    onRemoteAppReconnected: async () => {
      callLog.push("app-reconnected");
    },
    onRemoteProviderReconnected: async () => {
      callLog.push("provider-reconnected");
    },
  };
}

test("relay cluster claimApp rejects malformed stored occupant payloads", async () => {
  const shared = createInMemoryRelayClusterSharedState();
  shared.singleSessionOccupants.set("session-1", "not-json");
  const client = new InMemoryRelayClusterClient(shared, {
    nodeId: "node-a",
    callbacks: createCallbacks([]),
  });

  await assert.rejects(
    client.claimApp({
      sessionId: "session-1",
      appId: "app-1",
      groupMode: false,
    }),
    /Relay cluster occupant payload/,
  );
});

test("relay cluster rejects malformed provider reconnect payloads before invoking callbacks", async () => {
  const callLog: string[] = [];
  const client = new TestRelayClusterClient(
    createInMemoryRelayClusterSharedState(),
    {
      nodeId: "node-a",
      callbacks: createCallbacks(callLog),
    },
  );

  await assert.rejects(
    client.deliver(
      "privateclaw:bus:v1:provider:provider-1:control",
      JSON.stringify({
        kind: "provider_reconnected",
        originNodeId: "node-b",
        targetNodeId: 123,
        providerId: "provider-1",
      }),
    ),
    /Relay provider reconnect payload/,
  );
  assert.deepEqual(callLog, []);
});

test("relay cluster rejects malformed provider frame payloads before invoking callbacks", async () => {
  const callLog: string[] = [];
  const client = new TestRelayClusterClient(
    createInMemoryRelayClusterSharedState(),
    {
      nodeId: "node-a",
      callbacks: createCallbacks(callLog),
    },
  );

  await assert.rejects(
    client.deliver(
      "privateclaw:bus:v1:session:session-1:provider",
      JSON.stringify({
        originNodeId: "node-b",
        sessionId: "session-1",
        envelope: { invalid: true },
      }),
    ),
    /Relay provider frame payload/,
  );
  assert.deepEqual(callLog, []);
});
