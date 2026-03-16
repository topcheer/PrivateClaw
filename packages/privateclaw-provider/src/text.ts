export function formatBilingualText(chinese: string, english: string): string {
  return `${chinese}\n${english}`;
}

export function formatBilingualInline(
  chinese: string,
  english: string,
): string {
  return `${chinese} / ${english}`;
}

export function buildInviteAnnouncementText(params: {
  sessionId: string;
  expiresAt: string;
  groupMode: boolean;
}): string {
  if (params.groupMode) {
    return formatBilingualText(
      `PrivateClaw 群聊会话 ${params.sessionId} 已就绪，有效期至 ${params.expiresAt}。请将此二维码或邀请链接分享给所有需要加入这场端到端加密群聊的设备。`,
      `PrivateClaw group session ${params.sessionId} is ready until ${params.expiresAt}. Share this QR code or invite link with every app that should join the end-to-end encrypted group chat.`,
    );
  }

  return formatBilingualText(
    `PrivateClaw 会话 ${params.sessionId} 已就绪，有效期至 ${params.expiresAt}。请使用 PrivateClaw App 扫描二维码，或粘贴邀请链接完成连接。`,
    `PrivateClaw session ${params.sessionId} is ready until ${params.expiresAt}. Scan the QR code or paste the invite link into the PrivateClaw app to connect.`,
  );
}

export const PRIVATECLAW_PLUGIN_DESCRIPTION = formatBilingualInline(
  "OpenClaw 的一次性端到端加密 PrivateClaw 会话插件。",
  "Ephemeral end-to-end encrypted PrivateClaw session plugin for OpenClaw.",
);

export const PRIVATECLAW_COMMAND_DESCRIPTION = formatBilingualInline(
  "创建一次性加密的 PrivateClaw 会话二维码；传入 `group` 可启用群聊模式，传入 `relay=<url>` 或 `--relay <url>` 可临时覆盖 relay。",
  "Create a one-time encrypted PrivateClaw session QR code; pass `group` to enable group chat, and `relay=<url>` or `--relay <url>` to override the relay for this invite.",
);

export const PRIVATECLAW_CLI_ROOT_DESCRIPTION = formatBilingualInline(
  "PrivateClaw 本地配对与会话工具。",
  "PrivateClaw local pairing and session utilities.",
);

export const PRIVATECLAW_CLI_PAIR_DESCRIPTION = formatBilingualInline(
  "启动本地 PrivateClaw 会话，并在终端中渲染配对二维码。",
  "Start a local PrivateClaw session and render the pairing QR code in the terminal.",
);

export const PRIVATECLAW_CLI_SESSIONS_DESCRIPTION = formatBilingualInline(
  "列出当前活动中的 PrivateClaw 会话及参与者。",
  "List the active PrivateClaw sessions and their participants.",
);

export const PRIVATECLAW_CLI_SESSIONS_QR_DESCRIPTION = formatBilingualInline(
  "重新打印指定会话的二维码，可选地打开浏览器预览并通知当前参与者。",
  "Print the QR code for a selected session, optionally open a browser preview, and optionally notify the current participants.",
);

export const PRIVATECLAW_CLI_SESSIONS_KILL_DESCRIPTION = formatBilingualInline(
  "终止指定的活动会话；对于旧的后台 daemon，会回退为终止整个 daemon host。",
  "Terminate a selected active session; for older background daemons, this falls back to terminating the whole daemon host.",
);

export const PRIVATECLAW_CLI_KICK_DESCRIPTION = formatBilingualInline(
  "从群聊会话中移除指定参与者。",
  "Remove a participant from a group session.",
);

export const PRIVATECLAW_CLI_TTL_OPTION_DESCRIPTION = formatBilingualInline(
  "会话 TTL（毫秒）。",
  "Session TTL in milliseconds.",
);

export const PRIVATECLAW_CLI_LABEL_OPTION_DESCRIPTION = formatBilingualInline(
  "可选的中继会话标签。",
  "Optional relay session label.",
);

export const PRIVATECLAW_CLI_RELAY_OPTION_DESCRIPTION = formatBilingualInline(
  "临时覆盖本次命令使用的 relay base URL。",
  "Temporarily override the relay base URL for this command.",
);

export const PRIVATECLAW_CLI_GROUP_OPTION_DESCRIPTION = formatBilingualInline(
  "允许多个 PrivateClaw 客户端加入同一个会话。",
  "Allow multiple PrivateClaw app clients to join the same session.",
);

export const PRIVATECLAW_CLI_PRINT_ONLY_OPTION_DESCRIPTION =
  formatBilingualInline(
    "仅打印邀请信息和二维码，然后立即退出。",
    "Print the invite and QR code, then exit immediately.",
  );

export const PRIVATECLAW_CLI_OPEN_OPTION_DESCRIPTION = formatBilingualInline(
  "生成二维码后在浏览器中打开本地预览页。",
  "Open a local browser preview after generating the QR code.",
);

export const PRIVATECLAW_CLI_NOTIFY_OPTION_DESCRIPTION = formatBilingualInline(
  "同时把这个会话二维码通知给当前会话中的所有参与者。",
  "Also notify every current participant in this session with the session QR code.",
);

export const PRIVATECLAW_CLI_FOREGROUND_OPTION_DESCRIPTION = formatBilingualInline(
  "保持当前命令在前台运行，直到会话结束或按 Ctrl+C；在支持的运行时里也可按 Ctrl+D 转入后台。",
  "Keep the current command in the foreground until the session ends or you press Ctrl+C; in supported runtimes you can also press Ctrl+D to move it into the background.",
);

export const PRIVATECLAW_INVITE_URI_LABEL = formatBilingualInline(
  "邀请链接",
  "Invite URI",
);

export const PRIVATECLAW_QR_PNG_PATH_LABEL = formatBilingualInline(
  "二维码 PNG 路径",
  "QR PNG path",
);

export const PRIVATECLAW_WAITING_FOR_APP_MESSAGE = formatBilingualInline(
  "等待 PrivateClaw App 连接，按 Ctrl+C 停止。",
  "Waiting for the PrivateClaw app to connect. Press Ctrl+C to stop.",
);

export const PRIVATECLAW_WAITING_FOR_APP_WITH_BACKGROUND_MESSAGE = formatBilingualInline(
  "等待 PrivateClaw App 连接，按 Ctrl+C 停止，按 Ctrl+D 转入后台。",
  "Waiting for the PrivateClaw app to connect. Press Ctrl+C to stop or Ctrl+D to move it into the background.",
);

export function buildPrivateClawBackgroundDaemonReminder(
  commandPrefix: string,
  sessionId: string,
): string {
  return formatBilingualInline(
    `会话 ${sessionId} 现在由后台 daemon 托管；即使 OpenClaw 主进程重启，它也可能继续存活。可用 \`${commandPrefix} sessions\` 查看，必要时用 \`${commandPrefix} sessions kill ${sessionId}\` 终止。`,
    `Session ${sessionId} is now owned by a background daemon and may survive OpenClaw main-process restarts. Use \`${commandPrefix} sessions\` to inspect it, and \`${commandPrefix} sessions kill ${sessionId}\` if you want to terminate it.`,
  );
}

export const PRIVATECLAW_SESSION_ENDED_MESSAGE = formatBilingualInline(
  "PrivateClaw 会话已结束。",
  "The PrivateClaw session has ended.",
);

export function buildPrivateClawShutdownMessage(signal: string): string {
  return `[privateclaw-provider] ${formatBilingualInline(
    `收到 ${signal}，正在关闭`,
    `received ${signal}, shutting down`,
  )}`;
}

export function buildPrivateClawBackgroundHandoffFailureMessage(
  details: string,
): string {
  return `[privateclaw-provider] ${formatBilingualInline(
    `转入后台失败：${details}`,
    `failed to move the session into the background: ${details}`,
  )}`;
}

export function buildPrivateClawCommandErrorMessage(details: string): string {
  return formatBilingualInline(
    `创建 PrivateClaw 会话失败：${details}`,
    `Failed to create a PrivateClaw session: ${details}`,
  );
}

export const PRIVATECLAW_RENEW_SESSION_DESCRIPTION = formatBilingualInline(
  "轮换当前 PrivateClaw 会话密钥，并将当前会话延长 8 小时。",
  "Rotate the current PrivateClaw session key and extend this session by 8 hours.",
);

export const PRIVATECLAW_SESSION_QR_DESCRIPTION = formatBilingualInline(
  "重新打印当前 PrivateClaw 会话二维码，便于当面分享。",
  "Show the current PrivateClaw session QR again for in-person sharing.",
);

export const PRIVATECLAW_MUTE_BOT_DESCRIPTION = formatBilingualInline(
  "在当前群聊中暂停机器人参与回复。",
  "Pause bot replies in this group chat.",
);

export const PRIVATECLAW_UNMUTE_BOT_DESCRIPTION = formatBilingualInline(
  "在当前群聊中恢复机器人参与回复。",
  "Resume bot replies in this group chat.",
);
