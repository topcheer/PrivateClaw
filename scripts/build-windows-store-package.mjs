import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { repoRoot, resolveMobileVersion } from "./resolve-mobile-version.mjs";
import { resolveWindowsStoreVersion } from "./resolve-windows-store-version.mjs";

export const appRoot = path.join(repoRoot, "apps", "privateclaw_app");
export const outputDir = path.join(appRoot, "builds", "windows-store");

function parseArgs(argv) {
  const options = {
    architecture: "x64",
    skipBuild: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--architecture") {
      index += 1;
      options.architecture = argv[index] || "";
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["x64", "arm64"].includes(options.architecture)) {
    throw new Error(`--architecture must be x64 or arm64, received "${options.architecture}".`);
  }

  return options;
}

function printHelp() {
  console.log(
    [
      "Build an unsigned single-architecture Windows Store MSIX package.",
      "",
      "Usage:",
      "  node scripts/build-windows-store-package.mjs [--architecture x64|arm64] [--skip-build]",
      "",
      "Options:",
      "  --architecture  Target architecture. Defaults to x64.",
      "  --skip-build    Reuse an existing flutter build/windows release output.",
      "  --help          Show this help text.",
    ].join("\n"),
  );
}

export function ensureWindowsHost() {
  if (process.platform !== "win32") {
    throw new Error("Windows Store packaging must run on Windows or a Windows GitHub Actions runner.");
  }
}

export function run(command, args, cwd = appRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}.`);
  }
}

export function resolveWindowsStorePackageBaseName(mobileVersion, architecture) {
  return `PrivateClaw-v${mobileVersion.versionName}-b${mobileVersion.buildNumber}-windows-store-${architecture}`;
}

export function resolveWindowsStorePackagePath(mobileVersion, architecture) {
  return path.join(outputDir, `${resolveWindowsStorePackageBaseName(mobileVersion, architecture)}.msix`);
}

export function resolveWindowsStoreBundleBaseName(mobileVersion) {
  return `PrivateClaw-v${mobileVersion.versionName}-b${mobileVersion.buildNumber}-windows-store`;
}

export function resolveWindowsStoreBundlePath(mobileVersion) {
  return path.join(outputDir, `${resolveWindowsStoreBundleBaseName(mobileVersion)}.msixbundle`);
}

function isMainModule() {
  if (!process.argv[1]) {
    return false;
  }

  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  ensureWindowsHost();

  const mobileVersion = resolveMobileVersion();
  const storeVersion = resolveWindowsStoreVersion(mobileVersion);
  const outputName = resolveWindowsStorePackageBaseName(mobileVersion, options.architecture);

  if (!options.skipBuild) {
    run("flutter", [
      "build",
      "windows",
      "--release",
      "--build-name",
      String(mobileVersion.versionName),
      "--build-number",
      String(mobileVersion.buildNumber),
    ]);
  }

  run("flutter", [
    "pub",
    "run",
    "msix:create",
    "--build-windows",
    "false",
    "--architecture",
    options.architecture,
    "--version",
    storeVersion.msixVersion,
    "--output-name",
    outputName,
  ]);

  const artifactPath = resolveWindowsStorePackagePath(mobileVersion, options.architecture);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Expected MSIX artifact at ${artifactPath}, but it was not created.`);
  }

  console.log("");
  console.log("Windows Store MSIX package ready");
  console.log(`artifact=${artifactPath}`);
  console.log(`msixVersion=${storeVersion.msixVersion}`);
  console.log("storeUrl=https://apps.microsoft.com/detail/9P12LL1LT8RD");
}

if (isMainModule()) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
