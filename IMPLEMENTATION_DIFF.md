# Implementation Diff: Making /privateclaw Work in OpenClaw

> Historical note (March 2026): this file is kept as an implementation artifact from the original integration work. The live code has already absorbed these changes; use the current source tree and root `README.md` / `README.zh-CN.md` for present-day usage.

This file shows the exact code changes needed to expose `/privateclaw` as a real OpenClaw slash command.

## File 1: openclaw-plugin.ts (MAIN CHANGE)

**Path:** `packages/privateclaw-provider/src/openclaw-plugin.ts`

### Current Code
```typescript
import { EchoBridge } from "./bridges/echo-bridge.js";
import {
  type OpenClawExtensionPluginCompat,
  type OpenClawPluginApiCompat,
  privateClawConfigSchema,
} from "./compat/openclaw.js";
import { PrivateClawProvider } from "./provider.js";
import { resolveRelayEndpoints } from "./relay-endpoints.js";
import type { PrivateClawInviteBundle, PrivateClawProviderOptions } from "./types.js";

// ... existing code ...

export function createOpenClawCompatiblePlugin(
  options: PrivateClawProviderOptions,
): OpenClawExtensionPluginCompat {
  return {
    id: "privateclaw",
    name: "PrivateClaw",
    description: "Ephemeral end-to-end encrypted private channel for OpenClaw.",
    configSchema: privateClawConfigSchema,
    register(api: OpenClawPluginApiCompat) {
      void api.runtime;
      api.registerChannel({ plugin: createOpenClawCompatibleChannelPlugin(options) });
    },
  };
}
```

### Required Changes

```typescript
// ✅ CHANGE 1: Import real types instead of stubs
import type {
  OpenClawPluginApi,  // Changed from OpenClawPluginApiCompat
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
} from "openclaw/plugin-sdk";

import type { ReplyPayload } from "openclaw/plugin-sdk";

// ... other imports ...

// ✅ CHANGE 2: Add helper to create command handler
function createPrivateClawCommandHandler(
  provider: PrivateClawProvider
): (ctx: PluginCommandContext) => Promise<ReplyPayload> {
  return async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
    try {
      // Parse TTL from args (e.g., user sends "/privateclaw 300" for 5 minutes)
      const ttlMs = ctx.args
        ? parseInt(ctx.args, 10) * 1000
        : undefined;

      const inviteBundle = await provider.createInviteBundle(
        ttlMs ? { ttlMs } : undefined
      );

      // Format response as ReplyPayload (standard OpenClaw format)
      return {
        text: inviteBundle.announcementText,
        files: inviteBundle.qrSvg
          ? [
              {
                buffer: Buffer.from(inviteBundle.qrSvg),
                filename: "privateclaw-qr.svg",
                mimeType: "image/svg+xml",
              },
            ]
          : undefined,
      };
    } catch (error) {
      return {
        text: `Error generating PrivateClaw invite: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  };
}

// ✅ CHANGE 3: Update plugin registration
export function createOpenClawCompatiblePlugin(
  options: PrivateClawProviderOptions,
): OpenClawExtensionPluginCompat {
  const provider = new PrivateClawProvider(options);

  return {
    id: "privateclaw",
    name: "PrivateClaw",
    description: "Ephemeral end-to-end encrypted private channel for OpenClaw.",
    configSchema: privateClawConfigSchema,
    register(api: OpenClawPluginApi) {  // Changed type hint
      // Set runtime for channel operations
      setPrivateClawRuntime(api.runtime);

      // Register channel (existing functionality)
      api.registerChannel({ plugin: createOpenClawCompatibleChannelPlugin(options) });

      // ✅ NEW: Register slash command exposed to all channels
      const commandDef: OpenClawPluginCommandDefinition = {
        name: "privateclaw",
        description: "Generate ephemeral PrivateClaw invite with QR code and shareable URI",
        acceptsArgs: true,  // Allow optional TTL argument
        requireAuth: true,  // Only authorized senders can use
        nativeNames: {
          default: "privateclaw",  // Default for channels without override
          telegram: "pc",          // /pc in Telegram
          discord: "pvc",          // /pvc in Discord
          qqbot: "privateclaw",    // /privateclaw in QQ
        },
        handler: createPrivateClawCommandHandler(provider),
      };

      api.registerCommand(commandDef);
    },
  };
}
```

## File 2: compat/openclaw.ts (CLEANUP)

**Path:** `packages/privateclaw-provider/src/compat/openclaw.ts`

### Current Code
```typescript
export interface OpenClawPluginApiCompat {
  runtime: unknown;
  registerChannel(params: { plugin: unknown }): void;
}

export interface OpenClawExtensionPluginCompat {
  id: string;
  name: string;
  description: string;
  configSchema: typeof privateClawConfigSchema;
  register(api: OpenClawPluginApiCompat): void;
}
```

### Updated Code
```typescript
// ✅ Remove OpenClawPluginApiCompat - use real type from openclaw/plugin-sdk
// ✅ Keep OpenClawExtensionPluginCompat for now as it's used in type signatures

// If you want to fully upgrade, you can replace references with:
// import type { OpenClawPluginApi, OpenClawPluginDefinition } from "openclaw/plugin-sdk";

// For gradual migration:
export interface OpenClawExtensionPluginCompat {
  id: string;
  name: string;
  description: string;
  configSchema: typeof privateClawConfigSchema;
  register(api: OpenClawPluginApi): void;  // Use real type
}
```

## File 3: package.json (ADD METADATA)

**Path:** `packages/privateclaw-provider/package.json`

### Current Code
```json
{
  "name": "@privateclaw/provider",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "README.md"],
  "peerDependencies": {
    "openclaw": ">=0.1.0"
  }
}
```

### Updated Code
```json
{
  "name": "@privateclaw/provider",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  
  "openclaw": {
    "extensions": ["./src/openclaw-plugin.ts"]
  },
  
  "files": [
    "dist",
    "README.md",
    "privateclaw.plugin.json",
    "src"
  ],
  
  "peerDependencies": {
    "openclaw": ">=0.1.0"
  }
}
```

## File 4: Create Plugin Manifest

**New File:** `packages/privateclaw-provider/privateclaw.plugin.json`

```json
{
  "id": "privateclaw",
  "name": "PrivateClaw",
  "version": "0.1.0",
  "description": "Ephemeral end-to-end encrypted private channel with slash command integration for OpenClaw",
  "commands": ["privateclaw"],
  "channels": [],
  "capabilities": {
    "slashCommands": true,
    "crossChannelCommands": true,
    "authenticationSupport": true
  },
  "author": "PrivateClaw Contributors"
}
```

## Installation Steps

After making these changes:

```bash
# 1. Build the provider package
npm run build -w @privateclaw/provider

# 2. Install as OpenClaw plugin
openclaw plugin install --path ./packages/privateclaw-provider

# 3. Verify installation
cat ~/.openclaw/openclaw.json | jq '.plugins'

# 4. Test the command in any bot (if you have multiple channels enabled)
# Telegram: /pc
# Discord: /pvc
# QQ: /privateclaw

# 5. Check logs
openclaw logs | grep "privateclaw"
```

## Config Update (Automatic)

After installation, `~/.openclaw/openclaw.json` will be auto-updated:

```json
{
  "plugins": {
    "entries": {
      "privateclaw": { "enabled": true },
      "qqbot": { "enabled": true }
    },
    "installs": {
      "privateclaw": {
        "source": "local",
        "installPath": "$HOME/ggai/PrivateClaw/packages/privateclaw-provider",
        "resolvedName": "@privateclaw/provider",
        "resolvedVersion": "0.1.0",
        "installedAt": "2026-03-12T..."
      },
      "qqbot": { ... }
    }
  }
}
```

## Testing the Integration

### Test 1: Command Registration
```bash
openclaw commands list
# Should show:
# - privateclaw (from @privateclaw/provider)
```

### Test 2: Via Telegram (if enabled)
```
User: /pc
Bot: ▌ PrivateClaw Invite
      [QR Code]
      URI: privateclaw://...
```

### Test 3: Via QQ Bot
```
User: /privateclaw
Bot: ▌ PrivateClaw Invite
      [QR Code]
      URI: privateclaw://...
```

### Test 4: With TTL Argument
```
User: /privateclaw 600
Bot: ▌ PrivateClaw Invite (valid for 10 minutes)
      [QR Code]
```

### Test 5: Authorization Check
```
# In channel config with allowFrom restriction:
User (not authorized): /pc
Bot: Error: You are not authorized to use this command

User (authorized): /pc
Bot: [Works normally]
```

## Type Safety Validation

After changes, run TypeScript check:
```bash
npm run build -w @privateclaw/provider
# Should show no type errors related to:
# - OpenClawPluginApi
# - OpenClawPluginCommandDefinition
# - PluginCommandContext
# - PluginCommandResult
```

---

## Summary of Changes

| File | Type | Changes |
|------|------|---------|
| `openclaw-plugin.ts` | Modified | Add command handler + register command |
| `compat/openclaw.ts` | Modified | Use real types instead of stubs |
| `package.json` | Modified | Add "openclaw" field + "privateclaw.plugin.json" to files |
| `privateclaw.plugin.json` | Created | New plugin manifest |

**Total additions:** ~50 lines of code
**Breaking changes:** None (fully backward compatible)
**Impact:** `/privateclaw` now works in all integrated bot channels
