import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPrivateClawAppInstallFooter,
  buildPrivateClawCommandErrorMessage,
  PRIVATECLAW_APP_INSTALL_FOOTER_LINES,
  PRIVATECLAW_DESKTOP_GITHUB_RELEASES_URL,
} from "./text.js";

test("appendPrivateClawAppInstallFooter appends concise store links", () => {
  const text = appendPrivateClawAppInstallFooter("PrivateClaw session ready.");
  assert.match(text, /App Store/i);
  assert.match(text, /Google Play/i);
  assert.match(text, /Google Group/i);
  assert.match(text, /GitHub Releases/i);
  assert.ok(text.includes(PRIVATECLAW_DESKTOP_GITHUB_RELEASES_URL));
  assert.ok(
    text.endsWith(PRIVATECLAW_APP_INSTALL_FOOTER_LINES.at(-1) ?? ""),
    "footer should end with the desktop GitHub Releases note",
  );
});

test("buildPrivateClawCommandErrorMessage also appends store links", () => {
  const text = buildPrivateClawCommandErrorMessage("boom");
  assert.match(text, /Failed to create a PrivateClaw session: boom/);
  assert.match(text, /App Store/i);
  assert.match(text, /Google Play/i);
  assert.match(text, /Google Group/i);
  assert.match(text, /GitHub Releases/i);
  assert.ok(text.includes(PRIVATECLAW_DESKTOP_GITHUB_RELEASES_URL));
});
