import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPrivateClawAppInstallFooter,
  buildPrivateClawCommandErrorMessage,
  PRIVATECLAW_APP_INSTALL_FOOTER_LINES,
} from "./text.js";

test("appendPrivateClawAppInstallFooter appends concise store links", () => {
  const text = appendPrivateClawAppInstallFooter("PrivateClaw session ready.");
  assert.match(text, /TestFlight/i);
  assert.match(text, /Google Play/i);
  assert.match(text, /Google Group/i);
  assert.ok(
    text.endsWith(PRIVATECLAW_APP_INSTALL_FOOTER_LINES.at(-1) ?? ""),
    "footer should end with the Google Group note",
  );
});

test("buildPrivateClawCommandErrorMessage also appends store links", () => {
  const text = buildPrivateClawCommandErrorMessage("boom");
  assert.match(text, /Failed to create a PrivateClaw session: boom/);
  assert.match(text, /TestFlight/i);
  assert.match(text, /Google Play/i);
  assert.match(text, /Google Group/i);
});
