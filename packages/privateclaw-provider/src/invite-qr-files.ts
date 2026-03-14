import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import QRCode from "qrcode";
import {
  PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
  PRIVATECLAW_QR_IMAGE_MARGIN,
  PRIVATECLAW_QR_PNG_WIDTH,
} from "./qr-options.js";
import type { PrivateClawInviteBundle } from "./types.js";

export interface PrivateClawQrPngArtifact {
  pngPath: string;
  pngFileUrl: string;
}

export interface PrivateClawQrPreviewArtifact {
  previewPath: string;
  previewFileUrl: string;
}

export function resolvePrivateClawMediaDir(
  baseStateDir: string = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw"),
): string {
  return path.join(baseStateDir, "media", "privateclaw");
}

export async function writeInviteQrPng(
  bundle: PrivateClawInviteBundle,
  mediaDir: string,
): Promise<PrivateClawQrPngArtifact> {
  const pngBuffer = await QRCode.toBuffer(bundle.inviteUri, {
    type: "png",
    errorCorrectionLevel: PRIVATECLAW_QR_ERROR_CORRECTION_LEVEL,
    margin: PRIVATECLAW_QR_IMAGE_MARGIN,
    width: PRIVATECLAW_QR_PNG_WIDTH,
  });
  await mkdir(mediaDir, { recursive: true });
  const pngPath = path.join(mediaDir, `privateclaw-${bundle.invite.sessionId}.png`);
  await writeFile(pngPath, pngBuffer);
  return {
    pngPath,
    pngFileUrl: pathToFileURL(pngPath).href,
  };
}

export async function writeInviteQrPreviewHtml(
  bundle: PrivateClawInviteBundle,
  mediaDir: string,
  pngPath: string,
): Promise<PrivateClawQrPreviewArtifact> {
  await mkdir(mediaDir, { recursive: true });
  const previewPath = path.join(
    mediaDir,
    `privateclaw-${bundle.invite.sessionId}.html`,
  );
  const html = buildPreviewHtml(bundle, path.basename(pngPath));
  await writeFile(previewPath, html, "utf8");
  return {
    previewPath,
    previewFileUrl: pathToFileURL(previewPath).href,
  };
}

function buildPreviewHtml(bundle: PrivateClawInviteBundle, pngFilename: string): string {
  const title = escapeHtml(`PrivateClaw QR • ${bundle.invite.sessionId}`);
  const announcementHtml = escapeHtml(bundle.announcementText).replace(/\r?\n/gu, "<br />");
  const inviteHtml = escapeHtml(bundle.inviteUri);
  const qrSrc = escapeHtml(pngFilename);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "SF Pro Display", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top, rgba(122, 164, 255, 0.24), transparent 46%),
          linear-gradient(160deg, #060816 0%, #0d1730 48%, #05070e 100%);
        color: #f4f7ff;
      }
      main {
        width: min(92vw, 560px);
        padding: 28px;
        border-radius: 28px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: rgba(11, 18, 35, 0.82);
        box-shadow: 0 22px 64px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(18px);
      }
      h1 {
        margin: 0 0 14px;
        font-size: 1.35rem;
      }
      p {
        margin: 0;
        line-height: 1.6;
        color: rgba(234, 240, 255, 0.86);
      }
      img {
        display: block;
        width: min(100%, 320px);
        margin: 22px auto;
        border-radius: 20px;
        background: white;
        padding: 12px;
      }
      pre {
        margin: 0;
        padding: 14px;
        overflow: auto;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.06);
        color: #cfe2ff;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .hint {
        margin-top: 16px;
        font-size: 0.92rem;
        color: rgba(207, 226, 255, 0.76);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>${announcementHtml}</p>
      <img src="./${qrSrc}" alt="PrivateClaw QR code" />
      <pre>${inviteHtml}</pre>
      <p class="hint">Scan this code with PrivateClaw, or copy the invite URI if your device is already ready to join.</p>
    </main>
  </body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
