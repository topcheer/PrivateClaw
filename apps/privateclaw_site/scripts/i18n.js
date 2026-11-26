const BUNDLES = {
  en: {
    meta: {
      nativeLabel: "English",
      htmlLang: "en",
    },
    site: {
      stageLockLabel: "End-to-end encrypted",
      stageAiLabel: "OpenClaw is replying",
      showcaseKicker: "See it in motion",
      showcaseTitle: "Real screens from the real app.",
      showcaseBody: "Every frame below is the shipped iOS and web client: no mockups, no renders of features that do not exist.",
      showcase1Title: "One invite, one room",
      showcase1Body: "Paste a link or scan a QR code and you are inside a one-time private session. Nothing else to configure.",
      showcase2Title: "Group chat that stays yours",
      showcase2Body: "Invite the people you actually trust. Everyone sees the same encrypted room, and the relay only ever sees ciphertext.",
      showcase3Title: "Media that travels encrypted",
      showcase3Body: "Photos, voice notes, and files are attached to the end-to-end encrypted stream, not uploaded to a public feed.",
      showcase4Title: "Your OpenClaw, in the loop",
      showcase4Body: "The assistant you already run at home answers inside the session, from trip plans to files, with its usual memory and tools.",
      documentTitle: "PrivateClaw | Private rooms for your OpenClaw",
      metaDescription: "PrivateClaw gives you beautiful, private rooms for the people you trust around one shared OpenClaw: end-to-end encrypted chat on iPhone, Mac, Windows, Linux and the web, with your own AI assistant inside.",
      brandTagline: "Private rooms for your OpenClaw",
      languageLabel: "Language",
      navGithub: "GitHub",
      navBetaGroup: "Android test group",
      navTelegramGroup: "Telegram group chat",
      heroBadge: "Private • Encrypted • Invite-only",
      heroTitle: "Bring your people into one private OpenClaw room.",
      heroBody:
        "PrivateClaw turns one shared OpenClaw into a beautiful private room for the people you actually trust. Scan once, join instantly, and let the relay carry ciphertext only.",
      heroPrimaryCta: "Open web chat",
      heroSecondaryCta: "Join Android testing",
      heroDesktopHint:
        "Web chat works on desktop and phone. On desktop, pasting an invite or selecting a saved QR image is usually the fastest way in.",
      heroMobileHint:
        "Web chat works here too, so you can open the PrivateClaw room right away from this phone.",
      appComingSoon: "iPhone App Store + Android closed alpha",
      iosComingSoon: "Download on the App Store",
      androidComingSoon: "Join Android closed alpha",
      androidBetaNote:
        "Android closed alpha is delivered through Google Play. Join the Google Group first or Play will say the test is unavailable.",
      previewStatus: "Live preview",
      previewTitle: "A room that feels personal, not public.",
      previewBody:
        "Keep family, teammates, or friends around the OpenClaw you already trust, without moving the conversation into a public social feed.",
      heroStats: [
        {
          value: "One shared OpenClaw",
          label: "Invite your favorite people into the same assistant without exposing the room to strangers.",
        },
        {
          value: "Encrypted end to end",
          label: "The relay routes traffic, but it does not get your decrypted chat content.",
        },
        {
          value: "Made for real moments",
          label: "Trip planning, private family talks, team check-ins, and fun group sessions all feel natural.",
        },
      ],
      previewMessages: [
        {
          speaker: "RiverCat",
          role: "member",
          text: "Can we plan the weekend trip here instead of the big public group?",
        },
        {
          speaker: "PrivateClaw",
          role: "assistant",
          text: "Absolutely. I can keep the ideas, routes, and packing lists together for everyone in this room.",
        },
        {
          speaker: "SkyFox",
          role: "member",
          text: "Nice. One OpenClaw, one room, and no random timeline noise.",
        },
      ],
      featuresKicker: "Why people love it",
      featuresTitle: "Private by default, warm by design.",
      featuresBody:
        "PrivateClaw is for people who want secure spaces that still feel relaxed, social, and fun around one shared OpenClaw.",
      features: [
        {
          eyebrow: "Invite only",
          title: "One scan. One room.",
          body: "A room starts from a QR code or invite link, so you choose who gets in and when.",
        },
        {
          eyebrow: "Shared assistant",
          title: "One OpenClaw for everyone you trust.",
          body: "Friends, family, or teammates can all talk with the same OpenClaw session and enjoy the same context together.",
        },
        {
          eyebrow: "Private routing",
          title: "The relay is just a courier.",
          body: "Messages stay encrypted between the app and your OpenClaw side of the session, so the relay only forwards ciphertext.",
        },
        {
          eyebrow: "Mobile first",
          title: "Feels like a real chat app.",
          body: "Slash commands, media, group presence, and gentle motion all make it feel familiar on a phone.",
        },
      ],
      scenariosKicker: "Built for real life",
      scenariosTitle: "Security without losing the fun.",
      scenariosBody:
        "PrivateClaw is designed for close circles that want to keep using OpenClaw together without turning to public social software.",
      scenarios: [
        {
          eyebrow: "Family",
          title: "Keep private family planning together.",
          body: "Share schedules, ideas, and travel plans around one OpenClaw room that feels calm and personal.",
        },
        {
          eyebrow: "Friends",
          title: "Use group chat for the fun stuff too.",
          body: "Play with prompts, brainstorm gifts, or build shared plans with the same assistant in the same room.",
        },
        {
          eyebrow: "Teams",
          title: "Open a short-lived secure side channel.",
          body: "Spin up an invite-only room when you need a focused conversation without dragging people into another public chat silo.",
        },
      ],
      desktopDownloadsKicker: "Desktop apps",
      desktopDownloadsTitle: "PrivateClaw on Windows, macOS, and Linux.",
      desktopDownloadsBody:
        "PrivateClaw for Windows is live on the Microsoft Store, so it installs and updates like any other Windows app. macOS and Linux builds are published on GitHub; a Mac App Store version is not available yet.",
      desktopDownloadsBadge: "Microsoft Store + GitHub releases",
      desktopDownloadWindowsStore: "Get it from Microsoft Store",
      desktopDownloadWindowsX64: "Windows ZIP (sideload)",
      desktopDownloadMacosArm64: "macOS Apple Silicon DMG",
      desktopDownloadMacosX64: "macOS Intel DMG",
      desktopDownloadLinuxX64: "Linux x64 tar.gz",
      desktopDownloadLinuxArm64: "Linux ARM64 tar.gz",
      desktopDownloadsNote:
        "The Microsoft Store link is the live listing (Windows 10/11, auto-updates). The GitHub links are the direct v0.1.21 release assets for macOS, Linux, and Windows sideloading.",
      setupKicker: "Install the OpenClaw plugin",
      setupTitle: "Install from ClawHub. Pair. Done.",
      setupBody:
        "PrivateClaw is a ClawHub-reviewed plugin, so the official registry install works on current OpenClaw hosts with no override flags. Install, enable, restart the gateway, and pair from the CLI or from any chat channel.",
      setupSteps: [
        {
          step: "Recommended",
          title: "Install the plugin from ClawHub",
          body: "This is the official path. ClawHub serves the audited package, OpenClaw verifies it, and the plugin is enabled in two commands.",
          commands: [
            "openclaw plugins install clawhub:@privateclaw/privateclaw --accept-capabilities",
            "openclaw plugins enable privateclaw",
          ],
          note: "On current OpenClaw hosts the bare form `openclaw plugins install @privateclaw/privateclaw` resolves to ClawHub as well. Restart the OpenClaw gateway after enabling so it loads the plugin.",
          featured: true,
          variant: "recommended",
        },
        {
          step: "Then",
          title: "Restart the gateway and pair",
          body: "Restart OpenClaw, then open a pairing link from the CLI or create a room invite from any existing OpenClaw chat channel.",
          commands: [
            "openclaw privateclaw pair --open",
            "/privateclaw",
            "/privateclaw group",
          ],
          note: "Use `openclaw privateclaw pair --group --open` or `/privateclaw group` when you want multiple people sharing the same room.",
          variant: "fallback",
        },
        {
          step: "Alternative",
          title: "One-command setup wizard",
          body: "If you would rather not run the plugin commands by hand, the npx wizard installs or updates the plugin, enables it, restarts the gateway, and walks you straight into pairing.",
          commands: ["npx -y @privateclaw/privateclaw@latest"],
          note: "The wizard asks for single or group chat and a session duration from 30 minutes to permanent. It pulls the npm package directly, so it is also the fastest way to pick up a brand-new patch.",
          variant: "fallback",
        },
      ],
      betaKicker: "Mobile apps",
      betaTitle: "Get Hearth Room on iPhone. Join Android testing.",
      betaBody:
        "Hearth Room is now live on the App Store for iPhone, and Android closed alpha is live on Google Play. Join the Google Group first so Google Play will admit you to the Android test.",
      betaPrimaryCta: "Join Android test group",
      betaTelegramCta: "Join the Telegram chat",
      betaFootnote:
        "Android closed alpha still requires Google Group membership first. iPhone users can now download Hearth Room on the App Store, and Telegram stays open for the early community.",
      faqKicker: "FAQ",
      faqTitle: "Questions people ask",
      faqIntro: "Short answers about what Hearth Room and PrivateClaw are, how they work and what they cost.",
      faqQ1: "What is Hearth Room?",
      faqA1: "Hearth Room is the PrivateClaw client: an app for iPhone, iPad, Mac, Windows, Linux and the web that joins end-to-end encrypted chat rooms created by PrivateClaw on your computer.",
      faqQ2: "Is it free?",
      faqA2: "Yes. PrivateClaw, the OpenClaw plugin and Hearth Room are open source and free to use, with no account, subscription or in-app purchase.",
      faqQ3: "How private is it?",
      faqA3: "Messages, photos, voice notes and files are end-to-end encrypted between the members of a room. The relay only routes ciphertext and never sees the content or the keys.",
      faqQ4: "How do rooms and invites work?",
      faqA4: "A room is created with a one-time QR code or invite link and can be set to expire after a few hours, days or a longer period. Anyone with the invite can join until it expires or is revoked.",
      faqQ5: "Which platforms are supported?",
      faqA5: "Hearth Room runs on iOS and iPadOS, macOS, Windows and Linux, plus a web chat in the browser. An Android version is in closed testing.",
      faqQ6: "How does it relate to OpenClaw?",
      faqA6: "PrivateClaw is a plugin for OpenClaw, the assistant runtime you run on your own computer. It creates the rooms, issues the invites and lets your OpenClaw assistant answer inside them.",
      footerLine: "Private rooms, shared OpenClaw, and a calmer way to chat.",
      footerDisclaimer: "PrivateClaw is independent and not affiliated with OpenClaw.",
      footerPrivacy: "Privacy",
      footerTerms: "Terms",
      footerSupport: "Android testing updates live in the Google Group.",
      footerCopyright: "Copyright GG AI Studio 2026.",
    },
    chat: {
      documentTitle: "PrivateClaw Web Chat",
      metaDescription: "Open a PrivateClaw room right in your browser: paste an invite link or scan a QR code to join an end-to-end encrypted chat with your OpenClaw assistant.",
      headerTagline: "Web chat",
      disconnectButton: "Disconnect",
      desktopNoteTitle: "Desktop works too",
      desktopNoteBody:
        "This room is fully usable on larger screens as well. On desktop, pasting the invite or choosing a saved QR image is often the quickest way to join.",
      connectKicker: "Secure pairing",
      connectTitle: "Paste your PrivateClaw invite.",
      connectBody:
        "Paste the invite text, QR payload, or full announcement message from OpenClaw to enter the room.",
      changeInviteButton: "Use another invite",
      statusPanelTitle: "End-to-end encrypted",
      statusIdle: "Waiting for an invite.",
      inviteInputLabel: "Invite",
      inviteInputHelp:
        "You can paste a raw privateclaw:// link, a base64 payload, JSON, or even a full message that contains the invite.",
      inviteInputPlaceholder: "Paste invite or announcement here",
      scanButton: "Scan QR",
      scanImageButton: "Use QR image",
      scanHelp:
        "Use your camera on supported browsers, or choose a QR screenshot from your device.",
      scannerTitle: "Scan a PrivateClaw QR",
      scannerBody:
        "Point your camera at a PrivateClaw invite QR. The room will open as soon as it is recognized.",
      scannerCloseButton: "Close",
      scannerStatusStarting: "Opening camera…",
      scannerStatusScanning: "Scanning for a PrivateClaw invite…",
      scannerStatusFound: "Invite found. Connecting…",
      connectButton: "Connect securely",
      providerLabel: "Provider",
      expiresLabel: "Expires",
      modeLabel: "Mode",
      relayLabel: "Relay",
      identityLabel: "Identity",
      participantsLabel: "Participants",
      betaGroupButton: "Join the beta Google Group",
      emptyTitle: "Your private room will appear here",
      emptyBody:
        "Once connected, messages, slash commands, and media from OpenClaw stay inside this encrypted session.",
      draftAttachmentsLabel: "Ready to send",
      sendButton: "Send",
      composerPlaceholder: "Message your room…",
      commandSheetTitle: "Slash commands",
      commandSheetClose: "Close",
      commandButtonAria: "Open slash commands",
      attachButtonAria: "Attach files",
      providerUnknown: "PrivateClaw",
      relayUnknown: "Default relay",
      identityUnknown: "Private guest",
      modePrivate: "1:1 room",
      modeGroup: "Shared room",
      modeGroupMuted: "Shared room · Bot muted",
      statusLabelIdle: "Idle",
      statusLabelConnecting: "Connecting",
      statusLabelReconnecting: "Reconnecting",
      statusLabelRelayAttached: "Handshaking",
      statusLabelActive: "Connected",
      statusLabelClosed: "Closed",
      statusLabelError: "Needs attention",
      relayConnecting: "Connecting to the relay…",
      relayHandshake: "Relay connected. Finishing encrypted handshake…",
      relayConnectionError: "Connection problem: {reason}",
      relaySessionClosed: "This session has closed.",
      relaySessionClosedWithReason: "This session has closed: {reason}",
      relayError: "Relay error: {reason}",
      relayUnknownEvent: "Unexpected relay event: {reason}",
      relayUnknownPayload: "Unexpected encrypted payload: {reason}",
      welcomeFallback: "PrivateClaw connected.",
      customRelayWarningTitle: "Custom relay server",
      customRelayWarningBody:
        "This invite points to {relayLabel} instead of the default PrivateClaw relay. Continue only if you trust this server.",
      sessionDisconnected:
        "Session disconnected. Paste a new invite when you want to start again.",
      sessionRenewedNotice: "Session renewed until {time}.",
      connectFailed: "The invite could not be parsed.",
      invalidInviteVersion: "This invite version is not supported by the web client.",
      sessionKeyLengthError: "The session key must be 32 bytes.",
      browserCryptoUnavailable:
        "This browser does not support the Web Crypto features PrivateClaw needs.",
      scanUnsupported:
        "This browser cannot decode QR codes yet. Paste the invite or try a newer browser.",
      scanCameraUnsupported:
        "Camera scanning is not available here. Try choosing a QR image or pasting the invite.",
      scanPermissionDenied:
        "Camera access was blocked. Allow camera permission or choose a QR image instead.",
      scanPickerFallback:
        "Live camera scanning is not available here, so PrivateClaw opened your camera or photo library instead.",
      scanNoCodeFound: "No QR code was found in that image.",
      scanReadFailed: "Could not read that QR image.",
      fileTooLarge: "{name} is larger than 5 MB and was skipped.",
      fileReadError: "Could not read {name}.",
      sendFailed: "Could not send: {reason}",
      notConnected: "Connect to a room before sending messages.",
      noCommandsYet: "Slash commands will appear after the room handshake finishes.",
      assistantLabel: "PrivateClaw",
      systemLabel: "System",
      youLabel: "You",
      peerLabelFallback: "Participant",
      pendingLabel: "Thinking…",
      thinkingTraceFallbackTitle: "Thinking",
      thinkingTraceLive: "Live",
      thinkingTraceDone: "Done",
      thinkingTraceFailed: "Failed",
      thinkingTraceSteps: "{count} steps",
      mutedLabel: "Bot muted",
      commandSourceOpenclaw: "OpenClaw",
      commandSourcePlugin: "Plugin",
      commandSourcePrivateclaw: "PrivateClaw",
      commandArgHint: "Needs arguments",
      commandSendNow: "Tap to send now",
      draftRemoveAttachment: "Remove attachment",
      downloadAttachment: "Download",
      attachmentNoPreview: "Preview unavailable in the browser",
      toastConnected: "Secure room connected.",
      toastInviteReady: "Invite loaded. Starting secure connection…",
      toastDisconnected: "PrivateClaw disconnected.",
      toastCommandInserted: "Command inserted.",
      toastCommandSent: "Command sent.",
      toastCopiedNothing: "Nothing to send yet.",
      expiresUnknown: "Unknown",
      desktopBanner: "Desktop preview",
    },
  },
  "zh-CN": {
    meta: {
      nativeLabel: "简体中文",
      htmlLang: "zh-CN",
    },
    site: {
      stageLockLabel: "端到端加密",
      stageAiLabel: "OpenClaw 正在回复",
      showcaseKicker: "看看它实际的样子",
      showcaseTitle: "全部来自真实应用的截图。",
      showcaseBody: "下面每一帧都来自已发布的 iOS 与网页客户端，没有示意图，也没有不存在的功能。",
      showcase1Title: "一个邀请，一个房间",
      showcase1Body: "粘贴链接或扫描二维码，即可进入一次性的私密会话，无需任何其他设置。",
      showcase2Title: "群聊只属于你们",
      showcase2Body: "只邀请你真正信任的人。大家看到的是同一个加密房间，中继服务器只能看到密文。",
      showcase3Title: "媒体也走加密通道",
      showcase3Body: "照片、语音和文件都附在端到端加密流里，不会上传到任何公共信息流。",
      showcase4Title: "你自己的 OpenClaw 在场",
      showcase4Body: "你家里已经在运行的助手直接在会话里回答，从行程规划到文件，保留它原有的记忆与工具。",
      documentTitle: "PrivateClaw | 给 OpenClaw 的私密聊天室",
      metaDescription: "PrivateClaw 把一套共享的 OpenClaw 变成只属于你信任的人的私密房间：端到端加密聊天，支持 iPhone、Mac、Windows、Linux 与网页，你自己的 AI 助手也在房间里。",
      brandTagline: "给 OpenClaw 的私密聊天室",
      languageLabel: "语言",
      navGithub: "GitHub",
      navBetaGroup: "Android 内测群组",
      navTelegramGroup: "Telegram 群聊",
      heroBadge: "私密 • 加密 • 邀请制",
      heroTitle: "把你信任的人带进同一个私密 OpenClaw 房间。",
      heroBody:
        "PrivateClaw 把一套共享的 OpenClaw 变成只属于你们的小房间。扫一次码就能进入，中继只负责转发密文，不读取聊天内容。",
      heroPrimaryCta: "打开网页聊天",
      heroSecondaryCta: "加入 Android 内测",
      heroDesktopHint: "网页聊天支持桌面和手机访问。在桌面端，直接粘贴邀请或选择一张二维码截图通常是最快的进入方式。",
      heroMobileHint: "网页聊天在手机上也完全可用，你现在就可以直接打开 PrivateClaw 房间。",
      appComingSoon: "iPhone App Store + Android 封闭 alpha",
      iosComingSoon: "前往 App Store 下载",
      androidComingSoon: "加入 Android 封闭 alpha",
      androidBetaNote:
        "Android 封闭 alpha 通过 Google Play 分发。请先加入 Google 群组，否则 Google Play 会提示你暂时无法参与测试。",
      previewStatus: "实时预览",
      previewTitle: "像私人聊天室，而不是公共社交软件。",
      previewBody:
        "把家人、朋友或队友带到你已经信任的 OpenClaw 身边，不必把对话放进公开社交平台。",
      heroStats: [
        {
          value: "一套共享 OpenClaw",
          label: "把你最在意的人邀请到同一个助手里，而不是把房间暴露给陌生人。",
        },
        {
          value: "端到端加密",
          label: "中继只转发流量，拿不到解密后的聊天内容。",
        },
        {
          value: "适合真实场景",
          label: "家庭沟通、旅行计划、团队小群和一起玩 AI 都很自然。",
        },
      ],
      previewMessages: [
        {
          speaker: "流萤狐",
          role: "member",
          text: "这次周末出行我们在这里聊吧，不放到那个大群里了。",
        },
        {
          speaker: "PrivateClaw",
          role: "assistant",
          text: "没问题，我可以把行程、路线和打包清单都留在这个房间里，方便大家一起看。",
        },
        {
          speaker: "晴空猫",
          role: "member",
          text: "不错，一套 OpenClaw、一个房间，没有时间线噪音。",
        },
      ],
      featuresKicker: "为什么大家会喜欢",
      featuresTitle: "默认私密，但体验很轻松。",
      featuresBody: "PrivateClaw 适合想要安全感、又不想失去聊天乐趣的人。",
      features: [
        {
          eyebrow: "邀请制",
          title: "扫一扫，就进入同一个房间。",
          body: "每个房间都从二维码或邀请链接开始，谁能加入、什么时候加入，都由你决定。",
        },
        {
          eyebrow: "共享助手",
          title: "你信任的人共用一套 OpenClaw。",
          body: "家人、朋友或队友都能围绕同一个 OpenClaw 会话聊天，共享上下文和乐趣。",
        },
        {
          eyebrow: "私密转发",
          title: "中继只是快递员。",
          body: "消息在 App 和 OpenClaw 侧之间保持加密，中继只负责传递密文。",
        },
        {
          eyebrow: "移动优先",
          title: "体验像真正的聊天应用。",
          body: "斜杠命令、媒体消息、群成员状态和流畅的手机界面都已经准备好了。",
        },
      ],
      scenariosKicker: "贴近真实使用",
      scenariosTitle: "要安全，也要有一起玩的乐趣。",
      scenariosBody:
        "PrivateClaw 适合那些想继续一起使用 OpenClaw、又不想把沟通放在公开社交软件中的小圈子。",
      scenarios: [
        {
          eyebrow: "家庭",
          title: "把家里的计划留在家里。",
          body: "日程、旅行、清单和各种家务讨论都能放在一个安静的小房间里。",
        },
        {
          eyebrow: "朋友",
          title: "一起聊天，也一起玩 AI。",
          body: "脑暴礼物、做攻略、一起试 prompt，都能围绕同一个助手完成。",
        },
        {
          eyebrow: "团队",
          title: "临时拉起安全的小通道。",
          body: "当你需要一个短期、专注、非公开的讨论空间时，随时开一个邀请制房间。",
        },
      ],
      desktopDownloadsKicker: "桌面应用",
      desktopDownloadsTitle: "Windows、macOS、Linux 都能用 PrivateClaw。",
      desktopDownloadsBody:
        "Windows 版已上架 Microsoft Store，像普通 Windows 应用一样安装和自动更新；macOS 与 Linux 版本发布在 GitHub，Mac App Store 版本暂未上架。",
      desktopDownloadsBadge: "Microsoft Store + GitHub Releases",
      desktopDownloadWindowsStore: "前往 Microsoft Store 安装",
      desktopDownloadWindowsX64: "Windows ZIP（侧载）",
      desktopDownloadMacosArm64: "macOS Apple Silicon DMG",
      desktopDownloadMacosX64: "macOS Intel DMG",
      desktopDownloadLinuxX64: "Linux x64 tar.gz",
      desktopDownloadLinuxArm64: "Linux ARM64 tar.gz",
      desktopDownloadsNote:
        "Microsoft Store 链接为线上商店页（Windows 10/11，自动更新）。GitHub 链接为 v0.1.21 的直接发布资产，适用于 macOS、Linux 与 Windows 侧载。",
      setupKicker: "安装 OpenClaw 插件",
      setupTitle: "从 ClawHub 安装，配对，完成。",
      setupBody:
        "PrivateClaw 已通过 ClawHub 审核，在当前的 OpenClaw 主机上走官方 registry 安装即可，不需要任何强制覆盖参数。安装、启用、重启 gateway，然后从 CLI 或任意聊天频道配对。",
      setupSteps: [
        {
          step: "推荐",
          title: "从 ClawHub 安装插件",
          body: "这是官方路径：ClawHub 分发经过审计的包，OpenClaw 自行校验，两条命令即可启用。",
          commands: [
            "openclaw plugins install clawhub:@privateclaw/privateclaw --accept-capabilities",
            "openclaw plugins enable privateclaw",
          ],
          note: "在当前的 OpenClaw 主机上，简写 `openclaw plugins install @privateclaw/privateclaw` 同样会解析到 ClawHub。启用后请重启 OpenClaw gateway 以加载插件。",
          featured: true,
          variant: "recommended",
        },
        {
          step: "然后",
          title: "重启 gateway 并配对",
          body: "重启 OpenClaw，然后在 CLI 打开配对链接，或在任意已有的 OpenClaw 聊天频道里创建房间邀请。",
          commands: [
            "openclaw privateclaw pair --open",
            "/privateclaw",
            "/privateclaw group",
          ],
          note: "想让多个人共享同一个房间时，使用 `openclaw privateclaw pair --group --open` 或 `/privateclaw group`。",
          variant: "fallback",
        },
        {
          step: "备选",
          title: "一条命令的安装向导",
          body: "如果不想手动执行插件命令，npx 向导会安装或更新插件、启用它、重启 gateway，并直接带你进入配对。",
          commands: ["npx -y @privateclaw/privateclaw@latest"],
          note: "向导会询问单聊还是群聊，以及 30 分钟到永久的会话时长。它直接拉取 npm 包，所以也是拿到最新 patch 最快的方式。",
          variant: "fallback",
        },
      ],
      betaKicker: "移动应用",
      betaTitle: "下载 iPhone 版 Hearth Room，加入 Android 内测。",
      betaBody:
        "Hearth Room iPhone 版已经在 App Store 正式上线，Android 封闭 alpha 也已经在 Google Play 上线。想参与 Android 测试的话，请先加入 Google 群组。",
      betaPrimaryCta: "加入 Android 内测群组",
      betaTelegramCta: "加入 Telegram 群聊",
      betaFootnote:
        "Android 封闭 alpha 仍然需要先加入 Google Group；iPhone 用户现在可以直接在 App Store 下载 Hearth Room，Telegram 交流群也持续开放。",
      faqKicker: "常见问题",
      faqTitle: "大家常问的问题",
      faqIntro: "关于 Hearth Room 与 PrivateClaw 是什么、如何工作以及是否收费的简要回答。",
      faqQ1: "Hearth Room 是什么？",
      faqA1: "Hearth Room 是 PrivateClaw 的客户端：一款覆盖 iPhone、iPad、Mac、Windows、Linux 和网页的应用，用来加入由电脑上的 PrivateClaw 创建的端到端加密聊天房间。",
      faqQ2: "收费吗？",
      faqA2: "免费。PrivateClaw、OpenClaw 插件和 Hearth Room 都是开源且免费使用的，没有账号、订阅或应用内购买。",
      faqQ3: "有多私密？",
      faqA3: "消息、照片、语音和文件在房间成员之间端到端加密。中继服务器只转发密文，永远看不到内容，也没有密钥。",
      faqQ4: "房间和邀请是怎么运作的？",
      faqA4: "房间通过一次性二维码或邀请链接创建，可以设定在几小时、几天或更长时间后过期。在过期或被撤销之前，持有邀请的人都可以加入。",
      faqQ5: "支持哪些平台？",
      faqA5: "Hearth Room 支持 iOS 与 iPadOS、macOS、Windows 和 Linux，另有浏览器网页版。Android 版本正在封闭测试。",
      faqQ6: "它和 OpenClaw 是什么关系？",
      faqA6: "PrivateClaw 是 OpenClaw（运行在你自己电脑上的助手运行时）的插件。它负责创建房间、签发邀请，并让你自己的 OpenClaw 助手在房间里回答。",
      footerLine: "私密房间、共享 OpenClaw、更安静的聊天方式。",
      footerDisclaimer: "PrivateClaw 与 OpenClaw 没有附属关系。",
      footerPrivacy: "隐私",
      footerTerms: "条款",
      footerSupport: "Android 内测动态会发布在 Google 群组。",
      footerCopyright: "Copyright GG AI Studio 2026.",
    },
    chat: {
      documentTitle: "PrivateClaw 网页聊天",
      metaDescription: "直接在浏览器里打开 PrivateClaw 房间：粘贴邀请链接或扫描二维码，即可加入与你自己的 OpenClaw 助手端到端加密聊天。",
      headerTagline: "网页聊天",
      disconnectButton: "断开连接",
      desktopNoteTitle: "桌面端也可以直接使用",
      desktopNoteBody: "这个房间在大屏上同样可用。在桌面端，直接粘贴邀请，或者选择一张已经保存的二维码图片，通常是最快的加入方式。",
      connectKicker: "安全配对",
      connectTitle: "粘贴你的 PrivateClaw 邀请。",
      connectBody: "把 OpenClaw 发来的邀请文本、二维码 payload，或者包含邀请链接的整段消息粘贴进来即可。",
      changeInviteButton: "更换邀请",
      statusPanelTitle: "端到端加密",
      statusIdle: "等待粘贴邀请。",
      inviteInputLabel: "邀请内容",
      inviteInputHelp: "支持 privateclaw:// 链接、base64 payload、JSON，或包含邀请的完整消息。",
      inviteInputPlaceholder: "在这里粘贴邀请或整段公告",
      scanButton: "扫码连接",
      scanImageButton: "识别二维码图片",
      scanHelp: "在支持的浏览器中可直接调用相机扫码，也可以选择设备里的二维码截图。",
      scannerTitle: "扫描 PrivateClaw 二维码",
      scannerBody: "把摄像头对准 PrivateClaw 邀请二维码，识别成功后会自动开始连接。",
      scannerCloseButton: "关闭",
      scannerStatusStarting: "正在打开相机…",
      scannerStatusScanning: "正在识别 PrivateClaw 邀请二维码…",
      scannerStatusFound: "已识别邀请，正在连接…",
      connectButton: "安全连接",
      providerLabel: "提供方",
      expiresLabel: "过期时间",
      modeLabel: "模式",
      relayLabel: "Relay",
      identityLabel: "身份",
      participantsLabel: "成员",
      betaGroupButton: "加入 Google 内测群组",
      emptyTitle: "你的私密房间会显示在这里",
      emptyBody: "连接成功后，OpenClaw 的消息、斜杠命令和媒体内容都会留在这个加密会话里。",
      draftAttachmentsLabel: "待发送附件",
      sendButton: "发送",
      composerPlaceholder: "给房间发送消息…",
      commandSheetTitle: "斜杠命令",
      commandSheetClose: "关闭",
      commandButtonAria: "打开斜杠命令",
      attachButtonAria: "添加文件",
      providerUnknown: "PrivateClaw",
      relayUnknown: "默认 relay",
      identityUnknown: "Private guest",
      modePrivate: "单聊房间",
      modeGroup: "共享房间",
      modeGroupMuted: "共享房间 · 机器人已静音",
      statusLabelIdle: "空闲",
      statusLabelConnecting: "连接中",
      statusLabelReconnecting: "重连中",
      statusLabelRelayAttached: "握手中",
      statusLabelActive: "已连接",
      statusLabelClosed: "已关闭",
      statusLabelError: "需要处理",
      relayConnecting: "正在连接中继服务…",
      relayHandshake: "已连接中继，正在完成加密握手…",
      relayConnectionError: "连接异常：{reason}",
      relaySessionClosed: "当前会话已关闭。",
      relaySessionClosedWithReason: "当前会话已关闭：{reason}",
      relayError: "中继错误：{reason}",
      relayUnknownEvent: "收到未知中继事件：{reason}",
      relayUnknownPayload: "收到未知加密载荷：{reason}",
      welcomeFallback: "PrivateClaw 已连接。",
      customRelayWarningTitle: "自定义 relay 服务器",
      customRelayWarningBody:
        "这个邀请使用的是 {relayLabel}，而不是默认的 PrivateClaw relay。只有在你信任这台服务器时才继续。",
      sessionDisconnected: "会话已断开。需要继续时，请重新粘贴新的邀请。",
      sessionRenewedNotice: "会话已续期至 {time}。",
      connectFailed: "无法解析这条邀请。",
      invalidInviteVersion: "这个邀请版本暂时不受网页客户端支持。",
      sessionKeyLengthError: "会话密钥长度必须是 32 字节。",
      browserCryptoUnavailable: "当前浏览器不支持 PrivateClaw 所需的 Web Crypto 能力。",
      scanUnsupported: "当前浏览器暂时不支持识别二维码。请直接粘贴邀请，或换一个更新的浏览器。",
      scanCameraUnsupported: "当前环境无法直接调用相机扫码。你可以选择二维码图片，或直接粘贴邀请。",
      scanPermissionDenied: "相机权限被拒绝了。请允许相机访问，或改用二维码图片。",
      scanPickerFallback: "当前环境不支持实时相机扫码，PrivateClaw 已改为打开相机或相册供你选择二维码图片。",
      scanNoCodeFound: "这张图片里没有识别到二维码。",
      scanReadFailed: "读取这张二维码图片失败。",
      fileTooLarge: "{name} 超过 5 MB，已跳过。",
      fileReadError: "读取 {name} 失败。",
      sendFailed: "发送失败：{reason}",
      notConnected: "请先连接房间，再发送消息。",
      noCommandsYet: "斜杠命令会在握手完成后出现。",
      assistantLabel: "PrivateClaw",
      systemLabel: "系统",
      youLabel: "你",
      peerLabelFallback: "成员",
      pendingLabel: "思考中…",
      thinkingTraceFallbackTitle: "思考过程",
      thinkingTraceLive: "进行中",
      thinkingTraceDone: "已完成",
      thinkingTraceFailed: "失败",
      thinkingTraceSteps: "{count} 步",
      mutedLabel: "机器人已静音",
      commandSourceOpenclaw: "OpenClaw",
      commandSourcePlugin: "插件",
      commandSourcePrivateclaw: "PrivateClaw",
      commandArgHint: "需要参数",
      commandSendNow: "点击可立即发送",
      draftRemoveAttachment: "移除附件",
      downloadAttachment: "下载",
      attachmentNoPreview: "浏览器中无法预览",
      toastConnected: "安全房间已连接。",
      toastInviteReady: "邀请已载入，正在建立安全连接…",
      toastDisconnected: "PrivateClaw 已断开。",
      toastCommandInserted: "命令已插入输入框。",
      toastCommandSent: "命令已发送。",
      toastCopiedNothing: "现在还没有可发送的内容。",
      expiresUnknown: "未知",
      desktopBanner: "桌面预览",
    },
  },
  "zh-Hant": {
    meta: {
      nativeLabel: "繁體中文",
      htmlLang: "zh-Hant",
    },
    site: {
      stageLockLabel: "端對端加密",
      stageAiLabel: "OpenClaw 正在回覆",
      showcaseKicker: "看看它實際的樣子",
      showcaseTitle: "全部來自真實應用的截圖。",
      showcaseBody: "下面每一幀都來自已發佈的 iOS 與網頁用戶端，沒有示意圖，也沒有不存在的功能。",
      showcase1Title: "一個邀請，一個房間",
      showcase1Body: "貼上連結或掃描 QR Code，即可進入一次性的私密會話，無需任何其他設定。",
      showcase2Title: "群聊只屬於你們",
      showcase2Body: "只邀請你真正信任的人。大家看到的是同一個加密房間，中繼伺服器只能看到密文。",
      showcase3Title: "媒體也走加密通道",
      showcase3Body: "照片、語音和檔案都附在端對端加密串流裡，不會上傳到任何公共動態。",
      showcase4Title: "你自己的 OpenClaw 在場",
      showcase4Body: "你家裡已經在執行的助手直接在會話裡回答，從行程規劃到檔案，保留它原有的記憶與工具。",
      documentTitle: "PrivateClaw | 給 OpenClaw 的私密聊天室",
      metaDescription: "PrivateClaw 把一套共享的 OpenClaw 變成只屬於你信任的人的私密房間：端對端加密聊天，支援 iPhone、Mac、Windows、Linux 與網頁，你自己的 AI 助理也在房間裡。",
      brandTagline: "給 OpenClaw 的私密聊天室",
      languageLabel: "語言",
      navGithub: "GitHub",
      navBetaGroup: "Android 內測群組",
      navTelegramGroup: "Telegram 群聊",
      heroBadge: "私密 • 加密 • 邀請制",
      heroTitle: "把你信任的人帶進同一個私密 OpenClaw 房間。",
      heroBody:
        "PrivateClaw 把一套共享的 OpenClaw 變成只屬於你們的小房間。掃一次碼就能進入，中繼只負責轉送密文，不讀取聊天內容。",
      heroPrimaryCta: "開啟網頁聊天",
      heroSecondaryCta: "加入 Android 內測",
      heroDesktopHint: "網頁聊天支援桌面與手機。在桌面端，直接貼上邀請，或選擇一張已儲存的 QR 圖片，通常是最快的進入方式。",
      heroMobileHint: "網頁聊天在手機上也完全可用，你現在就可以直接開啟 PrivateClaw 房間。",
      appComingSoon: "iPhone App Store + Android 封閉 alpha",
      iosComingSoon: "前往 App Store 下載",
      androidComingSoon: "加入 Android 封閉 alpha",
      androidBetaNote:
        "Android 封閉 alpha 透過 Google Play 發放。請先加入 Google 群組，否則 Google Play 會顯示你目前無法參與測試。",
      previewStatus: "即時預覽",
      previewTitle: "像私人聊天室，而不是公開社群軟體。",
      previewBody:
        "把家人、朋友或隊友帶到你已經信任的 OpenClaw 身邊，不必把對話放進公開社群平台。",
      heroStats: [
        {
          value: "一套共享 OpenClaw",
          label: "把你最在意的人邀請到同一個助手裡，而不是把房間暴露給陌生人。",
        },
        {
          value: "端對端加密",
          label: "中繼只轉送流量，拿不到解密後的聊天內容。",
        },
        {
          value: "貼近真實場景",
          label: "家庭溝通、旅行規劃、團隊小群和一起玩 AI 都很自然。",
        },
      ],
      previewMessages: [
        {
          speaker: "流螢狐",
          role: "member",
          text: "這次週末出遊我們在這裡聊吧，不放到那個大群裡了。",
        },
        {
          speaker: "PrivateClaw",
          role: "assistant",
          text: "沒問題，我可以把行程、路線和打包清單都留在這個房間裡，方便大家一起看。",
        },
        {
          speaker: "晴空貓",
          role: "member",
          text: "不錯，一套 OpenClaw、一個房間，沒有時間線噪音。",
        },
      ],
      featuresKicker: "為什麼大家會喜歡",
      featuresTitle: "預設私密，但體驗很輕鬆。",
      featuresBody: "PrivateClaw 適合想要安全感、又不想失去聊天樂趣的人。",
      features: [
        {
          eyebrow: "邀請制",
          title: "掃一下，就進入同一個房間。",
          body: "每個房間都從 QR code 或邀請連結開始，誰能加入、什麼時候加入，都由你決定。",
        },
        {
          eyebrow: "共享助手",
          title: "你信任的人共用一套 OpenClaw。",
          body: "家人、朋友或隊友都能圍繞同一個 OpenClaw 會話聊天，共享上下文和樂趣。",
        },
        {
          eyebrow: "私密轉送",
          title: "中繼只是快遞員。",
          body: "訊息在 App 與 OpenClaw 端之間保持加密，中繼只負責傳遞密文。",
        },
        {
          eyebrow: "行動優先",
          title: "體驗像真正的聊天 App。",
          body: "斜槓命令、媒體訊息、群成員狀態和流暢的手機介面都已經準備好了。",
        },
      ],
      scenariosKicker: "貼近真實使用",
      scenariosTitle: "要安全，也要有一起玩的樂趣。",
      scenariosBody:
        "PrivateClaw 適合那些想繼續一起使用 OpenClaw、又不想把溝通放在公開社群軟體中的小圈子。",
      scenarios: [
        {
          eyebrow: "家庭",
          title: "把家裡的計畫留在家裡。",
          body: "行程、旅行、清單和各種家務討論都能放在一個安靜的小房間裡。",
        },
        {
          eyebrow: "朋友",
          title: "一起聊天，也一起玩 AI。",
          body: "腦暴禮物、做攻略、一起試 prompt，都能圍繞同一個助手完成。",
        },
        {
          eyebrow: "團隊",
          title: "臨時拉起安全的小通道。",
          body: "當你需要一個短期、專注、非公開的討論空間時，隨時開一個邀請制房間。",
        },
      ],
      desktopDownloadsKicker: "桌面應用",
      desktopDownloadsTitle: "Windows、macOS、Linux 都能用 PrivateClaw。",
      desktopDownloadsBody:
        "Windows 版已上架 Microsoft Store，像一般 Windows 應用一樣安裝並自動更新；macOS 與 Linux 版本發佈在 GitHub，Mac App Store 版本暫未上架。",
      desktopDownloadsBadge: "Microsoft Store + GitHub Releases",
      desktopDownloadWindowsStore: "前往 Microsoft Store 安裝",
      desktopDownloadWindowsX64: "Windows ZIP（側載）",
      desktopDownloadMacosArm64: "macOS Apple Silicon DMG",
      desktopDownloadMacosX64: "macOS Intel DMG",
      desktopDownloadLinuxX64: "Linux x64 tar.gz",
      desktopDownloadLinuxArm64: "Linux ARM64 tar.gz",
      desktopDownloadsNote:
        "Microsoft Store 連結為線上商店頁（Windows 10/11，自動更新）。GitHub 連結為 v0.1.21 的直接發佈資產，適用於 macOS、Linux 與 Windows 側載。",
      setupKicker: "安裝 OpenClaw 外掛",
      setupTitle: "從 ClawHub 安裝，配對，完成。",
      setupBody:
        "PrivateClaw 已通過 ClawHub 稽核，在目前的 OpenClaw 主機上走官方 registry 安裝即可，不需要任何強制覆蓋參數。安裝、啟用、重新啟動 gateway，然後從 CLI 或任何聊天頻道配對。",
      setupSteps: [
        {
          step: "建議",
          title: "從 ClawHub 安裝外掛",
          body: "這是官方路徑：ClawHub 發佈經過稽核的套件，OpenClaw 自行驗證，兩條指令即可啟用。",
          commands: [
            "openclaw plugins install clawhub:@privateclaw/privateclaw --accept-capabilities",
            "openclaw plugins enable privateclaw",
          ],
          note: "在目前的 OpenClaw 主機上，簡寫 `openclaw plugins install @privateclaw/privateclaw` 同樣會解析到 ClawHub。啟用後請重新啟動 OpenClaw gateway 以載入外掛。",
          featured: true,
          variant: "recommended",
        },
        {
          step: "然後",
          title: "重新啟動 gateway 並配對",
          body: "重新啟動 OpenClaw，然後在 CLI 開啟配對連結，或在任何既有的 OpenClaw 聊天頻道裡建立房間邀請。",
          commands: [
            "openclaw privateclaw pair --open",
            "/privateclaw",
            "/privateclaw group",
          ],
          note: "想讓多人共享同一個房間時，使用 `openclaw privateclaw pair --group --open` 或 `/privateclaw group`。",
          variant: "fallback",
        },
        {
          step: "備選",
          title: "一條指令的安裝精靈",
          body: "如果不想手動執行外掛指令，npx 精靈會安裝或更新外掛、啟用它、重新啟動 gateway，並直接帶你進入配對。",
          commands: ["npx -y @privateclaw/privateclaw@latest"],
          note: "精靈會詢問你要單聊還是群聊，並讓你選擇 30 分鐘到永久的會話時長。它直接拉取 npm 套件，所以也是拿到最新 patch 最快的方式。",
          variant: "fallback",
        },
      ],
      betaKicker: "行動應用",
      betaTitle: "下載 iPhone 版 Hearth Room，加入 Android 內測。",
      betaBody:
        "Hearth Room iPhone 版已經在 App Store 正式上線，Android 封閉 alpha 也已經在 Google Play 上線。想參與 Android 測試的話，請先加入 Google 群組。",
      betaPrimaryCta: "加入 Android 內測群組",
      betaTelegramCta: "加入 Telegram 群聊",
      betaFootnote:
        "Android 封閉 alpha 仍然需要先加入 Google Group；iPhone 使用者現在可以直接在 App Store 下載 Hearth Room，Telegram 群聊也持續開放。",
      faqKicker: "常見問題",
      faqTitle: "大家常問的問題",
      faqIntro: "關於 Hearth Room 與 PrivateClaw 是什麼、如何運作以及是否收費的簡要回答。",
      faqQ1: "Hearth Room 是什麼？",
      faqA1: "Hearth Room 是 PrivateClaw 的用戶端：一款涵蓋 iPhone、iPad、Mac、Windows、Linux 與網頁的應用程式，用來加入由電腦上的 PrivateClaw 建立的端對端加密聊天房間。",
      faqQ2: "收費嗎？",
      faqA2: "免費。PrivateClaw、OpenClaw 外掛與 Hearth Room 都是開源且免費使用的，沒有帳號、訂閱或應用程式內購。",
      faqQ3: "有多私密？",
      faqA3: "訊息、照片、語音與檔案在房間成員之間端對端加密。中繼伺服器只轉發密文，永遠看不到內容，也沒有金鑰。",
      faqQ4: "房間與邀請是怎麼運作的？",
      faqA4: "房間透過一次性 QR 碼或邀請連結建立，可以設定在幾小時、幾天或更長時間後過期。在過期或被撤銷之前，持有邀請的人都可以加入。",
      faqQ5: "支援哪些平台？",
      faqA5: "Hearth Room 支援 iOS 與 iPadOS、macOS、Windows 與 Linux，另有瀏覽器網頁版。Android 版本正在封閉測試。",
      faqQ6: "它和 OpenClaw 是什麼關係？",
      faqA6: "PrivateClaw 是 OpenClaw（運作在你自己電腦上的助理執行環境）的外掛。它負責建立房間、簽發邀請，並讓你自己的 OpenClaw 助理在房間裡回答。",
      footerLine: "私密房間、共享 OpenClaw、更安靜的聊天方式。",
      footerDisclaimer: "PrivateClaw 與 OpenClaw 沒有附屬關係。",
      footerPrivacy: "隱私",
      footerTerms: "條款",
      footerSupport: "Android 內測動態會發佈在 Google 群組。",
      footerCopyright: "Copyright GG AI Studio 2026.",
    },
    chat: {
      documentTitle: "PrivateClaw 網頁聊天",
      metaDescription: "直接在瀏覽器裡打開 PrivateClaw 房間：貼上邀請連結或掃描 QR 碼，即可加入與你自己的 OpenClaw 助理端對端加密聊天。",
      headerTagline: "網頁聊天",
      disconnectButton: "中斷連線",
      desktopNoteTitle: "桌面端也可以直接使用",
      desktopNoteBody: "這個房間在大螢幕上一樣可用。在桌面端，直接貼上邀請，或選擇一張已經存好的 QR 圖片，通常是最快的加入方式。",
      connectKicker: "安全配對",
      connectTitle: "貼上你的 PrivateClaw 邀請。",
      connectBody: "把 OpenClaw 發來的邀請文字、QR payload，或包含邀請連結的整段訊息貼進來即可。",
      changeInviteButton: "更換邀請",
      statusPanelTitle: "端對端加密",
      statusIdle: "等待貼上邀請。",
      inviteInputLabel: "邀請內容",
      inviteInputHelp: "支援 privateclaw:// 連結、base64 payload、JSON，或包含邀請的完整訊息。",
      inviteInputPlaceholder: "在這裡貼上邀請或整段公告",
      scanButton: "掃碼連線",
      scanImageButton: "辨識 QR 圖片",
      scanHelp: "在支援的瀏覽器中可直接呼叫相機掃碼，也可以選擇裝置裡的 QR 截圖。",
      scannerTitle: "掃描 PrivateClaw QR 碼",
      scannerBody: "把鏡頭對準 PrivateClaw 邀請 QR 碼，辨識成功後會自動開始連線。",
      scannerCloseButton: "關閉",
      scannerStatusStarting: "正在開啟相機…",
      scannerStatusScanning: "正在辨識 PrivateClaw 邀請 QR 碼…",
      scannerStatusFound: "已辨識邀請，正在連線…",
      connectButton: "安全連線",
      providerLabel: "提供方",
      expiresLabel: "到期時間",
      modeLabel: "模式",
      relayLabel: "Relay",
      identityLabel: "身份",
      participantsLabel: "成員",
      betaGroupButton: "加入 Google 內測群組",
      emptyTitle: "你的私密房間會顯示在這裡",
      emptyBody: "連線成功後，OpenClaw 的訊息、斜槓命令與媒體內容都會留在這個加密會話裡。",
      draftAttachmentsLabel: "待傳送附件",
      sendButton: "傳送",
      composerPlaceholder: "對房間傳送訊息…",
      commandSheetTitle: "斜槓命令",
      commandSheetClose: "關閉",
      commandButtonAria: "打開斜槓命令",
      attachButtonAria: "加入檔案",
      providerUnknown: "PrivateClaw",
      relayUnknown: "預設 relay",
      identityUnknown: "Private guest",
      modePrivate: "單聊房間",
      modeGroup: "共享房間",
      modeGroupMuted: "共享房間 · 機器人已靜音",
      statusLabelIdle: "閒置",
      statusLabelConnecting: "連線中",
      statusLabelReconnecting: "重連中",
      statusLabelRelayAttached: "握手中",
      statusLabelActive: "已連線",
      statusLabelClosed: "已關閉",
      statusLabelError: "需要處理",
      relayConnecting: "正在連接中繼服務…",
      relayHandshake: "已連接中繼，正在完成加密握手…",
      relayConnectionError: "連線異常：{reason}",
      relaySessionClosed: "目前會話已關閉。",
      relaySessionClosedWithReason: "目前會話已關閉：{reason}",
      relayError: "中繼錯誤：{reason}",
      relayUnknownEvent: "收到未知中繼事件：{reason}",
      relayUnknownPayload: "收到未知加密載荷：{reason}",
      welcomeFallback: "PrivateClaw 已連線。",
      customRelayWarningTitle: "自訂 relay 伺服器",
      customRelayWarningBody:
        "這個邀請使用的是 {relayLabel}，而不是預設的 PrivateClaw relay。只有在你信任這台伺服器時才繼續。",
      sessionDisconnected: "會話已中斷。需要繼續時，請重新貼上新的邀請。",
      sessionRenewedNotice: "會話已續期至 {time}。",
      connectFailed: "無法解析這條邀請。",
      invalidInviteVersion: "這個邀請版本暫時不支援網頁客戶端。",
      sessionKeyLengthError: "會話金鑰長度必須是 32 位元組。",
      browserCryptoUnavailable: "目前瀏覽器不支援 PrivateClaw 所需的 Web Crypto 能力。",
      scanUnsupported: "目前瀏覽器暫時不支援辨識 QR 碼。請直接貼上邀請，或換用更新的瀏覽器。",
      scanCameraUnsupported: "目前環境無法直接呼叫相機掃碼。你可以選擇 QR 圖片，或直接貼上邀請。",
      scanPermissionDenied: "相機權限被拒絕了。請允許相機存取，或改用 QR 圖片。",
      scanPickerFallback: "目前環境不支援即時鏡頭掃碼，PrivateClaw 已改為開啟鏡頭或相簿供你選擇 QR 圖片。",
      scanNoCodeFound: "這張圖片裡沒有辨識到 QR 碼。",
      scanReadFailed: "讀取這張 QR 圖片失敗。",
      fileTooLarge: "{name} 超過 5 MB，已跳過。",
      fileReadError: "讀取 {name} 失敗。",
      sendFailed: "傳送失敗：{reason}",
      notConnected: "請先連接房間，再傳送訊息。",
      noCommandsYet: "斜槓命令會在握手完成後出現。",
      assistantLabel: "PrivateClaw",
      systemLabel: "系統",
      youLabel: "你",
      peerLabelFallback: "成員",
      pendingLabel: "思考中…",
      thinkingTraceFallbackTitle: "思考過程",
      thinkingTraceLive: "進行中",
      thinkingTraceDone: "已完成",
      thinkingTraceFailed: "失敗",
      thinkingTraceSteps: "{count} 步",
      mutedLabel: "機器人已靜音",
      commandSourceOpenclaw: "OpenClaw",
      commandSourcePlugin: "外掛",
      commandSourcePrivateclaw: "PrivateClaw",
      commandArgHint: "需要參數",
      commandSendNow: "點擊可立即傳送",
      draftRemoveAttachment: "移除附件",
      downloadAttachment: "下載",
      attachmentNoPreview: "瀏覽器中無法預覽",
      toastConnected: "安全房間已連線。",
      toastInviteReady: "邀請已載入，正在建立安全連線…",
      toastDisconnected: "PrivateClaw 已中斷。",
      toastCommandInserted: "命令已插入輸入框。",
      toastCommandSent: "命令已傳送。",
      toastCopiedNothing: "現在還沒有可傳送的內容。",
      expiresUnknown: "未知",
      desktopBanner: "桌面預覽",
    },
  },
};

const LOCALE_KEY = "privateclaw.site.locale";
const LOCALE_ORDER = ["en", "zh-CN", "zh-Hant"];
const LOCALE_PREFIXES = { "zh-CN": "/zh-CN/", "zh-Hant": "/zh-Hant/" };

const localeListeners = new Set();
let currentLocale = detectLocale();

function readStoredLocale() {
  try {
    return window.localStorage.getItem(LOCALE_KEY);
  } catch (error) {
    console.warn("PrivateClaw could not read the stored locale.", error);
    return null;
  }
}

function writeStoredLocale(locale) {
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch (error) {
    console.warn("PrivateClaw could not persist the locale.", error);
  }
}

// The URL is the source of truth for the page language: "/" is English,
// "/zh-CN/..." and "/zh-Hant/..." serve the localized pages (one language per
// URL, as crawlers and hreflang expect). The stored or browser locale is only
// used to suggest the localized version, never to swap the page in place.
export function localeFromPath(pathname) {
  for (const [locale, prefix] of Object.entries(LOCALE_PREFIXES)) {
    if (pathname === prefix.slice(0, -1) || pathname.startsWith(prefix)) {
      return locale;
    }
  }
  return "en";
}

// Path of the same page in another locale, e.g. /privacy/ -> /zh-Hant/privacy/.
export function localizedPath(locale, pathname = window.location.pathname) {
  const current = localeFromPath(pathname);
  const rest =
    current === "en" ? pathname : pathname.slice(LOCALE_PREFIXES[current].length - 1);
  return locale === "en" ? rest : `${LOCALE_PREFIXES[locale].slice(0, -1)}${rest}`;
}

function detectLocale() {
  return localeFromPath(window.location.pathname);
}

export function normalizeLocale(input) {
  if (typeof input !== "string" || input.trim() === "") {
    return null;
  }

  const lowered = input.trim().toLowerCase();
  if (lowered === "en" || lowered.startsWith("en-")) {
    return "en";
  }
  if (
    lowered === "zh-hant" ||
    lowered.includes("hant") ||
    lowered.startsWith("zh-tw") ||
    lowered.startsWith("zh-hk") ||
    lowered.startsWith("zh-mo")
  ) {
    return "zh-Hant";
  }
  if (lowered === "zh" || lowered.startsWith("zh-cn") || lowered.startsWith("zh-sg") || lowered.startsWith("zh-hans")) {
    return "zh-CN";
  }
  if (LOCALE_ORDER.includes(input)) {
    return input;
  }
  return null;
}

function getByPath(bundle, keyPath) {
  return keyPath.split(".").reduce((value, segment) => {
    if (value && typeof value === "object" && segment in value) {
      return value[segment];
    }
    return undefined;
  }, bundle);
}

function interpolate(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.hasOwn(values, key)) {
      return String(values[key]);
    }
    return match;
  });
}

function applyDocumentLanguage() {
  if (typeof document !== "undefined") {
    document.documentElement.lang = BUNDLES[currentLocale].meta.htmlLang;
  }
}

export function getLocale() {
  return currentLocale;
}

export function setLocale(locale) {
  const nextLocale = normalizeLocale(locale) || "en";
  writeStoredLocale(nextLocale);
  const target = localizedPath(nextLocale);
  if (target !== window.location.pathname) {
    window.location.assign(target);
    return;
  }
  if (nextLocale === currentLocale) {
    return;
  }
  currentLocale = nextLocale;
  writeStoredLocale(nextLocale);
  applyDocumentLanguage();
  for (const listener of localeListeners) {
    listener(nextLocale);
  }
}

export function getBundle(locale = currentLocale) {
  return BUNDLES[locale] || BUNDLES.en;
}

export function getValue(keyPath, locale = currentLocale) {
  const localized = getByPath(getBundle(locale), keyPath);
  if (localized !== undefined) {
    return localized;
  }
  return getByPath(BUNDLES.en, keyPath);
}

export function t(keyPath, values) {
  const value = getValue(keyPath);
  if (typeof value !== "string") {
    return keyPath;
  }
  return interpolate(value, values);
}

export function onLocaleChange(listener) {
  localeListeners.add(listener);
  return () => localeListeners.delete(listener);
}

export function getLocaleOptions() {
  return LOCALE_ORDER.map((locale) => ({
    value: locale,
    label: BUNDLES[locale].meta.nativeLabel,
  }));
}

export function bindLocaleSelect(select) {
  if (!(select instanceof HTMLSelectElement)) {
    throw new TypeError("Expected a select element for locale binding.");
  }

  select.replaceChildren();
  for (const option of getLocaleOptions()) {
    const optionElement = document.createElement("option");
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    select.append(optionElement);
  }
  select.value = currentLocale;

  const syncValue = (locale) => {
    if (select.value !== locale) {
      select.value = locale;
    }
  };
  const unsubscribe = onLocaleChange(syncValue);
  select.addEventListener("change", () => {
    setLocale(select.value);
  });
  return unsubscribe;
}

export function applyTranslations(root = document) {
  applyDocumentLanguage();
  const elements = root.querySelectorAll("[data-i18n]");
  for (const element of elements) {
    const keyPath = element.getAttribute("data-i18n");
    if (!keyPath) {
      continue;
    }
    const value = t(keyPath);
    element.textContent = value;
  }
}

applyDocumentLanguage();
