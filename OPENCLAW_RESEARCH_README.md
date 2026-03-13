# OpenClaw Integration Research - Complete Documentation

> Historical note (March 2026): this document captures the original investigation phase. The implementation has since landed; use `README.md`, `README.zh-CN.md`, and the current source tree for the up-to-date package name, relay image, and setup flow.

This directory contains a comprehensive investigation into how the OpenClaw runtime handles slash commands and plugin extensions, with specific analysis of PrivateClaw's current implementation and required changes.

## 📚 Documentation Files

All files created March 12, 2026 as part of deep codebase research.

### Start Here: Quick Overview
- **OPENCLAW_DOCS_INDEX.md** - Navigation guide for all documents (5 min read)

### For Understanding the Gap
- **OPENCLAW_INTEGRATION_EXECUTIVE_SUMMARY.md** - High-level findings and solution (150 lines, 5 min read)
- **Key Finding:** PrivateClaw does NOT call `api.registerCommand()` yet

### For Implementation
- **IMPLEMENTATION_DIFF.md** - Exact code changes needed (350 lines, 15 min read)
- Shows: 4 files to modify, ~50 new lines total

### For Deep Understanding
- **OPENCLAW_INTEGRATION_REPORT.md** - Complete architecture details (865 lines, 45 min read)
- Covers: Plugin loading, interfaces, command flow, config structure

## 🎯 The Main Finding

**Current State:**
- ❌ PrivateClaw registers channel: `api.registerChannel()`
- ❌ Does NOT register command: `api.registerCommand()` ← **MISSING**
- ❌ `/privateclaw` is not exposed to other bots (Telegram, Discord, etc.)

**Required Fix:**
```typescript
// Add this to openclaw-plugin.ts:
api.registerCommand({
  name: "privateclaw",
  description: "Generate PrivateClaw invite with QR",
  handler: async (ctx: PluginCommandContext) => { ... }
});
```

**Result After Fix:**
- ✅ `/privateclaw` works in QQ bot
- ✅ `/pc` (alias) works in Telegram
- ✅ `/pvc` (alias) works in Discord
- ✅ Works with channel authorization
- ✅ Handler receives sender context

## 📋 Research Methodology

This investigation:

1. **Explored installed OpenClaw runtime** at `/opt/homebrew/lib/node_modules/openclaw/`
2. **Analyzed user config** at `~/.openclaw/openclaw.json`
3. **Examined existing extension** - QQBot at `~/.openclaw/extensions/qqbot/`
4. **Extracted TypeScript definitions** for `OpenClawPluginApi`, `ChannelPlugin`, etc.
5. **Reviewed PrivateClaw implementation** at `packages/privateclaw-provider/`
6. **Compared real vs stub implementations** in compat layer

## 📁 Key File Locations

### OpenClaw Installation
```
/opt/homebrew/lib/node_modules/openclaw/
├── openclaw.mjs                    # Entry point
├── dist/
│   └── plugin-sdk/                 # TypeScript definitions
│       ├── plugins/types.d.ts
│       ├── plugins/commands.d.ts
│       └── channels/plugins/
│           └── types.plugin.d.ts
└── extensions/                     # Bundled channels
    ├── telegram/
    ├── discord/
    └── ... (43 total)
```

### User OpenClaw Config
```
~/.openclaw/
├── openclaw.json                   # Main config (see structure below)
├── extensions/
│   └── qqbot/                      # User-installed extension
│       ├── index.ts
│       ├── openclaw.plugin.json
│       └── src/
│           ├── channel.ts
│           ├── gateway.ts
│           └── ...
└── agents/main/                    # Agent config
```

### PrivateClaw Repository
```
/Users/zhanju/ggai/PrivateClaw/
├── packages/privateclaw-provider/
│   ├── src/
│   │   ├── openclaw-plugin.ts       # ← MAIN FILE TO MODIFY
│   │   ├── compat/openclaw.ts       # ← Type stubs (update)
│   │   └── provider.ts
│   ├── package.json                 # ← ADD "openclaw" field
│   └── privateclaw.plugin.json      # ← CREATE THIS FILE
└── OPENCLAW_INTEGRATION_REPORT.md   # ← You are here
```

## 🔑 Key Concepts

### OpenClaw Plugin Architecture

**Three registration types available:**
1. **Channels** (existing in PrivateClaw)
   - `api.registerChannel({ plugin: ChannelPlugin })`
   - Handles receiving/sending on a platform (QQ, Telegram, etc.)

2. **Commands** (MISSING in PrivateClaw)
   - `api.registerCommand(OpenClawPluginCommandDefinition)`
   - Registers slash commands available across all channels
   - Receives `PluginCommandContext` with full metadata

3. **Tools** (not used in PrivateClaw yet)
   - `api.registerTool(AgentTool)`
   - Registered as LLM tools

### Plugin Lifecycle

```
npm install @privateclaw/provider
     ↓
openclaw plugin install --path ./packages/privateclaw-provider
     ↓
~/.openclaw/openclaw.json updated with:
  plugins.entries.privateclaw = { enabled: true }
  plugins.installs.privateclaw = { installPath: "...", ... }
     ↓
OpenClaw startup loads plugin via index.ts:
  const plugin = { id, name, register() {...} }
  plugin.register(api)
     ↓
register() called with api.registerChannel() and api.registerCommand()
     ↓
Plugin active: channels receive messages, commands matched to handler
```

### Command Flow

```
User: "/privateclaw 300" (in Telegram as "@bot /pc")
  ↓
Telegram channel receives update
  ↓
Gateway passes to OpenClaw:
  commandBody: "privateclaw 300"
  CommandAuthorized: true
  from: "user@telegram/123456"
  channel: "telegram"
  ↓
matchPluginCommand("privateclaw 300")
  ↓
Found: PrivateClaw command registered by plugin
  ↓
executePluginCommand({
  channel: "telegram",
  commandBody: "privateclaw 300",
  args: "300",
  isAuthorizedSender: true,
  ...
})
  ↓
Plugin handler called: async (ctx: PluginCommandContext) => {
  const ttlMs = parseInt(ctx.args) * 1000;
  const invite = await provider.createInviteBundle({ ttlMs });
  return { text: invite.announcementText, files: [...] };
}
  ↓
Handler returns ReplyPayload
  ↓
OpenClaw sends to Telegram: [QR image + invite URI]
```

## 🛠️ Implementation Path

**Estimated time: 1 hour**

1. Read OPENCLAW_DOCS_INDEX.md (5 min)
2. Read OPENCLAW_INTEGRATION_EXECUTIVE_SUMMARY.md (5 min)
3. Review IMPLEMENTATION_DIFF.md (15 min)
4. Implement 4 file changes (30 min):
   - Modify: openclaw-plugin.ts
   - Modify: compat/openclaw.ts
   - Modify: package.json
   - Create: privateclaw.plugin.json
5. Build & test (10 min)

## 📊 Type System

**Core types from `openclaw/plugin-sdk`:**

```typescript
// Plugin registration API
type OpenClawPluginApi = {
  id: string;
  runtime: PluginRuntime;
  config: OpenClawConfig;
  registerChannel: (registration: ChannelPlugin) => void;
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;
  registerTool: (...) => void;
  // ... other methods
};

// Command definition (what you register)
type OpenClawPluginCommandDefinition = {
  name: string;                          // "privateclaw"
  description: string;
  acceptsArgs?: boolean;
  requireAuth?: boolean;
  nativeNames?: { [provider]: string };  // { telegram: "pc" }
  handler: PluginCommandHandler;
};

// Context passed to handler
type PluginCommandContext = {
  senderId?: string;           // "123456" (Telegram user ID)
  channel: string;             // "telegram"
  channelId?: string;
  isAuthorizedSender: boolean; // true/false based on allowFrom
  args?: string;               // "300" from "/privateclaw 300"
  commandBody: string;         // "privateclaw 300"
  config: OpenClawConfig;
  from?: string;               // "user@telegram/123456"
  to?: string;
  accountId?: string;          // For multi-account channels
};

// Handler return type
type PluginCommandResult = ReplyPayload;

// ReplyPayload structure
type ReplyPayload = {
  text?: string;
  files?: Array<{
    buffer: Buffer;
    filename: string;
    mimeType: string;
  }>;
  // ... other optional fields
};
```

## 🔍 Validation Checklist

After implementation, verify:

- [ ] TypeScript compiles: `npm run build -w @privateclaw/provider`
- [ ] Plugin installs: `openclaw plugin install --path ./packages/privateclaw-provider`
- [ ] Config updates: `~/.openclaw/openclaw.json` has privateclaw entries
- [ ] Command registered: `openclaw commands list` includes privateclaw
- [ ] QQ bot test: `/privateclaw` generates invite
- [ ] Telegram test: `/pc` generates invite (if enabled)
- [ ] Auth works: Only allowFrom users can invoke
- [ ] Logs clean: No TypeScript or runtime errors

## 📚 Related Documentation

**OpenClaw References:**
- Type definitions: `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/`
- SDK docs would be at: `https://openclaw.io/docs/plugins` (if exists)

**PrivateClaw Context:**
- Protocol: `packages/privateclaw-protocol/`
- Provider: `packages/privateclaw-provider/`

## ❓ Common Questions

**Q: Why does PrivateClaw currently use `api.registerChannel()`?**
A: It's registering as a communication channel (like Telegram/Discord/QQ) not as a command plugin. It should do BOTH.

**Q: Can I use this with existing bots without reinstalling?**
A: After `openclaw plugin install`, restart OpenClaw with `openclaw start` to pick up new commands.

**Q: What are "native names"?**
A: Provider-specific command aliases. `telegram: "pc"` means use `/pc` in Telegram instead of `/privateclaw`.

**Q: Does the command work in private vs group chats?**
A: Yes, depends on channel config in `~/.openclaw/openclaw.json` under `allowFrom`.

**Q: Can I pass arguments to the command?**
A: Yes, if `acceptsArgs: true`. They're passed in `PluginCommandContext.args`.

## 🎓 Learning Resources

**Files in order of complexity:**
1. OPENCLAW_DOCS_INDEX.md (5 min) - Navigation
2. OPENCLAW_INTEGRATION_EXECUTIVE_SUMMARY.md (5 min) - Overview
3. IMPLEMENTATION_DIFF.md (15 min) - Implementation details
4. OPENCLAW_INTEGRATION_REPORT.md (45 min) - Full architecture

**What each teaches:**
- Summary: The gap and solution
- Diff: How to implement
- Report: Why it works this way

## 📞 Support

If you have questions about:
- **Implementation details** → See IMPLEMENTATION_DIFF.md
- **Type definitions** → See OPENCLAW_INTEGRATION_REPORT.md section 2
- **Architecture** → See OPENCLAW_INTEGRATION_REPORT.md section 3-4
- **File paths** → See OPENCLAW_INTEGRATION_REPORT.md appendix

---

**Created:** March 12, 2026
**Investigation Scope:** OpenClaw plugin system, command dispatch, PrivateClaw integration
**Status:** ✅ Complete - Ready for implementation
