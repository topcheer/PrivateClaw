import type { PrivateClawProvider } from "./provider.js";
import {
  buildPrivateClawShutdownMessage,
  formatBilingualInline,
  PRIVATECLAW_INVITE_URI_LABEL,
  PRIVATECLAW_WAITING_FOR_APP_MESSAGE,
} from "./text.js";
import type { PrivateClawInviteBundle } from "./types.js";

export interface PairSessionOptions {
  provider: PrivateClawProvider;
  ttlMs?: number;
  label?: string;
  groupMode?: boolean;
  printOnly?: boolean;
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
  writeLine = (line) => {
    console.log(line);
  },
}: PairSessionOptions): Promise<PrivateClawInviteBundle> {
  try {
    const bundle = await provider.createInviteBundle({
      ...(typeof ttlMs === "number" ? { ttlMs } : {}),
      ...(label ? { label: label.trim() } : {}),
      ...(groupMode ? { groupMode: true } : {}),
    });

    writeLine(bundle.announcementText);
    writeLine(`${PRIVATECLAW_INVITE_URI_LABEL}: ${bundle.inviteUri}`);
    writeLine(bundle.qrTerminal);

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
