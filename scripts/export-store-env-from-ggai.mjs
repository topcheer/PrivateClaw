import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const ggaiDoodleRoot = path.resolve(
  process.env.PRIVATECLAW_GGAIDOODLE_ROOT || path.join(os.homedir(), "ggai", "GGAiDoodle"),
);

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
  return filePath;
}

function firstMatch(content, regex, label) {
  const match = content.match(regex);
  if (!match?.[1]) {
    throw new Error(`Could not find ${label}`);
  }
  return match[1];
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\"'\"'`)}'`;
}

function resolveIosConfig() {
  const fastfilePath = requireFile(path.join(ggaiDoodleRoot, "ios", "fastlane", "Fastfile"), "GGAiDoodle iOS Fastfile");
  const fastfile = readText(fastfilePath);
  const keyId = firstMatch(fastfile, /key_id:\s*"([^"]+)"/, "App Store Connect key_id");
  const issuerId = firstMatch(fastfile, /issuer_id:\s*"([^"]+)"/, "App Store Connect issuer_id");
  const keyFileRelativePath = firstMatch(fastfile, /key_filepath:\s*"([^"]+)"/, "App Store Connect key_filepath");
  const keyFilePath = requireFile(path.resolve(path.dirname(path.dirname(fastfilePath)), keyFileRelativePath), "App Store Connect API key file");
  const teamId = resolveAppleTeamId();

  return {
    PRIVATECLAW_APP_STORE_CONNECT_KEY_ID: keyId,
    PRIVATECLAW_APP_STORE_CONNECT_ISSUER_ID: issuerId,
    PRIVATECLAW_APP_STORE_CONNECT_KEY_FILE: keyFilePath,
    ...(teamId ? { PRIVATECLAW_APPLE_TEAM_ID: teamId } : {}),
  };
}

function resolveAppleTeamId() {
  const provisioningProfilePath = path.join(
    ggaiDoodleRoot,
    "ios",
    "GuangguangDrawingFresh.mobileprovision",
  );
  if (!fs.existsSync(provisioningProfilePath)) {
    return "";
  }

  const decoded = execFileSync("security", ["cms", "-D", "-i", provisioningProfilePath], {
    encoding: "utf8",
  });
  const match = decoded.match(
    /<key>TeamIdentifier<\/key>\s*<array>\s*<string>([A-Z0-9]+)<\/string>/,
  );
  if (!match?.[1]) {
    throw new Error(
      `Could not find TeamIdentifier in provisioning profile: ${provisioningProfilePath}`,
    );
  }
  return match[1];
}

function resolveAndroidConfig() {
  const buildGradlePath = requireFile(path.join(ggaiDoodleRoot, "android", "app", "build.gradle"), "GGAiDoodle Android build.gradle");
  const buildGradle = readText(buildGradlePath);
  const androidAppfilePath = requireFile(path.join(ggaiDoodleRoot, "android", "fastlane", "Appfile"), "GGAiDoodle Android Appfile");
  const androidAppfile = readText(androidAppfilePath);

  const storeFileRelativePath = firstMatch(buildGradle, /storeFile\s+file\(['"]([^'"]+)['"]\)/, "Android storeFile");
  const storeFilePath = requireFile(path.resolve(path.dirname(buildGradlePath), storeFileRelativePath), "Android upload keystore");
  const storePassword = firstMatch(buildGradle, /storePassword\s+['"]([^'"]+)['"]/, "Android storePassword");
  const keyAlias = firstMatch(buildGradle, /keyAlias\s+['"]([^'"]+)['"]/, "Android keyAlias");
  const keyPassword = firstMatch(buildGradle, /keyPassword\s+['"]([^'"]+)['"]/, "Android keyPassword");
  const playJsonRelativePath = firstMatch(androidAppfile, /json_key_file\(['"]([^'"]+)['"]\)/, "Play json_key_file");
  const playJsonPath = requireFile(
    path.resolve(path.dirname(path.dirname(androidAppfilePath)), playJsonRelativePath),
    "Play service account json",
  );

  return {
    PRIVATECLAW_PLAY_STORE_JSON_KEY: playJsonPath,
    PRIVATECLAW_ANDROID_KEYSTORE_PATH: storeFilePath,
    PRIVATECLAW_ANDROID_KEYSTORE_PASSWORD: storePassword,
    PRIVATECLAW_ANDROID_KEY_ALIAS: keyAlias,
    PRIVATECLAW_ANDROID_KEY_PASSWORD: keyPassword,
  };
}

const env = {
  ...resolveIosConfig(),
  ...resolveAndroidConfig(),
};

for (const [key, value] of Object.entries(env)) {
  console.log(`export ${key}=${shellEscape(value)}`);
}
