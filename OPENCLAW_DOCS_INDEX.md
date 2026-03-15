# OpenClaw Integration Documentation Index

> Historical note (March 2026): the gap described in these research notes has already been implemented. The current package name is `@privateclaw/privateclaw`, and the current source of truth for setup, relay deployment, and development is the current-documents list below, including the standalone push rollout guide.

This directory contains historical research and implementation guides for the early OpenClaw integration work. They remain useful for background context, but they are no longer the day-to-day source of truth for the shipped product.

## Current source-of-truth documents

| Scope | Document |
| --- | --- |
| Project overview, relay deployment, store tooling | `README.md` |
| 中文项目总览 | `README.zh-CN.md` |
| Provider / plugin package details | `packages/privateclaw-provider/README.md` |
| Flutter app behavior and store delivery notes | `apps/privateclaw_app/README.md` |
| Push wake + local notification rollout | `PUSH_WAKE_NOTIFICATIONS.md` |

## Documents

### 1. **OPENCLAW_INTEGRATION_EXECUTIVE_SUMMARY.md** ⭐ START HERE
- **Length:** ~150 lines
- **Reading time:** 5 minutes
- **Contains:** High-level overview, key findings, required changes
- **Best for:** Understanding the gap and quick implementation plan

### 2. **IMPLEMENTATION_DIFF.md** 📝 FOR DEVELOPERS
- **Length:** ~350 lines  
- **Reading time:** 15 minutes
- **Contains:** Exact code changes, file-by-file diffs, testing steps
- **Best for:** Implementing the actual integration

### 3. **OPENCLAW_INTEGRATION_REPORT.md** 🔬 DEEP DIVE
- **Length:** ~865 lines
- **Reading time:** 45 minutes
- **Contains:** Complete type definitions, architecture details, references
- **Best for:** Understanding the full OpenClaw plugin system

## Quick Links

| Need | Document | Section |
|------|----------|---------|
| Understand the gap | Executive Summary | Key Finding: The Gap |
| Implement the fix | Implementation Diff | File 1-4 |
| See all types | Full Report | Section 2: Interfaces & Shapes |
| Command flow | Full Report | Section 3: How Commands Work |
| Config details | Full Report | Section 8: Runtime Config |
| File references | Full Report | Appendix: File Paths |

## Key Files to Modify

1. **`packages/privateclaw-provider/src/openclaw-plugin.ts`**
   - Add: `api.registerCommand()` call
   - Add: Command handler function
   - See: IMPLEMENTATION_DIFF.md File 1

2. **`packages/privateclaw-provider/src/compat/openclaw.ts`**
   - Update: Use real types from openclaw/plugin-sdk
   - See: IMPLEMENTATION_DIFF.md File 2

3. **`packages/privateclaw-provider/package.json`**
   - Add: `"openclaw"` field with extensions
   - Add: `privateclaw.plugin.json` to files
   - See: IMPLEMENTATION_DIFF.md File 3

4. **`packages/privateclaw-provider/privateclaw.plugin.json`** (NEW)
   - Create: Plugin manifest file
   - See: IMPLEMENTATION_DIFF.md File 4

## The Problem

PrivateClaw currently:
- ✅ Registers as an OpenClaw channel
- ❌ Does NOT register slash commands globally
- ❌ Cannot be invoked as `/privateclaw` or `/pc`
- ❌ Cannot receive command context (sender, authorization, etc.)

## The Solution

Add 50 lines of code to:
- Register command via `api.registerCommand()`
- Define handler with `PluginCommandContext`
- Create plugin manifest file
- Update package.json

## Result

After implementation:
- ✅ `/privateclaw` works in QQ bot
- ✅ `/pc` works in Telegram (alias)
- ✅ `/pvc` works in Discord (alias)
- ✅ Works with channel authorization (`allowFrom` config)
- ✅ Full context available (sender, channel, auth status)

## Installation Path

```
1. Make code changes
2. npm run build -w @privateclaw/provider
3. openclaw plugin install --path ./packages/privateclaw-provider
4. ~/.openclaw/openclaw.json auto-updates
5. Test: /privateclaw in any enabled channel
```

## Type References

**From `openclaw/plugin-sdk`:**
- `OpenClawPluginApi` - Plugin registration API
- `OpenClawPluginCommandDefinition` - Command metadata
- `PluginCommandContext` - Handler receives this
- `PluginCommandResult` - Handler returns this (= `ReplyPayload`)

**Key method:**
```typescript
api.registerCommand(command: OpenClawPluginCommandDefinition): void
```

## Real-World Example

**Existing QQBot Extension:**
- Location: `~/.openclaw/extensions/qqbot/`
- Type: ChannelPlugin (handles QQ send/receive)
- Registered via: `api.registerChannel()`
- Could also register commands via: `api.registerCommand()`

## Architecture Overview

```
User Message (Telegram/QQ/Discord)
    ↓
OpenClaw Gateway receives via channel handler
    ↓
Message parsed → commandBody = "privateclaw"
    ↓
Plugin Command Registry matches to registered commands
    ↓
PrivateClaw plugin command handler invoked
    ↓
Handler receives PluginCommandContext (sender, auth, channel info)
    ↓
Handler returns ReplyPayload (text + optional files/QR)
    ↓
OpenClaw sends response via channel (Telegram /pc response, etc.)
```

## Critical Imports

```typescript
// ✅ USE THESE (from openclaw/plugin-sdk)
import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
} from "openclaw/plugin-sdk";

// ❌ REMOVE THESE (stub types from compat)
import type {
  OpenClawPluginApiCompat,
  OpenClawExtensionPluginCompat,
} from "./compat/openclaw.js";
```

## Testing Checklist

- [ ] Code compiles without errors
- [ ] PrivateClaw provider builds: `npm run build -w @privateclaw/provider`
- [ ] Installed into OpenClaw: `openclaw plugin install --path ...`
- [ ] Config updated: check `~/.openclaw/openclaw.json`
- [ ] Command registered: `openclaw commands list` shows "privateclaw"
- [ ] Test in QQ bot: `/privateclaw` generates invite
- [ ] Test in Telegram: `/pc` generates invite
- [ ] Test authorization: Works only for allowed users

## Support References

**OpenClaw Installation:**
- Runtime: `/opt/homebrew/lib/node_modules/openclaw/`
- Plugin SDK: `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/`

**User Config:**
- Main config: `~/.openclaw/openclaw.json`
- Extensions: `~/.openclaw/extensions/`

**PrivateClaw Repo:**
- Provider package: `packages/privateclaw-provider/`
- Plugin entry: `src/openclaw-plugin.ts`
- Compat layer: `src/compat/openclaw.ts`

---

## Next Steps

1. **Read** OPENCLAW_INTEGRATION_EXECUTIVE_SUMMARY.md (5 min)
2. **Review** IMPLEMENTATION_DIFF.md (15 min)
3. **Implement** the 4 file changes (30 min)
4. **Build & Test** (10 min)
5. **Reference** full report if questions arise

Total time: ~1 hour
