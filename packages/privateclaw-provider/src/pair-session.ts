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
  writePrivateClawAppInstallFooter,
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

type ActiveSessionSource = Pick<PrivateClawProvider, "listActiveSessions">;

export type PairSessionForegroundOutcome =
  | { kind: "signal"; signal: NodeJS.Signals }
  | { kind: "session-ended" }
  | { kind: "stdin-eof" };

export interface PairSessionWaiter<TOutcome> {
  promise: Promise<TOutcome>;
  cancel(): void;
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

function createNeverResolvingPromise<T>(): Promise<T> {
  return new Promise<T>(() => undefined);
}

export function createShutdownSignalWaiter(
  signalSource: Pick<NodeJS.Process, "once" | "off"> = process,
): PairSessionWaiter<{ kind: "signal"; signal: NodeJS.Signals }> {
  let cancelled = false;
  let handleSigint: (() => void) | undefined;
  let handleSigterm: (() => void) | undefined;
  const cleanup = () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    if (handleSigint) {
      signalSource.off("SIGINT", handleSigint);
    }
    if (handleSigterm) {
      signalSource.off("SIGTERM", handleSigterm);
    }
  };
  const promise = new Promise<{ kind: "signal"; signal: NodeJS.Signals }>((resolve) => {
    handleSigint = () => {
      cleanup();
      resolve({ kind: "signal", signal: "SIGINT" });
    };
    handleSigterm = () => {
      cleanup();
      resolve({ kind: "signal", signal: "SIGTERM" });
    };

    signalSource.once("SIGINT", handleSigint);
    signalSource.once("SIGTERM", handleSigterm);
  });
  return {
    promise,
    cancel: cleanup,
  };
}

export function createStdinEofWaiter(
  input: Pick<
    NodeJS.ReadStream,
    "isTTY" | "destroyed" | "isPaused" | "pause" | "resume" | "once" | "off"
  > = process.stdin,
): PairSessionWaiter<{ kind: "stdin-eof" }> {
  if (!input.isTTY || input.destroyed) {
    return {
      promise: createNeverResolvingPromise(),
      cancel: () => undefined,
    };
  }

  let cancelled = false;
  const wasPaused = input.isPaused();
  let handleEnd: (() => void) | undefined;
  let handleClose: (() => void) | undefined;
  const cleanup = () => {
    if (cancelled) {
      return;
    }
    cancelled = true;
    if (handleEnd) {
      input.off("end", handleEnd);
    }
    if (handleClose) {
      input.off("close", handleClose);
    }
    if (wasPaused && !input.destroyed) {
      input.pause();
    }
  };
  const promise = new Promise<{ kind: "stdin-eof" }>((resolve) => {
    handleEnd = () => {
      cleanup();
      resolve({ kind: "stdin-eof" });
    };
    handleClose = () => {
      cleanup();
      resolve({ kind: "stdin-eof" });
    };

    input.once("end", handleEnd);
    input.once("close", handleClose);
    if (wasPaused) {
      input.resume();
    }
  });
  return {
    promise,
    cancel: cleanup,
  };
}

export function createSessionsDrainWaiter(
  provider: ActiveSessionSource,
  pollMs = 250,
): PairSessionWaiter<{ kind: "session-ended" }> {
  let timer: NodeJS.Timeout | undefined;
  let cancelled = false;
  const promise = new Promise<{ kind: "session-ended" }>((resolve) => {
    const poll = () => {
      if (cancelled) {
        return;
      }
      if (provider.listActiveSessions().length === 0) {
        cancelled = true;
        resolve({ kind: "session-ended" });
        return;
      }
      timer = setTimeout(poll, pollMs);
    };
    poll();
  });
  return {
    promise,
    cancel: () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

export async function waitForForegroundPairOutcome(params: {
  provider: ActiveSessionSource;
  handoffToBackground?: () => Promise<string | void>;
  pollMs?: number;
  createSignalWaiter?: typeof createShutdownSignalWaiter;
  createDrainWaiter?: typeof createSessionsDrainWaiter;
  createInputWaiter?: typeof createStdinEofWaiter;
}): Promise<PairSessionForegroundOutcome> {
  const createSignalWaiter = params.createSignalWaiter ?? createShutdownSignalWaiter;
  const createDrainWaiter = params.createDrainWaiter ?? createSessionsDrainWaiter;
  const createInputWaiter = params.createInputWaiter ?? createStdinEofWaiter;
  const waiters: PairSessionWaiter<PairSessionForegroundOutcome>[] = [
    createSignalWaiter(),
    createDrainWaiter(params.provider, params.pollMs),
    ...(params.handoffToBackground ? [createInputWaiter()] : []),
  ];
  try {
    return await Promise.race(waiters.map((waiter) => waiter.promise));
  } finally {
    for (const waiter of waiters) {
      waiter.cancel();
    }
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

export async function renderInviteBundleOutput(
  bundle: PrivateClawInviteBundle,
  params?: {
    qrMediaDir?: string;
    openInBrowser?: boolean;
    writeLine?: (line: string) => void;
    includeFooter?: boolean;
  },
): Promise<PrivateClawInviteBundle> {
  const writeLine = params?.writeLine ?? ((line) => console.log(line));
  const mediaDir = params?.qrMediaDir ?? resolvePrivateClawMediaDir();
  const qrPng = await writeInviteQrPng(bundle, mediaDir);
  const renderedBundle: PrivateClawInviteBundle = {
    ...bundle,
    qrPngPath: qrPng.pngPath,
  };

  printPairInviteBundle(renderedBundle, writeLine);

  if (params?.openInBrowser) {
    const preview = await writeInviteQrPreviewHtml(
      renderedBundle,
      mediaDir,
      qrPng.pngPath,
    );
    await openInBrowserPreview(preview.previewFileUrl);
  }
  if (params?.includeFooter !== false) {
    writePrivateClawAppInstallFooter(writeLine);
  }

  return renderedBundle;
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
    const bundle = await renderInviteBundleOutput(inviteBundle, {
      ...(qrMediaDir ? { qrMediaDir } : {}),
      ...(openInBrowser ? { openInBrowser: true } : {}),
      includeFooter: false,
      writeLine,
    });

    if (printOnly) {
      writePrivateClawAppInstallFooter(writeLine);
      await provider.dispose();
      return bundle;
    }

    if (!foreground) {
      writePrivateClawAppInstallFooter(writeLine);
      return bundle;
    }

    writeLine(
      handoffToBackground
        ? PRIVATECLAW_WAITING_FOR_APP_WITH_BACKGROUND_MESSAGE
        : PRIVATECLAW_WAITING_FOR_APP_MESSAGE,
    );
    writePrivateClawAppInstallFooter(writeLine);
    for (;;) {
      const outcome = await waitForForegroundPairOutcome({
        provider,
        ...(handoffToBackground ? { handoffToBackground } : {}),
      });
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

export async function openInBrowserPreview(target: string): Promise<void> {
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
