import { spawn } from "node:child_process";
import type { PrivateClawProvider } from "./provider.js";
import {
  resolvePrivateClawMediaDir,
  writeInviteQrPng,
  writeInviteQrPreviewHtml,
} from "./invite-qr-files.js";
import {
  buildPrivateClawShutdownMessage,
  formatBilingualInline,
  PRIVATECLAW_INVITE_URI_LABEL,
  PRIVATECLAW_QR_PNG_PATH_LABEL,
  PRIVATECLAW_WAITING_FOR_APP_MESSAGE,
} from "./text.js";
import type { PrivateClawInviteBundle } from "./types.js";

export interface PairSessionOptions {
  provider: PrivateClawProvider;
  ttlMs?: number;
  label?: string;
  groupMode?: boolean;
  printOnly?: boolean;
  openInBrowser?: boolean;
  qrMediaDir?: string;
  writeLine?: (line: string) => void;
}

export function parsePositiveIntegerFlag(
  value: string | undefined,
  label: string,
): number | undefined {
  if (!value || value.trim() === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      formatBilingualInline(
        `${label} 必须是正整数。`,
        `${label} must be a positive integer.`,
      ),
    );
  }

  return parsed;
}

async function waitForShutdownSignal(): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    const handleSigint = () => {
      cleanup();
      resolve("SIGINT");
    };
    const handleSigterm = () => {
      cleanup();
      resolve("SIGTERM");
    };
    const cleanup = () => {
      process.off("SIGINT", handleSigint);
      process.off("SIGTERM", handleSigterm);
    };

    process.once("SIGINT", handleSigint);
    process.once("SIGTERM", handleSigterm);
  });
}

export async function runPairSession({
  provider,
  ttlMs,
  label,
  groupMode = false,
  printOnly = false,
  openInBrowser = false,
  qrMediaDir,
  writeLine = (line) => {
    console.log(line);
  },
}: PairSessionOptions): Promise<PrivateClawInviteBundle> {
  try {
    const inviteBundle = await provider.createInviteBundle({
      ...(typeof ttlMs === "number" ? { ttlMs } : {}),
      ...(label ? { label: label.trim() } : {}),
      ...(groupMode ? { groupMode: true } : {}),
    });
    const qrPng = await writeInviteQrPng(
      inviteBundle,
      qrMediaDir ?? resolvePrivateClawMediaDir(),
    );
    const bundle: PrivateClawInviteBundle = {
      ...inviteBundle,
      qrPngPath: qrPng.pngPath,
    };

    writeLine(bundle.announcementText);
    writeLine(`${PRIVATECLAW_INVITE_URI_LABEL}: ${bundle.inviteUri}`);
    writeLine(`${PRIVATECLAW_QR_PNG_PATH_LABEL}: ${qrPng.pngPath}`);
    writeLine(bundle.qrTerminal);

    if (openInBrowser) {
      const preview = await writeInviteQrPreviewHtml(
        bundle,
        qrMediaDir ?? resolvePrivateClawMediaDir(),
        qrPng.pngPath,
      );
      await openInBrowserPreview(preview.previewFileUrl);
    }

    if (printOnly) {
      await provider.dispose();
      return bundle;
    }

    writeLine(PRIVATECLAW_WAITING_FOR_APP_MESSAGE);
    process.stdin.resume();
    try {
      const signal = await waitForShutdownSignal();
      writeLine(buildPrivateClawShutdownMessage(signal));
      await provider.dispose();
      return bundle;
    } finally {
      process.stdin.pause();
    }
  } catch (error) {
    await provider.dispose();
    throw error;
  }
}

async function openInBrowserPreview(target: string): Promise<void> {
  const command =
    process.platform === "win32"
      ? {
          file: "cmd.exe",
          args: ["/d", "/s", "/c", `start "" "${target.replace(/"/gu, '""')}"`],
        }
      : process.platform === "darwin"
        ? { file: "open", args: [target] }
        : { file: "xdg-open", args: [target] };

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command.file, command.args, {
      stdio: "ignore",
      ...(process.platform === "win32" ? { windowsHide: true } : {}),
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          formatBilingualInline(
            `无法打开二维码预览页（退出码 ${code ?? "unknown"}）。`,
            `Failed to open the QR preview page (exit code ${code ?? "unknown"}).`,
          ),
        ),
      );
    });
  });
}
