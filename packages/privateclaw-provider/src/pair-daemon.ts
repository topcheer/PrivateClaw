import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PrivateClawInviteBundle,
  PrivateClawProviderHandoffState,
} from "./types.js";

interface PairDaemonSuccessResult {
  ok: true;
  bundle: PrivateClawInviteBundle;
}

interface PairDaemonErrorResult {
  ok: false;
  error: string;
}

type PairDaemonResult = PairDaemonSuccessResult | PairDaemonErrorResult;

interface PairDaemonHandoffSuccessResult {
  ok: true;
  resumedSessionCount: number;
}

type PairDaemonHandoffResult = PairDaemonHandoffSuccessResult | PairDaemonErrorResult;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveBuiltCliCandidate(cliPath: string): string | null {
  if (path.extname(cliPath) !== ".ts") {
    return null;
  }

  const sourceDir = path.dirname(cliPath);
  if (path.basename(sourceDir) !== "src") {
    return null;
  }

  return path.join(
    path.dirname(sourceDir),
    "dist",
    `${path.basename(cliPath, ".ts")}.js`,
  );
}

export async function resolveCliInvocation(
  cliModuleUrl: string,
): Promise<{ command: string; args: string[] }> {
  const cliPath = fileURLToPath(cliModuleUrl);
  const builtCliPath = resolveBuiltCliCandidate(cliPath);
  if (builtCliPath && (await pathExists(builtCliPath))) {
    return {
      command: process.execPath,
      args: [builtCliPath],
    };
  }

  return path.extname(cliPath) === ".ts"
    ? {
        command: process.execPath,
        args: ["--import", "tsx", cliPath],
      }
    : {
        command: process.execPath,
        args: [cliPath],
      };
}

async function waitForResultFile<T>(
  resultPath: string,
  timeoutMs: number,
): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    try {
      return JSON.parse(await readFile(resultPath, "utf8")) as T;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (error instanceof SyntaxError) {
        // The daemon may still be writing the result file.
      } else if (code !== "ENOENT") {
        throw error;
      }
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error(
          `Timed out waiting for background pair session result: ${resultPath}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

export async function spawnBackgroundPairDaemon(params: {
  cliModuleUrl: string;
  env?: NodeJS.ProcessEnv;
  stateDir: string;
  ttlMs?: number;
  label?: string;
  groupMode?: boolean;
  openInBrowser?: boolean;
  verbose?: boolean;
}): Promise<PrivateClawInviteBundle> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "privateclaw-pair-daemon-"),
  );
  const resultPath = path.join(tempDir, `${randomUUID()}.json`);

  try {
    const invocation = await resolveCliInvocation(params.cliModuleUrl);
    const args = [
      ...invocation.args,
      "pair",
      "--daemon-child",
      "--result-file",
      resultPath,
      ...(typeof params.ttlMs === "number"
        ? ["--ttl-ms", String(params.ttlMs)]
        : []),
      ...(params.label ? ["--label", params.label] : []),
      ...(params.groupMode ? ["--group"] : []),
      ...(params.openInBrowser ? ["--open"] : []),
      ...(params.verbose ? ["--verbose"] : []),
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(invocation.command, args, {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ...params.env,
          OPENCLAW_STATE_DIR: params.stateDir,
        },
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });

    const result = await waitForResultFile<PairDaemonResult>(resultPath, 60_000);
    if (!result.ok) {
      throw new Error(
        `[privateclaw-provider] Daemon pair child failed: ${result.error}`,
      );
    }
    return result.bundle;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function handoffForegroundPairToBackground(params: {
  cliModuleUrl: string;
  env?: NodeJS.ProcessEnv;
  stateDir: string;
  handoffState: PrivateClawProviderHandoffState;
  verbose?: boolean;
}): Promise<number> {
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "privateclaw-pair-handoff-"),
  );
  const resultPath = path.join(tempDir, `${randomUUID()}.json`);
  const snapshotPath = path.join(tempDir, `${randomUUID()}.snapshot.json`);

  try {
    await writeFile(snapshotPath, JSON.stringify(params.handoffState), "utf8");
    const invocation = await resolveCliInvocation(params.cliModuleUrl);
    const args = [
      ...invocation.args,
      "pair",
      "--daemon-child",
      "--result-file",
      resultPath,
      "--resume-snapshot-file",
      snapshotPath,
      ...(params.verbose ? ["--verbose"] : []),
    ];

    await new Promise<void>((resolve, reject) => {
      const child = spawn(invocation.command, args, {
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ...params.env,
          OPENCLAW_STATE_DIR: params.stateDir,
        },
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });

    const result = await waitForResultFile<PairDaemonHandoffResult>(
      resultPath,
      30_000,
    );
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.resumedSessionCount;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
