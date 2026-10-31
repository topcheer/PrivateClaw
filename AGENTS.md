# AGENTS.md

Durable guidance for coding agents working in this repository. Verify against the
repo when conventions change; do not put one-off task plans here.

## Project Snapshot

- **What it is**: PrivateClaw — a lightweight end-to-end encrypted private channel
  for OpenClaw. A user leaves a public bot surface (Telegram/Discord/QQ/...), scans
  a one-time QR (`privateclaw://connect?payload=...`), and continues the chat in a
  dedicated mobile app. The relay only ever sees ciphertext.
- **Repo**: github.com/topcheer/PrivateClaw. Docs are bilingual: `README.md` (EN) and
  `README.zh-CN.md` (ZH). User-facing provider strings are deliberately bilingual
  Chinese + English (see `bot-mode-topics.ts`, invite announcements, slash-command help).
- **Layout**: npm workspaces monorepo (`packages/*`, `services/*`) plus a Flutter app
  (`apps/privateclaw_app`) that is NOT an npm workspace.
- **Stack**: TypeScript ESM (`"type": "module"`, NodeNext module resolution, strict
  mode incl. `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` — see
  `tsconfig.base.json`); Node `>=20` for protocol/relay, `>=22` for the provider
  (peer-depends on `openclaw`, optional); Flutter/Dart `^3.10.7` for the app.

## Validation (verified in `.github/workflows/npm.yml`, Node 24)

```bash
npm ci                                            # install (root, hoisted workspaces)
npm run build                                     # protocol -> relay -> provider (order matters)
npm run test                                      # all three workspaces + (cd apps/privateclaw_app && flutter test)
npm run build --workspace @privateclaw/protocol   # single workspace build
npm run test  --workspace @privateclaw/privateclaw-relay
cd apps/privateclaw_app && flutter test && flutter analyze   # app tests + lint
```

- There is **no eslint/biome/Makefile**. The `tsc -p tsconfig.json` build IS the
  lint gate for TS; `flutter analyze` (flutter_lints ^6) is the gate for Dart.
- Tests are colocated `src/*.test.ts` files run with the Node built-in test runner:
  `node --import tsx --test src/**/*.test.ts`. Add tests next to the module they cover.
- `npm test` at the root requires the Flutter toolchain on PATH (it shells out to
  `flutter test`).
- Git hooks live in `.githooks/` (pre-commit/pre-push). Activate once with
  `npm run hooks:install`. `npm run hooks:check:staged` blocks committing
  local-only files — never force past it.
- Publishing is CI-driven on `v*` tags (build + test all workspaces, then `npm publish`
  per package, skipping versions already on npm). Bump each `package.json` version
  manually before tagging.

## Architecture

```
packages/privateclaw-protocol   @privateclaw/protocol          shared types + AES-256-GCM crypto (crypto.ts, invite.ts, types.ts)
packages/privateclaw-provider   @privateclaw/privateclaw       OpenClaw plugin: provider runtime (provider.ts), openclaw-plugin.ts,
                                                               session-control.ts, setup.ts, cli.ts, pair-session.ts, bridges/, compat/
services/relay-server           @privateclaw/privateclaw-relay blind WebSocket relay: relay-server.ts, relay-cluster.ts (ioredis),
                                                               session-store, admin-web/admin-api/admin-metrics, push-notifier, tunnel-installer
apps/privateclaw_app            privateclaw_app (Flutter)      mobile/desktop client: lib/main.dart + models/ services/ widgets/ l10n/,
                                                               vendored plugins under plugins/, fastlane in ios/ android/ macos/
scripts/                                                        release/store automation (.mjs) + env wrappers (with-ggai-store-env.sh)
skills/  docs/  social-local/                                   plugin-setup skill, docs, social experiments
```

- **Data flow**: provider connects at `/ws/provider`; app scans QR and connects at
  `/ws/app?sessionId=...`; both sides exchange AES-256-GCM envelopes; `sessionId`
  is bound as AAD. Session renewal rotates keys without a new public invite.
- The relay is intentionally **blind**: it must never receive, log, or parse
  plaintext message contents. Treat this as a hard invariant in any relay change.
- Provider entrypoints: `index.ts` (referenced by `openclaw.plugin.json` as the
  OpenClaw extension) and `dist/cli.ts` (bin `privateclaw-provider`). The npm
  package ships `src/`, `index.ts`, `tsconfig.json`, and `openclaw.plugin.json` —
  keep all of them publishable.
- Plugin compatibility is declared in `packages/privateclaw-provider/package.json`
  (`openclaw` field: `pluginApi >=2026.4.24`, `minHostVersion >=2026.3.23`).
  Update these deliberately; they gate which OpenClaw hosts can load the plugin.
- Deployment: relay via `railway.toml` / `Dockerfile.multiarch(.redis)` /
  `compose.yaml` (`npm run docker:relay`); production relay default is
  `https://relay.privateclaw.us` (see `relay-defaults.ts`).

## Coding Conventions

- **TS style**: ESM with `.js` extensions on relative imports (`./types.js`),
  double quotes, `import type` for type-only imports, trailing commas. Prefer
  object-literal parameters (`params: { sessionId; sessionKey; payload }`) over
  long positional argument lists — see `crypto.ts`.
- **Crypto/encoding**: keys, IVs, tags, and ciphertext are `base64url` strings;
  session keys are 32 random bytes. Validate lengths/versions and throw
  descriptive `Error`s (e.g. "Unsupported PrivateClaw envelope version: ...").
  Never weaken AAD binding or the v1 envelope format without a migration story.
- **Error handling**: throw on protocol violations; WebSocket/relay layers catch,
  log, and continue. Do not panic-crash a long-running relay/provider process on a
  single bad session.
- **Flutter app**: `main.dart` is a large single-file app plus `models/`,
  `services/`, `widgets/`; l10n via `flutter_localizations`/`intl` (`l10n.yaml`,
  `flutter: generate: true`) — user-visible strings must be localized, not hardcoded.
  Follow `analysis_options.yaml` (flutter_lints); run `flutter analyze` before commit.
  - The `dependency_overrides` pinning `path_provider_foundation` (and the vendored
    `plugins/mobile_scanner`, `plugins/privateclaw_local_notifications`) exist to fix
    real crashes — do not casually replace them with pub.dev versions.
- **Commits**: history is mostly written in Chinese, concise subject lines.
  Match that style; keep messages describing user-visible behavior changes.
- **Scope discipline**: `@privateclaw/protocol` is shared by relay, provider, and
  (as types) the app — changes there are high-blast-radius and need tests in all
  consuming workspaces before publish.
