import { spawn } from "node:child_process";
import type { PrivateClawProvider } from "./provider.js";
import {
  resolvePrivateClawMediaDir,
  writeInviteQrPng,
  writeInviteQrPreviewHtml,
} from "./invite-qr-files.js";
import {
  buildPrivateClawBackgroundHandoffFailureMessage,
  buildPrivateClawShutdownMessage,
  formatBilingualInline,
  PRIVATECLAW_INVITE_URI_LABEL,
  PRIVATECLAW_QR_PNG_PATH_LABEL,
  PRIVATECLAW_SESSION_ENDED_MESSAGE,
  PRIVATECLAW_WAITING_FOR_APP_MESSAGE,
  PRIVATECLAW_WAITING_FOR_APP_WITH_BACKGROUND_MESSAGE,
} from "./text.js";
import type { PrivateClawInviteBundle } from "./types.js";

export interface PairSessionOptions {
  provider: PrivateClawProvider;
  ttlMs?: number;
  label?: string;
  groupMode?: boolean;
  printOnly?: boolean;
  foreground?: boolean;
  openInBrowser?: boolean;
  qrMediaDir?: string;
  writeLine?: (line: string) => void;
  handoffToBackground?: () => Promise<string | void>;
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

async function waitForStdinEof(): Promise<void> {
  if (!process.stdin.isTTY || process.stdin.destroyed) {
    return new Promise<void>(() => undefined);
  }

  return new Promise((resolve) => {
    const wasPaused = process.stdin.isPaused();
    const handleEnd = () => {
      cleanup();
      resolve();
    };
    const handleClose = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      process.stdin.off("end", handleEnd);
      process.stdin.off("close", handleClose);
      if (wasPaused && !process.stdin.destroyed) {
        process.stdin.pause();
      }
    };

    process.stdin.once("end", handleEnd);
    process.stdin.once("close", handleClose);
    if (wasPaused) {
      process.stdin.resume();
    }
  });
}

async function waitForSessionsToDrain(
  provider: PrivateClawProvider,
  pollMs = 250,
): Promise<void> {
  while (provider.listActiveSessions().length > 0) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

export function printPairInviteBundle(
  bundle: PrivateClawInviteBundle,
  writeLine: (line: string) => void,
): void {
  writeLine(bundle.announcementText);
  writeLine(`${PRIVATECLAW_INVITE_URI_LABEL}: ${bundle.inviteUri}`);
  if (bundle.qrPngPath) {
    writeLine(`${PRIVATECLAW_QR_PNG_PATH_LABEL}: ${bundle.qrPngPath}`);
  }
  writeLine(bundle.qrTerminal);
}

export async function runPairSession({
  provider,
  ttlMs,
  label,
  groupMode = false,
  printOnly = false,
  foreground = true,
  openInBrowser = false,
  qrMediaDir,
  writeLine = (line) => {
    console.log(line);
  },
  handoffToBackground,
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

    printPairInviteBundle(bundle, writeLine);

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

    if (!foreground) {
      return bundle;
    }

    writeLine(
      handoffToBackground
        ? PRIVATECLAW_WAITING_FOR_APP_WITH_BACKGROUND_MESSAGE
        : PRIVATECLAW_WAITING_FOR_APP_MESSAGE,
    );
    for (;;) {
      const outcome = await Promise.race<
        | { kind: "signal"; signal: NodeJS.Signals }
        | { kind: "session-ended" }
        | { kind: "stdin-eof" }
      >([
        waitForShutdownSignal().then((signal) => ({ kind: "signal", signal })),
        waitForSessionsToDrain(provider).then(() => ({ kind: "session-ended" })),
        ...(handoffToBackground
          ? [waitForStdinEof().then(() => ({ kind: "stdin-eof" as const }))]
          : []),
      ]);
      if (outcome.kind === "stdin-eof") {
        try {
          const message = await handoffToBackground?.();
          if (message) {
            writeLine(message);
          }
          await provider.dispose({ closeSessions: false });
          return bundle;
        } catch (error) {
          writeLine(
            buildPrivateClawBackgroundHandoffFailureMessage(
              error instanceof Error ? error.message : String(error),
            ),
          );
          continue;
        }
      }
      if (outcome.kind === "signal") {
        writeLine(buildPrivateClawShutdownMessage(outcome.signal));
      } else {
        writeLine(PRIVATECLAW_SESSION_ENDED_MESSAGE);
      }
      break;
    }
    await provider.dispose();
    return bundle;
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
