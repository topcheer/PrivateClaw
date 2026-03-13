# OpenClaw Integration - Executive Summary

> Historical note (March 2026): this summary reflects the pre-implementation gap analysis. PrivateClaw now registers its real slash command path; refer to the root `README.md` / `README.zh-CN.md` for the current operational setup.

**Status:** PrivateClaw currently does NOT expose slash commands via real OpenClaw mechanism.

## Key Finding: The Gap

PrivateClaw's `openclaw-plugin.ts` only calls `api.registerChannel()` but **does NOT call `api.registerCommand()`**. This means:

- ❌ `/privateclaw` command is NOT registered in OpenClaw's global command registry
- ❌ Not available as `/pc` via Telegram, `/pvc` via Discord, etc.
- ❌ No access to cross-channel command dispatch
- ✅ Only works if someone manually adds it to bot's hardcoded commands

## How Real OpenClaw Commands Work

1. **Plugin registers command** via `api.registerCommand(definition)`
   ```typescript
   api.registerCommand({
     name: "privateclaw",
     nativeNames: { telegram: "pc", discord: "pvc", qqbot: "privateclaw" },
     description: "Generate PrivateClaw invite with QR",
     acceptsArgs: true,
     handler: async (ctx: PluginCommandContext) => { ... }
   });
   ```

2. **OpenClaw runtime** matches incoming messages to registered commands
3. **Channel** (Telegram, QQ, Discord, etc.) sends message + metadata to runtime
4. **Runtime** checks auth, executes handler, returns reply
5. **Channel** sends reply back to user

## Example: Existing QQBot Plugin

- **Location:** `~/.openclaw/extensions/qqbot/` (installed as `@sliverp/qqbot@1.5.4`)
- **Type:** ChannelPlugin (handles QQ receive/send)
- **Plugin registration:** Calls `api.registerChannel()`
- **Command support:** Declares `nativeCommands: true` but doesn't register specific commands yet

## Required Changes in PrivateClaw

### 1. Update Plugin Registration (openclaw-plugin.ts)
```typescript
register(api: OpenClawPluginApi) {
  // Already done:
  api.registerChannel({ plugin: createOpenClawCompatibleChannelPlugin(options) });
  
  // ADD THIS:
  api.registerCommand({
    name: "privateclaw",
    description: "Generate PrivateClaw invite with QR code",
    acceptsArgs: true,
    requireAuth: true,
    nativeNames: { default: "privateclaw", telegram: "pc" },
    handler: async (ctx: PluginCommandContext) => {
      const inviteBundle = await provider.createInviteBundle();
      return {
        text: inviteBundle.announcementText,
        files: [{ buffer: Buffer.from(inviteBundle.qrSvg), ... }]
      };
    }
  });
}
```

### 2. Create Plugin Manifest (privateclaw.plugin.json)
```json
{
  "id": "privateclaw",
  "name": "PrivateClaw",
  "commands": ["privateclaw"],
  "capabilities": { "slashCommands": true }
}
```

### 3. Update package.json
```json
{
  "openclaw": { "extensions": ["./src/openclaw-plugin.ts"] },
  "peerDependencies": { "openclaw": "*" },
  "files": ["dist", "src", "privateclaw.plugin.json"]
}
```

### 4. Install into OpenClaw
```bash
openclaw plugin install --path ./packages/privateclaw-provider
```

This updates `~/.openclaw/openclaw.json` automatically:
```json
{
  "plugins": {
    "entries": { "privateclaw": { "enabled": true }, "qqbot": { ... } },
    "installs": {
      "privateclaw": {
        "installPath": "/Users/zhanju/.openclaw/extensions/privateclaw",
        ...
      }
    }
  }
}
```

## After Implementation

Users will be able to:
- Type `/privateclaw` in QQ bot → triggers PrivateClaw plugin command
- Type `/pc` in Telegram bot → triggers same PrivateClaw command (alias)
- Type `/pvc` in Discord bot → triggers same command with Discord alias
- All through same handler, with context about who sent it, which channel, authorization status

## Key Types to Use

| Type | File | Purpose |
|------|------|---------|
| `OpenClawPluginApi` | openclaw/plugin-sdk | Plugin registration API |
| `OpenClawPluginCommandDefinition` | openclaw/plugin-sdk | Command metadata |
| `PluginCommandContext` | openclaw/plugin-sdk | Handler receives this |
| `PluginCommandResult` (= `ReplyPayload`) | openclaw/plugin-sdk | Handler returns this |

## Key Files to Modify

1. `/packages/privateclaw-provider/src/openclaw-plugin.ts` - Main implementation
2. `/packages/privateclaw-provider/src/compat/openclaw.ts` - Type stubs (can now use real types)
3. `/packages/privateclaw-provider/privateclaw.plugin.json` - Create new manifest
4. `/packages/privateclaw-provider/package.json` - Add openclaw field

## Full Implementation Details

See `OPENCLAW_INTEGRATION_REPORT.md` for:
- Complete type definitions
- Full ChannelPlugin interface
- Command dispatch architecture  
- Example flows from QQBot
- Config structure details
- Validation checklist
