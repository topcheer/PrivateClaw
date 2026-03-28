import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appRoot,
  ensureWindowsHost,
  outputDir,
  resolveWindowsStoreBundlePath,
  resolveWindowsStorePackagePath,
  run,
} from "./build-windows-store-package.mjs";
import { resolveMobileVersion } from "./resolve-mobile-version.mjs";
import { resolveWindowsStoreVersion } from "./resolve-windows-store-version.mjs";

const requiredArchitectures = ["x64", "arm64"];

function parseArgs(argv) {
  const options = {
    help: false,
    inputDir: outputDir,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--input-dir") {
      index += 1;
      options.inputDir = path.resolve(argv[index] || "");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(
    [
      "Build an unsigned Windows Store MSIX bundle from prebuilt x64 and arm64 MSIX packages.",
      "",
      "Usage:",
      "  node scripts/build-windows-store-bundle.mjs [--input-dir <directory>]",
      "",
      "Options:",
      "  --input-dir  Directory containing the architecture-specific .msix packages.",
      "               Defaults to apps/privateclaw_app/builds/windows-store/.",
      "  --help       Show this help text.",
      "",
      "Notes:",
      "  The bundle step does not build Flutter binaries itself.",
      "  Build the x64 and arm64 .msix packages first, then run this command.",
    ].join("\n"),
  );
}

function compareVersionParts(left, right) {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

function resolveSdkCandidates() {
  const kitsRoot = path.join(
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    "Windows Kits",
    "10",
    "bin",
  );

  if (!fs.existsSync(kitsRoot)) {
    return [];
  }

  return fs
    .readdirSync(kitsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => compareVersionParts(right, left))
    .flatMap((version) =>
      ["x64", "x86"].map((toolArch) => path.join(kitsRoot, version, toolArch, "MakeAppx.exe")),
    )
    .filter((candidate) => fs.existsSync(candidate));
}

function findMakeAppx() {
  const explicitPath = process.env.MAKEAPPX_PATH?.trim();
  if (explicitPath) {
    if (!fs.existsSync(explicitPath)) {
      throw new Error(`MAKEAPPX_PATH points to a missing file: ${explicitPath}`);
    }

    return explicitPath;
  }

  const pathCandidates = (process.env.PATH || "")
    .split(path.delimiter)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => path.join(segment, "MakeAppx.exe"))
    .filter((candidate) => fs.existsSync(candidate));

  const sdkCandidates = resolveSdkCandidates();
  const makeAppxPath = pathCandidates[0] || sdkCandidates[0];

  if (!makeAppxPath) {
    throw new Error(
      "Unable to locate MakeAppx.exe. Install the Windows 10/11 SDK or set MAKEAPPX_PATH explicitly.",
    );
  }

  return makeAppxPath;
}

function copyRequiredPackages(inputDir, mobileVersion, stagingDir) {
  const copiedPackages = [];

  for (const architecture of requiredArchitectures) {
    const packageName = path.basename(resolveWindowsStorePackagePath(mobileVersion, architecture));
    const sourcePath = path.join(inputDir, packageName);

    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        [
          `Missing required ${architecture} MSIX package: ${sourcePath}`,
          "Build both architectures first, for example:",
          "  npm run windows:store:package:x64",
          "  npm run windows:store:package:arm64",
        ].join("\n"),
      );
    }

    const destinationPath = path.join(stagingDir, packageName);
    fs.copyFileSync(sourcePath, destinationPath);
    copiedPackages.push(destinationPath);
  }

  return copiedPackages;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.help) {
    printHelp();
    return;
  }

  ensureWindowsHost();

  const mobileVersion = resolveMobileVersion();
  const storeVersion = resolveWindowsStoreVersion(mobileVersion);
  const artifactPath = resolveWindowsStoreBundlePath(mobileVersion);
  const makeAppxPath = findMakeAppx();

  fs.mkdirSync(outputDir, { recursive: true });

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "privateclaw-windows-store-bundle-"));

  try {
    const copiedPackages = copyRequiredPackages(options.inputDir, mobileVersion, stagingDir);

    if (fs.existsSync(artifactPath)) {
      fs.rmSync(artifactPath, { force: true });
    }

    run(makeAppxPath, [
      "bundle",
      "/o",
      "/d",
      stagingDir,
      "/p",
      artifactPath,
      "/bv",
      storeVersion.msixVersion,
    ]);

    if (!fs.existsSync(artifactPath)) {
      throw new Error(`Expected MSIX bundle at ${artifactPath}, but it was not created.`);
    }

    console.log("");
    console.log("Windows Store MSIX bundle ready");
    console.log(`artifact=${artifactPath}`);
    console.log(`msixVersion=${storeVersion.msixVersion}`);
    console.log(`inputs=${copiedPackages.join(",")}`);
    console.log("storeUrl=https://apps.microsoft.com/detail/9P12LL1LT8RD");
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
