import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { type AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { resolvePrivateClawMediaDir } from "./invite-qr-files.js";
import { formatBilingualInline } from "./text.js";
import type {
  PrivateClawInviteBundle,
  PrivateClawManagedSession,
} from "./types.js";

export type PrivateClawControlHostKind =
  | "plugin-service"
  | "pair-foreground"
  | "pair-daemon";

export interface PrivateClawSessionControlDescriptor {
  version: 1;
  controlId: string;
  kind: PrivateClawControlHostKind;
  pid: number;
  host: string;
  port: number;
  token: string;
  startedAt: string;
}

export interface PrivateClawDiscoveredSessionHost {
  controlId: string;
  kind: PrivateClawControlHostKind;
  pid: number;
  startedAt: string;
}

export interface PrivateClawDiscoveredSessionListing {
  host: PrivateClawDiscoveredSessionHost;
  sessions: PrivateClawManagedSession[];
}

export interface PrivateClawManagedSessionQrBundleResult {
  host: PrivateClawDiscoveredSessionHost;
  session: PrivateClawManagedSession;
  bundle: PrivateClawInviteBundle;
  notifyParticipantsSupported: true;
}

export interface PrivateClawManagedSessionQrLegacyResult {
  host: PrivateClawDiscoveredSessionHost;
  session: PrivateClawManagedSession;
  legacyPngPath: string;
  notifyParticipantsSupported: false;
}

export type PrivateClawManagedSessionQrLookupResult =
  | PrivateClawManagedSessionQrBundleResult
  | PrivateClawManagedSessionQrLegacyResult;

interface PrivateClawKickResult {
  sessionId: string;
  participant: {
    appId: string;
    displayName: string;
  };
}

interface PrivateClawSessionCloseResult {
  sessionId: string;
}

interface PrivateClawSessionQrResult {
  sessionId: string;
  bundle: PrivateClawInviteBundle;
}

interface PrivateClawSessionControlProvider {
  listManagedSessions(): PrivateClawManagedSession[];
  getSessionQrBundle(
    sessionId: string,
    params?: { notifyParticipants?: boolean },
  ): Promise<PrivateClawInviteBundle>;
  closeManagedSession(
    sessionId: string,
    reason?: string,
  ): Promise<PrivateClawManagedSession>;
  kickGroupParticipant(
    sessionId: string,
    appId: string,
    reason?: string,
  ): Promise<{
    appId: string;
    displayName: string;
  }>;
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function readBearerToken(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return undefined;
  }
  return header.slice("Bearer ".length).trim();
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function toHostSummary(
  descriptor: PrivateClawSessionControlDescriptor,
): PrivateClawDiscoveredSessionHost {
  return {
    controlId: descriptor.controlId,
    kind: descriptor.kind,
    pid: descriptor.pid,
    startedAt: descriptor.startedAt,
  };
}

function isDescriptor(
  value: unknown,
): value is PrivateClawSessionControlDescriptor {
  if (!value || typeof value !== "object") {
    return false;
  }
  const descriptor = value as Record<string, unknown>;
  return (
    descriptor.version === 1 &&
    typeof descriptor.controlId === "string" &&
    typeof descriptor.kind === "string" &&
    typeof descriptor.pid === "number" &&
    typeof descriptor.host === "string" &&
    typeof descriptor.port === "number" &&
    typeof descriptor.token === "string" &&
    typeof descriptor.startedAt === "string"
  );
}

async function listDescriptorPaths(controlDir: string): Promise<string[]> {
  try {
    const entries = await readdir(controlDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(controlDir, entry.name));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function loadDescriptors(
  stateDir: string,
): Promise<Array<{ descriptor: PrivateClawSessionControlDescriptor; descriptorPath: string }>> {
  const descriptorPaths = await listDescriptorPaths(resolvePrivateClawControlDir(stateDir));
  const descriptors: Array<{
    descriptor: PrivateClawSessionControlDescriptor;
    descriptorPath: string;
  }> = [];
  for (const descriptorPath of descriptorPaths) {
    try {
      const descriptor = JSON.parse(
        await readFile(descriptorPath, "utf8"),
      ) as unknown;
      if (!isDescriptor(descriptor)) {
        await rm(descriptorPath, { force: true });
        continue;
      }
      descriptors.push({ descriptor, descriptorPath });
    } catch {
      await rm(descriptorPath, { force: true });
    }
  }
  return descriptors;
}

async function requestDescriptorJson<T>(
  descriptor: PrivateClawSessionControlDescriptor,
  pathname: string,
  init?: {
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<T> {
  const response = await fetch(
    `http://${descriptor.host}:${descriptor.port}${pathname}`,
    {
      method: init?.method ?? "GET",
      headers: {
        authorization: `Bearer ${descriptor.token}`,
        ...(init?.body !== undefined
          ? { "content-type": "application/json; charset=utf-8" }
          : {}),
      },
      ...(init?.body !== undefined
        ? { body: JSON.stringify(init.body) }
        : {}),
    },
  );

  if (!response.ok) {
    throw new PrivateClawControlRequestError(response.status, response.statusText);
  }

  return (await response.json()) as T;
}

class PrivateClawControlRequestError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`Control request failed (${status} ${statusText})`);
  }
}

function formatHostKind(kind: PrivateClawControlHostKind): string {
  switch (kind) {
    case "plugin-service":
      return "plugin-service";
    case "pair-foreground":
      return "pair-foreground";
    case "pair-daemon":
      return "pair-daemon";
  }
}

export function resolvePrivateClawStateDir(
  stateDir: string = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw"),
): string {
  return stateDir;
}

export function resolvePrivateClawControlDir(stateDir: string): string {
  return path.join(resolvePrivateClawStateDir(stateDir), "privateclaw", "control");
}

export function buildManagedSessionsReportLines(
  listings: ReadonlyArray<PrivateClawDiscoveredSessionListing>,
): string[] {
  const sessions = listings.flatMap((listing) =>
    listing.sessions.map((session) => ({
      host: listing.host,
      session,
    })),
  );
  if (sessions.length === 0) {
    return [
      formatBilingualInline(
        "当前没有活动中的 PrivateClaw 会话。",
        "No active PrivateClaw sessions.",
      ),
    ];
  }

  const lines = [
    formatBilingualInline(
      `当前共有 ${sessions.length} 个活动中的 PrivateClaw 会话。`,
      `Found ${sessions.length} active PrivateClaw sessions.`,
    ),
  ];

  for (const { host, session } of sessions) {
    lines.push(
      `- ${session.sessionId} | type=${session.groupMode ? "group" : "single"} | participants=${session.participantCount} | state=${session.state} | expires=${session.expiresAt} | host=${formatHostKind(host.kind)}#${host.pid}${session.label ? ` | label=${JSON.stringify(session.label)}` : ""}`,
    );
    if (session.participants.length > 0) {
      for (const participant of session.participants) {
        lines.push(
          `  • ${participant.displayName} (${participant.appId})${participant.deviceLabel ? ` [${participant.deviceLabel}]` : ""}`,
        );
      }
    }
  }

  return lines;
}

export class PrivateClawSessionControlServer {
  private server:
    | ReturnType<typeof createServer>
    | undefined;
  private descriptor: PrivateClawSessionControlDescriptor | undefined;
  private descriptorPath: string | undefined;

  constructor(
    private readonly options: {
      provider: PrivateClawSessionControlProvider;
      stateDir: string;
      kind: PrivateClawControlHostKind;
      onLog?: (message: string) => void;
    },
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    await mkdir(resolvePrivateClawControlDir(this.options.stateDir), {
      recursive: true,
      mode: 0o700,
    });

    const token = randomUUID();
    const controlId = randomUUID();
    const startedAt = new Date().toISOString();

    this.server = createServer(async (request, response) => {
      try {
        if (readBearerToken(request) !== token) {
          writeJson(response, 401, { error: "unauthorized" });
          return;
        }

        const url = new URL(request.url ?? "/", "http://127.0.0.1");
        if (request.method === "GET" && url.pathname === "/healthz") {
          writeJson(response, 200, { ok: true });
          return;
        }
        if (request.method === "GET" && url.pathname === "/sessions") {
          writeJson(response, 200, {
            host: {
              controlId,
              kind: this.options.kind,
              pid: process.pid,
              startedAt,
            },
            sessions: this.options.provider.listManagedSessions(),
          });
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname.startsWith("/sessions/") &&
          url.pathname.endsWith("/qr")
        ) {
          const sessionId = decodeURIComponent(
            url.pathname.slice("/sessions/".length, -"/qr".length),
          );
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const bundle = await this.options.provider.getSessionQrBundle(
            sessionId,
            {
              notifyParticipants:
                body.notify === true || body.notifyParticipants === true,
            },
          );
          writeJson(response, 200, {
            sessionId,
            bundle,
          } satisfies PrivateClawSessionQrResult);
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname.startsWith("/sessions/") &&
          url.pathname.endsWith("/kick")
        ) {
          const sessionId = decodeURIComponent(
            url.pathname.slice("/sessions/".length, -"/kick".length),
          );
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const appId = typeof body.appId === "string" ? body.appId : "";
          const reason =
            typeof body.reason === "string" && body.reason.trim() !== ""
              ? body.reason
              : undefined;
          const participant = await this.options.provider.kickGroupParticipant(
            sessionId,
            appId,
            reason,
          );
          writeJson(response, 200, {
            sessionId,
            participant,
          } satisfies PrivateClawKickResult);
          return;
        }
        if (
          request.method === "POST" &&
          url.pathname.startsWith("/sessions/") &&
          url.pathname.endsWith("/close")
        ) {
          const sessionId = decodeURIComponent(
            url.pathname.slice("/sessions/".length, -"/close".length),
          );
          const body = (await readJsonBody(request)) as Record<string, unknown>;
          const reason =
            typeof body.reason === "string" && body.reason.trim() !== ""
              ? body.reason
              : undefined;
          await this.options.provider.closeManagedSession(sessionId, reason);
          writeJson(response, 200, {
            sessionId,
          } satisfies PrivateClawSessionCloseResult);
          return;
        }

        writeJson(response, 404, { error: "not_found" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        this.options.onLog?.(
          `[session-control] ${this.options.kind} request failed: ${message}`,
        );
        writeJson(response, 400, { error: message });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });

    const address = this.server.address() as AddressInfo | null;
    if (!address) {
      throw new Error("PrivateClaw session control server failed to bind.");
    }

    this.descriptor = {
      version: 1,
      controlId,
      kind: this.options.kind,
      pid: process.pid,
      host: "127.0.0.1",
      port: address.port,
      token,
      startedAt,
    };
    this.descriptorPath = path.join(
      resolvePrivateClawControlDir(this.options.stateDir),
      `${this.options.kind}-${process.pid}-${controlId}.json`,
    );
    await writeFile(
      this.descriptorPath,
      JSON.stringify(this.descriptor, null, 2),
      { mode: 0o600 },
    );
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server!.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      this.server = undefined;
    }

    if (this.descriptorPath) {
      await rm(this.descriptorPath, { force: true });
      this.descriptorPath = undefined;
    }
    this.descriptor = undefined;
  }
}

export async function listManagedSessionsFromStateDir(
  stateDir: string,
): Promise<PrivateClawDiscoveredSessionListing[]> {
  const descriptors = await loadDescriptors(stateDir);
  const listings: PrivateClawDiscoveredSessionListing[] = [];

  for (const { descriptor, descriptorPath } of descriptors) {
    try {
      const response = await requestDescriptorJson<{
        host: PrivateClawDiscoveredSessionHost;
        sessions: PrivateClawManagedSession[];
      }>(descriptor, "/sessions");
      listings.push({
        host: response.host ?? toHostSummary(descriptor),
        sessions: response.sessions ?? [],
      });
    } catch {
      await rm(descriptorPath, { force: true });
    }
  }

  return listings.sort((left, right) =>
    left.host.startedAt.localeCompare(right.host.startedAt),
  );
}

async function resolveManagedSessionDescriptor(params: {
  stateDir: string;
  sessionId: string;
}): Promise<{
  listing: PrivateClawDiscoveredSessionListing;
  session: PrivateClawManagedSession;
  descriptor: PrivateClawSessionControlDescriptor;
  descriptorPath: string;
}> {
  const listings = await listManagedSessionsFromStateDir(params.stateDir);
  const descriptors = await loadDescriptors(params.stateDir);

  for (const listing of listings) {
    const session = listing.sessions.find(
      (candidate) => candidate.sessionId === params.sessionId,
    );
    if (!session) {
      continue;
    }

    const descriptor = descriptors.find(
      (candidate) => candidate.descriptor.controlId === listing.host.controlId,
    );
    if (!descriptor) {
      break;
    }

    return {
      listing,
      session,
      descriptor: descriptor.descriptor,
      descriptorPath: descriptor.descriptorPath,
    };
  }

  throw new Error(
    `Could not find session ${params.sessionId} in ${resolvePrivateClawStateDir(params.stateDir)}.`,
  );
}

async function resolveLegacySessionQrPngPath(params: {
  stateDir: string;
  sessionId: string;
}): Promise<string | undefined> {
  const pngPath = path.join(
    resolvePrivateClawMediaDir(resolvePrivateClawStateDir(params.stateDir)),
    `privateclaw-${params.sessionId}.png`,
  );
  try {
    await access(pngPath);
    return pngPath;
  } catch {
    return undefined;
  }
}

export function isManagedSessionQrLegacyResult(
  result: PrivateClawManagedSessionQrLookupResult,
): result is PrivateClawManagedSessionQrLegacyResult {
  return "legacyPngPath" in result;
}

export function buildManagedSessionQrLegacyLines(params: {
  result: PrivateClawManagedSessionQrLegacyResult;
  notifyParticipants?: boolean;
}): string[] {
  const lines = [
    formatBilingualInline(
      `会话 ${params.result.session.sessionId} 由较旧的 PrivateClaw host 管理，当前 control API 还不能重新导出这张二维码。`,
      `Session ${params.result.session.sessionId} is managed by an older PrivateClaw host, so its current control API cannot re-export this QR code yet.`,
    ),
    formatBilingualInline(
      `已保留的二维码 PNG 路径: ${params.result.legacyPngPath}`,
      `Saved QR PNG path: ${params.result.legacyPngPath}`,
    ),
  ];
  if (params.notifyParticipants) {
    lines.push(
      formatBilingualInline(
        "这次没有向参与者推送二维码。请让已连接参与者在会话里运行 /session-qr，或使用当前版本重新建立会话。",
        "Participants were not notified. Ask a connected participant to run /session-qr inside the session, or recreate the session with the current provider build.",
      ),
    );
  } else {
    lines.push(
      formatBilingualInline(
        "如需直接打开这张已保存的二维码图片，可重试并追加 --open。",
        "Re-run with --open to open the saved QR image directly.",
      ),
    );
  }
  return lines;
}

async function waitForPidExit(params: {
  pid: number;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = params.timeoutMs ?? 5_000;
  const startedAt = Date.now();
  for (;;) {
    try {
      process.kill(params.pid, 0);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ESRCH") {
        return;
      }
      throw error;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error(
        `Timed out waiting for process ${params.pid} to exit after terminating the legacy PrivateClaw host.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

export async function kickManagedParticipantFromStateDir(params: {
  stateDir: string;
  sessionId: string;
  appId: string;
  reason?: string;
}): Promise<{
  host: PrivateClawDiscoveredSessionHost;
  session: PrivateClawManagedSession;
  participant: {
    appId: string;
    displayName: string;
  };
}> {
  const resolved = await resolveManagedSessionDescriptor({
    stateDir: params.stateDir,
    sessionId: params.sessionId,
  });
  const result = await requestDescriptorJson<PrivateClawKickResult>(
    resolved.descriptor,
    `/sessions/${encodeURIComponent(params.sessionId)}/kick`,
    {
      method: "POST",
      body: {
        appId: params.appId,
        ...(params.reason ? { reason: params.reason } : {}),
      },
    },
  );
  return {
    host: resolved.listing.host,
    session: resolved.session,
    participant: result.participant,
  };
}

export async function closeManagedSessionFromStateDir(params: {
  stateDir: string;
  sessionId: string;
  reason?: string;
}): Promise<{
  host: PrivateClawDiscoveredSessionHost;
  session: PrivateClawManagedSession;
  terminatedHost: boolean;
}> {
  const resolved = await resolveManagedSessionDescriptor({
    stateDir: params.stateDir,
    sessionId: params.sessionId,
  });
  try {
    await requestDescriptorJson<PrivateClawSessionCloseResult>(
      resolved.descriptor,
      `/sessions/${encodeURIComponent(params.sessionId)}/close`,
      {
        method: "POST",
        body: {
          ...(params.reason ? { reason: params.reason } : {}),
        },
      },
    );
    return {
      host: resolved.listing.host,
      session: resolved.session,
      terminatedHost: false,
    };
  } catch (error) {
    if (
      error instanceof PrivateClawControlRequestError &&
      error.status === 404 &&
      resolved.listing.host.kind !== "plugin-service" &&
      resolved.listing.sessions.length === 1
    ) {
      process.kill(resolved.listing.host.pid, "SIGTERM");
      await waitForPidExit({
        pid: resolved.listing.host.pid,
      });
      await rm(resolved.descriptorPath, { force: true });
      return {
        host: resolved.listing.host,
        session: resolved.session,
        terminatedHost: true,
      };
    }
    throw error;
  }
}

export interface PrivateClawBulkClosedManagedSession {
  host: PrivateClawDiscoveredSessionHost;
  session: PrivateClawManagedSession;
  terminatedHost: boolean;
}

export interface PrivateClawBulkCloseManagedSessionFailure {
  host: PrivateClawDiscoveredSessionHost;
  session: PrivateClawManagedSession;
  error: string;
}

export async function closeManagedSessionsFromStateDir(params: {
  stateDir: string;
  hostKinds: PrivateClawControlHostKind[];
  reason?: string;
}): Promise<{
  closed: PrivateClawBulkClosedManagedSession[];
  failed: PrivateClawBulkCloseManagedSessionFailure[];
}> {
  const targetedHostKinds = new Set(params.hostKinds);
  const skippedSessionIds = new Set<string>();
  const closed: PrivateClawBulkClosedManagedSession[] = [];
  const failed: PrivateClawBulkCloseManagedSessionFailure[] = [];

  for (;;) {
    const listings = await listManagedSessionsFromStateDir(params.stateDir);
    const candidate = listings
      .filter((listing) => targetedHostKinds.has(listing.host.kind))
      .flatMap((listing) =>
        listing.sessions.map((session) => ({
          host: listing.host,
          session,
        })),
      )
      .find((entry) => !skippedSessionIds.has(entry.session.sessionId));

    if (!candidate) {
      return {
        closed,
        failed,
      };
    }

    try {
      closed.push(
        await closeManagedSessionFromStateDir({
          stateDir: params.stateDir,
          sessionId: candidate.session.sessionId,
          ...(params.reason ? { reason: params.reason } : {}),
        }),
      );
    } catch (error) {
      failed.push({
        host: candidate.host,
        session: candidate.session,
        error: error instanceof Error ? error.message : String(error),
      });
      skippedSessionIds.add(candidate.session.sessionId);
    }
  }
}

export async function getManagedSessionQrBundleFromStateDir(params: {
  stateDir: string;
  sessionId: string;
  notifyParticipants?: boolean;
}): Promise<PrivateClawManagedSessionQrLookupResult> {
  const resolved = await resolveManagedSessionDescriptor({
    stateDir: params.stateDir,
    sessionId: params.sessionId,
  });
  try {
    const result = await requestDescriptorJson<PrivateClawSessionQrResult>(
      resolved.descriptor,
      `/sessions/${encodeURIComponent(params.sessionId)}/qr`,
      {
        method: "POST",
        body: {
          ...(params.notifyParticipants ? { notify: true } : {}),
        },
      },
    );
    return {
      host: resolved.listing.host,
      session: resolved.session,
      bundle: result.bundle,
      notifyParticipantsSupported: true,
    };
  } catch (error) {
    if (
      error instanceof PrivateClawControlRequestError &&
      error.status === 404
    ) {
      const legacyPngPath = await resolveLegacySessionQrPngPath({
        stateDir: params.stateDir,
        sessionId: params.sessionId,
      });
      if (legacyPngPath) {
        return {
          host: resolved.listing.host,
          session: resolved.session,
          legacyPngPath,
          notifyParticipantsSupported: false,
        };
      }
      throw new Error(
        formatBilingualInline(
          `会话 ${params.sessionId} 的当前 host 还不支持通过 control API 重新导出二维码。请让已连接参与者在会话内运行 /session-qr，或使用当前版本重新建立会话。`,
          `The current host for session ${params.sessionId} does not support re-exporting QR codes through the control API yet. Ask a connected participant to run /session-qr inside the session, or recreate the session with the current provider build.`,
        ),
      );
    }
    throw error;
  }
}
