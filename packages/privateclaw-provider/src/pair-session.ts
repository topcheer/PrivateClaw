import type { PrivateClawProvider } from "./provider.js";
import type { PrivateClawInviteBundle } from "./types.js";

export interface PairSessionOptions {
  provider: PrivateClawProvider;
  ttlMs?: number;
  label?: string;
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
    throw new Error(`${label} must be a positive integer.`);
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
  printOnly = false,
  writeLine = (line) => {
    console.log(line);
  },
}: PairSessionOptions): Promise<PrivateClawInviteBundle> {
  try {
    const bundle = await provider.createInviteBundle({
      ...(typeof ttlMs === "number" ? { ttlMs } : {}),
      ...(label ? { label: label.trim() } : {}),
    });

    writeLine(bundle.announcementText);
    writeLine(`Invite URI: ${bundle.inviteUri}`);
    writeLine(bundle.qrTerminal);

    if (printOnly) {
      await provider.dispose();
      return bundle;
    }

    writeLine("Waiting for the PrivateClaw app to connect. Press Ctrl+C to stop.");
    process.stdin.resume();
    try {
      const signal = await waitForShutdownSignal();
      writeLine(`[privateclaw-provider] received ${signal}, shutting down`);
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
