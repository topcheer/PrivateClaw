# PrivateClaw 架构设计 Review 报告

**审查日期**: 2025-07-22  
**审查范围**: Monorepo 全量源码  
**审查人**: arch-reviewer

---

## 一、项目概览

PrivateClaw 是一个端到端加密的即时通讯系统，核心设计理念是 **"Relay 只转发密文，永远不触碰明文"**。系统由以下组件构成：

| 组件 | 语言 | 代码行数(不含测试) | 职责 |
|---|---|---|---|
| `@privateclaw/protocol` | TypeScript | ~434 | 协议类型、加密/解密、邀请编解码 |
| `@privateclaw/privateclaw` (Provider) | TypeScript | ~14,527 | Provider 运行时、Agent Bridge、OpenClaw 插件适配 |
| `@privateclaw/privateclaw-relay` (Relay) | TypeScript | ~8,506 | 中继服务器、集群、管理面板 |
| `privateclaw_app` (Flutter App) | Dart | ~15,964 | 移动端客户端（iOS/Android/macOS/Windows） |
| `privateclaw_site` | - | - | 网站 |

**测试代码**: ~12,015 行（覆盖 protocol、provider、relay）

---

## 二、Monorepo 结构审查

### 2.1 Workspace 划分

```
privateclaw/
├── packages/
│   ├── privateclaw-protocol/    # 共享协议库
│   └── privateclaw-provider/    # Provider 运行时
├── services/
│   └── relay-server/            # 中继服务器
├── apps/
│   ├── privateclaw_app/         # Flutter 客户端
│   └── privateclaw_site/        # 网站
└── package.json                 # 根 workspace 配置
```

**优点**:

- **清晰的分层隔离**: `protocol` 作为独立包，被 provider、relay、Flutter app（Dart 重写版）三端共同依赖，是典型的 Shared Kernel 模式
- **npm workspaces 配置规范**: 使用 `"workspaces": ["packages/*", "services/*"]` 标准模式，构建顺序在根 `package.json` 的 `build` script 中显式声明（protocol -> relay -> provider）
- **三端独立发布**: protocol、relay、provider 都有独立的 `publishConfig`，可分别发布到 npm
- **TypeScript 统一配置**: 通过 `tsconfig.base.json` 共享编译选项（`strict: true`、`noUncheckedIndexedAccess`），确保类型安全基线一致

**改进建议**:

1. **Flutter app 未纳入 npm workspace**: `apps/privateclaw_app` 和 `apps/privateclaw_site` 不在 npm workspaces 中，根 `test` script 中 Flutter test 通过 `cd` 子目录调用，而非 workspace 统一编排。可考虑在根 `package.json` 中增加 `// note` 注释说明原因（Flutter/Dart 生态差异）
2. **缺少 `apps/*` 的 workspace 支持**: 当前只有 `packages/*` 和 `services/*` 在 workspaces 中。如果 `privateclaw_site` 是 Node.js 项目，可以考虑纳入
3. **构建脚本硬编码顺序**: `"build": "npm run build --workspace @privateclaw/protocol && npm run build --workspace @privateclaw/privateclaw-relay && ..."` 使用 `&&` 链式调用，如果中间某步失败但未正确退出，可能产生不一致状态。建议增加 `--if-present` 或在 CI 中做依赖拓扑排序

### 2.2 依赖关系

```
protocol <── provider <── (openclaw peerDep, optional)
    └──── relay-server
    └──── flutter_app (Dart 重写，非 npm 依赖)
```

**优点**:

- **依赖方向正确**: provider 和 relay 都只依赖 protocol，不存在反向依赖或循环依赖
- **openclaw 作为 optional peerDependency**: 通过 `peerDependenciesMeta.openclaw.optional: true` 实现了优雅的可选集成
- **外部依赖精简**: protocol 零外部依赖（纯 Node.js crypto），provider 仅 `fflate`、`qrcode`、`ws`，relay 仅 `ioredis`、`ws`

**改进建议**:

- protocol `package.json` 缺少 `devDependencies` 中 TypeScript 的显式依赖声明（虽然在根 `devDependencies` 中有，但子包独立发布时 `npm install` 不会自动获取）

---

## 三、协议设计审查

### 3.1 消息格式

协议定义在 `packages/privateclaw-protocol/src/types.ts` 中，核心类型：

- **EncryptedEnvelope**: 加密信封，包含 `version`、`messageId`、`iv`、`ciphertext`、`tag`、`sentAt`
- **PrivateClawPayload**: 联合类型，涵盖 11 种消息类型（client_hello、user_message、assistant_message、thinking_message、system_message 等）
- **Provider<->Relay 消息**: `ProviderToRelayMessage`、`AppToRelayMessage`、`RelayToProviderMessage`、`RelayToAppMessage`

**优点**:

- **类型设计严谨**: 使用 TypeScript discriminated union（通过 `kind` 字段区分消息类型），编译器可自动推导，不易出错
- **Envelope 版本号**: `version: 1` 为未来协议升级预留了空间
- **消息 ID 独立生成**: 每个信封有独立的 `messageId`（UUID），有利于消息追踪和去重
- **完善的 Slash Commands**: 支持三种来源（`openclaw`、`plugin`、`privateclaw`），便于扩展

**改进建议**:

1. **缺少 payload 向后兼容策略**: `PrivateClawPayload` 是联合类型，新增 `kind` 时旧客户端无法识别。建议：
   - 在文档中明确"客户端应忽略未知 kind"的约定
   - 考虑增加 `minVersion` / `maxVersion` 字段到 payload 基础接口
2. **SessionClosePayload 不区分发起方**: `SessionClosePayload` 只有 `reason` 字段，无法区分是 provider 主动关闭、session 过期还是 app 主动断开
3. **缺少消息确认机制**: 当前协议是 fire-and-forget 模式，没有 ACK/NACK。对于 assistant_message 这类关键消息，建议增加 delivery confirmation

### 3.2 加密方案

```typescript
// AES-256-GCM + sessionId as AAD
encryptPayload({ sessionId, sessionKey, payload })
```

**优点**:

- **算法选择正确**: AES-256-GCM 是目前最广泛认证的 AEAD 方案
- **AAD 绑定 sessionId**: 将 `sessionId` 作为 AAD (Additional Authenticated Data)，防止密文被重放到不同 session
- **IV 随机性**: 使用 `randomBytes(12)` 生成 12 字节 IV，符合 NIST SP 800-38D 建议
- **Key 长度校验**: `decodeSessionKey` 严格验证 32 字节密钥长度

**改进建议**:

1. **Key 派生**: 当前 `sessionKey` 是直接使用的原始密钥。如果 session 生命周期较长（默认 24h），建议考虑增加密钥轮换机制（目前有 `session_renewed` 消息，但新 key 也是随机生成的，不是 KDF 派生）
2. **前向安全性**: 当前设计不支持前向安全性（PFS）。如果某个 session key 泄露，所有历史消息都可解密。可考虑每 N 条消息进行一次 key ratchet
3. **Flutter 端加密实现独立**: `privateclaw_crypto.dart` 是 Dart 独立实现（使用 `cryptography` 包），而非 protocol 包的编译产物。这意味着两端加密逻辑需要手动保持同步。建议增加跨语言集成测试

### 3.3 邀请 (Invite) 机制

```typescript
// privateclaw://connect?payload=<base64url(JSON)>
PrivateClawInvite { version, sessionId, sessionKey, appWsUrl, expiresAt, groupMode?, providerLabel? }
```

**优点**:

- **多格式支持**: `decodeInviteString` 支持 URI scheme、原始 JSON、base64url 三种输入格式
- **自定义 URI Scheme**: `privateclaw://connect` 支持深度链接
- **校验完备**: `assertInvite` 验证所有必填字段

**改进建议**:

- 邀请中包含明文 `sessionKey`，虽然邀请本身是短期有效的，但传输链路的安全性值得关注。建议在文档中强调邀请通道（QR 码/链接）的物理安全要求

---

## 四、Relay 架构审查

### 4.1 核心设计

Relay 服务器（`services/relay-server/src/relay-server.ts`，2069 行）是整个系统的核心中转节点。

**架构模式**: 基于 WebSocket 的消息路由器 + Session 管理

```
Provider <--WS--> Relay <--WS--> App(s)
                  |
            SessionHub (内存状态)
                  |
        ┌─────────┼─────────┐
   SessionStore  FrameCache  Cluster(Redis)
```

**SessionHub** 类是核心，管理：
- `providerSockets`: Map<providerId, WebSocket> - Provider 连接池
- `sessionApps`: Map<sessionId, Map<appId, WebSocket>> - 每个 session 的 App 连接
- `sessionProviders`: Map<sessionId, providerId> - Session -> Provider 映射
- `providerSessions`: Map<providerId, Set<sessionId>> - Provider 的所有 session

**优点**:

1. **Blind Relay 设计**: Relay 只转发 `EncryptedEnvelope`，永远不触碰明文。这是隐私优先架构的基石
2. **Frame Cache 机制**: `EncryptedFrameCache`（InMemory/Redis 双实现）缓存离线消息，App 重连后可 drain 未读帧。设计巧妙
3. **Rate Limiting**: 实现了固定窗口限流器（App 120/min, Provider 600/min），防止消息洪泛
4. **Heartbeat 机制**: 15 秒 ping/pong，及时检测死连接
5. **消息大小限制**: 默认 24MB 上限，防止内存溢出
6. **Wake Cooldown**: 5 秒冷却期防止推送风暴
7. **多级存储策略**: 所有状态组件都有 `InMemory` 和 `Redis` 两种实现，通过工厂函数 `create*()` 自动选择

**改进建议**:

1. **SessionHub 上帝类问题**: `SessionHub` 类承担了过多职责——Provider 管理、App 管理、Session 生命周期、消息路由、推送通知、管理指标。建议拆分为：
   - `ProviderConnectionManager`
   - `AppConnectionManager` 
   - `SessionLifecycleManager`
   - `MessageRouter`

2. **单文件过大**: `relay-server.ts` 有 2069 行。虽然逻辑上是内聚的，但可读性和可维护性受到影响。建议至少将消息处理 handler 拆分为独立文件

3. **缺少优雅停机**: 未见 WebSocket 服务器的 graceful shutdown 逻辑。当进程收到 SIGTERM 时，应：
   - 停止接受新连接
   - 等待现有连接 drain
   - 通知 cluster 释放资源
   - 关闭 Redis 连接

### 4.2 集群支持

`relay-cluster.ts`（931 行）通过 Redis Pub/Sub 实现多节点集群。

**设计亮点**:

1. **Redis Channel 分层设计**:
   - `privateclaw:bus:v1:session:{id}:app:broadcast` - 广播给所有 App
   - `privateclaw:bus:v1:session:{id}:app:{appId}` - 定向发送给特定 App
   - `privateclaw:bus:v1:session:{id}:provider` - 发送给 Provider
   - `privateclaw:bus:v1:session:{id}:control` - 控制消息
   - `privateclaw:bus:v1:provider:{id}:control` - Provider 级控制

2. **引用计数频道订阅**: `channelRefs` Map 实现了频道引用计数，避免重复订阅/过早退订

3. **Presence 机制**: 通过 Redis key + TTL 实现节点存活检测

4. **Claim/Release 语义**: Provider 和 App 连接到特定节点时通过 Redis 原子操作 "claim"，防止分裂脑

5. **双实现**: `InMemoryRelayClusterClient`（单节点测试）和 `RedisRelayClusterClient`（生产集群）

6. **Reconnect 路由**: 当 Provider/App 重连到不同节点时，通过 `publishProviderReconnected`/`publishAppReconnected` 通知原节点清理

**改进建议**:

1. **Redis 单点故障**: 当前 Redis 是集群的硬依赖。如果 Redis 不可用，集群节点间通信完全中断。建议：
   - 增加 Redis Sentinel/Cluster 模式支持
   - 增加 Redis 连接断开时的 fallback 策略（退化为单节点模式）

2. **频道模式解析使用正则**: `handleChannelMessage` 中多处使用 `.match(/^privateclaw:bus:v1:.../)` 正则解析频道名。性能可接受但可读性不佳。建议使用结构化的频道名解析函数

3. **Presence TTL 硬编码**: `LEASE_MS = 45_000` 固定 45 秒。在高负载下可能需要根据实际心跳频率动态调整

### 4.3 可扩展性评估

| 维度 | 评分 | 说明 |
|---|---|---|
| 水平扩展 | 7/10 | Redis Pub/Sub + Presence 支持多节点，但 Redis 本身是瓶颈 |
| 垂直扩展 | 8/10 | WebSocket 非阻塞 IO，单节点可承载大量连接 |
| 存储扩展 | 8/10 | InMemory/Redis 双模式，Redis 模式下 TTL 自动过期 |
| 运维扩展 | 7/10 | 有 Admin API + Metrics Store，但缺少 Prometheus 格式导出 |

### 4.4 部署架构

```yaml
# compose.yaml - Docker Compose 支持
services:
  relay: ...     # WebSocket 中继
  redis: ...     # 可选 Redis（profiles: ["redis"]）
```

支持 Tailscale Funnel / Cloudflare Tunnel 公网暴露，以及 Railway 部署。Docker 配置合理。

---

## 五、客户端架构审查

### 5.1 Flutter 应用

**结构**:
```
lib/
├── main.dart              # 3857 行 - 应用主入口（状态管理 + UI）
├── models/                # 7 个数据模型
├── services/              # 14 个服务层
│   ├── privateclaw_session_client.dart  # 823 行 - 核心会话客户端
│   ├── privateclaw_crypto.dart          # 91 行 - 加密服务
│   └── ...
├── widgets/               # 17 个 UI 组件
└── l10n/                  # 国际化
```

**优点**:

1. **Session Client 设计精良**: `PrivateClawSessionClient` 实现了完整的连接生命周期管理：
   - 自动重连（指数退避，最大 30 秒）
   - 连接代数（`_connectionGeneration`）防止旧连接的回调干扰
   - 终端错误识别（`_terminalRelayErrorCodes`）避免对不可恢复错误无限重试
   - Push Token 注册

2. **事件驱动架构**: 通过 `StreamController<PrivateClawSessionEvent>.broadcast()` 实现响应式 UI 更新

3. **多平台支持**: iOS、Android、macOS、Windows 四端支持

4. **本地化**: 配置了 `l10n.yaml`，支持国际化

5. **自定义插件**: `mobile_scanner`、`privateclaw_local_notifications`、`path_provider_foundation` 三个本地插件解决平台特定问题

**改进建议**:

1. **main.dart 上帝文件**: `main.dart` 有 3857 行，包含了所有页面和状态管理逻辑。这是典型的大型 StatefulWidget 集中化问题。建议：
   - 使用状态管理方案（Riverpod/Bloc/GetX）
   - 按页面拆分文件
   - 将业务逻辑从 Widget 中提取到 Service/Repository 层

2. **缺少抽象层**: `PrivateClawSessionClient` 直接依赖 `IOWebSocketChannel`，没有通过接口抽象。单元测试时 mock 困难

3. **Crypto 实现与 protocol 包不一致**: Flutter 端的 `PrivateClawCrypto` 独立实现了 AES-256-GCM，而 Node.js 端使用 `@privateclaw/protocol` 的 `crypto.ts`。两份代码需要手动保持同步

### 5.2 Provider 运行时

Provider（`provider.ts`，3122 行）是连接 AI Agent Bridge 和 Relay 的桥梁。

**架构**:
```
Agent Bridges (Echo/OpenAI/OpenClaw/Webhook)
        ↓
  PrivateClawProvider (核心运行时)
        ↓
  RelayProviderClient (WebSocket 客户端)
        ↓
  Relay Server
```

**Bridge 模式**（策略模式变体）:

- `EchoBridge` - 回声桥（演示）
- `OpenAICompatibleBridge` - OpenAI API 兼容桥
- `OpenClawAgentBridge` - OpenClaw 集成桥（67475 行，最复杂）
- `WebhookBridge` - Webhook 桥

**优点**:

1. **Bridge 接口设计清晰**: `PrivateClawAgentBridge` 接口定义了 `handleUserMessage` 和可选的 `transcribeAudioAttachments`，新 Bridge 只需实现接口
2. **完善的会话管理**: 支持 session 创建、续期（renewal）、Bot Mode（静默加入、空闲话题）、多参与者群聊
3. **QR 码邀请生成**: 支持 SVG/PNG/Terminal 三种 QR 输出格式
4. **Session Control Server**: 本地 HTTP 服务器提供会话管理 API（list/close/QR/kick），支持前台配对和后台守护进程两种模式
5. **State 持久化**: Provider 支持将 session state 序列化到文件系统（`PrivateClawProviderSessionHandoff`），实现 daemon 模式的状态恢复
6. **OpenClaw 插件适配**: 通过 `compat/openclaw.ts` 和 `channel.ts` 实现了完整的 OpenClaw 插件协议，包括 Channel Plugin、Extension Plugin、命令发现等

**改进建议**:

1. **provider.ts 过大**: 3122 行的核心文件。建议拆分为：
   - `provider-core.ts` - 连接管理和消息路由
   - `provider-session.ts` - 会话生命周期
   - `provider-bot-mode.ts` - Bot Mode 逻辑
   - `provider-participants.ts` - 参与者管理

2. **OpenClaw Agent Bridge 过于复杂**: `openclaw-agent-bridge.ts` 有 67475 行，是整个项目中最大的文件。这表明 OpenClaw 集成的复杂度可能需要在架构层面重新考虑

3. **缺少中间件机制**: 消息处理流程（接收 -> 解密 -> 分发 -> Bridge -> 加密 -> 发送）没有中间件/拦截器机制。如果需要添加日志、指标、消息转换等横切关注点，需要侵入核心代码

---

## 六、模块耦合审查

### 6.1 耦合度矩阵

| | protocol | provider | relay | flutter_app |
|---|---|---|---|---|
| **protocol** | - | 低耦合 | 低耦合 | Dart重写(中耦合) |
| **provider** | 依赖 | - | 无直接依赖 | 无 |
| **relay** | 依赖 | 无直接依赖 | - | 无 |
| **flutter_app** | Dart重写 | 无 | 无 | - |

**关键发现**:

1. **Provider 和 Relay 完全解耦**: Provider 通过 `RelayProviderClient`（WebSocket 客户端）与 Relay 通信，没有任何代码级依赖。这是优秀的边界设计
2. **Protocol 是唯一的共享依赖**: 所有 TypeScript 组件只通过 `@privateclaw/protocol` 共享类型和加密逻辑
3. **Flutter 端是"协议级重写"**: Dart 端没有依赖 TypeScript 的 protocol 包，而是独立实现了相同的加密和消息格式。这是"共享协议规范"而非"共享代码"的模式

### 6.2 依赖注入

**Relay 端**:

- 使用工厂函数模式（`createRelaySessionStore`、`createEncryptedFrameCache`、`createRedisRelayClusterClient`）
- 通过接口（`RelaySessionStore`、`EncryptedFrameCache`、`RelayClusterClient`）实现多态
- 测试中可通过参数注入 mock 实现

**Provider 端**:

- `PrivateClawProviderOptions.bridge` 通过构造函数注入 Bridge 实现
- `RelayProviderClient` 通过构造函数注入依赖
- `PrivateClawAgentBridge` 接口允许不同 AI 后端的透明替换

**Flutter 端**:

- `PrivateClawSessionClient` 通过构造函数接收 `invite` 和 `identity`
- `pushTokenProvider` 作为可选回调注入
- 但 `IOWebSocketChannel` 是硬编码的，不易替换

**评估**: TypeScript 端的 DI 设计良好（接口 + 工厂函数），Flutter 端略弱（缺少抽象接口层）

### 6.3 可测试性

**测试覆盖统计**:
- protocol: `crypto.test.ts` (1223 行 / 434 行源码 ≈ 282%)
- provider: 多个 test 文件，总计约 ~7000 行测试
- relay: 多个 test 文件，总计约 ~5000 行测试

**优点**:

- 使用 Node.js 内置 test runner（`node --import tsx --test`），零外部测试框架依赖
- 接口设计允许可控的依赖注入（如 `RedisFrameCacheClientLike` 接口）
- 时间注入：多处 `now?: () => number` 参数，方便时间相关测试

**改进建议**:

- Flutter 端缺少可见的单元测试文件（`test/` 目录存在但需要确认覆盖范围）
- Provider 的 `provider.ts` 3122 行巨型文件，测试是否覆盖了所有路径需要进一步确认

---

## 七、扩展性审查

### 7.1 新增消息类型

**难度**: 低  
**步骤**: 在 `types.ts` 中添加新的 `*Payload` 接口 + 加入 `PrivateClawPayload` 联合类型  
**影响**: Relay 不需要改动（blind relay），Provider 和 App 各自处理新类型

### 7.2 新增 Agent Bridge

**难度**: 低  
**步骤**: 实现 `PrivateClawAgentBridge` 接口  
**影响**: 只在 Provider 层，不影响协议和 Relay

### 7.3 新增平台客户端

**难度**: 中  
**步骤**: 在目标平台重新实现加密逻辑 + WebSocket 客户端 + 消息解析  
**当前支持**: iOS/Android/macOS/Windows (Flutter)  
**可扩展**: Web (纯 Dart/JS)、Linux (Flutter)

### 7.4 新增存储后端

**难度**: 中  
**步骤**: 实现 `RelaySessionStore`、`EncryptedFrameCache`、`RelayClusterClient` 接口  
**当前支持**: InMemory + Redis  
**可扩展**: MongoDB、PostgreSQL、SQLite 等

### 7.5 横切关注点扩展

**难度**: 高  
**问题**: 缺少中间件/插件机制，添加日志、审计、消息过滤等需要侵入核心代码  
**建议**: 在消息处理管道中引入中间件模式

---

## 八、安全性评估

| 维度 | 状态 | 说明 |
|---|---|---|
| 传输加密 | WebSocket (wss://) | 生产环境应强制 TLS |
| 消息加密 | AES-256-GCM | 端到端加密，Relay 不可解密 |
| 密钥管理 | 临时 Session Key | 24h TTL，支持 Renewal |
| 认证 | Provider ID + Session ID | 无传统用户认证，依赖 session 隔离 |
| 限流 | 固定窗口 | App 120/min, Provider 600/min |
| 消息完整性 | GCM Auth Tag + AAD | 防篡改 |
| 前向安全 | 不支持 | session key 泄露可解密历史消息 |
| 输入验证 | 严格 | JSON 解析 + 类型检查 + 大小限制 |

---

## 九、总体评价

### 优势总结

1. **隐私优先架构**: Blind Relay 设计确保中继服务器永远不触碰明文，这是该项目的核心竞争力
2. **精简的协议包**: 434 行代码覆盖了完整的加密/类型/邀请逻辑，零外部依赖
3. **Bridge 模式**: AI Agent 集成通过策略模式实现，新后端接入成本低
4. **双模式存储**: 每个状态组件都有 InMemory/Redis 双实现，开发/生产无缝切换
5. **集群支持**: Redis Pub/Sub 实现的多节点集群，包含 Presence、Claim/Release、重连路由等完整机制
6. **TypeScript 严格模式**: `strict: true` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` 三重保障
7. **良好的接口抽象**: Relay 端的存储、缓存、集群组件都通过接口解耦

### 核心改进建议（按优先级排序）

| 优先级 | 建议 | 影响 |
|---|---|---|
| P0 | 拆分 `main.dart` (3857行) 为多个文件 + 引入状态管理 | 可维护性 |
| P0 | 拆分 `provider.ts` (3122行) 和 `relay-server.ts` (2069行) | 可维护性 |
| P1 | 增加跨语言加密一致性测试 (TypeScript vs Dart) | 正确性 |
| P1 | 增加协议版本兼容策略文档 | 演进能力 |
| P1 | Relay 增加优雅停机机制 | 可靠性 |
| P2 | 引入消息中间件/拦截器机制 | 扩展性 |
| P2 | Redis 高可用方案 (Sentinel/Cluster) | 生产就绪 |
| P2 | 增加前向安全性（Key Ratchet） | 安全性 |
| P3 | Prometheus 格式指标导出 | 可观测性 |
| P3 | Provider OpenClaw Agent Bridge 拆分 (67475行) | 可维护性 |

---

## 十、架构评分

| 维度 | 评分(1-10) | 说明 |
|---|---|---|
| **整体架构** | 8.5/10 | Blind Relay + E2E Encryption 设计理念先进且实现严谨 |
| **代码组织** | 7/10 | 接口抽象良好，但部分文件过大 |
| **可维护性** | 6.5/10 | 多个超长文件影响长期维护 |
| **可测试性** | 8/10 | 接口注入 + 时间注入 + 工厂模式，测试友好 |
| **可扩展性** | 8/10 | Bridge 模式 + 接口抽象，新功能接入成本低 |
| **安全性** | 8/10 | E2E 加密 + 盲中继，缺少前向安全性 |
| **生产就绪度** | 7/10 | Docker/集群/管理面板齐备，但缺少 HA 和可观测性 |
| **文档** | 7.5/10 | README 详尽，但架构设计文档和协议规范可加强 |

**综合评分: 7.6/10**

PrivateClaw 的核心架构设计（Blind Relay + E2E AES-256-GCM + Bridge Pattern）是成熟且正确的。主要的改进空间在于代码组织的细化（拆分超长文件）和生产级运维能力的增强（HA、可观测性、优雅停机）。协议设计本身简洁高效，具备良好的演进能力。

---

*审查完毕。如有疑问或需要深入讨论某个方面，请随时联系。*
