import { parseArgs } from "node:util";
import { RelayCliUserError } from "./cli-error.js";
import { loadRelayConfig, type RelayServerConfig } from "./config.js";
import { offerRelayProviderSetup } from "./provider-setup.js";
import { createRelayServer } from "./relay-server.js";
import {
  ensureRelayTunnelDependencyAvailable,
  ensureRelayTunnelProviderConfigured,
} from "./tunnel-installer.js";
import {
  isRelayTunnelProvider,
  MissingRelayTunnelBinaryError,
  openRelayTunnel,
  RelayTunnelPrerequisiteError,
  type RelayTunnelHandle,
  type RelayTunnelProvider,
} from "./tunnel.js";

const DEFAULT_PORT_FALLBACK_ATTEMPTS = 50;

export interface RelayCliOptions {
  showHelp: boolean;
  configOverrides: Partial<RelayServerConfig>;
  publicTunnel?: RelayTunnelProvider;
}

type RelayServerInstance = ReturnType<typeof createRelayServer>;

interface StartedRelayServer {
  relayServer: RelayServerInstance;
  port: number;
  url: string;
}

interface StartRelayServerWithPortFallbackOptions {
  config: RelayServerConfig;
  allowPortFallback: boolean;
  maxAttempts?: number;
  createRelayServerInstance?: typeof createRelayServer;
  onLog?: (line: string) => void;
}

function parsePositiveIntegerFlag(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

export function renderRelayCliHelp(): string {
  return `privateclaw-relay [serve] [--host <host>] [--port <port>] [--ttl-ms <ms>] [--frame-cache-size <count>] [--redis-url <url>] [--public <tailscale|cloudflare>]

Start the local PrivateClaw relay server.

Examples:
  privateclaw-relay
  privateclaw-relay --port 8787 --public tailscale
  privateclaw-relay serve --host 0.0.0.0 --redis-url redis://127.0.0.1:6379

Notes:
  default local port     automatically retries the next free port when 8787 is busy
  --public tailscale   enables Tailscale Funnel for the relay port
  --public cloudflare  starts a temporary Cloudflare quick tunnel
`;
}

export function parseRelayCliArgs(args: string[]): RelayCliOptions {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      host: { type: "string" },
      port: { type: "string" },
      "ttl-ms": { type: "string" },
      "frame-cache-size": { type: "string" },
      "redis-url": { type: "string" },
      public: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });

  const [command, ...rest] = parsed.positionals;
  if (command === "help") {
    return {
      showHelp: true,
      configOverrides: {},
    };
  }
  if (command && command !== "serve") {
    throw new Error(`Unsupported privateclaw-relay command: ${command}`);
  }
  if (rest.length > 0) {
    throw new Error(`Unexpected extra arguments: ${rest.join(" ")}`);
  }
  if (parsed.values.help) {
    return {
      showHelp: true,
      configOverrides: {},
    };
  }

  const publicTunnelRaw = parsed.values.public?.trim();
  if (publicTunnelRaw && !isRelayTunnelProvider(publicTunnelRaw)) {
    throw new Error(
      `--public must be either "tailscale" or "cloudflare". Received: ${publicTunnelRaw}`,
    );
  }
  const publicTunnel = publicTunnelRaw && isRelayTunnelProvider(publicTunnelRaw)
    ? publicTunnelRaw
    : undefined;

  const port = parsePositiveIntegerFlag(parsed.values.port, "--port");
  const sessionTtlMs = parsePositiveIntegerFlag(
    parsed.values["ttl-ms"],
    "--ttl-ms",
  );
  const frameCacheSize = parsePositiveIntegerFlag(
    parsed.values["frame-cache-size"],
    "--frame-cache-size",
  );

  return {
    showHelp: false,
    configOverrides: {
      ...(parsed.values.host?.trim()
        ? { host: parsed.values.host.trim() }
        : {}),
      ...(typeof port === "number" ? { port } : {}),
      ...(typeof sessionTtlMs === "number" ? { sessionTtlMs } : {}),
      ...(typeof frameCacheSize === "number" ? { frameCacheSize } : {}),
      ...(parsed.values["redis-url"]?.trim()
        ? { redisUrl: parsed.values["redis-url"].trim() }
        : {}),
    },
    ...(publicTunnel ? { publicTunnel } : {}),
  };
}

function isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EADDRINUSE"
  );
}

export function shouldAllowRelayCliPortFallback(
  parsed: RelayCliOptions,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (typeof parsed.configOverrides.port === "number") {
    return false;
  }
  return !(
    env.PRIVATECLAW_RELAY_PORT?.trim() ||
    env.PORT?.trim()
  );
}

export async function startRelayServerWithPortFallback(
  params: StartRelayServerWithPortFallbackOptions,
): Promise<StartedRelayServer> {
  const createRelayServerInstance =
    params.createRelayServerInstance ?? createRelayServer;
  const maxAttempts = params.allowPortFallback
    ? Math.max(1, params.maxAttempts ?? DEFAULT_PORT_FALLBACK_ATTEMPTS)
    : 1;
  let currentPort = params.config.port;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const relayServer = createRelayServerInstance({
      ...params.config,
      port: currentPort,
    });
    try {
      const started = await relayServer.start();
      if (attempt > 0) {
        params.onLog?.(
          `[privateclaw-relay] port ${params.config.port} was unavailable, listening on ${started.port} instead.`,
        );
      }
      return {
        relayServer,
        port: started.port,
        url: started.url,
      };
    } catch (error) {
      await relayServer.stop();
      if (
        !params.allowPortFallback ||
        !isAddressInUseError(error) ||
        currentPort >= 65_535 ||
        attempt + 1 >= maxAttempts
      ) {
        throw error;
      }
      const nextPort = currentPort + 1;
      params.onLog?.(
        `[privateclaw-relay] port ${currentPort} is unavailable, retrying on ${nextPort}.`,
      );
      currentPort = nextPort;
    }
  }

  throw new Error("Relay CLI exhausted its local port fallback attempts.");
}

export function applyRelayCliOverrides(
  config: RelayServerConfig,
  overrides: Partial<RelayServerConfig>,
): RelayServerConfig {
  return {
    ...config,
    ...overrides,
  };
}

export async function runRelayCli(args: string[]): Promise<void> {
  let parsed: RelayCliOptions;
  try {
    parsed = parseRelayCliArgs(args);
  } catch (error) {
    if (error instanceof Error) {
      throw new RelayCliUserError(error.message);
    }
    throw error;
  }
  if (parsed.showHelp) {
    console.log(renderRelayCliHelp());
    return;
  }

  const config = applyRelayCliOverrides(loadRelayConfig(), parsed.configOverrides);
  const allowPortFallback = shouldAllowRelayCliPortFallback(parsed);
  let relayServer: RelayServerInstance | undefined;
  let tunnel: RelayTunnelHandle | undefined;
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    console.log(`[privateclaw-relay] received ${signal}, shutting down`);
    await tunnel?.close();
    await relayServer?.stop();
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  try {
    const startedRelay = await startRelayServerWithPortFallback({
      config,
      allowPortFallback,
      onLog: (line) => {
        console.log(line);
      },
    });
    relayServer = startedRelay.relayServer;
    const { port, url } = startedRelay;
    console.log(`[privateclaw-relay] listening on ${url}`);

    if (!parsed.publicTunnel) {
      return;
    }

    console.log(
      `[privateclaw-relay] exposing the relay to the internet through ${parsed.publicTunnel}.`,
    );
    try {
      tunnel = await openRelayTunnel({
        provider: parsed.publicTunnel,
        localPort: port,
        localUrl: `http://127.0.0.1:${port}`,
        onLog: (line) => {
          console.log(line);
        },
      });
    } catch (error) {
      if (
        parsed.publicTunnel &&
        error instanceof MissingRelayTunnelBinaryError
      ) {
        await ensureRelayTunnelDependencyAvailable({
          provider: parsed.publicTunnel,
          missingDependency: error,
          onLog: (line) => {
            console.log(line);
          },
        });
        console.log(
          `[privateclaw-relay] retrying ${parsed.publicTunnel} setup after installing ${error.command}.`,
        );
        try {
          tunnel = await openRelayTunnel({
            provider: parsed.publicTunnel,
            localPort: port,
            localUrl: `http://127.0.0.1:${port}`,
            onLog: (line) => {
              console.log(line);
            },
          });
        } catch (retryError) {
          if (
            retryError instanceof MissingRelayTunnelBinaryError &&
            retryError.command === error.command
          ) {
            throw new RelayCliUserError(
              `Installed \`${error.command}\`, but it is still unavailable in the current shell PATH. Open a new terminal and run \`privateclaw-relay --public ${parsed.publicTunnel}\` again.`,
            );
          }
          throw retryError;
        }
      } else if (
        parsed.publicTunnel &&
        error instanceof RelayTunnelPrerequisiteError
      ) {
        await ensureRelayTunnelProviderConfigured({
          provider: parsed.publicTunnel,
          summary: error.message,
          onLog: (line) => {
            console.log(line);
          },
        });
        console.log(
          `[privateclaw-relay] retrying ${parsed.publicTunnel} setup after running the recommended configuration commands.`,
        );
        try {
          tunnel = await openRelayTunnel({
            provider: parsed.publicTunnel,
            localPort: port,
            localUrl: `http://127.0.0.1:${port}`,
            onLog: (line) => {
              console.log(line);
            },
          });
        } catch (retryError) {
          if (retryError instanceof RelayTunnelPrerequisiteError) {
            throw new RelayCliUserError(retryError.message);
          }
          throw retryError;
        }
      } else {
        throw error;
      }
    }
    if (tunnel.publicUrl) {
      console.log(`[privateclaw-relay] public URL: ${tunnel.publicUrl}`);
    }
    for (const note of tunnel.notes) {
      console.log(`[privateclaw-relay] ${note}`);
    }
    if (tunnel.publicUrl) {
      await offerRelayProviderSetup({
        relayBaseUrl: tunnel.publicUrl,
        onLog: (line) => {
          console.log(line);
        },
      });
    }
  } catch (error) {
    await tunnel?.close();
    await relayServer?.stop();
    throw error;
  }
}
