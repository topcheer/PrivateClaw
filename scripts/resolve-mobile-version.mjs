import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const pubspecPath = path.join(repoRoot, "apps", "privateclaw_app", "pubspec.yaml");
const buildEpochSeconds = Math.floor(Date.UTC(2024, 0, 1, 0, 0, 0) / 1000);

function parseArgs(argv) {
  const format = argv.includes("--json")
    ? "json"
    : argv.includes("--shell")
      ? "shell"
      : "text";

  return { format };
}

function parsePositiveInteger(rawValue, label) {
  const value = Number.parseInt(String(rawValue).trim(), 10);

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }

  return value;
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function readPubspecVersion(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const match = source.match(/^version:\s*([0-9]+\.[0-9]+\.[0-9]+)(?:\+([0-9]+))?\s*$/m);

  if (!match) {
    throw new Error(`Could not parse a Flutter version from ${filePath}.`);
  }

  return {
    marketingVersion: match[1],
    storedBuildNumber: match[2] ? parsePositiveInteger(match[2], "pubspec build number") : 0,
  };
}

function resolveMobileVersion() {
  const pubspecVersion = readPubspecVersion(pubspecPath);
  const overrideBuildName = process.env.PRIVATECLAW_BUILD_NAME?.trim();
  const overrideBuildNumber = process.env.PRIVATECLAW_BUILD_NUMBER?.trim();
  const generatedBuildNumber = Math.floor(Date.now() / 1000) - buildEpochSeconds;
  const nextAutoBuildNumber = Math.max(generatedBuildNumber, pubspecVersion.storedBuildNumber + 1);

  return {
    versionName: overrideBuildName || pubspecVersion.marketingVersion,
    buildNumber: overrideBuildNumber
      ? parsePositiveInteger(overrideBuildNumber, "PRIVATECLAW_BUILD_NUMBER")
      : nextAutoBuildNumber,
    pubspecMarketingVersion: pubspecVersion.marketingVersion,
    pubspecBuildNumber: pubspecVersion.storedBuildNumber,
    buildNumberRule: overrideBuildNumber ? "env-override" : "seconds-since-2024-01-01-utc",
    buildEpoch: "2024-01-01T00:00:00Z",
    sourceFile: path.relative(repoRoot, pubspecPath),
  };
}

function renderText(version) {
  return [
    "PrivateClaw mobile store version",
    `versionName=${version.versionName}`,
    `buildNumber=${version.buildNumber}`,
    `pubspecVersion=${version.pubspecMarketingVersion}+${version.pubspecBuildNumber}`,
    `buildRule=${version.buildNumberRule}`,
    `epoch=${version.buildEpoch}`,
    `source=${version.sourceFile}`,
  ].join("\n");
}

function renderShell(version) {
  return [
    `export PRIVATECLAW_BUILD_NAME=${shellEscape(version.versionName)}`,
    `export PRIVATECLAW_BUILD_NUMBER=${shellEscape(version.buildNumber)}`,
  ].join("\n");
}

const { format } = parseArgs(process.argv.slice(2));
const version = resolveMobileVersion();

if (format === "json") {
  console.log(JSON.stringify(version));
} else if (format === "shell") {
  console.log(renderShell(version));
} else {
  console.log(renderText(version));
}
