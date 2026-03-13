import { execFile } from "node:child_process";
import { access, readFile, readdir, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import type { PrivateClawSlashCommand } from "@privateclaw/protocol";

const execFileAsync = promisify(execFile);

interface OpenClawCommandDefinitionLike {
  key?: unknown;
  description?: unknown;
  textAliases?: unknown;
  acceptsArgs?: unknown;
}

interface OpenClawPluginCommandSpecLike {
  name?: unknown;
  description?: unknown;
  acceptsArgs?: unknown;
}

interface OpenClawCommandRuntime {
  listChatCommands: () => OpenClawCommandDefinitionLike[];
  getPluginCommandSpecs: () => OpenClawPluginCommandSpecLike[];
}

let cachedRuntimePromise: Promise<OpenClawCommandRuntime | null> | undefined;

function normalizeSlash(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function mapBuiltInCommands(
  commands: OpenClawCommandDefinitionLike[],
): PrivateClawSlashCommand[] {
  return commands.flatMap((command) => {
    const aliases = Array.isArray(command.textAliases)
      ? command.textAliases.filter((value): value is string => typeof value === "string")
      : [];
    const fallback =
      typeof command.key === "string" && command.key.trim()
        ? `/${command.key.trim().toLowerCase()}`
        : "";
    const slash = normalizeSlash(aliases[0] ?? fallback);
    const description =
      typeof command.description === "string" ? command.description.trim() : "";
    if (!slash || !description) {
      return [];
    }
    return [
      {
        slash,
        description,
        acceptsArgs: Boolean(command.acceptsArgs),
        source: "openclaw" as const,
      },
    ];
  });
}

function mapPluginCommands(
  commands: OpenClawPluginCommandSpecLike[],
): PrivateClawSlashCommand[] {
  return commands.flatMap((command) => {
    const slash =
      typeof command.name === "string" ? normalizeSlash(command.name) : "";
    const description =
      typeof command.description === "string" ? command.description.trim() : "";
    if (!slash || !description) {
      return [];
    }
    return [
      {
        slash,
        description,
        acceptsArgs: Boolean(command.acceptsArgs),
        source: "plugin" as const,
      },
    ];
  });
}

function dedupeCommands(commands: PrivateClawSlashCommand[]): PrivateClawSlashCommand[] {
  const unique = new Map<string, PrivateClawSlashCommand>();
  for (const command of commands) {
    unique.set(command.slash.toLowerCase(), command);
  }
  return [...unique.values()].sort((left, right) =>
    left.slash.localeCompare(right.slash),
  );
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isOpenClawRoot(candidate: string): Promise<boolean> {
  const packageJsonPath = path.join(candidate, "package.json");
  if (!(await pathExists(packageJsonPath))) {
    return false;
  }
  try {
    const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      name?: unknown;
    };
    return parsed.name === "openclaw";
  } catch {
    return false;
  }
}

async function searchParentsForOpenClawRoot(startPath: string): Promise<string | null> {
  let current = startPath;
  try {
    current = await realpath(startPath);
  } catch {
    return null;
  }

  let cursor = current;
  while (true) {
    const candidate = path.extname(cursor) ? path.dirname(cursor) : cursor;
    if (await isOpenClawRoot(candidate)) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return null;
    }
    cursor = parent;
  }
}

async function resolveGlobalOpenClawRoot(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("npm", ["root", "-g"]);
    const npmRoot = stdout.trim();
    if (!npmRoot) {
      return null;
    }
    const candidate = path.join(npmRoot, "openclaw");
    return (await isOpenClawRoot(candidate)) ? candidate : null;
  } catch {
    return null;
  }
}

async function resolveOpenClawRoot(): Promise<string | null> {
  const envCandidate = process.env.OPENCLAW_PACKAGE_ROOT?.trim();
  if (envCandidate) {
    const resolved = await searchParentsForOpenClawRoot(envCandidate);
    if (resolved) {
      return resolved;
    }
  }

  const searchCandidates = [
    process.argv[1],
    process.cwd(),
    "/opt/homebrew/lib/node_modules/openclaw",
    "/usr/local/lib/node_modules/openclaw",
  ].filter((value): value is string => typeof value === "string" && value.trim() !== "");

  for (const candidate of searchCandidates) {
    const resolved = await searchParentsForOpenClawRoot(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return resolveGlobalOpenClawRoot();
}

async function resolveHashedModulePath(params: {
  distDir: string;
  entryFile: string;
  prefix: string;
}): Promise<string | null> {
  const entryPath = path.join(params.distDir, params.entryFile);
  try {
    const entryContents = await readFile(entryPath, "utf8");
    const match = entryContents.match(
      new RegExp(`["']\\.\\/(${params.prefix}[A-Za-z0-9_-]+\\.js)["']`),
    );
    if (match?.[1]) {
      return path.join(params.distDir, match[1]);
    }
  } catch {
    // Fall through to directory scan.
  }

  try {
    const entries = await readdir(params.distDir);
    const match = entries.find(
      (entry) => entry.startsWith(params.prefix) && entry.endsWith(".js"),
    );
    return match ? path.join(params.distDir, match) : null;
  } catch {
    return null;
  }
}

async function loadRuntime(): Promise<OpenClawCommandRuntime | null> {
  if (!cachedRuntimePromise) {
    cachedRuntimePromise = (async () => {
      const openClawRoot = await resolveOpenClawRoot();
      if (!openClawRoot) {
        return null;
      }

      const distDir = path.join(openClawRoot, "dist");
      const pluginSdkDir = path.join(distDir, "plugin-sdk");
      const [commandsRegistryPath, registryPath] = await Promise.all([
        resolveHashedModulePath({
          distDir: pluginSdkDir,
          entryFile: "index.js",
          prefix: "commands-registry-",
        }),
        resolveHashedModulePath({
          distDir,
          entryFile: "index.js",
          prefix: "registry-",
        }),
      ]);

      if (!commandsRegistryPath || !registryPath) {
        return null;
      }

      const [commandsModule, registryModule] = await Promise.all([
        import(pathToFileURL(commandsRegistryPath).href) as Promise<Record<string, unknown>>,
        import(pathToFileURL(registryPath).href) as Promise<Record<string, unknown>>,
      ]);

      const listChatCommands = commandsModule.i;
      const getPluginCommandSpecs = registryModule.w;
      if (
        typeof listChatCommands !== "function" ||
        typeof getPluginCommandSpecs !== "function"
      ) {
        return null;
      }

      return {
        listChatCommands: () => listChatCommands() as OpenClawCommandDefinitionLike[],
        getPluginCommandSpecs: () =>
          getPluginCommandSpecs() as OpenClawPluginCommandSpecLike[],
      };
    })();
  }

  return cachedRuntimePromise;
}

export async function loadAvailableOpenClawCommands(): Promise<PrivateClawSlashCommand[]> {
  const runtime = await loadRuntime();
  if (!runtime) {
    return [];
  }

  return dedupeCommands([
    ...mapBuiltInCommands(runtime.listChatCommands()),
    ...mapPluginCommands(runtime.getPluginCommandSpecs()),
  ]);
}
