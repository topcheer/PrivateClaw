import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveMobileVersion } from "./resolve-mobile-version.mjs";

function parseArgs(argv) {
  const format = argv.includes("--json")
    ? "json"
    : argv.includes("--shell")
      ? "shell"
      : "text";

  return { format };
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

const SEMVER_MAJOR_BITS = 4;
const SEMVER_MINOR_BITS = 6;
const SEMVER_PATCH_BITS = 6;
const MAX_SEMVER_MAJOR = 2 ** SEMVER_MAJOR_BITS - 1;
const MAX_SEMVER_MINOR = 2 ** SEMVER_MINOR_BITS - 1;
const MAX_SEMVER_PATCH = 2 ** SEMVER_PATCH_BITS - 1;
const MAX_MSIX_BUILD_NUMBER = 2 ** 32 - 1;

function parseSemanticVersion(versionName) {
  const match = String(versionName).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);

  if (!match) {
    throw new Error(
      `Windows Store packaging requires a semantic version like 0.1.14, received "${versionName}".`,
    );
  }

  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
}

function packSemanticVersion({ major, minor, patch }) {
  if (major > MAX_SEMVER_MAJOR || minor > MAX_SEMVER_MINOR || patch > MAX_SEMVER_PATCH) {
    throw new Error(
      [
        "Windows Store packaging packs semver into the first 16-bit Appx version field.",
        `Received ${major}.${minor}.${patch}, but the current mapping only supports`,
        `major <= ${MAX_SEMVER_MAJOR}, minor <= ${MAX_SEMVER_MINOR}, patch <= ${MAX_SEMVER_PATCH}.`,
      ].join(" "),
    );
  }

  return (major << (SEMVER_MINOR_BITS + SEMVER_PATCH_BITS)) | (minor << SEMVER_PATCH_BITS) | patch;
}

export function resolveWindowsStoreVersion(mobileVersion = resolveMobileVersion()) {
  const { major, minor, patch } = parseSemanticVersion(mobileVersion.versionName);
  const buildNumber = Number.parseInt(String(mobileVersion.buildNumber), 10);

  if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
    throw new Error(`Windows Store packaging requires a positive build number, received "${mobileVersion.buildNumber}".`);
  }

  if (buildNumber > MAX_MSIX_BUILD_NUMBER) {
    throw new Error(
      `Windows Store packaging splits the build number across two 16-bit Appx fields, so it must stay <= ${MAX_MSIX_BUILD_NUMBER}, received ${buildNumber}.`,
    );
  }

  const msixMajor = packSemanticVersion({ major, minor, patch });
  const msixMinor = Math.floor(buildNumber / 65536);
  const msixBuild = buildNumber % 65536;
  const msixRevision = 0;

  if (msixMajor > 65535 || msixMinor > 65535 || msixBuild > 65535 || msixRevision > 65535) {
    throw new Error(
      `The resolved MSIX version components must stay within 0-65535, got ${msixMajor}.${msixMinor}.${msixBuild}.${msixRevision}.`,
    );
  }

  return {
    ...mobileVersion,
    msixVersion: `${msixMajor}.${msixMinor}.${msixBuild}.${msixRevision}`,
    mapping: {
      semver: `${major}.${minor}.${patch} -> ${msixMajor} (packed as ${major} << 12 | ${minor} << 6 | ${patch})`,
      buildNumber: `${buildNumber} -> ${msixMinor}.${msixBuild}.0 (high/low 16-bit split, revision forced to 0 for Store upload)`,
    },
  };
}

function renderText(version) {
  return [
    "PrivateClaw Windows Store version",
    `marketingVersion=${version.versionName}`,
    `buildNumber=${version.buildNumber}`,
    `msixVersion=${version.msixVersion}`,
    `semverMapping=${version.mapping.semver}`,
    `buildNumberMapping=${version.mapping.buildNumber}`,
  ].join("\n");
}

function renderShell(version) {
  return [
    `export PRIVATECLAW_WINDOWS_STORE_MSIX_VERSION=${shellEscape(version.msixVersion)}`,
  ].join("\n");
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  const { format } = parseArgs(process.argv.slice(2));
  const version = resolveWindowsStoreVersion();

  if (format === "json") {
    console.log(JSON.stringify(version));
  } else if (format === "shell") {
    console.log(renderShell(version));
  } else {
    console.log(renderText(version));
  }
}
