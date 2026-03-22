import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  RelayAdminMetricsStore,
  RelayAdminSessionListOptions,
  RelayAdminSessionStatus,
} from "./admin-metrics-store.js";

export interface HandleRelayAdminRequestOptions {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  adminToken?: string;
  metricsStore: RelayAdminMetricsStore;
  now?: () => number;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function normalizeBearerToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }
  const match = headerValue.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return undefined;
  }
  return match[1]?.trim() || undefined;
}

function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  const headerValue = request.headers.authorization;
  if (typeof headerValue !== "string") {
    return false;
  }
  return normalizeBearerToken(headerValue) === expectedToken;
}

function parsePositiveInteger(
  rawValue: string | null,
  fallback: number,
): number {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseStatus(rawValue: string | null): RelayAdminSessionListOptions["status"] {
  if (!rawValue || rawValue === "all") {
    return "all";
  }
  if (
    rawValue === "active" ||
    rawValue === "closed" ||
    rawValue === "expired"
  ) {
    return rawValue as RelayAdminSessionStatus;
  }
  return "all";
}

export async function handleRelayAdminRequest(
  options: HandleRelayAdminRequestOptions,
): Promise<boolean> {
  if (!options.url.pathname.startsWith("/api/admin")) {
    return false;
  }

  if (!options.adminToken) {
    writeJson(options.response, 404, { error: "not_found" });
    return true;
  }

  if (options.request.method !== "GET") {
    options.response.writeHead(405, {
      "content-type": "application/json",
      allow: "GET",
    });
    options.response.end(JSON.stringify({ error: "method_not_allowed" }));
    return true;
  }

  if (!isAuthorized(options.request, options.adminToken)) {
    options.response.writeHead(401, {
      "content-type": "application/json",
      "www-authenticate": 'Bearer realm="PrivateClaw Relay Admin"',
    });
    options.response.end(JSON.stringify({ error: "unauthorized" }));
    return true;
  }

  const now = options.now?.() ?? Date.now();

  if (
    options.url.pathname === "/api/admin" ||
    options.url.pathname === "/api/admin/overview"
  ) {
    writeJson(options.response, 200, await options.metricsStore.getOverview(now));
    return true;
  }

  if (options.url.pathname === "/api/admin/sessions") {
    const page = parsePositiveInteger(options.url.searchParams.get("page"), 1);
    const pageSize = parsePositiveInteger(
      options.url.searchParams.get("pageSize"),
      50,
    );
    const query = options.url.searchParams.get("query") ?? undefined;
    const status = parseStatus(options.url.searchParams.get("status"));
    writeJson(
      options.response,
      200,
      await options.metricsStore.listSessions({
        page,
        pageSize,
        ...(query ? { query } : {}),
        ...(status ? { status } : {}),
        now,
      }),
    );
    return true;
  }

  if (options.url.pathname.startsWith("/api/admin/sessions/")) {
    const sessionId = decodeURIComponent(
      options.url.pathname.slice("/api/admin/sessions/".length),
    );
    if (!sessionId) {
      writeJson(options.response, 404, { error: "not_found" });
      return true;
    }
    const detail = await options.metricsStore.getSessionDetail(sessionId, now);
    if (!detail) {
      writeJson(options.response, 404, { error: "unknown_session" });
      return true;
    }
    writeJson(options.response, 200, detail);
    return true;
  }

  if (options.url.pathname === "/api/admin/instances") {
    writeJson(options.response, 200, {
      generatedAt: now,
      instances: await options.metricsStore.listInstances(now),
    });
    return true;
  }

  writeJson(options.response, 404, { error: "not_found" });
  return true;
}
