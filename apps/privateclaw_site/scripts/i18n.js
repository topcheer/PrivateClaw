const BUNDLES = {
  en: {
    meta: {
      nativeLabel: "English",
      htmlLang: "en",
    },
    site: {
      documentTitle: "PrivateClaw | Private rooms for your OpenClaw",
      brandTagline: "Private rooms for your OpenClaw",
      languageLabel: "Language",
      navGithub: "GitHub",
      navBetaGroup: "Beta Google Group",
      heroBadge: "Private • Encrypted • Invite-only",
      heroTitle: "Bring your people into one private OpenClaw room.",
      heroBody:
        "PrivateClaw turns one shared OpenClaw into a beautiful private room for the people you actually trust. Scan once, join instantly, and let the relay carry ciphertext only.",
      heroPrimaryCta: "Open mobile web chat",
      heroSecondaryCta: "Join the beta group",
      heroDesktopHint:
        "On phones, the mobile web chat button appears here so you can jump in right away.",
      heroMobileHint:
        "You are on a mobile device, so you can open the PrivateClaw web chat right now.",
      appComingSoon: "Apps coming soon",
      iosComingSoon: "iOS app coming soon",
      androidComingSoon: "Android app coming soon",
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
      betaKicker: "Early access",
      betaTitle: "Join the PrivateClaw beta circle.",
      betaBody:
        "We are collecting feedback from early users who care about private mobile experiences, secure sharing, and creative ways to enjoy OpenClaw together.",
      betaPrimaryCta: "Join the Google Group",
      betaFootnote: "Google Group: gg-studio-ai-products",
      footerLine: "Private rooms, shared OpenClaw, and a calmer way to chat.",
      footerSupport: "Beta updates live in the Google Group.",
    },
    chat: {
      documentTitle: "PrivateClaw Web Chat",
      headerTagline: "Mobile web chat",
      disconnectButton: "Disconnect",
      desktopWarningTitle: "Best on phones",
      desktopWarningBody:
        "This web client is designed for mobile access. It still works here, but the phone experience is the one we are optimizing first.",
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
      documentTitle: "PrivateClaw | 给 OpenClaw 的私密聊天室",
      brandTagline: "给 OpenClaw 的私密聊天室",
      languageLabel: "语言",
      navGithub: "GitHub",
      navBetaGroup: "Google 内测群组",
      heroBadge: "私密 • 加密 • 邀请制",
      heroTitle: "把你信任的人带进同一个私密 OpenClaw 房间。",
      heroBody:
        "PrivateClaw 把一套共享的 OpenClaw 变成只属于你们的小房间。扫一次码就能进入，中继只负责转发密文，不读取聊天内容。",
      heroPrimaryCta: "打开移动网页聊天",
      heroSecondaryCta: "加入内测群组",
      heroDesktopHint: "在手机上访问时，这里会直接显示移动网页聊天入口。",
      heroMobileHint: "你正在使用移动设备，可以立即打开 PrivateClaw 网页聊天。",
      appComingSoon: "App 即将上线",
      iosComingSoon: "iOS App Coming Soon",
      androidComingSoon: "Android App Coming Soon",
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
      betaKicker: "抢先体验",
      betaTitle: "加入 PrivateClaw 内测圈。",
      betaBody: "如果你关心移动端私密体验、共享 OpenClaw，以及更舒服的小群沟通方式，欢迎加入我们。",
      betaPrimaryCta: "加入 Google 群组",
      betaFootnote: "Google Group：gg-studio-ai-products",
      footerLine: "私密房间、共享 OpenClaw、更安静的聊天方式。",
      footerSupport: "最新内测动态会发布在 Google 群组。",
    },
    chat: {
      documentTitle: "PrivateClaw 网页聊天",
      headerTagline: "移动网页聊天",
      disconnectButton: "断开连接",
      desktopWarningTitle: "更适合手机使用",
      desktopWarningBody: "这个网页客户端主要为移动设备设计。桌面端也能打开，但我们优先优化手机体验。",
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
      sessionDisconnected: "会话已断开。需要继续时，请重新粘贴新的邀请。",
      sessionRenewedNotice: "会话已续期至 {time}。",
      connectFailed: "无法解析这条邀请。",
      invalidInviteVersion: "这个邀请版本暂时不受网页客户端支持。",
      sessionKeyLengthError: "会话密钥长度必须是 32 字节。",
      browserCryptoUnavailable: "当前浏览器不支持 PrivateClaw 所需的 Web Crypto 能力。",
      scanUnsupported: "当前浏览器暂时不支持识别二维码。请直接粘贴邀请，或换一个更新的浏览器。",
      scanCameraUnsupported: "当前环境无法直接调用相机扫码。你可以选择二维码图片，或直接粘贴邀请。",
      scanPermissionDenied: "相机权限被拒绝了。请允许相机访问，或改用二维码图片。",
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
      documentTitle: "PrivateClaw | 給 OpenClaw 的私密聊天室",
      brandTagline: "給 OpenClaw 的私密聊天室",
      languageLabel: "語言",
      navGithub: "GitHub",
      navBetaGroup: "Google 內測群組",
      heroBadge: "私密 • 加密 • 邀請制",
      heroTitle: "把你信任的人帶進同一個私密 OpenClaw 房間。",
      heroBody:
        "PrivateClaw 把一套共享的 OpenClaw 變成只屬於你們的小房間。掃一次碼就能進入，中繼只負責轉送密文，不讀取聊天內容。",
      heroPrimaryCta: "開啟行動網頁聊天",
      heroSecondaryCta: "加入內測群組",
      heroDesktopHint: "在手機上打開時，這裡會直接顯示行動網頁聊天入口。",
      heroMobileHint: "你正在使用行動裝置，可以立即開啟 PrivateClaw 網頁聊天。",
      appComingSoon: "App 即將推出",
      iosComingSoon: "iOS App Coming Soon",
      androidComingSoon: "Android App Coming Soon",
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
      betaKicker: "搶先體驗",
      betaTitle: "加入 PrivateClaw 內測圈。",
      betaBody: "如果你在意行動端私密體驗、共享 OpenClaw，以及更舒服的小群溝通方式，歡迎加入我們。",
      betaPrimaryCta: "加入 Google 群組",
      betaFootnote: "Google Group：gg-studio-ai-products",
      footerLine: "私密房間、共享 OpenClaw、更安靜的聊天方式。",
      footerSupport: "最新內測動態會發佈在 Google 群組。",
    },
    chat: {
      documentTitle: "PrivateClaw 網頁聊天",
      headerTagline: "行動網頁聊天",
      disconnectButton: "中斷連線",
      desktopWarningTitle: "更適合手機使用",
      desktopWarningBody: "這個網頁客戶端主要為行動裝置設計。桌面端也能打開，但我們優先優化手機體驗。",
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
      sessionDisconnected: "會話已中斷。需要繼續時，請重新貼上新的邀請。",
      sessionRenewedNotice: "會話已續期至 {time}。",
      connectFailed: "無法解析這條邀請。",
      invalidInviteVersion: "這個邀請版本暫時不支援網頁客戶端。",
      sessionKeyLengthError: "會話金鑰長度必須是 32 位元組。",
      browserCryptoUnavailable: "目前瀏覽器不支援 PrivateClaw 所需的 Web Crypto 能力。",
      scanUnsupported: "目前瀏覽器暫時不支援辨識 QR 碼。請直接貼上邀請，或換用更新的瀏覽器。",
      scanCameraUnsupported: "目前環境無法直接呼叫相機掃碼。你可以選擇 QR 圖片，或直接貼上邀請。",
      scanPermissionDenied: "相機權限被拒絕了。請允許相機存取，或改用 QR 圖片。",
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

function detectLocale() {
  const stored = normalizeLocale(readStoredLocale());
  if (stored) {
    return stored;
  }

  const requested = [
    ...(navigator.languages || []),
    navigator.language || "en",
  ];
  for (const locale of requested) {
    const normalized = normalizeLocale(locale);
    if (normalized) {
      return normalized;
    }
  }
  return "en";
}

function normalizeLocale(input) {
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
