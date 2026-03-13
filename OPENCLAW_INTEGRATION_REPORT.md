# OpenClaw Runtime Integration - Deep Research Report
## PrivateClaw Plugin Architecture Analysis

> Historical note (March 2026): this report preserves the original research snapshot. The current implementation now lives in the repository source, uses the package name `@privateclaw/privateclaw`, and is documented in the root `README.md` / `README.zh-CN.md`.

---

## EXECUTIVE SUMMARY

PrivateClaw's current `openclaw-plugin.ts` is a **shim/compatibility adapter** that does NOT yet integrate with OpenClaw's real plugin command system. While it registers a channel, it does not expose slash commands (/privateclaw) through OpenClaw's `registerCommand()` mechanism. This document details the gap and provides concrete implementation requirements.

---

## 1. HOW OPENCLAW DISCOVERS AND LOADS EXTENSIONS

### 1.1 Plugin Installation & Configuration

**Config File Location:** `~/.openclaw/openclaw.json`

**Plugin Registry Structure:**
```json
{
  "plugins": {
    "entries": {
      "qqbot": { "enabled": true }
    },
    "installs": {
      "qqbot": {
        "source": "npm",
        "spec": "@sliverp/qqbot@latest",
        "installPath": "/Users/zhanju/.openclaw/extensions/qqbot",
        "version": "1.5.4",
        "resolvedName": "@sliverp/qqbot",
        "resolvedAt": "...",
        "installedAt": "..."
      }
    }
  }
}
```

### 1.2 Plugin Module Format

**Required Files:**
- `package.json` with peer dependency on openclaw
- `index.ts` exporting default plugin object
- Optional: `*.plugin.json` (e.g., `openclaw.plugin.json` for descriptive metadata)

**Example package.json (from qqbot at ~/.openclaw/extensions/qqbot/):**
```json
{
  "name": "@sliverp/qqbot",
  "type": "module",
  "main": "dist/index.js",
  "openclaw": {
    "extensions": ["./index.ts"]
  },
  "peerDependencies": {
    "openclaw": "*"
  }
}
```

**Example plugin manifest (openclaw.plugin.json):**
```json
{
  "id": "qqbot",
  "name": "QQ Bot Channel",
  "description": "QQ Bot channel plugin...",
  "channels": ["qqbot"],
  "skills": ["skills/qqbot-cron", "skills/qqbot-media"],
  "capabilities": {
    "proactiveMessaging": true,
    "cronJobs": true
  }
}
```

### 1.3 Plugin Module Initialization

**Plugin exported from index.ts implements OpenClawPluginDefinition:**

File: `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/plugins/types.d.ts`

```typescript
export type OpenClawPluginDefinition = {
  id: string;
  name: string;
  description?: string;
  configSchema: ChannelConfigSchema;
  register(api: OpenClawPluginApi): void;
};
```

**Example from qqbot/index.ts:**
```typescript
const plugin = {
  id: "qqbot",
  name: "QQ Bot",
  description: "QQ Bot channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setQQBotRuntime(api.runtime);
    api.registerChannel({ plugin: qqbotPlugin });
  },
};

export default plugin;
```

---

## 2. ACTUAL INTERFACES & EXPORTED SHAPES

### 2.1 OpenClawPluginApi - The Core Registration Interface

**File:** `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/plugins/types.d.ts`

```typescript
export type OpenClawPluginApi = {
  id: string;                          // Plugin ID
  name: string;                        // Display name
  version?: string;                    // Version string
  description?: string;                // Description
  source: string;                      // Source (e.g., "npm", "workspace")
  config: OpenClawConfig;              // Current OpenClaw config
  pluginConfig?: Record<string, unknown>; // Plugin-specific config
  runtime: PluginRuntime;              // Runtime services
  logger: PluginLogger;                // Logger instance

  // CHANNEL REGISTRATION (what PrivateClaw currently uses)
  registerChannel: (registration: OpenClawPluginChannelRegistration | ChannelPlugin) => void;

  // COMMAND REGISTRATION (what PrivateClaw NEEDS to add)
  registerCommand: (command: OpenClawPluginCommandDefinition) => void;

  // OTHER REGISTRATIONS
  registerTool: (tool: AnyAgentTool | OpenClawPluginToolFactory, opts?: OpenClawPluginToolOptions) => void;
  registerHook: (events: string | string[], handler: InternalHookHandler, opts?: OpenClawPluginHookOptions) => void;
  registerHttpRoute: (params: OpenClawPluginHttpRouteParams) => void;
  registerGatewayMethod: (method: string, handler: GatewayRequestHandler) => void;
  registerCli: (registrar: OpenClawPluginCliRegistrar, opts?: { commands?: string[] }) => void;
  registerService: (service: OpenClawPluginService) => void;
  registerProvider: (provider: ProviderPlugin) => void;
  registerContextEngine: (id: string, factory: ContextEngineFactory) => void;

  on: <K extends PluginHookName>(
    hookName: K,
    handler: PluginHookHandlerMap[K],
    opts?: { priority?: number }
  ) => void;
};
```

### 2.2 OpenClawPluginCommandDefinition - Command Registration

**File:** `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/plugins/types.d.ts`

```typescript
export type OpenClawPluginCommandDefinition = {
  /** Command name without leading slash (e.g., "tts", "privateclaw") */
  name: string;

  /**
   * Optional native-command aliases for slash/menu surfaces.
   * Maps provider name to command alias.
   * 'default' applies to all unless overridden.
   * Example: { default: "privateclaw", telegram: "pc", discord: "pvc" }
   */
  nativeNames?: Partial<Record<string, string>> & {
    default?: string;
  };

  /** Description shown in /help and command menus */
  description: string;

  /** Whether this command accepts arguments */
  acceptsArgs?: boolean;

  /** Whether only authorized senders can use this command (default: true) */
  requireAuth?: boolean;

  /** The handler function */
  handler: PluginCommandHandler;
};

export type PluginCommandHandler = (ctx: PluginCommandContext) =>
  PluginCommandResult | Promise<PluginCommandResult>;

export type PluginCommandContext = {
  /** The sender's identifier (e.g., Telegram user ID) */
  senderId?: string;

  /** The channel/surface (e.g., "telegram", "discord", "qqbot") */
  channel: string;

  /** Provider channel id (e.g., "telegram") */
  channelId?: ChannelId;

  /** Whether the sender is on the allowlist */
  isAuthorizedSender: boolean;

  /** Raw command arguments after the command name */
  args?: string;

  /** The full normalized command body */
  commandBody: string;

  /** Current OpenClaw configuration */
  config: OpenClawConfig;

  /** Raw "From" value (channel-scoped id) */
  from?: string;

  /** Raw "To" value (channel-scoped id) */
  to?: string;

  /** Account id for multi-account channels */
  accountId?: string;

  /** Thread/topic id if available */
  messageThreadId?: number;
};

export type PluginCommandResult = ReplyPayload;  // Standard reply format
```

### 2.3 ChannelPlugin - Channel Registration Interface

**File:** `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/channels/plugins/types.plugin.d.ts`

```typescript
export type ChannelPlugin<ResolvedAccount = any, Probe = unknown, Audit = unknown> = {
  id: ChannelId;
  meta: ChannelMeta;
  capabilities: ChannelCapabilities;
  reload?: {
    configPrefixes: string[];
    noopPrefixes?: string[];
  };
  onboarding?: ChannelOnboardingAdapter;
  config: ChannelConfigAdapter<ResolvedAccount>;
  configSchema?: ChannelConfigSchema;
  setup?: ChannelSetupAdapter;
  pairing?: ChannelPairingAdapter;
  security?: ChannelSecurityAdapter<ResolvedAccount>;
  groups?: ChannelGroupAdapter;
  mentions?: ChannelMentionAdapter;
  outbound?: ChannelOutboundAdapter;
  status?: ChannelStatusAdapter<ResolvedAccount, Probe, Audit>;
  gatewayMethods?: string[];
  gateway?: ChannelGatewayAdapter<ResolvedAccount>;
  auth?: ChannelAuthAdapter;
  elevated?: ChannelElevatedAdapter;
  commands?: ChannelCommandAdapter;  // Minimal command config
  streaming?: ChannelStreamingAdapter;
  threading?: ChannelThreadingAdapter;
  messaging?: ChannelMessagingAdapter;
  agentPrompt?: ChannelAgentPromptAdapter;
  directory?: ChannelDirectoryAdapter;
  resolver?: ChannelResolverAdapter;
  actions?: ChannelMessageActionAdapter;
  heartbeat?: ChannelHeartbeatAdapter;
  agentTools?: ChannelAgentToolFactory | ChannelAgentTool[];
};

export type ChannelCommandAdapter = {
  enforceOwnerForCommands?: boolean;
  skipWhenConfigEmpty?: boolean;
};
```

### 2.4 Command Processing & Dispatch

**File:** `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/plugins/commands.d.ts`

Public command registry functions:
```typescript
export declare function registerPluginCommand(
  pluginId: string,
  command: OpenClawPluginCommandDefinition
): CommandRegistrationResult;

export declare function matchPluginCommand(
  commandBody: string
): {
  command: RegisteredPluginCommand;
  args?: string;
} | null;

export declare function executePluginCommand(params: {
  command: RegisteredPluginCommand;
  args?: string;
  senderId?: string;
  channel: string;
  channelId?: PluginCommandContext["channelId"];
  isAuthorizedSender: boolean;
  commandBody: string;
  config: OpenClawConfig;
  from?: PluginCommandContext["from"];
  to?: PluginCommandContext["to"];
  accountId?: PluginCommandContext["accountId"];
  messageThreadId?: PluginCommandContext["messageThreadId"];
}): Promise<PluginCommandResult>;

export declare function getPluginCommandSpecs(provider?: string): Array<{
  name: string;
  description: string;
  acceptsArgs: boolean;
}>;

export declare function listPluginCommands(): Array<{
  name: string;
  description: string;
  pluginId: string;
}>;
```

---

## 3. HOW PROVIDERS/CHANNELS EXPOSE COMMANDS

### 3.1 Command Flow Architecture

```
User sends message to bot (e.g., "Telegram /privateclaw")
  ↓
OpenClaw Gateway receives via channel handler (e.g., QQBot gateway)
  ↓
Message parsed: commandBody = "privateclaw"
  ↓
matchPluginCommand(commandBody) → checks registered plugin commands
  ↓
If matched: executePluginCommand() → calls plugin handler
If not matched: → proceeds to agent LLM
  ↓
Plugin command handler returns ReplyPayload
  ↓
OpenClaw sends response back via channel outbound (e.g., sendText)
```

### 3.2 Command Ownership Model

**Commands are OWNED BY plugins, NOT by channels directly:**

- Plugin registers command via `api.registerCommand()`
- Command definition includes `nativeNames` mapping provider names to aliases
- Command handler receives `PluginCommandContext` with channel info
- Command can be triggered from ANY channel (Telegram, Discord, QQ, etc.) via `/commandname`

### 3.3 Native Command Integration

Channels that support "native commands" (e.g., Telegram, Discord):
- Declare `nativeCommands: true` in capabilities
- OpenClaw fetches plugin command specs via `getPluginCommandSpecs(channelId)`
- Channel integrates these specs into its native command menu
- When user triggers via native interface, OpenClaw dispatches to plugin command handler

### 3.4 Example Flow in QQBot Channel

**File:** `~/.openclaw/extensions/qqbot/src/gateway.ts`

Gateway receives QQ message → parses `CommandBody`:
```typescript
const ctxPayload = pluginRuntime.channel.reply.finalizeInboundContext({
  Body: body,
  CommandBody: event.content,
  CommandAuthorized: commandAuthorized,
  // ... other context
});
```

OpenClaw runtime then:
1. Extracts `commandBody` from context
2. Calls `matchPluginCommand(commandBody)`
3. If matched and `CommandAuthorized === true`, executes plugin command
4. Otherwise, proceeds to agent

---

## 4. COMMAND OWNERSHIP: PLUGIN VS CHANNEL VS GATEWAY

**Answer: Commands are owned by PLUGINS, not channels.**

| Layer | Responsibility |
|-------|-----------------|
| **Plugin** | Registers command definition via `api.registerCommand()` |
| **Gateway/Channel** | Routes inbound messages to runtime, includes `CommandBody` and `CommandAuthorized` in context |
| **Runtime** | Matches, validates auth, dispatches to plugin command handler |
| **Config** | `channels.{channelid}.allowFrom` controls who can invoke commands |

**Config Example (from ~/.openclaw/openclaw.json):**
```json
{
  "channels": {
    "qqbot": {
      "enabled": true,
      "allowFrom": ["*"]  // Who can invoke commands
    }
  }
}
```

---

## 5. CONCRETE EXAMPLES FROM INSTALLED EXTENSIONS

### 5.1 QQBot Channel Plugin

**Location:** `~/.openclaw/extensions/qqbot/`

**File Structure:**
```
~/.openclaw/extensions/qqbot/
├── index.ts                    # Main plugin entry
├── openclaw.plugin.json        # Plugin manifest
├── package.json
├── src/
│   ├── channel.ts              # ChannelPlugin implementation
│   ├── gateway.ts              # Gateway receive/send handlers (120KB)
│   ├── outbound.ts             # Send message logic
│   ├── runtime.ts
│   └── api.ts, config.ts, types.ts
└── skills/
    ├── qqbot-cron/
    └── qqbot-media/
```

**Key Lines:**
- `index.ts`: Calls `api.registerChannel({ plugin: qqbotPlugin })`
- `openclaw.plugin.json`: Declares `"channels": ["qqbot"]`
- Capabilities: `nativeCommands: true` (NOT exposed in qqbot's channel.ts, but would support it)

**Command Dispatch in gateway.ts (~line 897):**
```typescript
const ctxPayload = pluginRuntime.channel.reply.finalizeInboundContext({
  // ... context fields
  CommandBody: event.content,
  CommandAuthorized: commandAuthorized,
});
// OpenClaw runtime then processes CommandBody via plugin command registry
```

### 5.2 Telegram Channel Plugin

**Location:** `/opt/homebrew/lib/node_modules/openclaw/extensions/telegram/`

**Capabilities:**
```typescript
capabilities: {
  chatTypes: ["direct", "group", "channel", "thread"],
  nativeCommands: true,  // <-- Supports slash commands
  blockStreaming: true,
}
```

**Key File:** `src/channel.ts` - implements `ChannelPlugin`

---

## 6. GAP ANALYSIS: PrivateClaw vs Real OpenClaw Integration

### 6.1 PrivateClaw Current Implementation

**File:** `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/src/openclaw-plugin.ts`

**Current Code:**
```typescript
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

### 6.2 Critical Gaps

| Gap | Current State | Required State |
|-----|---------------|-----------------|
| **Command Registration** | ❌ Does NOT call `api.registerCommand()` | ✅ Must call with `/privateclaw` command def |
| **Command Handler** | ❌ Commands defined in ChannelPlugin.commands object (custom) | ✅ Must use `OpenClawPluginCommandDefinition` |
| **Native Command Aliases** | ❌ Not exposed to providers | ✅ Should support `nativeNames: { default: "privateclaw", telegram: "pvc" }` |
| **Handler Signature** | ❌ Custom `(params?: {...}): Promise<PrivateClawCommandResult>` | ✅ Must be `(ctx: PluginCommandContext) => PluginCommandResult | Promise<...>` |
| **Auth Integration** | ❌ No `requireAuth` or `isAuthorizedSender` | ✅ Must respect channel's `allowFrom` config |
| **Context Integration** | ❌ No access to `PluginCommandContext` (senderId, from, to, accountId) | ✅ Must receive and use context |
| **Plugin JSON Manifest** | ❌ Not created | ✅ Should create `privateclaw.plugin.json` |
| **Installation Mechanism** | ❌ Requires manual npm install into ~/.openclaw/extensions | ✅ Should be installable via OpenClaw CLI or config |

---

## 7. EXACT CODE CHANGES REQUIRED

### 7.1 Fix Type Compatibility Layer

**File:** `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/src/compat/openclaw.ts`

Replace the stub interfaces with real ones:
```typescript
// ❌ REMOVE STUBS
export interface OpenClawPluginApiCompat {
  runtime: unknown;
  registerChannel(params: { plugin: unknown }): void;
}

// ✅ USE REAL TYPES
import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
} from "openclaw/plugin-sdk";

// Re-export for compatibility
export type { OpenClawPluginApi };
```

### 7.2 Create Plugin Command Definition

**File:** `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/src/openclaw-plugin.ts`

```typescript
import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
} from "openclaw/plugin-sdk";
import type { ReplyPayload } from "openclaw/plugin-sdk";

// Convert PrivateClaw invite logic to command handler
function createPrivateClawCommandHandler(
  provider: PrivateClawProvider
): (ctx: PluginCommandContext) => Promise<PluginCommandResult> {
  return async (ctx: PluginCommandContext) => {
    // Parse TTL from args if provided (e.g., "/privateclaw 3600")
    const ttlMs = ctx.args ? parseInt(ctx.args) * 1000 : undefined;

    const inviteBundle = await provider.createInviteBundle(
      ttlMs ? { ttlMs } : undefined
    );

    // Return ReplyPayload format expected by OpenClaw
    return {
      text: inviteBundle.announcementText,
      // Optional: include QR as attachment
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
  };
}

const privateClawCommand: OpenClawPluginCommandDefinition = {
  name: "privateclaw",
  description: "Generate ephemeral PrivateClaw invite with QR code and URI",
  acceptsArgs: true, // Accept optional TTL in seconds
  requireAuth: true,
  nativeNames: {
    default: "privateclaw",
    telegram: "pc",        // /pc on Telegram
    discord: "pvc",        // /pvc on Discord
    qqbot: "privateclaw",
  },
  handler: createPrivateClawCommandHandler(provider),
};
```

### 7.3 Update Plugin Register Function

**File:** `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/src/openclaw-plugin.ts`

```typescript
export function createOpenClawCompatiblePlugin(
  options: PrivateClawProviderOptions,
): OpenClawExtensionPluginCompat {
  const provider = new PrivateClawProvider(options);

  return {
    id: "privateclaw",
    name: "PrivateClaw",
    description: "Ephemeral end-to-end encrypted private channel for OpenClaw.",
    configSchema: privateClawConfigSchema,
    register(api: OpenClawPluginApi) {
      // Set runtime for channel operations
      setPrivateClawRuntime(api.runtime);

      // Register channel (already works)
      api.registerChannel({ plugin: createOpenClawCompatibleChannelPlugin(options) });

      // ✅ NEW: Register slash command that works across all providers
      const commandHandler = createPrivateClawCommandHandler(provider);
      api.registerCommand({
        name: "privateclaw",
        description: "Generate ephemeral PrivateClaw invite with QR code and URI",
        acceptsArgs: true,
        requireAuth: true,
        nativeNames: {
          default: "privateclaw",
          telegram: "pc",
          discord: "pvc",
          qqbot: "privateclaw",
        },
        handler: async (ctx: PluginCommandContext) => {
          // TTL can be passed as argument in seconds
          const ttlMs = ctx.args ? parseInt(ctx.args) * 1000 : undefined;
          const inviteBundle = await provider.createInviteBundle(
            ttlMs ? { ttlMs } : undefined
          );

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
        },
      });
    },
  };
}
```

### 7.4 Create Plugin Manifest

**New file:** `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/privateclaw.plugin.json`

```json
{
  "id": "privateclaw",
  "name": "PrivateClaw",
  "description": "Ephemeral end-to-end encrypted private channel with slash command integration",
  "commands": ["privateclaw"],
  "capabilities": {
    "slashCommands": true,
    "crossChannelCommands": true
  }
}
```

### 7.5 Update Package.json

**File:** `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/package.json`

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
    "src",
    "privateclaw.plugin.json",
    "README.md"
  ],
  "peerDependencies": {
    "openclaw": "*"
  }
}
```

---

## 8. RUNTIME CONFIG CHANGES REQUIRED

### 8.1 Installation into OpenClaw

After building PrivateClaw provider, install via OpenClaw CLI:

```bash
# Option A: Install from local path during dev
openclaw plugin install --path ./packages/privateclaw-provider

# Option B: Install from npm registry (after publishing)
openclaw plugin install @privateclaw/provider@latest
```

This will update `~/.openclaw/openclaw.json`:
```json
{
  "plugins": {
    "entries": {
      "privateclaw": { "enabled": true },
      "qqbot": { "enabled": true }
    },
    "installs": {
      "privateclaw": {
        "source": "npm",
        "spec": "@privateclaw/provider@latest",
        "installPath": "/Users/zhanju/.openclaw/extensions/privateclaw",
        "version": "0.1.0",
        "resolvedName": "@privateclaw/provider",
        "resolvedVersion": "0.1.0",
        "installedAt": "..."
      },
      "qqbot": { ... }
    }
  }
}
```

### 8.2 Command Authorization Config

**File:** `~/.openclaw/openclaw.json`

The PrivateClaw command will respect channel-level `allowFrom` config:

```json
{
  "channels": {
    "qqbot": {
      "enabled": true,
      "allowFrom": ["*"],  // Who can invoke /privateclaw via QQ
      "appId": "...",
      "clientSecret": "..."
    },
    "telegram": {
      "enabled": true,
      "allowFrom": ["123456789", "987654321"],  // Only these users can invoke /pc
      "token": "..."
    }
  }
}
```

### 8.3 Optional: Global Command Config

OpenClaw config also supports global command options:
```json
{
  "commands": {
    "native": "auto",       // Auto-register native commands
    "nativeSkills": "auto",
    "restart": true
  }
}
```

---

## 9. EXACT SIGNATURES & EXPORTS

### 9.1 OpenClawPluginApi Methods Used

From `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/plugins/types.d.ts`:

```typescript
api.registerCommand(command: OpenClawPluginCommandDefinition): void
api.registerChannel(registration: OpenClawPluginChannelRegistration | ChannelPlugin): void
api.runtime: PluginRuntime
api.config: OpenClawConfig
api.logger: PluginLogger
```

### 9.2 Key Import Paths for PrivateClaw

```typescript
// From installed openclaw package
import type {
  OpenClawPluginApi,
  OpenClawPluginCommandDefinition,
  PluginCommandContext,
  PluginCommandResult,
  ChannelPlugin,
} from "openclaw/plugin-sdk";

import type { ReplyPayload } from "openclaw/plugin-sdk";

// PrivateClaw should use these, NOT custom types
```

---

## 10. SUMMARY TABLE: Current vs Required

| Component | Current | Required |
|-----------|---------|----------|
| Plugin registration | `api.registerChannel()` | `api.registerChannel()` ✅ + `api.registerCommand()` ✅ |
| Command definition | Custom object | `OpenClawPluginCommandDefinition` from SDK |
| Command handler | `(params?: {...})` | `(ctx: PluginCommandContext) => PluginCommandResult` |
| Handler access to sender | ❌ None | ✅ `ctx.senderId`, `ctx.from`, `ctx.accountId` |
| Auth enforcement | ❌ Manual in channel | ✅ `requireAuth: true`, `ctx.isAuthorizedSender` |
| Channel aliases | ❌ Not exposed | ✅ `nativeNames: { telegram: "pc", discord: "pvc" }` |
| Plugin manifest | ❌ Not created | ✅ `privateclaw.plugin.json` |
| Package.json "openclaw" field | ❌ Not present | ✅ `"openclaw": { "extensions": [...] }` |
| Cross-channel support | ❌ Only direct channel | ✅ Works from /telegram, /qg, /discord, etc. |
| Command discovery | ❌ Manual hardcode | ✅ Automatic via `getPluginCommandSpecs()` |

---

## 11. VALIDATION CHECKLIST

After implementing changes, verify:

```bash
# 1. Build PrivateClaw provider
npm run build -w @privateclaw/provider

# 2. Install into OpenClaw
openclaw plugin install --path ./packages/privateclaw-provider

# 3. Check config was updated
cat ~/.openclaw/openclaw.json | jq '.plugins'

# 4. Start OpenClaw with QQ bot enabled
openclaw start

# 5. Test via Telegram bot (if installed)
# Send: /pc
# Expected: PrivateClaw invite with QR

# 6. Test via QQ bot (if installed)
# Send: /privateclaw
# Expected: PrivateClaw invite with QR

# 7. Check command listing
openclaw commands list
# Should show: privateclaw (from @privateclaw/provider)

# 8. Check OpenClaw logs for registration
# Look for: "Plugin 'privateclaw' registered command 'privateclaw'"
```

---

## APPENDIX: File Paths Reference

**OpenClaw Installed Components:**
- Runtime: `/opt/homebrew/lib/node_modules/openclaw/`
- Plugin SDK: `/opt/homebrew/lib/node_modules/openclaw/dist/plugin-sdk/`
- Built-in channels: `/opt/homebrew/lib/node_modules/openclaw/dist/`

**User Config & Extensions:**
- Main config: `~/.openclaw/openclaw.json`
- Extensions dir: `~/.openclaw/extensions/`
- QQBot extension: `~/.openclaw/extensions/qqbot/`

**PrivateClaw Repo:**
- Provider package: `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/`
- Plugin entry: `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/src/openclaw-plugin.ts`
- Compat layer: `/Users/zhanju/ggai/PrivateClaw/packages/privateclaw-provider/src/compat/openclaw.ts`
