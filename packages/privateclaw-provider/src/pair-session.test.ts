import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import {
  createSessionsDrainWaiter,
  createShutdownSignalWaiter,
  createStdinEofWaiter,
  waitForForegroundPairOutcome,
} from "./pair-session.js";

class FakeTtyInput extends EventEmitter {
  isTTY = true;
  destroyed = false;
  #paused = true;

  isPaused(): boolean {
    return this.#paused;
  }

  pause(): this {
    this.#paused = true;
    return this;
  }

  resume(): this {
    this.#paused = false;
    return this;
  }
}

test("waitForForegroundPairOutcome cancels losing waiters after a signal", async () => {
  const cancelled: string[] = [];
  const outcome = await waitForForegroundPairOutcome({
    provider: {
      listActiveSessions: () => [{ sessionId: "still-active" }] as never[],
    },
    handoffToBackground: async () => undefined,
    createSignalWaiter: () => ({
      promise: Promise.resolve({ kind: "signal", signal: "SIGINT" as const }),
      cancel: () => {
        cancelled.push("signal");
      },
    }),
    createDrainWaiter: () => ({
      promise: new Promise(() => undefined),
      cancel: () => {
        cancelled.push("drain");
      },
    }),
    createInputWaiter: () => ({
      promise: new Promise(() => undefined),
      cancel: () => {
        cancelled.push("stdin");
      },
    }),
  });

  assert.deepEqual(outcome, {
    kind: "signal",
    signal: "SIGINT",
  });
  assert.deepEqual(cancelled.sort(), ["drain", "signal", "stdin"]);
});

test("createShutdownSignalWaiter removes signal listeners when cancelled", () => {
  const signalSource = new EventEmitter();
  const waiter = createShutdownSignalWaiter(
    signalSource as unknown as Pick<NodeJS.Process, "once" | "off">,
  );

  assert.equal(signalSource.listenerCount("SIGINT"), 1);
  assert.equal(signalSource.listenerCount("SIGTERM"), 1);

  waiter.cancel();

  assert.equal(signalSource.listenerCount("SIGINT"), 0);
  assert.equal(signalSource.listenerCount("SIGTERM"), 0);
});

test("createStdinEofWaiter removes stdin listeners when cancelled", () => {
  const input = new FakeTtyInput();
  const waiter = createStdinEofWaiter(
    input as unknown as Pick<
      NodeJS.ReadStream,
      "isTTY" | "destroyed" | "isPaused" | "pause" | "resume" | "once" | "off"
    >,
  );

  assert.equal(input.isPaused(), false);
  assert.equal(input.listenerCount("end"), 1);
  assert.equal(input.listenerCount("close"), 1);

  waiter.cancel();

  assert.equal(input.isPaused(), true);
  assert.equal(input.listenerCount("end"), 0);
  assert.equal(input.listenerCount("close"), 0);
});

test("createSessionsDrainWaiter stops polling after cancellation", async () => {
  let pollCount = 0;
  const waiter = createSessionsDrainWaiter(
    {
      listActiveSessions: () => {
        pollCount += 1;
        return [{ sessionId: "still-active" }] as never[];
      },
    },
    5,
  );

  await new Promise((resolve) => setTimeout(resolve, 25));
  const countBeforeCancel = pollCount;
  waiter.cancel();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.ok(countBeforeCancel >= 2);
  assert.equal(pollCount, countBeforeCancel);
});
