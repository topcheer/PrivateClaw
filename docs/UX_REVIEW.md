# Hearth Room — UX review and roadmap (2026-11-25)

Scope: the Flutter client (`apps/privateclaw_app`) on iPhone, iPad and macOS, audited
against the real running app (simulator / macOS debug build) and the widget-test
suite. Everything under "Shipped" is implemented, covered by tests, and verified on
the real app; "Next" is prioritized but needs a product decision first.

## Shipped in this pass

| Problem (observed on the real app) | Change | Where |
| --- | --- | --- |
| First launch showed an empty chat area ("End-to-end encrypted chat will appear here…") with no hint that a room must be created by PrivateClaw on a computer first. | First-run empty state: QR icon, "Scan your first invite", one-paragraph explanation (`/privateclaw` on the computer, scan the one-time QR or paste the link above) and a "Get PrivateClaw for desktop" button. Only shown before any room is joined; while connecting the old placeholder stays. | `main.dart` `_buildFirstRunEmptyState` |
| "Join session" was enabled with an empty field and only produced a validation error when tapped. | Button is disabled until the invite field has non-whitespace text. | `_canSubmitInviteInput` |
| Composer said "Wait for the session to finish connecting…" even when no session existed. | Idle hint is now "Join a room to start chatting…"; the connecting hint is kept for the connecting state (also for the disabled toolbar buttons and the fullscreen editor). | `_inactiveComposerHint` |
| The collapsed session panel was a bare `<` chevron glued to the right edge, overlapping messages; nothing on screen told you how long the room stays open or whether it is a group. | AppBar pill: group/lock icon + compact remaining time ("7h", "28m", "40s"), error colour when inside the renewal window, chevron. Tapping opens the same session panel. No overlap with messages; the renewal banner no longer needs a right inset. | `_buildCollapsedSessionHandle`, `_formatRemainingCompact` |
| "Disconnect" sat next to "Scan QR code" in the session panel and left the room instantly; invites are one-time, so a slip costs the room. | Confirmation dialog ("Leave this room?" / "You will need a new invite to come back…") with Cancel / Disconnect. | `_disconnect` |
| Every bubble printed the full date ("3/13/2026 10:47 PM"), which is noise in a room that lives for hours. | Messages from today show only the time; older messages keep date + time. Session expiry keeps the absolute date. | `chat_message_bubble.dart` |

All new copy is localized in the 13 store locales (`lib/l10n/app_*.arb`); tests live in
`test/user_experience_test.dart` (first-run state, Join gating, handle content,
disconnect confirmation, timestamp format) plus one updated expectation in
`widget_test.dart`. Full suite: 74 tests green.

## Next (needs a decision)

1. **Session panel as a proper page on phones.** Today it is a floating overlay
   (`_buildManagedSessionOverlay`): session id, expiry, relay, identity, members and
   four buttons stacked in a card. A dedicated sheet/page with sections (Room /
   Members / Relay) and a prominent "Renew" action would scale better and give the
   renewal flow a home instead of the slash command.
2. **Connecting and error states.** Connecting shows one status line; relay errors are
   surfaced as raw text (`ECONNREFUSED`, `session_not_found`). Add step-wise progress
   (relay → handshake → joined) with a Cancel action, humanize relay errors, and detect
   an expired invite before connecting ("This invite expired 2h ago").
3. **Message list polish.** Day separators, relative timestamps for yesterday, and
   grouping of consecutive messages from the same sender (avatar/time shown once).
4. **Notification permission explainer.** Permission is requested when the first room
   is prepared (good), but with no context. One screen before the system prompt
   ("Get notified when your assistant replies while the app is closed") lifts opt-in.
5. **Composer affordances.** The emoji / voice / photo / file row is visible but
   disabled before a room exists; consider hiding it until connected, and show the
   available slash commands as tappable chips above the composer instead of only
   inside the `/` sheet.
6. **Desktop.** Keyboard-shortcut help (Cmd+Enter to send, Cmd+K for commands), and
   bubbles constrained to ~480 px leave the macOS window empty on the right; a
   centered, wider column would read better.
7. **Store assets.** The screenshots shipped with 0.1.20 predate these changes; rerun
   `python3 scripts/build-store-screenshots.py` for the next release so the listing
   shows the onboarding state and the session pill.
