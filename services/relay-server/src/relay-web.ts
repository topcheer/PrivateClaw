import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, statSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RELAY_WEB_ROOT_CANDIDATES = [
  fileURLToPath(new URL("./web/", import.meta.url)),
  fileURLToPath(new URL("../dist/web/", import.meta.url)),
  fileURLToPath(new URL("../../../apps/privateclaw_site/", import.meta.url)),
];
const RELAY_ADMIN_WEB_ROOT_CANDIDATES = [
  fileURLToPath(new URL("./admin-web/", import.meta.url)),
  fileURLToPath(new URL("../dist/admin-web/", import.meta.url)),
];

const CONTENT_TYPES = new Map<string, string>([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
]);

interface RelayWebFileMatch {
  filePath: string;
  size: number;
}

interface RelayWebRedirectMatch {
  location: string;
}

type RelayWebMatch = RelayWebFileMatch | RelayWebRedirectMatch;

export interface ServeRelayWebRequestOptions {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  webRootDir: string;
  mountPath?: string;
}

function hasUsableRelayWebIndex(candidate: string): boolean {
  try {
    return (
      statSync(candidate).isDirectory() &&
      statSync(path.join(candidate, "index.html")).isFile()
    );
  } catch {
    return false;
  }
}

function resolveStaticWebRootDir(
  candidates: readonly string[],
  errorMessage: string,
): string {
  for (const candidate of candidates) {
    if (hasUsableRelayWebIndex(candidate)) {
      return candidate;
    }
  }

  throw new Error(errorMessage);
}

export function resolveRelayWebRootDir(): string {
  return resolveStaticWebRootDir(
    RELAY_WEB_ROOT_CANDIDATES,
    "Unable to locate the bundled PrivateClaw website assets for `--web`. Rebuild `@privateclaw/privateclaw-relay` or reinstall the package and try again.",
  );
}

export function resolveRelayAdminWebRootDir(): string {
  return resolveStaticWebRootDir(
    RELAY_ADMIN_WEB_ROOT_CANDIDATES,
    "Unable to locate the bundled relay admin assets. Rebuild `@privateclaw/privateclaw-relay` or reinstall the package and try again.",
  );
}

function isPathInsideRoot(rootDir: string, candidatePath: string): boolean {
  const resolvedRoot = path.resolve(rootDir);
  const resolvedCandidate = path.resolve(candidatePath);
  return (
    resolvedCandidate === resolvedRoot ||
    resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`)
  );
}

function stripMountPath(
  pathname: string,
  mountPath: string,
): string | undefined {
  if (mountPath === "/" || mountPath === "") {
    return pathname;
  }
  const normalizedMountPath =
    mountPath.endsWith("/") && mountPath !== "/"
      ? mountPath.slice(0, -1)
      : mountPath;
  if (pathname === normalizedMountPath || pathname === `${normalizedMountPath}/`) {
    return "/";
  }
  if (!pathname.startsWith(`${normalizedMountPath}/`)) {
    return undefined;
  }
  return pathname.slice(normalizedMountPath.length) || "/";
}

function normalizeRelayWebPathname(pathname: string): string[] | undefined {
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const segments = decodedPathname.split("/").filter(Boolean);
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        segment.startsWith(".") ||
        segment.includes(path.sep),
    )
  ) {
    return undefined;
  }
  return segments;
}

function toRelayWebContentType(filePath: string): string {
  return (
    CONTENT_TYPES.get(path.extname(filePath).toLowerCase()) ??
    "application/octet-stream"
  );
}

function isRedirectMatch(match: RelayWebMatch): match is RelayWebRedirectMatch {
  return "location" in match;
}

async function resolveRelayWebMatch(
  webRootDir: string,
  url: URL,
  mountPath: string,
): Promise<RelayWebMatch | undefined> {
  const mountedPathname = stripMountPath(url.pathname, mountPath);
  if (!mountedPathname) {
    return undefined;
  }

  const segments = normalizeRelayWebPathname(mountedPathname);
  if (!segments) {
    return undefined;
  }

  const candidatePath = path.resolve(webRootDir, ...segments);
  if (!isPathInsideRoot(webRootDir, candidatePath)) {
    return undefined;
  }

  let candidateStat;
  try {
    candidateStat = await stat(candidatePath);
  } catch {
    return undefined;
  }

  if (candidateStat.isDirectory()) {
    if (!url.pathname.endsWith("/")) {
      return {
        location: `${url.pathname}/${url.search}`,
      };
    }

    const indexPath = path.join(candidatePath, "index.html");
    if (!existsSync(indexPath)) {
      return undefined;
    }
    const indexStat = await stat(indexPath);
    if (!indexStat.isFile()) {
      return undefined;
    }
    return {
      filePath: indexPath,
      size: indexStat.size,
    };
  }

  if (!candidateStat.isFile()) {
    return undefined;
  }

  return {
    filePath: candidatePath,
    size: candidateStat.size,
  };
}

export async function serveRelayWebRequest(
  params: ServeRelayWebRequestOptions,
): Promise<boolean> {
  if (
    params.request.method !== "GET" &&
    params.request.method !== "HEAD"
  ) {
    return false;
  }

  if (params.url.pathname.startsWith("/ws/")) {
    return false;
  }

  const match = await resolveRelayWebMatch(
    params.webRootDir,
    params.url,
    params.mountPath ?? "/",
  );
  if (!match) {
    return false;
  }

  if (isRedirectMatch(match)) {
    params.response.writeHead(301, {
      location: match.location,
    });
    params.response.end();
    return true;
  }

  params.response.writeHead(200, {
    "content-length": String(match.size),
    "content-type": toRelayWebContentType(match.filePath),
  });

  if (params.request.method === "HEAD") {
    params.response.end();
    return true;
  }

  params.response.end(await readFile(match.filePath));
  return true;
}
