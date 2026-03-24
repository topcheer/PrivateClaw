import { applyTranslations, bindLocaleSelect, getLocale, onLocaleChange } from "./i18n.js?v=20260324-1";

const POLICY_BUNDLES = {
  en: {
    privacy: {
      documentTitle: "Privacy | PrivateClaw",
      kicker: "Privacy",
      title: "Privacy at a glance",
      body: "PrivateClaw is built around encrypted, session-based chat. This page explains what data the app, relay, provider, and website may handle.",
      updatedLabel: "Last updated",
      updatedValue: "2026-03-14",
      sections: [
        {
          title: "Scope",
          paragraphs: [
            "This page covers the PrivateClaw website, mobile app, web chat, relay, and provider distributed by GG AI Studio.",
            "If you connect to a relay, provider, or OpenClaw deployment run by somebody else, that operator is responsible for their own handling and retention practices.",
          ],
        },
        {
          title: "Data PrivateClaw may handle",
          items: [
            "session invite data such as session ID, relay endpoint, expiry time, and session key",
            "messages, attachments, and room activity that you choose to send or receive",
            "temporary local files needed to preview or open media and documents",
            "connection and routing metadata such as reconnect attempts, timestamps, and encrypted envelope sizes",
          ],
        },
        {
          title: "Permissions and infrastructure",
          items: [
            "Camera access is used only for scanning QR invites.",
            "File and media access is used only when you choose attachments or open received files.",
            "Network access is used to establish encrypted sessions and exchange encrypted traffic with your selected relay and provider.",
          ],
        },
        {
          title: "Encryption and third parties",
          paragraphs: [
            "PrivateClaw is designed so the relay mostly forwards encrypted payloads. A relay operator may still observe limited metadata such as session IDs, timing, and message sizes.",
            "The selected provider and OpenClaw deployment decrypt content in order to answer your requests. The project does not include advertising SDKs or analytics SDKs by default.",
          ],
        },
        {
          title: "Your choices and contact",
          paragraphs: [
            "You can deny camera permission and paste an invite manually, choose whether to send files, clear app data, or self-host the stack if you want tighter infrastructure control.",
            "For project questions or policy feedback, use GitHub Issues: https://github.com/topcheer/PrivateClaw/issues",
          ],
        },
      ],
    },
    terms: {
      documentTitle: "Terms | PrivateClaw",
      kicker: "Terms",
      title: "Terms of use",
      body: "These terms cover the PrivateClaw website, apps, relay, and provider published by GG AI Studio.",
      updatedLabel: "Last updated",
      updatedValue: "2026-03-14",
      sections: [
        {
          title: "Acceptance and scope",
          paragraphs: [
            "By using PrivateClaw, you agree to these terms. PrivateClaw is an independent project and is not affiliated with OpenClaw.",
            "If you operate your own relay, provider, or OpenClaw deployment, you are also responsible for your own local policies and compliance obligations.",
          ],
        },
        {
          title: "Your responsibilities",
          items: [
            "Use the product lawfully and do not use it to harm others or violate their rights.",
            "Only share messages, files, and invites that you are allowed to share.",
            "Protect invite links and session QR codes because anyone with them may be able to join the room before it expires.",
          ],
        },
        {
          title: "Availability and beta status",
          paragraphs: [
            "PrivateClaw may change, improve, or remove features over time. Some parts of the product are still in beta and may be interrupted or limited.",
            "We do not promise uninterrupted availability for the website, relay, or any hosted community channels.",
          ],
        },
        {
          title: "Third-party services",
          paragraphs: [
            "Your use may also involve third-party software and services such as OpenClaw, self-hosted infrastructure, Apple, Google, Telegram, or your cloud provider.",
            "Those services keep their own terms and privacy rules, and you are responsible for reviewing them where relevant.",
          ],
        },
        {
          title: "Disclaimers and contact",
          paragraphs: [
            "PrivateClaw is provided on an “as is” and “as available” basis to the extent allowed by law. To the extent permitted by law, GG AI Studio disclaims warranties and limits liability for indirect or consequential loss.",
            "For support or legal contact about this project, use GitHub Issues first: https://github.com/topcheer/PrivateClaw/issues",
          ],
        },
      ],
    },
  },
  "zh-CN": {
    privacy: {
      documentTitle: "隐私 | PrivateClaw",
      kicker: "隐私",
      title: "关于隐私的简要说明",
      body: "PrivateClaw 围绕加密的会话式聊天构建。这个页面说明 App、网页聊天、relay、provider 和网站可能会处理哪些数据。",
      updatedLabel: "最后更新",
      updatedValue: "2026-03-14",
      sections: [
        {
          title: "适用范围",
          paragraphs: [
            "这个页面覆盖 GG AI Studio 发布的 PrivateClaw 网站、移动 App、网页聊天、relay 和 provider。",
            "如果你连接的是其他人运营的 relay、provider 或 OpenClaw 部署，那么对方需要对自己的数据处理和保留策略负责。",
          ],
        },
        {
          title: "PrivateClaw 可能处理的数据",
          items: [
            "会话邀请数据，例如 session ID、relay 地址、过期时间和 session key",
            "你主动发送或接收的消息、附件和房间活动",
            "为了预览或打开媒体、文档而在本地创建的临时文件",
            "用于维持连接的元数据，例如重连记录、时间戳和加密信封大小",
          ],
        },
        {
          title: "权限与基础设施",
          items: [
            "相机权限只用于扫描二维码邀请。",
            "文件和媒体访问只在你主动选择附件或打开收到的文件时使用。",
            "网络访问只用于建立加密会话，并与所选 relay / provider 交换加密流量。",
          ],
        },
        {
          title: "加密与第三方",
          paragraphs: [
            "PrivateClaw 的设计目标是让 relay 主要只转发加密载荷。relay 运营方仍可能观察到 session ID、连接时间和消息大小等有限元数据。",
            "被选中的 provider 和 OpenClaw 部署需要解密内容才能处理你的请求。项目默认不包含广告 SDK 或分析 SDK。",
          ],
        },
        {
          title: "你的选择与联系我们",
          paragraphs: [
            "你可以拒绝相机权限并手动粘贴邀请，决定是否发送文件，清除本地数据，或者自托管整套服务来获得更强的基础设施控制权。",
            "如果你对项目或隐私政策有疑问，请通过 GitHub Issues 联系我们：https://github.com/topcheer/PrivateClaw/issues",
          ],
        },
      ],
    },
    terms: {
      documentTitle: "条款 | PrivateClaw",
      kicker: "条款",
      title: "使用条款",
      body: "这些条款适用于 GG AI Studio 发布的 PrivateClaw 网站、App、relay 和 provider。",
      updatedLabel: "最后更新",
      updatedValue: "2026-03-14",
      sections: [
        {
          title: "接受与范围",
          paragraphs: [
            "当你使用 PrivateClaw 时，表示你同意这些条款。PrivateClaw 是独立项目，与 OpenClaw 没有附属关系。",
            "如果你运营自己的 relay、provider 或 OpenClaw 部署，你也需要自行承担本地合规和政策责任。",
          ],
        },
        {
          title: "你的责任",
          items: [
            "请合法使用产品，不要用它伤害他人或侵犯他人权利。",
            "只分享你有权分享的消息、文件和邀请。",
            "请妥善保管邀请链接和二维码，因为在过期前拿到它们的人可能都能加入房间。",
          ],
        },
        {
          title: "可用性与 Beta 状态",
          paragraphs: [
            "PrivateClaw 的功能可能会持续变化、改进或下线。产品中的部分能力仍处于 beta 阶段，可能会受到限制或中断。",
            "我们不承诺网站、relay 或社区入口始终持续可用。",
          ],
        },
        {
          title: "第三方服务",
          paragraphs: [
            "你的使用过程还可能涉及 OpenClaw、自托管基础设施、Apple、Google、Telegram 或你的云服务商等第三方软件和服务。",
            "这些服务有各自的条款与隐私规则，你需要在相关场景下自行查阅。",
          ],
        },
        {
          title: "免责声明与联系",
          paragraphs: [
            "在法律允许的范围内，PrivateClaw 按“现状”和“可用”基础提供。GG AI Studio 在法律允许的范围内不对间接损失或后果性损失承担责任。",
            "如果你需要支持或法律联系入口，请优先使用 GitHub Issues：https://github.com/topcheer/PrivateClaw/issues",
          ],
        },
      ],
    },
  },
  "zh-Hant": {
    privacy: {
      documentTitle: "隱私 | PrivateClaw",
      kicker: "隱私",
      title: "關於隱私的簡要說明",
      body: "PrivateClaw 圍繞加密的會話式聊天打造。這個頁面說明 App、網頁聊天、relay、provider 和網站可能會處理哪些資料。",
      updatedLabel: "最後更新",
      updatedValue: "2026-03-14",
      sections: [
        {
          title: "適用範圍",
          paragraphs: [
            "這個頁面涵蓋 GG AI Studio 發布的 PrivateClaw 網站、行動 App、網頁聊天、relay 和 provider。",
            "如果你連接的是其他人營運的 relay、provider 或 OpenClaw 部署，那麼對方需要對自己的資料處理與保留策略負責。",
          ],
        },
        {
          title: "PrivateClaw 可能處理的資料",
          items: [
            "會話邀請資料，例如 session ID、relay 位址、到期時間和 session key",
            "你主動送出或接收的訊息、附件和房間活動",
            "為了預覽或開啟媒體、文件而在本機建立的暫存檔",
            "用於維持連線的中繼資料，例如重連紀錄、時間戳與加密封包大小",
          ],
        },
        {
          title: "權限與基礎設施",
          items: [
            "相機權限只用於掃描 QR 邀請。",
            "檔案與媒體存取只在你主動選擇附件或開啟收到的檔案時使用。",
            "網路存取只用於建立加密會話，並與所選 relay / provider 交換加密流量。",
          ],
        },
        {
          title: "加密與第三方",
          paragraphs: [
            "PrivateClaw 的設計目標是讓 relay 主要只轉送加密內容。relay 營運方仍可能觀察到 session ID、連線時間和訊息大小等有限中繼資料。",
            "被選中的 provider 與 OpenClaw 部署需要解密內容才能處理你的請求。專案預設不包含廣告 SDK 或分析 SDK。",
          ],
        },
        {
          title: "你的選擇與聯絡我們",
          paragraphs: [
            "你可以拒絕相機權限並手動貼上邀請，自行決定是否傳送檔案、清除本機資料，或自架整套服務來獲得更高的基礎設施控制權。",
            "如果你對專案或隱私政策有疑問，請透過 GitHub Issues 聯絡我們：https://github.com/topcheer/PrivateClaw/issues",
          ],
        },
      ],
    },
    terms: {
      documentTitle: "條款 | PrivateClaw",
      kicker: "條款",
      title: "使用條款",
      body: "這些條款適用於 GG AI Studio 發布的 PrivateClaw 網站、App、relay 和 provider。",
      updatedLabel: "最後更新",
      updatedValue: "2026-03-14",
      sections: [
        {
          title: "接受與範圍",
          paragraphs: [
            "當你使用 PrivateClaw 時，代表你同意這些條款。PrivateClaw 是獨立專案，與 OpenClaw 沒有附屬關係。",
            "如果你營運自己的 relay、provider 或 OpenClaw 部署，你也需要自行承擔本地合規與政策責任。",
          ],
        },
        {
          title: "你的責任",
          items: [
            "請合法使用產品，不要用它傷害他人或侵犯他人權利。",
            "只分享你有權分享的訊息、檔案和邀請。",
            "請妥善保管邀請連結與 QR 碼，因為在到期前拿到它們的人可能都能加入房間。",
          ],
        },
        {
          title: "可用性與 Beta 狀態",
          paragraphs: [
            "PrivateClaw 的功能可能會持續變動、改善或下線。產品中的部分能力仍處於 beta 階段，可能會受到限制或中斷。",
            "我們不承諾網站、relay 或社群入口會持續可用。",
          ],
        },
        {
          title: "第三方服務",
          paragraphs: [
            "你的使用過程還可能涉及 OpenClaw、自架基礎設施、Apple、Google、Telegram 或你的雲端服務商等第三方軟體與服務。",
            "這些服務有各自的條款與隱私規則，你需要在相關情境下自行查閱。",
          ],
        },
        {
          title: "免責聲明與聯絡方式",
          paragraphs: [
            "在法律允許的範圍內，PrivateClaw 依「現況」與「可用」基礎提供。GG AI Studio 在法律允許的範圍內不對間接損失或後果性損失承擔責任。",
            "如果你需要支援或法律聯絡入口，請優先使用 GitHub Issues：https://github.com/topcheer/PrivateClaw/issues",
          ],
        },
      ],
    },
  },
};

const localeSelect = document.getElementById("locale-select");
const pageType = document.body.dataset.policyPage;
const policyKicker = document.getElementById("policy-kicker");
const policyTitle = document.getElementById("policy-title");
const policyBody = document.getElementById("policy-body");
const policyUpdatedLabel = document.getElementById("policy-updated-label");
const policyUpdatedValue = document.getElementById("policy-updated-value");
const policySections = document.getElementById("policy-sections");

bindLocaleSelect(localeSelect);

function getPolicy(locale, type) {
  return POLICY_BUNDLES[locale]?.[type] ?? POLICY_BUNDLES.en[type];
}

function renderPolicy() {
  applyTranslations();
  const policy = getPolicy(getLocale(), pageType);
  if (!policy) {
    throw new Error(`Unknown policy page: ${pageType}`);
  }

  document.title = policy.documentTitle;
  policyKicker.textContent = policy.kicker;
  policyTitle.textContent = policy.title;
  policyBody.textContent = policy.body;
  policyUpdatedLabel.textContent = policy.updatedLabel;
  policyUpdatedValue.textContent = policy.updatedValue;

  policySections.replaceChildren();
  for (const section of policy.sections) {
    const article = document.createElement("article");
    article.className = "policy-section glass-panel";

    const title = document.createElement("h2");
    title.textContent = section.title;
    article.append(title);

    for (const paragraph of section.paragraphs ?? []) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      article.append(p);
    }

    if (Array.isArray(section.items) && section.items.length > 0) {
      const list = document.createElement("ul");
      list.className = "policy-list";
      for (const item of section.items) {
        const listItem = document.createElement("li");
        listItem.textContent = item;
        list.append(listItem);
      }
      article.append(list);
    }

    policySections.append(article);
  }
}

onLocaleChange(renderPolicy);
renderPolicy();
