import { loadRelayConfig } from "./config.js";
import { createRelayServer } from "./relay-server.js";

const relayServer = createRelayServer(loadRelayConfig());
const { url } = await relayServer.start();

console.log(`[privateclaw-relay] listening on ${url}`);

async function shutdown(signal: string): Promise<void> {
  console.log(`[privateclaw-relay] received ${signal}, shutting down`);
  await relayServer.stop();
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
