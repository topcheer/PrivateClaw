# PrivateClaw 安全审查报告

**审查日期:** 2025-07-11  
**审查范围:** packages/privateclaw-protocol, packages/privateclaw-provider, services/relay-server, apps/privateclaw_app  
**审查人:** Security Reviewer  

---

## 执行摘要

PrivateClaw 是一个端到端加密的会话中继系统，整体安全架构设计合理。核心加密使用 AES-256-GCM，中继服务器仅转发密文不接触明文。以下是审查发现的所有安全问题，按严重程度分级。

### 严重程度分布

| 严重程度 | 数量 |
|----------|------|
| 高危 (High) | 2 |
| 中危 (Medium) | 5 |
| 低危 (Low) | 6 |
| 信息 (Info) | 4 |

---

## 1. 加密通信

### 1.1 [OK] AES-256-GCM 实现 - 良好

**Node.js 端 (`packages/privateclaw-protocol/src/crypto.ts`):**
- 使用 `createCipheriv`/`createDecipheriv`，算法为 `aes-256-gcm`
- 256-bit 会话密钥，12-byte 随机 IV
- 使用 `sessionKey` 做 AAD (Additional Authenticated Data)，正确绑定会话上下文
- Node.js 内置 crypto 模块，安全可靠

**Flutter 端 (`apps/privateclaw_app/lib/services/privateclaw_crypto.dart`):**
- 使用 `cryptography` 包的 `AesGcm.with256bits()`
- 同样使用 sessionId 作为 AAD
- 12-byte nonce，使用 `Random.secure()` 生成
- 与 Node.js 端加密格式兼容

**评估:** 加密实现正确，两端对齐良好。

### 1.2 [OK] 密钥管理

- 会话密钥 (`sessionKey`) 为 32 字节随机生成 (`randomBytes(32)`)
- 密钥通过 Invite（QR 码/链接）在带外传输给 App 端
- 会话续期时使用 `newSessionKey` 轮换密钥
- 密钥生命周期与会话 TTL 绑定（默认 15 分钟）

### 1.3 [MEDIUM] Nonce 生成方式不一致

**位置:** `apps/privateclaw_app/lib/services/privateclaw_crypto.dart:31`

```dart
final nonce = List<int>.generate(12, (_) => _random.nextInt(256));
```

Flutter 端使用 `Random.secure()` 生成 nonce，但这是实例级别的字段：

```dart
final Random _random = Random.secure();
```

虽然在实践中 `Random.secure()` 是 CSPRNG，但每次 `nextInt(256)` 调用是独立的。如果未来有人修改为 `Random()` 而不修改此处，会导致 nonce 可预测。相比之下，Node.js 端使用 `randomBytes(12)` 生成 IV，语义更清晰。

**建议:** 考虑使用 `cryptography` 包内置的随机 nonce 生成（不手动指定 nonce），或者在生成 nonce 时添加明确的注释说明安全性依赖。

### 1.4 [MEDIUM] Invite 中明文包含 Session Key

**位置:** `packages/privateclaw-protocol/src/invite.ts`, `apps/privateclaw_app/lib/models/privateclaw_invite.dart`

Invite payload（base64url 编码的 JSON）包含 `sessionKey` 字段。该 payload 通过 QR 码或 URI scheme (`privateclaw://connect?payload=...`) 传输。

**风险:** 
- QR 码可能被截图/拍照泄露
- URI scheme 可能被日志系统、浏览器历史记录记录
- base64url 编码并非加密，任何获得 payload 的人都能提取 sessionKey

**缓解因素:**
- Session 有 TTL 限制（默认 15 分钟）
- 需要物理接近或实时截获 QR 码

**建议:** 
- 在 Invite 文档中明确警告 QR 码的时效性和安全性
- 考虑在 QR 码显示完成后自动清除终端输出
- URI scheme 中的 payload 应在解析后立即从内存中清除

---

## 2. 认证授权

### 2.1 [HIGH] Admin API 使用简单字符串比较验证 Token

**位置:** `services/relay-server/src/admin-api.ts:42`

```typescript
function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  const headerValue = request.headers.authorization;
  if (typeof headerValue !== "string") {
    return false;
  }
  return normalizeBearerToken(headerValue) === expectedToken;
}
```

使用 `===` 比较 Bearer token，存在 **时序攻击 (timing attack)** 风险。攻击者可通过测量响应时间逐字节推断 token 内容。

**建议:** 使用 `crypto.timingSafeEqual()` 进行常量时间比较：

```typescript
import { timingSafeEqual } from "node:crypto";

function isAuthorized(request: IncomingMessage, expectedToken: string): boolean {
  const headerValue = request.headers.authorization;
  if (typeof headerValue !== "string") {
    return false;
  }
  const provided = normalizeBearerToken(headerValue);
  if (!provided) return false;
  const expectedBuf = Buffer.from(expectedToken, "utf8");
  const providedBuf = Buffer.from(provided, "utf8");
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
```

### 2.2 [MEDIUM] Provider WebSocket 无认证机制

**位置:** `services/relay-server/src/relay-server.ts` (provider WebSocket upgrade handler)

Provider 连接 WebSocket 时仅需提供 `providerId` 查询参数，无任何认证：

```typescript
// relay-provider-client.ts:70-72
private buildProviderUrl(): string {
  const url = new URL(this.options.providerWsUrl);
  url.searchParams.set("providerId", this.providerId);
  return url.toString();
}
```

**风险:** 任何知道 providerId 的人都可以冒充 Provider 连接到 relay，劫持会话或注入恶意消息。

**缓解因素:**
- Provider 通常在内网或通过 tunnel 连接
- providerId 是随机 UUID，有一定的不可预测性
- Relay 通常由同一运营者控制

**建议:** 为 Provider 连接增加认证机制，如：
- 预共享密钥 (pre-shared key) 验证
- TLS 客户端证书
- JWT token 认证

### 2.3 [LOW] App WebSocket 连接无认证

**位置:** `apps/privateclaw_app/lib/services/privateclaw_session_client.dart:654-661`

App 连接 WebSocket 时仅需提供 `appId` 和通过 URL 隐式传递的 `sessionId`：

```dart
Uri _buildSocketUri() {
  final Uri baseUri = Uri.parse(invite.appWsUrl);
  final Map<String, String> queryParameters = <String, String>{
    ...baseUri.queryParameters,
    'appId': _identity.appId,
  };
  return baseUri.replace(queryParameters: queryParameters);
}
```

**风险:** 拥有 sessionId 的任何人都可以连接（但这也在一定程度上是设计意图，因为 sessionId + sessionKey 来自 Invite）。

**缓解因素:** 端到端加密保护了内容安全，即使未授权的连接也无法解密消息。

---

## 3. 数据保护

### 3.1 [OK] Relay 服务器仅转发密文

Relay 服务器转发 `EncryptedEnvelope` 结构，包含 `version`, `messageId`, `iv`, `ciphertext`, `tag`, `sentAt`。Relay 不持有 sessionKey，无法解密内容。

### 3.2 [MEDIUM] Identity 文件未加密存储

**位置:** `apps/privateclaw_app/lib/services/privateclaw_identity_store.dart:29-33`

```dart
Future<void> save(PrivateClawIdentity identity) async {
  final File file = await _identityFile();
  await file.parent.create(recursive: true);
  await file.writeAsString(jsonEncode(identity.toJson()));
}
```

App 的 identity（包含 `appId`）以明文 JSON 文件存储在设备上。

**风险:** 
- Root/Jailbreak 设备上可被其他应用读取
- 备份时可能泄露

**缓解因素:**
- Identity 文件本身不包含 sessionKey（sessionKey 在 Invite 中临时传递）
- appId 本身不是高度敏感信息

**建议:** 考虑使用 `flutter_secure_storage` 存储 identity 文件，或在 Android 上使用 EncryptedSharedPreferences，在 iOS 上使用 Keychain。

### 3.3 [LOW] Debug 日志可能泄露 sessionId 和 appId

**位置:** `apps/privateclaw_app/lib/services/privateclaw_session_client.dart:600-636`

```dart
debugPrint(
  '[privateclaw-app] attempting push registration '
  'session=${invite.sessionId} appId=${_identity.appId} hasProvider=${provider != null}',
);
```

多处使用 `debugPrint` 输出 sessionId、appId、messageId 等信息。

**缓解因素:** `debugPrint` 在 Release 构建中会被去除（Flutter 框架行为）。

**建议:** 确认 Release 构建中所有 `debugPrint` 均被优化掉。对生产日志应避免输出任何标识符。

### 3.4 [LOW] Relay 服务器错误消息暴露内部信息

**位置:** `services/relay-server/src/relay-server.ts:1402-1408`

```typescript
response.writeHead(500, { "content-type": "application/json" });
response.end(
  JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }),
);
```

500 错误响应中包含原始错误消息，可能暴露内部实现细节。

**建议:** 在生产环境中返回通用错误消息，将详细错误信息仅记录到服务端日志。

---

## 4. 输入验证

### 4.1 [OK] JSON 解析有异常处理

所有 WebSocket 消息均经过 `JSON.parse` + 类型校验。无效 JSON 和不符合协议的消息会被拒绝并返回错误。

### 4.2 [OK] 消息大小限制

**位置:** `services/relay-server/src/relay-server.ts:119-132`

```typescript
function assertMessageSizeWithinLimit(
  raw: string,
  maxBytes: number,
  actorLabel: "App" | "Provider",
): void {
  const rawBytes = Buffer.byteLength(raw, "utf8");
  if (rawBytes <= maxBytes) {
    return;
  }
  throw new RelayProtocolError(
    "message_too_large",
    `${actorLabel} message exceeds the ${maxBytes}-byte relay limit.`,
  );
}
```

WebSocket 和应用层均有消息大小限制（默认 24MB，可配置）。

### 4.3 [OK] 速率限制

Relay 服务器实现了固定窗口速率限制器：

```typescript
class FixedWindowRateLimiter {
  // App 和 Provider 分别有独立的 rate limit 配置
  // 默认: App 120条/分钟, Provider 600条/分钟
}
```

### 4.4 [OK] Invite 解析有版本校验

```dart
// Flutter 端
if (json['version'] != 1) {
  throw const FormatException('Unsupported PrivateClaw invite version.');
}
```

### 4.5 [LOW] admin-api sessionId 路径参数未做格式校验

**位置:** `services/relay-server/src/admin-api.ts:135-137`

```typescript
const sessionId = decodeURIComponent(
  options.url.pathname.slice("/api/admin/sessions/".length),
);
```

sessionId 直接从 URL 提取，未验证其格式（如是否为有效 UUID）。虽然后续会通过 store 查询进行隐式验证，但恶意输入可能被传递到 Redis 查询中。

**建议:** 在路由层添加 sessionId 格式校验（UUID v4 格式）。

---

## 5. 依赖安全

### 5.1 [OK] 依赖数量少且均为知名库

**relay-server 依赖:**
- `ioredis` (^5.8.1) - Redis 客户端
- `ws` (^8.18.3) - WebSocket 库

**Flutter 应用依赖:**
- `cryptography` - Dart 加密库
- `web_socket_channel` - WebSocket 客户端
- `firebase_messaging` - 推送通知

这些均为广泛使用的成熟库。

### 5.2 [INFO] 建议定期运行 npm audit

```bash
npm audit
cd apps/privateclaw_app && flutter pub outdated
```

**建议:** 在 CI 中集成 `npm audit` 和 Dependabot/Renovate 自动更新。

---

## 6. WebSocket 安全

### 6.1 [HIGH] 默认配置使用 ws:// 而非 wss://

**位置:** `packages/privateclaw-provider/.env.example:1`

```
PRIVATECLAW_RELAY_BASE_URL=ws://127.0.0.1:8787
```

**风险:** 
- 未加密的 WebSocket 连接可被中间人攻击
- SessionKey、加密消息、元数据均可被窃听
- 即使消息内容已加密，流量模式分析仍可泄露信息

**缓解因素:**
- 示例配置使用 `127.0.0.1`（本地回环），本地开发是安全的
- 生产部署可通过 Tailscale/Cloudflare Tunnel 加密

**建议:** 
- 文档中明确要求生产环境必须使用 `wss://` 或加密隧道
- 在 App 端对 `ws://` 非 localhost 连接显示安全警告

### 6.2 [OK] WebSocket 心跳检测

实现了 ping/pong 心跳机制，超时自动断开连接（45 秒超时，15 秒间隔）。防止了僵尸连接。

### 6.3 [OK] WebSocket maxPayload 配置

```typescript
const providerWss = new WebSocketServer({
  noServer: true,
  maxPayload: websocketMaxPayloadBytes,
});
```

WebSocket 层面限制了最大 payload 大小。

### 6.4 [LOW] WebSocket 连接无 Origin 检查

**位置:** `services/relay-server/src/relay-server.ts` (upgrade handler)

WebSocket upgrade 时未检查 `Origin` 头。

**风险:** 可能被恶意网页发起跨站 WebSocket 劫持（CSWSH）。

**缓解因素:**
- Relay 主要用于 WebSocket 而非浏览器连接
- 即使连接成功，没有 sessionKey 也无法解密内容

**建议:** 在 upgrade handler 中添加 Origin 白名单检查。

---

## 7. 隐私保护

### 7.1 [OK] 无账号注册系统

PrivateClaw 不需要用户注册账号，不收集个人身份信息。App 自动生成匿名 identity。

### 7.2 [OK] 隐私政策完善

`PRIVACY.md` 清晰说明了数据流向、加密设计、权限使用和数据保留策略。

### 7.3 [OK] 无第三方分析/广告 SDK

代码中没有集成 Google Analytics、Facebook SDK 或任何广告追踪 SDK。

### 7.4 [INFO] Relay 可观测元数据

正如隐私政策中所述，Relay 运营者可以观察到：
- Session ID 和连接时间
- 消息大小和频率
- 参与者数量（App 连接数）

这是架构设计的固有限制。建议在文档中继续强调这一点。

---

## 8. 配置安全

### 8.1 [OK] .env 文件处理

- `.env` 文件已在 `.gitignore` 中排除
- 提供了 `.env.example` 模板，不含真实密钥
- 敏感文件如 `google-services.json`、`GoogleService-Info.plist` 已被排除

### 8.2 [OK] FCM 私钥处理

**位置:** `services/relay-server/src/push-notifier.ts`

FCM 服务账号私钥从环境变量读取，用于生成 OAuth token。私钥不会输出到日志中。

### 8.3 [MEDIUM] Admin Token 通过环境变量明文传递

**位置:** `services/relay-server/.env.example:9`

```
# PRIVATECLAW_ADMIN_TOKEN=replace-with-a-long-random-token
```

Admin Token 以明文存储在环境变量中。

**建议:** 
- 文档中应指导用户使用强随机 token（如 `openssl rand -hex 32`）
- 考虑支持从文件读取 token（如 Docker secrets）

### 8.4 [OK] Docker 配置

`Dockerfile.multiarch` 使用多阶段构建，最终镜像不包含开发依赖。`NODE_ENV=production` 已设置。

### 8.5 [OK] Redis 配置

Docker Compose 中 Redis 配置了 `--save "" --appendonly no`，不持久化数据，减少了数据残留风险。

### 8.6 [LOW] compose.yaml 中 ADMIN_TOKEN 可能为空

```yaml
PRIVATECLAW_ADMIN_TOKEN: ${PRIVATECLAW_ADMIN_TOKEN:-}
```

如果未设置 `PRIVATECLAW_ADMIN_TOKEN`，admin API 会返回 404（代码中已处理）。但如果设置为空字符串，可能有意外行为。

**建议:** 在启动时检查：如果 `PRIVATECLAW_ADMIN_TOKEN` 被设置为空字符串，应发出警告或拒绝启动。

---

## 9. 其他发现

### 9.1 [INFO] Session TTL 合理

默认 15 分钟 TTL，可通过 `/renew-session` 命令续期。短期会话限制了密钥泄露的影响范围。

### 9.2 [LOW] Redis 数据未加密

Redis 中存储的 session 数据和 frame cache 数据未加密。

**缓解因素:** 
- Session 数据本身不包含消息内容（仅包含 sessionId、providerId、expiresAt）
- Frame cache 中存储的是加密后的 envelope（已有端到端加密保护）
- Redis 建议在内网运行

**建议:** 如果 Redis 需要跨网络访问，建议启用 TLS。

### 9.3 [LOW] 错误响应中包含错误类名

**位置:** `services/relay-server/src/relay-server.ts` (多处)

部分错误消息可能包含内部实现细节，如 provider session 的 UUID、错误代码等。

**建议:** 在面向客户端的错误消息中只返回通用错误码和提示，将详细信息记录到服务端日志。

---

## 修复优先级建议

| 优先级 | 编号 | 问题 | 工作量 |
|--------|------|------|--------|
| P0 | 2.1 | Admin Token 使用 timingSafeEqual | 小 |
| P0 | 6.1 | 文档强制要求生产环境 wss:// | 小 |
| P1 | 2.2 | Provider WebSocket 增加认证 | 中 |
| P1 | 1.4 | Invite 安全性文档加强 | 小 |
| P1 | 3.2 | Identity 文件加密存储 | 中 |
| P2 | 1.3 | Nonce 生成方式改进 | 小 |
| P2 | 8.3 | Admin Token 配置安全加强 | 小 |
| P2 | 4.5 | Admin API sessionId 格式校验 | 小 |
| P2 | 6.4 | WebSocket Origin 检查 | 小 |
| P3 | 3.3 | Debug 日志审查 | 小 |
| P3 | 3.4 | 500 错误消息脱敏 | 小 |
| P3 | 9.2 | Redis TLS | 中 |

---

## 总结

PrivateClaw 的安全架构设计是扎实的。端到端加密的核心设计使得 Relay 服务器成为"盲中继"，即使 Relay 被攻破，消息内容仍然安全。主要的安全改进集中在：

1. **认证加固** - Admin API 的时序安全比较、Provider 连接认证
2. **传输安全** - 确保生产环境强制 TLS
3. **密钥生命周期** - 加强 Invite 传输安全、本地 identity 存储

整体而言，该项目在安全方面的投入是认真且专业的，核心加密实现正确，架构上做到了最小信任原则。
