import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const appRoot = path.join(repoRoot, "apps", "privateclaw_app");
const androidRoot = path.join(appRoot, "android");
const androidAppModuleRoot = path.join(androidRoot, "app");

const iosArtifactPath = path.join(appRoot, "builds", "ios", "PrivateClaw.ipa");
const macosArtifactPath = path.join(appRoot, "builds", "macos", "PrivateClaw.pkg");
const macosMetadataPath = path.join(appRoot, "macos", "fastlane", "metadata");
const macosScreenshotsPath = path.join(appRoot, "macos", "fastlane", "screenshots");
const androidArtifactPath = path.join(
  appRoot,
  "build",
  "app",
  "outputs",
  "bundle",
  "release",
  "app-release.aab",
);
const androidKeyPropertiesPath = path.join(androidRoot, "key.properties");

function expandHome(value) {
  if (!value || !value.startsWith("~")) {
    return value;
  }

  const homeDir = process.env.HOME;
  if (!homeDir) {
    return value;
  }

  return path.join(homeDir, value.slice(1));
}

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function pathExists(filePath) {
  return filePath ? fs.existsSync(filePath) : false;
}

function relativeToRepo(filePath) {
  return path.relative(repoRoot, filePath) || ".";
}

function parseProperties(filePath) {
  if (!pathExists(filePath)) {
    return {};
  }

  const entries = {};

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#") || !line.includes("=")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    entries[key] = value;
  }

  return entries;
}

function envStatus(name, { file = false, optional = false } = {}) {
  const rawValue = normalizeValue(process.env[name]);
  const expandedValue = expandHome(rawValue);
  const exists = file ? pathExists(expandedValue) : rawValue.length > 0;

  return {
    name,
    optional,
    present: rawValue.length > 0,
    ready: file ? rawValue.length > 0 && exists : rawValue.length > 0,
    detail: file
      ? rawValue.length > 0
        ? exists
          ? `file found at ${expandedValue}`
          : `file missing at ${expandedValue}`
        : "not set"
      : rawValue.length > 0
        ? "set"
        : "not set",
  };
}

function inheritedAndroidSigning(key, envName, properties) {
  const envValue = normalizeValue(process.env[envName]);
  if (envValue) {
    return {
      source: "env",
      value: envName === "PRIVATECLAW_ANDROID_KEYSTORE_PATH" ? expandHome(envValue) : envValue,
    };
  }

  const propertyValue = normalizeValue(properties[key]);
  if (!propertyValue) {
    return {
      source: "missing",
      value: "",
    };
  }

    return {
      source: "android/key.properties",
      value:
      key === "storeFile" && !path.isAbsolute(propertyValue)
        ? path.resolve(androidAppModuleRoot, propertyValue)
        : propertyValue,
    };
  }

function formatStatus(ok, label, detail) {
  return `${ok ? "[ok]" : "[missing]"} ${label} — ${detail}`;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createAppStoreConnectJwt() {
  const keyId = normalizeValue(process.env.PRIVATECLAW_APP_STORE_CONNECT_KEY_ID);
  const issuerId = normalizeValue(process.env.PRIVATECLAW_APP_STORE_CONNECT_ISSUER_ID);
  const keyFile = expandHome(normalizeValue(process.env.PRIVATECLAW_APP_STORE_CONNECT_KEY_FILE));
  if (!keyId || !issuerId || !keyFile || !pathExists(keyFile)) {
    return "";
  }

  const header = {
    alg: "ES256",
    kid: keyId,
    typ: "JWT",
  };
  const payload = {
    iss: issuerId,
    exp: Math.floor(Date.now() / 1000) + 1200,
    aud: "appstoreconnect-v1",
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("sha256", Buffer.from(signingInput), {
    key: fs.readFileSync(keyFile, "utf8"),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function appStoreConnectAppStatus(bundleId) {
  const token = createAppStoreConnectJwt();
  if (!token) {
    return {
      ready: false,
      detail: "could not verify (missing App Store Connect API credentials)",
    };
  }

  const response = await fetch(
    `https://api.appstoreconnect.apple.com/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = Array.isArray(body.errors) && body.errors.length > 0 ? body.errors[0] : null;
    return {
      ready: false,
      detail: error?.detail || `request failed with HTTP ${response.status}`,
    };
  }

  const total = body?.meta?.paging?.total;
  if (typeof total === "number" && total > 0) {
    return {
      ready: true,
      detail: `found ${total} app record${total === 1 ? "" : "s"} for bundle id ${bundleId}`,
    };
  }

  return {
    ready: false,
    detail: `no app record found for bundle id ${bundleId}`,
  };
}

const iosChecks = [
  envStatus("PRIVATECLAW_APP_STORE_CONNECT_KEY_ID"),
  envStatus("PRIVATECLAW_APP_STORE_CONNECT_ISSUER_ID"),
  envStatus("PRIVATECLAW_APP_STORE_CONNECT_KEY_FILE", { file: true }),
  envStatus("PRIVATECLAW_APPLE_ID", { optional: true }),
  envStatus("PRIVATECLAW_APPLE_TEAM_ID", { optional: true }),
  envStatus("PRIVATECLAW_ITC_TEAM_ID", { optional: true }),
  envStatus("PRIVATECLAW_TESTFLIGHT_EXTERNAL_GROUPS", { optional: true }),
  envStatus("PRIVATECLAW_TESTFLIGHT_NOTIFY_EXTERNAL_TESTERS", { optional: true }),
  envStatus("PRIVATECLAW_TESTFLIGHT_CHANGELOG", { optional: true }),
  envStatus("PRIVATECLAW_AUTOMATIC_RELEASE", { optional: true }),
];

const macosChecks = [
  envStatus("PRIVATECLAW_APP_STORE_CONNECT_KEY_ID"),
  envStatus("PRIVATECLAW_APP_STORE_CONNECT_ISSUER_ID"),
  envStatus("PRIVATECLAW_APP_STORE_CONNECT_KEY_FILE", { file: true }),
  envStatus("PRIVATECLAW_APPLE_TEAM_ID"),
  envStatus("PRIVATECLAW_ITC_TEAM_ID", { optional: true }),
  envStatus("PRIVATECLAW_AUTOMATIC_RELEASE", { optional: true }),
  envStatus("PRIVATECLAW_SKIP_MACOS_SCREENSHOTS", { optional: true }),
  envStatus("PRIVATECLAW_MACOS_INSTALLER_CERT_NAME", { optional: true }),
  envStatus("PRIVATECLAW_MACOS_CODE_SIGN_IDENTITY", { optional: true }),
];

const androidProperties = parseProperties(androidKeyPropertiesPath);
const androidSigningChecks = [
  {
    label: "PRIVATECLAW_ANDROID_KEYSTORE_PATH / android/key.properties:storeFile",
    ...inheritedAndroidSigning("storeFile", "PRIVATECLAW_ANDROID_KEYSTORE_PATH", androidProperties),
  },
  {
    label: "PRIVATECLAW_ANDROID_KEYSTORE_PASSWORD / android/key.properties:storePassword",
    ...inheritedAndroidSigning("storePassword", "PRIVATECLAW_ANDROID_KEYSTORE_PASSWORD", androidProperties),
  },
  {
    label: "PRIVATECLAW_ANDROID_KEY_ALIAS / android/key.properties:keyAlias",
    ...inheritedAndroidSigning("keyAlias", "PRIVATECLAW_ANDROID_KEY_ALIAS", androidProperties),
  },
  {
    label: "PRIVATECLAW_ANDROID_KEY_PASSWORD / android/key.properties:keyPassword",
    ...inheritedAndroidSigning("keyPassword", "PRIVATECLAW_ANDROID_KEY_PASSWORD", androidProperties),
  },
];

const iosReady = iosChecks.filter((entry) => !entry.optional).every((entry) => entry.ready);
const macosAppRecord = await appStoreConnectAppStatus("gg.ai.privateclaw");
const macosReady =
  macosChecks.filter((entry) => !entry.optional).every((entry) => entry.ready) && macosAppRecord.ready;
const playJsonCheck = envStatus("PRIVATECLAW_PLAY_STORE_JSON_KEY", { file: true });
const androidSigningReady = androidSigningChecks.every((entry) => {
  if (entry.label.includes("storeFile")) {
    return entry.value.length > 0 && pathExists(entry.value);
  }
  return entry.value.length > 0;
});
const androidReady = playJsonCheck.ready && androidSigningReady;

console.log("PrivateClaw store upload preflight");
console.log("");

console.log("iOS TestFlight / App Store Connect");
for (const entry of iosChecks) {
  const label = entry.optional ? `${entry.name} (optional)` : entry.name;
  console.log(formatStatus(entry.ready || entry.optional, label, entry.detail));
}
console.log(
  `[info] Existing IPA artifact — ${
    pathExists(iosArtifactPath)
      ? `found at ${relativeToRepo(iosArtifactPath)}`
      : "not found (fastlane beta will rebuild it)"
  }`,
);
console.log(`[summary] iOS upload ${iosReady ? "can start" : "is blocked by missing required inputs"}`);
console.log("[info] TestFlight external promote defaults to the App Store Connect group 'ext' when no override is set.");
console.log("");

console.log("macOS App Store Connect");
for (const entry of macosChecks) {
  const label = entry.optional ? `${entry.name} (optional)` : entry.name;
  console.log(formatStatus(entry.ready || entry.optional, label, entry.detail));
}
console.log(formatStatus(macosAppRecord.ready, "App Store Connect macOS app record", macosAppRecord.detail));
console.log(
  `[info] macOS metadata path — ${
    pathExists(macosMetadataPath)
      ? `found at ${relativeToRepo(macosMetadataPath)}`
      : "not found"
  }`,
);
console.log(
  `[info] macOS screenshots path — ${
    pathExists(macosScreenshotsPath)
      ? `found at ${relativeToRepo(macosScreenshotsPath)}`
      : "not found (real-interaction screenshots must be captured separately or PRIVATECLAW_SKIP_MACOS_SCREENSHOTS=true must be set for a no-screenshot upload attempt)"
  }`,
);
console.log(
  `[info] Existing macOS pkg artifact — ${
    pathExists(macosArtifactPath)
      ? `found at ${relativeToRepo(macosArtifactPath)}`
      : "not found (fastlane release will rebuild it)"
  }`,
);
console.log(
  `[summary] macOS upload ${macosReady ? "can start" : "is blocked by missing required inputs or App Store Connect setup"}`,
);
console.log("");

console.log("Android Play Internal Track");
console.log(formatStatus(playJsonCheck.ready, playJsonCheck.name, playJsonCheck.detail));
for (const entry of [
  envStatus("PRIVATECLAW_PLAY_RELEASE_STATUS", { optional: true }),
  envStatus("PRIVATECLAW_PLAY_CLOSED_TRACK", { optional: true }),
  envStatus("PRIVATECLAW_PLAY_PROMOTE_FROM_TRACK", { optional: true }),
  envStatus("PRIVATECLAW_PLAY_METADATA_TRACK", { optional: true }),
  envStatus("PRIVATECLAW_PLAY_METADATA_VERSION_CODE", { optional: true }),
]) {
  const label = `${entry.name} (optional)`;
  console.log(formatStatus(entry.ready || entry.optional, label, entry.detail));
}
for (const entry of androidSigningChecks) {
  const ready =
    entry.label.includes("storeFile") ? entry.value.length > 0 && pathExists(entry.value) : entry.value.length > 0;
  const detail =
    entry.source === "missing"
      ? "not set"
      : entry.label.includes("storeFile")
        ? `${entry.source} -> ${ready ? `file found at ${entry.value}` : `file missing at ${entry.value}`}`
        : `loaded from ${entry.source}`;
  console.log(formatStatus(ready, entry.label, detail));
}
console.log(
  `[info] Existing AAB artifact — ${
    pathExists(androidArtifactPath)
      ? `found at ${relativeToRepo(androidArtifactPath)}`
      : "not found (fastlane internal will rebuild it)"
  }`,
);
console.log(
  "[info] Google Play requires the first binary for a brand-new app to be uploaded manually in Play Console before the internal track can be automated.",
);
console.log(`[summary] Android upload ${androidReady ? "can start" : "is blocked by missing required inputs"}`);

process.exitCode = iosReady && macosReady && androidReady ? 0 : 1;
