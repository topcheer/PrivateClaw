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
`widget_test.dart`.

## Shipped in the second pass (P0 + two P1 items)

| Problem (observed on the real app) | Change | Where |
| --- | --- | --- |
| Joining showed one status line ("Connecting to the PrivateClaw relay…") for up to 15 s with nothing to do; if the relay was unreachable the client retried forever and never said why. | Step-wise progress (Relay → Handshake → Joined) with a Cancel button. Cancel resets the UI instantly; the socket teardown finishes in the background. The AppBar pill shows a sync icon while connecting. | `_buildConnectionProgress`, `_cancelConnect`, `_connectStepIndex` |
| Relay and socket failures were shown raw (`Connect failed: FormatException: …`, `ECONNREFUSED`, `session_not_found`). | Humanized errors: refused / unreachable / timeout (naming the relay), expired room, unknown room, invalid key, rate limited; unknown errors are trimmed to 120 chars. Only the invite parser's own `FormatException` maps to "Paste or scan a valid invite"; persistence failures no longer abort a join. | `_humanizeConnectError`, `_humanizeRelayReason`, `_persistActiveSessionIfAvailable` |
| A first join that keeps retrying silently flipped into "reconnecting" and popped the big session panel over an empty chat. | The reason of the last failure stays on screen ("…refused the connection…" or "Still trying to reach relay…") in the pairing card with Cancel; the session panel only opens for sessions that were actually live. | `_lastConnectErrorText`, `_hasManagedSessionContext`, `_localizeNotice` |
| Scanning an invite that already expired dialed the relay first and only then failed with "session closed: expired". | Expired invites are rejected before dialing: "This invite expired 2h ago. Ask the host for a new one." (also for saved sessions). | `_connectFromInput`, `_connectToSavedSession`, `_formatExpiredAgo` |
| The notification permission prompt appeared out of nowhere on first join. | A one-time explainer ("Get notified about replies", Enable / Not now) precedes the system prompt; the choice is persisted in `privateclaw_preferences.json`. | `_shouldShowNotificationExplainer`, `PrivateClawAppPreferences` |
| Long rooms were a wall of bubbles, each repeating avatar and name. | Date separators (Today / Yesterday / date) and grouping: a follow-up from the same sender within two minutes hides its avatar and name. | `_buildMessageList`, `_isGroupedWithPrevious`, `ChatMessageBubble.groupedWithPrevious` |
| On small screens / the connecting state the pairing card could overflow the column. | The card keeps its natural height up to 55% of the screen and scrolls internally beyond that. | `build` |

Tests: 11 in `test/user_experience_test.dart` (expired invite, invalid invite, progress +
cancel, humanized errors, reconnect with reason, notification explainer, date
separators + grouping, plus the first-pass cases); full suite 81 green.

## Next (needs a decision)

Priority key: **P0** = users hit it on the normal path and it costs them a room or
leaves them stuck; **P1** = felt every session, but there is a workaround; **P2** =
polish that only shows up with heavy use or on one platform.

| # | Item | Priority | Why |
| --- | --- | --- | --- |
| 1 | **Session panel as a proper page on phones.** Replace the floating overlay (`_buildManagedSessionOverlay`: session id, expiry, relay, identity, members, four buttons) with a sheet/page split into Room / Members / Relay sections and a prominent "Renew" action. | **P1** | Every renewal currently depends on the banner or the `/renew-session` command; a dedicated page gives it a home. Workaround exists (banner), so not P0. |
| 2 | **Composer affordances.** Hide the disabled emoji / voice / photo / file row before a room exists; show available slash commands as tappable chips above the composer instead of only inside the `/` sheet. | **P2** | Discoverability improvement; all features remain reachable today. |
| 3 | **Desktop.** Keyboard-shortcut help (Cmd+Enter to send, Cmd+K for commands); widen/center the message column (bubbles cap at ~480 px, leaving the right of a macOS window empty). | **P2** | Single-platform layout polish; no functional gap. |
| 4 | **Store assets.** The screenshots shipped with 0.1.20 predate these changes; rerun `python3 scripts/build-store-screenshots.py` before the next release so the listing shows the onboarding state and the session pill. | **P2** | Release hygiene rather than in-app UX; must be done before the next submission but changes no code. |
