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

export function resolveWindowsStoreVersion(mobileVersion = resolveMobileVersion()) {
  const { major, minor, patch } = parseSemanticVersion(mobileVersion.versionName);
  const buildNumber = Number.parseInt(String(mobileVersion.buildNumber), 10);

  if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) {
    throw new Error(`Windows Store packaging requires a positive build number, received "${mobileVersion.buildNumber}".`);
  }

  if (minor > 255 || patch > 255) {
    throw new Error(
      `Windows Store packaging currently packs minor (${minor}) and patch (${patch}) into one 16-bit field, so both must be <= 255.`,
    );
  }

  const msixMajor = major + 1;
  const msixMinor = minor * 256 + patch;
  const msixBuild = Math.floor(buildNumber / 65536);
  const msixRevision = buildNumber % 65536;

  if (msixMajor > 65535 || msixMinor > 65535 || msixBuild > 65535 || msixRevision > 65535) {
    throw new Error(
      `The resolved MSIX version components must stay within 0-65535, got ${msixMajor}.${msixMinor}.${msixBuild}.${msixRevision}.`,
    );
  }

  return {
    ...mobileVersion,
    msixVersion: `${msixMajor}.${msixMinor}.${msixBuild}.${msixRevision}`,
    mapping: {
      major: `${major} -> ${msixMajor} (MSIX major cannot be 0)`,
      minorPatch: `${minor}.${patch} -> ${msixMinor} (${minor} * 256 + ${patch})`,
      buildNumber: `${buildNumber} -> ${msixBuild}.${msixRevision} (high/low 16-bit split)`,
    },
  };
}

function renderText(version) {
  return [
    "PrivateClaw Windows Store version",
    `marketingVersion=${version.versionName}`,
    `buildNumber=${version.buildNumber}`,
    `msixVersion=${version.msixVersion}`,
    `majorMapping=${version.mapping.major}`,
    `minorPatchMapping=${version.mapping.minorPatch}`,
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
