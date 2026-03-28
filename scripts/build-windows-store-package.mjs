import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { repoRoot, resolveMobileVersion } from "./resolve-mobile-version.mjs";
import { resolveWindowsStoreVersion } from "./resolve-windows-store-version.mjs";

const appRoot = path.join(repoRoot, "apps", "privateclaw_app");
const outputDir = path.join(appRoot, "builds", "windows-store");

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
      "Build an unsigned Windows Store MSIX package for manual Partner Center upload.",
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

function run(command, args, cwd = appRoot) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

if (process.platform !== "win32") {
  throw new Error("Windows Store MSIX packaging must run on Windows or a Windows GitHub Actions runner.");
}

const mobileVersion = resolveMobileVersion();
const storeVersion = resolveWindowsStoreVersion(mobileVersion);
const outputName = `PrivateClaw-v${mobileVersion.versionName}-b${mobileVersion.buildNumber}-windows-store-${options.architecture}`;

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

run("dart", [
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

const artifactPath = path.join(outputDir, `${outputName}.msix`);

if (!fs.existsSync(artifactPath)) {
  throw new Error(`Expected MSIX artifact at ${artifactPath}, but it was not created.`);
}

console.log("");
console.log("Windows Store MSIX package ready");
console.log(`artifact=${artifactPath}`);
console.log(`msixVersion=${storeVersion.msixVersion}`);
console.log("storeUrl=https://apps.microsoft.com/detail/9P12LL1LT8RD");
