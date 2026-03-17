#!/usr/bin/env node

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function printUsage() {
  console.log(`Usage: npm run relay:promote -- [options] [source-ref]

Force-sync the deployment branch to a chosen source ref and push it to the configured remotes.
When no source ref is provided, the command syncs HEAD.

Options:
  --branch NAME         Target branch name (default: railway-relay)
  --base-remote REMOTE  Remote used to inspect the latest target branch tip (default: origin)
  --remote REMOTE       Remote to push after promotion; repeatable (default: origin, upstream)
  --help                Show this help message

Examples:
  npm run relay:promote
  npm run relay:promote -- 0123abcd
  npm run relay:promote -- --branch staging-relay --remote origin -- 0123abcd
`);
}

function parseArgs(argv) {
  let branch = "railway-relay";
  let baseRemote = "origin";
  const remotes = ["origin", "upstream"];
  const sourceRefs = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    if (arg === "--branch") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--branch requires a value");
      }
      branch = value;
      index += 1;
      continue;
    }

    if (arg === "--base-remote") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--base-remote requires a value");
      }
      baseRemote = value;
      index += 1;
      continue;
    }

    if (arg === "--remote") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--remote requires a value");
      }
      remotes.push(value);
      index += 1;
      continue;
    }

    if (arg === "--") {
      sourceRefs.push(...argv.slice(index + 1));
      break;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    }

    sourceRefs.push(arg);
  }

  if (sourceRefs.length > 1) {
    throw new Error(
      "relay:promote now accepts at most one source ref because it fully syncs the deployment branch instead of cherry-picking commits.",
    );
  }

  return {
    branch,
    baseRemote,
    remotes: [...new Set(remotes)],
    sourceRef: sourceRefs[0] ?? "HEAD",
  };
}

function runGit(args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: options.cwd ?? repoRoot,
    stdio: options.captureStdout ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const command = `git ${args.join(" ")}`;
    throw new Error(`${command} exited with status ${result.status ?? "unknown"}`);
  }

  return options.captureStdout ? result.stdout.trim() : "";
}

function refExists(ref, cwd = repoRoot) {
  const result = spawnSync("git", ["show-ref", "--verify", "--quiet", ref], {
    cwd,
    stdio: "ignore",
  });
  return result.status === 0;
}

function ensureRemoteExists(remote) {
  runGit(["remote", "get-url", remote], { captureStdout: true });
}

function resolveBaseRef(branch, baseRemote) {
  ensureRemoteExists(baseRemote);

  const fetchResult = spawnSync("git", ["fetch", baseRemote, branch], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8",
  });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  if (
    refExists(`refs/remotes/${baseRemote}/${branch}`) &&
    fetchResult.status === 0
  ) {
    return `refs/remotes/${baseRemote}/${branch}`;
  }

  if (refExists(`refs/remotes/${baseRemote}/${branch}`)) {
    return `refs/remotes/${baseRemote}/${branch}`;
  }

  if (refExists(`refs/heads/${branch}`)) {
    return `refs/heads/${branch}`;
  }

  if (refExists(`refs/remotes/${baseRemote}/main`)) {
    return `refs/remotes/${baseRemote}/main`;
  }

  return "HEAD";
}

function refreshRemoteBranch(branch, remote) {
  ensureRemoteExists(remote);

  const fetchResult = spawnSync("git", ["fetch", remote, branch], {
    cwd: repoRoot,
    stdio: "inherit",
    encoding: "utf8",
  });

  if (fetchResult.error) {
    throw fetchResult.error;
  }

  return refExists(`refs/remotes/${remote}/${branch}`);
}

function resolveSourceRef(sourceRef) {
  return runGit(["rev-parse", "--verify", `${sourceRef}^{commit}`], {
    captureStdout: true,
  });
}

function main() {
  const topLevel = runGit(["rev-parse", "--show-toplevel"], {
    captureStdout: true,
  });

  if (path.resolve(topLevel) !== repoRoot) {
    throw new Error(`Expected repository root ${repoRoot}, got ${topLevel}`);
  }

  const { branch, baseRemote, remotes, sourceRef } = parseArgs(process.argv.slice(2));
  const baseRef = resolveBaseRef(branch, baseRemote);
  const resolvedSourceRef = resolveSourceRef(sourceRef);
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "privateclaw-relay-"));
  let worktreeAdded = false;
  let cleanupWorktree = false;

  console.log(`Syncing ${branch} to ${resolvedSourceRef} (source: ${sourceRef}, current target base: ${baseRef})`);

  try {
    runGit(["worktree", "add", "--detach", tempDir, resolvedSourceRef]);
    worktreeAdded = true;

    for (const remote of remotes) {
      const hasRemoteBranch = refreshRemoteBranch(branch, remote);
      const pushArgs = ["push", remote, `HEAD:refs/heads/${branch}`];
      pushArgs.push(hasRemoteBranch ? "--force-with-lease" : "--force");
      runGit(pushArgs, { cwd: tempDir });
    }

    cleanupWorktree = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Relay promotion stopped: ${message}`);
    if (worktreeAdded) {
      console.error(`Temporary worktree kept at ${tempDir}`);
    }
    process.exit(1);
  } finally {
    if (worktreeAdded && cleanupWorktree) {
      runGit(["worktree", "remove", "--force", tempDir]);
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(`Relay branch ${branch} updated on ${remotes.join(", ")}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
