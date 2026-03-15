#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LOCAL_ONLY_PATHS = new Map([
  [
    "apps/privateclaw_app/android/app/google-services.json",
    "Android Firebase config is intentionally local-only.",
  ],
  [
    "apps/privateclaw_app/ios/Runner/GoogleService-Info.plist",
    "iOS Firebase config is intentionally local-only.",
  ],
  [
    "services/relay-server/.env",
    "Relay credentials belong in the ignored local .env file.",
  ],
  [
    "packages/privateclaw-provider/.env",
    "Provider credentials belong in the ignored local .env file.",
  ],
  [
    "apps/privateclaw_app/fastlane.env",
    "Store-upload credentials belong in the ignored local fastlane env file.",
  ],
  [
    "apps/privateclaw_app/android/key.properties",
    "Android signing credentials belong in the ignored local key.properties file.",
  ],
]);

const BLOCKED_EXTENSIONS = new Map([
  [".jks", "Android signing keystores should stay local-only."],
  [".keystore", "Android signing keystores should stay local-only."],
  [".mobileprovision", "Provisioning profiles should stay local-only."],
  [".p12", "Signing certificates should stay local-only."],
  [".p8", "Private signing keys should stay local-only."],
]);

const BLOCKED_BASENAME_PATTERNS = [
  {
    pattern: /^google-services\.json$/i,
    reason: "Firebase Android config files should not be committed.",
  },
  {
    pattern: /^GoogleService-Info\.plist$/i,
    reason: "Firebase iOS config files should not be committed.",
  },
  {
    pattern: /service-account.*\.json$/i,
    reason: "Service-account JSON files usually contain local credentials.",
  },
];

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function runGit(args, options = {}) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch (error) {
    if (options.allowFailure) {
      return "";
    }
    const message =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim()
        : String(error);
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}

function splitLines(text) {
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function classifyPath(filePath) {
  const normalizedPath = normalizePath(filePath);
  const exactReason = LOCAL_ONLY_PATHS.get(normalizedPath);
  if (exactReason) {
    return exactReason;
  }

  const extensionReason = BLOCKED_EXTENSIONS.get(path.extname(normalizedPath).toLowerCase());
  if (extensionReason) {
    return extensionReason;
  }

  const baseName = path.posix.basename(normalizedPath);
  for (const rule of BLOCKED_BASENAME_PATTERNS) {
    if (rule.pattern.test(baseName)) {
      return rule.reason;
    }
  }

  return undefined;
}

function collectStagedPaths() {
  return uniqueSorted(
    splitLines(runGit(["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { allowFailure: true })),
  );
}

function parsePushUpdates(input) {
  return splitLines(input).map((line) => {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/u);
    return { localRef, localSha, remoteRef, remoteSha };
  });
}

function isZeroSha(sha) {
  return /^0+$/u.test(sha);
}

function collectCommitPaths(commits) {
  if (commits.length === 0) {
    return [];
  }

  const result = spawnSync(
    "git",
    ["diff-tree", "--stdin", "--no-commit-id", "--name-only", "-r", "--diff-filter=ACMR"],
    {
      encoding: "utf8",
      input: `${commits.join("\n")}\n`,
    },
  );

  if (result.status !== 0) {
    throw new Error(`git diff-tree failed: ${result.stderr.trim()}`);
  }

  return uniqueSorted(splitLines(result.stdout));
}

function collectPushPaths(remoteName, updates) {
  const commits = new Set();

  for (const update of updates) {
    if (!update.localSha || isZeroSha(update.localSha)) {
      continue;
    }

    let newCommits = [];
    if (update.remoteSha && !isZeroSha(update.remoteSha)) {
      newCommits = splitLines(
        runGit(["rev-list", `${update.remoteSha}..${update.localSha}`], { allowFailure: true }),
      );
    } else if (remoteName) {
      newCommits = splitLines(
        runGit(["rev-list", update.localSha, "--not", `--remotes=${remoteName}`], {
          allowFailure: true,
        }),
      );
      if (newCommits.length === 0) {
        newCommits = splitLines(
          runGit(["rev-list", update.localSha, "--not", "--remotes"], { allowFailure: true }),
        );
      }
    } else {
      newCommits = splitLines(runGit(["rev-list", update.localSha], { allowFailure: true }));
    }

    for (const commit of newCommits) {
      commits.add(commit);
    }
  }

  return collectCommitPaths([...commits]);
}

function buildFailureMessage(mode, offenders, remoteName) {
  const lines = [
    `Blocked ${mode}${remoteName ? ` for remote "${remoteName}"` : ""}.`,
    "",
    "These paths look like local-only credentials or signing artifacts and should stay out of Git:",
    ...offenders.map(({ filePath, reason }) => `- ${filePath}: ${reason}`),
    "",
    "If you staged one accidentally, remove it from the index and keep the local file on disk:",
    "  git restore --staged <path>",
    "",
    "The repo already ignores these files; this hook is a second safety net for forced adds and old commits.",
  ];
  return lines.join("\n");
}

function main() {
  const [mode, ...rest] = process.argv.slice(2);

  let candidatePaths = [];
  let remoteName;

  if (mode === "--staged") {
    candidatePaths = collectStagedPaths();
  } else if (mode === "--pre-push") {
    [remoteName] = rest;
    const stdin = fs.readFileSync(process.stdin.fd, "utf8");
    candidatePaths = collectPushPaths(remoteName, parsePushUpdates(stdin));
  } else {
    console.error(
      "Usage: node scripts/check-local-only-files.mjs --staged | --pre-push <remote-name> <remote-url>",
    );
    process.exit(2);
  }

  const offenders = candidatePaths
    .map((filePath) => ({ filePath, reason: classifyPath(filePath) }))
    .filter((entry) => entry.reason != null);

  if (offenders.length > 0) {
    console.error(buildFailureMessage(mode === "--staged" ? "commit" : "push", offenders, remoteName));
    process.exit(1);
  }
}

main();
