#!/usr/bin/env node
// scripts/windows-store-listing.mjs
//
// Upload Windows Store listing metadata, packages, and images
// via the Microsoft Partner Center Submission API.
//
// Usage:
//   node scripts/windows-store-listing.mjs --test                          # auth + show current state
//   node scripts/windows-store-listing.mjs --submit                        # update listings (draft)
//   node scripts/windows-store-listing.mjs --submit --package <path.msixbundle>  # + upload package
//   node scripts/windows-store-listing.mjs --submit --package <path> --commit    # + submit for cert

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const APP_DIR = path.join(ROOT, "apps", "privateclaw_app");
const ASSETS_DIR = path.join(APP_DIR, "windows-store-assets");

const BASE_URL = "https://manage.devcenter.microsoft.com/v1.0/my";
const PRIVACY_URL = "https://privateclaw.us/privacy/";
const SUPPORT_EMAIL = "msstore@liop.dev";
const WEBSITE_URL = "https://privateclaw.us";

// ── Credential loading ──────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(APP_DIR, "windows-store.env");
  if (!fs.existsSync(envPath)) {
    console.error(`❌ Missing credential file: ${envPath}`);
    console.error(
      "   Create it with WINDOWS_STORE_TENANT_ID, WINDOWS_STORE_CLIENT_ID, WINDOWS_STORE_CLIENT_SECRET"
    );
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

// ── Azure AD token ──────────────────────────────────────────────────

async function getToken() {
  const { WINDOWS_STORE_TENANT_ID, WINDOWS_STORE_CLIENT_ID, WINDOWS_STORE_CLIENT_SECRET } =
    process.env;
  const url = `https://login.microsoftonline.com/${WINDOWS_STORE_TENANT_ID}/oauth2/v2.0/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: WINDOWS_STORE_CLIENT_ID,
      client_secret: WINDOWS_STORE_CLIENT_SECRET,
      scope: "https://manage.devcenter.microsoft.com/.default",
    }),
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Auth failed: ${JSON.stringify(data, null, 2)}`);
  }
  return data.access_token;
}

// ── API helpers ─────────────────────────────────────────────────────

async function api(token, method, endpoint, body) {
  const url = `${BASE_URL}/${endpoint}`;
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const opts = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(120_000),
    };
    if (body !== undefined) {
      const json = JSON.stringify(body);
      if (attempt === 1) console.log(`   [debug] ${method} ${endpoint} (${(json.length / 1024).toFixed(1)} KB)`);
      opts.body = json;
    }
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      if (attempt < maxRetries) {
        console.log(`   [retry ${attempt}/${maxRetries}] ${err.cause?.code || err.message} — waiting 3s...`);
        await new Promise((r) => setTimeout(r, 3000));
        continue;
      }
      throw new Error(`API ${method} ${endpoint} → network error after ${maxRetries} attempts: ${err.cause || err.message}`);
    }
    if (res.status === 204) return null;
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API ${method} ${endpoint} → ${res.status}: ${text.slice(0, 2000)}`);
    }
    return res.json();
  }
}

async function uploadZipToBlob(sasUrl, zipPath) {
  const data = fs.readFileSync(zipPath);
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(sasUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": "application/zip",
          "Content-Length": String(data.length),
        },
        body: data,
        signal: AbortSignal.timeout(300_000), // 5 min for large uploads
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Blob upload failed: ${res.status} ${text}`);
      }
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        console.log(`   [retry ${attempt}/${maxRetries}] Upload error: ${err.cause?.code || err.message} — waiting 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
}

// ── Listing data ────────────────────────────────────────────────────

function buildListings() {
  return {
    "en-us": {
      baseListing: {
        title: "PrivateClaw",
        shortTitle: "PrivateClaw",
        voiceTitle: "Private Claw",
        privacyUrl: PRIVACY_URL,
        supportContact: SUPPORT_EMAIL,
        websiteUrl: "https://privateclaw.us",
        shortDescription:
          "Leave public chat behind. PrivateClaw creates a private, end-to-end encrypted channel between you and your AI assistant. Scan a one-time QR invite, and the relay never sees your messages. Secure, lightweight, no account needed.",
        description: [
          "PrivateClaw creates a private, end-to-end encrypted path between you and a self-hosted or cloud OpenClaw AI deployment.",
          "",
          "Use a one-time QR invite to join a session, keep the relay blind to message contents, and move sensitive conversations away from public chat surfaces like Telegram, Discord, or QQ.",
          "",
          "All messages are encrypted with AES-256-GCM before leaving your device. The session key stays local — the relay server only routes ciphertext and never has access to your plaintext. No account registration is required, and there are no ads or tracking SDKs.",
          "",
          "Whether you run your own server or connect to a cloud relay, PrivateClaw gives you full control over your private AI conversations.",
        ].join("\n"),
        features: [
          "End-to-end AES-256-GCM encryption for all messages",
          "Zero-knowledge relay — server never sees plaintext",
          "Scan QR code or paste invite link to connect instantly",
          "No account registration required",
          "Group chat with multiple encrypted participants",
          "Markdown rendering with Mermaid diagram support",
          "Send and receive images, audio, video, and files",
          "Encrypted file uploads alongside text messages",
          "Voice messaging with provider-side transcription",
          "Automatic session renewal before expiry",
          "Slash commands: /renew-session, /mute-bot, /unmute-bot",
          "Works with self-hosted or cloud relays",
          "Deterministic participant avatars for easy identification",
          "Persistent app identity across reconnects",
          "Join/leave system notices in group sessions",
          "Multi-language UI with bilingual system notices",
          "No advertising SDKs or analytics tracking",
          "Lightweight and fast — minimal resource usage",
          "Cross-platform: Windows, macOS, Linux, iOS, Android",
          "Session keys stay local — you own your privacy",
        ],
      },
    },
    "zh-hans-cn": {
      baseListing: {
        title: "PrivateClaw",
        shortTitle: "PrivateClaw",
        voiceTitle: "Private Claw",
        privacyUrl: PRIVACY_URL,
        supportContact: SUPPORT_EMAIL,
        websiteUrl: "https://privateclaw.us",
        shortDescription:
          "告别公开聊天。PrivateClaw 在你与 AI 助手之间建立一条私密的端到端加密通道。扫描一次性二维码即可加入会话，中继服务器全程看不到消息明文。安全轻量，无需注册账号。",
        description: [
          "PrivateClaw 为你与自托管或云端 OpenClaw AI 部署之间建立一条私密的端到端加密通道。",
          "",
          "使用一次性二维码邀请加入会话，让中继服务器始终看不到消息明文，把敏感对话从 Telegram、Discord、QQ 等公开聊天界面迁移出去。",
          "",
          "所有消息在离开设备前均使用 AES-256-GCM 加密。会话密钥仅保留在本地 — 中继服务器只负责转发密文，绝不接触明文内容。无需注册账号，没有广告，没有追踪 SDK。",
          "",
          "无论你自建服务器还是接入云端中继，PrivateClaw 都让你完全掌控自己的私密 AI 对话。",
        ].join("\n"),
        features: [
          "所有消息采用端到端 AES-256-GCM 加密",
          "零知识中继 — 服务器始终看不到明文",
          "扫码或粘贴邀请链接，即刻连接",
          "无需注册账号",
          "支持多人加密群组会话",
          "Markdown 渲染，支持 Mermaid 图表",
          "收发图片、音频、视频和文件",
          "加密文件上传，可伴随文本消息",
          "语音消息，支持服务端语音转文字",
          "会话到期前自动续期",
          "斜杠命令：/renew-session、/mute-bot、/unmute-bot",
          "支持自建服务器或云端中继",
          "确定性参与者头像，轻松辨识身份",
          "重连后保持稳定的应用身份",
          "群组会话中显示加入/离开系统通知",
          "多语言界面，系统通知支持双语",
          "无广告 SDK，无数据追踪",
          "轻量快速，资源占用极低",
          "跨平台：Windows、macOS、Linux、iOS、Android",
          "会话密钥仅保存在本地 — 隐私由你掌控",
        ],
      },
    },
    "zh-hant-tw": {
      baseListing: {
        title: "PrivateClaw",
        shortTitle: "PrivateClaw",
        voiceTitle: "Private Claw",
        privacyUrl: PRIVACY_URL,
        supportContact: SUPPORT_EMAIL,
        websiteUrl: "https://privateclaw.us",
        shortDescription:
          "告別公開聊天。PrivateClaw 在你與 AI 助手之間建立一條私密的端對端加密通道。掃描一次性 QR 邀請即可加入會話，中繼伺服器全程看不到訊息明文。安全輕量，無需註冊帳號。",
        description: [
          "PrivateClaw 為你與自架或雲端 OpenClaw AI 部署之間建立一條私密的端對端加密通道。",
          "",
          "透過一次性 QR 邀請加入會話，讓中繼伺服器始終看不到訊息明文，把敏感對話從 Telegram、Discord、QQ 等公開聊天介面中移開。",
          "",
          "所有訊息在離開裝置前均使用 AES-256-GCM 加密。會話金鑰僅保留在本地 — 中繼伺服器只負責轉發密文，絕不接觸明文內容。無需註冊帳號，沒有廣告，沒有追蹤 SDK。",
          "",
          "無論你自建伺服器還是接入雲端中繼，PrivateClaw 都讓你完全掌控自己的私密 AI 對話。",
        ].join("\n"),
        features: [
          "所有訊息採用端對端 AES-256-GCM 加密",
          "零知識中繼 — 伺服器始終看不到明文",
          "掃碼或貼上邀請連結，即刻連線",
          "無需註冊帳號",
          "支援多人加密群組會話",
          "Markdown 渲染，支援 Mermaid 圖表",
          "收發圖片、音訊、影片和檔案",
          "加密檔案上傳，可伴隨文字訊息",
          "語音訊息，支援伺服端語音轉文字",
          "會話到期前自動續期",
          "斜線命令：/renew-session、/mute-bot、/unmute-bot",
          "支援自建伺服器或雲端中繼",
          "確定性參與者頭像，輕鬆辨識身分",
          "重新連線後保持穩定的應用程式身分",
          "群組會話中顯示加入/離開系統通知",
          "多語言介面，系統通知支援雙語",
          "無廣告 SDK，無資料追蹤",
          "輕量快速，資源佔用極低",
          "跨平台：Windows、macOS、Linux、iOS、Android",
          "會話金鑰僅保存在本地 — 隱私由你掌控",
        ],
      },
    },
  };
}

function buildImageEntries() {
  return [
    {
      fileName: "StoreLogo_1080x1080.png",
      fileStatus: "PendingUpload",
      imageType: "StoreLogoSquare",
      description: "PrivateClaw square store logo",
    },
    {
      fileName: "StorePoster_720x1080.png",
      fileStatus: "PendingUpload",
      imageType: "StoreLogo9x16",
      description: "PrivateClaw portrait store poster",
    },
    {
      fileName: "Screenshot_1366x768.png",
      fileStatus: "PendingUpload",
      imageType: "Screenshot",
      description: "PrivateClaw desktop — encrypted group chat session",
    },
  ];
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const testOnly = args.includes("--test");
  const submit = args.includes("--submit");

  if (!testOnly && !submit) {
    console.log("Usage:");
    console.log("  node scripts/windows-store-listing.mjs --test     Auth test + show current state");
    console.log("  node scripts/windows-store-listing.mjs --submit   Update listings + commit");
    process.exit(0);
  }

  loadEnv();

  // ── Step 1: Auth ──
  console.log("🔑 Authenticating with Azure AD...");
  const token = await getToken();
  console.log("   ✅ Token acquired\n");

  // ── Step 2: Find app ──
  console.log("📱 Fetching applications...");
  const apps = await api(token, "GET", "applications");
  const appList = apps.value || [];
  console.log(`   Found ${appList.length} app(s)`);

  const app = appList.find(
    (a) =>
      a.packageIdentityName === "GuangGuangAIStudio.PrivateClaw" ||
      a.primaryName === "PrivateClaw"
  );

  if (!app) {
    console.error("❌ PrivateClaw not found. Available apps:");
    for (const a of appList) {
      console.error(`   - ${a.primaryName} (${a.id}) pkg=${a.packageIdentityName}`);
    }
    process.exit(1);
  }

  const appId = app.id;
  console.log(`   ✅ ${app.primaryName} → ${appId}`);
  console.log(`      Package: ${app.packageIdentityName}`);
  if (app.lastPublishedApplicationSubmission) {
    console.log(`      Last published submission: ${app.lastPublishedApplicationSubmission.id}`);
  }
  if (app.pendingApplicationSubmission) {
    console.log(`      ⚠️  Pending submission: ${app.pendingApplicationSubmission.id}`);
  }

  // ── Step 3: Inspect current submission ──
  if (app.lastPublishedApplicationSubmission) {
    console.log("\n📋 Current published listing locales:");
    try {
      const sub = await api(
        token,
        "GET",
        `applications/${appId}/submissions/${app.lastPublishedApplicationSubmission.id}`
      );
      const locales = Object.keys(sub.listings || {});
      for (const loc of locales) {
        const l = sub.listings[loc].baseListing;
        console.log(`   ${loc}: "${l.title}" (${(l.features || []).length} features, ${(l.images || []).length} images)`);
      }
    } catch (e) {
      console.log(`   (could not fetch details: ${e.message})`);
    }
  }

  if (testOnly) {
    console.log("\n✅ Auth and app lookup succeeded. Use --submit to update listings.");
    return;
  }

  // ── Step 4: Get or create submission ──
  let submission;
  let subId;
  const forceFresh = args.includes("--fresh");

  if (app.pendingApplicationSubmission) {
    const pendingId = app.pendingApplicationSubmission.id;
    if (forceFresh) {
      console.log(`\n🗑️  --fresh: Deleting pending submission ${pendingId}...`);
      await api(token, "DELETE", `applications/${appId}/submissions/${pendingId}`);
      console.log("   ✅ Deleted");
      console.log("📝 Creating new submission...");
      submission = await api(token, "POST", `applications/${appId}/submissions`);
      subId = submission.id;
      console.log(`   ✅ Submission ${subId} created`);
    } else {
      console.log(`\n📝 Checking pending submission ${pendingId}...`);
      const pending = await api(token, "GET", `applications/${appId}/submissions/${pendingId}`);
      if (pending.status === "PendingCommit") {
        submission = pending;
        subId = pendingId;
        console.log(`   ✅ Reusing (status: ${pending.status})`);
      } else {
        console.log(`   ⚠️  Status "${pending.status}" — deleting and recreating...`);
        await api(token, "DELETE", `applications/${appId}/submissions/${pendingId}`);
        console.log("   🗑️  Deleted");
        submission = await api(token, "POST", `applications/${appId}/submissions`);
        subId = submission.id;
        console.log(`   ✅ New submission ${subId} created`);
      }
    }
  } else {
    console.log("\n📝 Creating new submission...");
    submission = await api(token, "POST", `applications/${appId}/submissions`);
    subId = submission.id;
    console.log(`   ✅ Submission ${subId} created`);
  }

  // ── Step 6: Merge our listing data into the cloned submission ──
  const newListings = buildListings();
  const imageEntries = buildImageEntries();

  // Set required fields if missing
  if (!submission.applicationCategory || submission.applicationCategory === "NotSet") {
    submission.applicationCategory = "UtilitiesAndTools";
  }
  // Device families — desktop only for now
  if (!submission.allowTargetFutureDeviceFamilies || !Object.keys(submission.allowTargetFutureDeviceFamilies).length) {
    submission.allowTargetFutureDeviceFamilies = {
      Desktop: true,
      Mobile: false,
      Holographic: false,
      Xbox: false,
    };
  }

  // Discover which locale keys the API expects (may be zh-hans-cn or zh-cn, etc.)
  const existingLocales = Object.keys(submission.listings || {});
  console.log(`   Existing locales: ${existingLocales.join(", ") || "(none)"}`);

  // Map our canonical locale keys to what the API already uses
  const localeMap = {
    "en-us": findLocale(existingLocales, ["en-us", "en"]) || "en-us",
    "zh-hans-cn": findLocale(existingLocales, ["zh-hans-cn", "zh-cn", "zh-hans"]) || "zh-hans-cn",
    "zh-hant-tw": findLocale(existingLocales, ["zh-hant-tw", "zh-tw", "zh-hant"]) || "zh-hant-tw",
  };
  console.log(
    `   Locale mapping: ${Object.entries(localeMap)
      .map(([k, v]) => `${k}→${v}`)
      .join(", ")}`
  );

   // Update or create listings for each target locale
  for (const [canonical, apiLocale] of Object.entries(localeMap)) {
    const src = newListings[canonical];
    if (!submission.listings[apiLocale]) {
      submission.listings[apiLocale] = { baseListing: {} };
    }
    const dest = submission.listings[apiLocale].baseListing;

    dest.title = src.baseListing.title;
    dest.shortTitle = src.baseListing.shortTitle;
    dest.voiceTitle = src.baseListing.voiceTitle;
    dest.shortDescription = src.baseListing.shortDescription;
    dest.description = src.baseListing.description;
    dest.features = src.baseListing.features;
    dest.privacyUrl = src.baseListing.privacyUrl;
    dest.supportContact = src.baseListing.supportContact;
    dest.websiteUrl = src.baseListing.websiteUrl;

    // Replace all images with our set
    dest.images = [...imageEntries];
  }

  // ── Step 6b: Set pricing (use Free via API; paid pricing must be set in Partner Center UI) ──
  submission.pricing = {
    trialPeriod: "NoFreeTrial",
    marketSpecificPricings: {},
    sales: [],
    priceId: "Free",
    isAdvancedPricingModel: false,
  };

  // ── Step 6c: Add MSIXBUNDLE package if --package provided ──
  const pkgIdx = args.indexOf("--package");
  const pkgPath = pkgIdx >= 0 ? args[pkgIdx + 1] : null;
  if (pkgPath) {
    if (!fs.existsSync(pkgPath)) {
      console.error(`❌ Package file not found: ${pkgPath}`);
      process.exit(1);
    }
    const pkgName = path.basename(pkgPath);
    console.log(`\n📦 Including package: ${pkgName} (${(fs.statSync(pkgPath).size / 1024 / 1024).toFixed(1)} MB)`);
    // Clear existing packages and add ours
    submission.applicationPackages = [
      {
        fileName: pkgName,
        fileStatus: "PendingUpload",
        minimumDirectXVersion: "None",
        minimumSystemRam: "None",
      },
    ];
  }

  // ── Step 7: PUT updated submission ──
  console.log("\n📤 Updating submission...");
  submission = await api(token, "PUT", `applications/${appId}/submissions/${subId}`, submission);
  console.log("   ✅ Submission updated");
  console.log(`   Pricing: ${submission.pricing?.priceId}`);
  console.log(`   Packages: ${submission.applicationPackages?.length || 0}`);
  console.log(`   Listings: ${Object.keys(submission.listings || {}).join(", ")}`);

  // ── Step 8: Upload assets (images + package) to Azure Blob ──
  const uploadUrl = submission.fileUploadUrl;
  if (uploadUrl) {
    console.log("\n📤 Uploading assets to Azure Blob...");

    const zipPath = path.join(ASSETS_DIR, "_upload.zip");
    // Remove old zip if present
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    // Build ZIP with images
    const imageFiles = "StoreLogo_1080x1080.png StorePoster_720x1080.png Screenshot_1366x768.png";
    execSync(`cd "${ASSETS_DIR}" && zip -j "${zipPath}" ${imageFiles}`, { stdio: "pipe" });
    console.log(`   Images ZIP: ${(fs.statSync(zipPath).size / 1024).toFixed(1)} KB`);

    // Add MSIXBUNDLE to the ZIP if provided
    if (pkgPath) {
      execSync(`zip -j "${zipPath}" "${path.resolve(pkgPath)}"`, { stdio: "pipe" });
      console.log(`   + Package added → ZIP: ${(fs.statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB`);
    }

    await uploadZipToBlob(uploadUrl, zipPath);
    console.log("   ✅ Uploaded to Azure Blob");

    fs.unlinkSync(zipPath);
  } else {
    console.warn("   ⚠️  No fileUploadUrl in submission — skipping upload");
  }

  // ── Step 9: Commit ──
  if (args.includes("--commit")) {
    console.log("\n🚀 Committing submission for certification...");
    await api(token, "POST", `applications/${appId}/submissions/${subId}/commit`);
    console.log("   ✅ Committed");

    // Poll status
    const status = await api(token, "GET", `applications/${appId}/submissions/${subId}/status`);
    console.log(`\n📊 Status: ${status.status}`);
    if (status.statusDetails?.errors?.length) {
      console.log("   Errors:");
      for (const e of status.statusDetails.errors) {
        console.log(`     ❌ ${e.code}: ${e.details}`);
      }
    }
    if (status.statusDetails?.warnings?.length) {
      console.log("   Warnings:");
      for (const w of status.statusDetails.warnings) {
        console.log(`     ⚠️  ${w.code}: ${w.details}`);
      }
    }
  } else {
    console.log("\n📌 Submission saved as draft (no --commit flag).");
    console.log("   To submit for certification: node scripts/windows-store-listing.mjs --submit --commit");
  }

  console.log("\n✅ Done! Submission ID:", subId);
  console.log("   Partner Center: https://partner.microsoft.com/dashboard");
}

function findLocale(existing, candidates) {
  const lower = existing.map((l) => l.toLowerCase());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) return existing[idx];
  }
  return null;
}

main().catch((err) => {
  console.error("\n❌ Fatal:", err.message || err);
  process.exit(1);
});
