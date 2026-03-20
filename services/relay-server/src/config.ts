export interface RelayServerConfig {
  host: string;
  port: number;
  sessionTtlMs: number;
  frameCacheSize: number;
  maxMessageBytes?: number;
  appMessagesPerMinute?: number;
  providerMessagesPerMinute?: number;
  webRootDir?: string;
  instanceId?: string;
  redisUrl?: string;
  fcmServiceAccountJson?: string;
  fcmProjectId?: string;
  fcmClientEmail?: string;
  fcmPrivateKey?: string;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  label: string,
): number {
  if (!value || value.trim() === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return parsed;
}

export function loadRelayConfig(env: NodeJS.ProcessEnv = process.env): RelayServerConfig {
  const host = env.PRIVATECLAW_RELAY_HOST?.trim() || "127.0.0.1";
  const port = parsePositiveInteger(
    env.PRIVATECLAW_RELAY_PORT?.trim() || env.PORT?.trim(),
    8787,
    "PRIVATECLAW_RELAY_PORT",
  );
  const sessionTtlMs = parsePositiveInteger(
    env.PRIVATECLAW_SESSION_TTL_MS,
    15 * 60 * 1000,
    "PRIVATECLAW_SESSION_TTL_MS",
  );
  const frameCacheSize = parsePositiveInteger(
    env.PRIVATECLAW_FRAME_CACHE_SIZE,
    25,
    "PRIVATECLAW_FRAME_CACHE_SIZE",
  );
  const maxMessageBytes = parsePositiveInteger(
    env.PRIVATECLAW_MAX_MESSAGE_BYTES,
    24 * 1024 * 1024,
    "PRIVATECLAW_MAX_MESSAGE_BYTES",
  );
  const appMessagesPerMinute = parsePositiveInteger(
    env.PRIVATECLAW_APP_MESSAGES_PER_MINUTE,
    120,
    "PRIVATECLAW_APP_MESSAGES_PER_MINUTE",
  );
  const providerMessagesPerMinute = parsePositiveInteger(
    env.PRIVATECLAW_PROVIDER_MESSAGES_PER_MINUTE,
    600,
    "PRIVATECLAW_PROVIDER_MESSAGES_PER_MINUTE",
  );
  const instanceId =
    env.PRIVATECLAW_RELAY_INSTANCE_ID?.trim() ||
    env.RAILWAY_REPLICA_ID?.trim();
  const redisUrl = env.PRIVATECLAW_REDIS_URL?.trim() || env.REDIS_URL?.trim();
  const fcmServiceAccountJson =
    env.PRIVATECLAW_FCM_SERVICE_ACCOUNT_JSON?.trim();
  const fcmProjectId = env.PRIVATECLAW_FCM_PROJECT_ID?.trim();
  const fcmClientEmail = env.PRIVATECLAW_FCM_CLIENT_EMAIL?.trim();
  const fcmPrivateKey = env.PRIVATECLAW_FCM_PRIVATE_KEY?.trim();

  return {
    host,
    port,
    sessionTtlMs,
    frameCacheSize,
    maxMessageBytes,
    appMessagesPerMinute,
    providerMessagesPerMinute,
    ...(instanceId ? { instanceId } : {}),
    ...(redisUrl ? { redisUrl } : {}),
    ...(fcmServiceAccountJson ? { fcmServiceAccountJson } : {}),
    ...(fcmProjectId ? { fcmProjectId } : {}),
    ...(fcmClientEmail ? { fcmClientEmail } : {}),
    ...(fcmPrivateKey ? { fcmPrivateKey } : {}),
  };
}
