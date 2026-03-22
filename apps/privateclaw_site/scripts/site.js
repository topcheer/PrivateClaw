import { applyTranslations, bindLocaleSelect, getValue, onLocaleChange, t } from "./i18n.js?v=20260322-1";

const localeSelect = document.getElementById("locale-select");
const webEntry = document.getElementById("web-entry");
const deviceHintCopy = document.getElementById("device-hint-copy");
const heroStats = document.getElementById("hero-stats");
const previewChat = document.getElementById("preview-chat");
const featureGrid = document.getElementById("feature-grid");
const scenarioGrid = document.getElementById("scenario-grid");
const setupGrid = document.getElementById("setup-grid");

bindLocaleSelect(localeSelect);

function isMobileDevice() {
  const ua = navigator.userAgent || "";
  const coarsePointer = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowScreen = globalThis.matchMedia?.("(max-width: 820px)")?.matches ?? false;
  return coarsePointer || narrowScreen || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
}

function renderStats() {
  heroStats.replaceChildren();
  const stats = getValue("site.heroStats");
  if (!Array.isArray(stats)) {
    return;
  }
  for (const stat of stats) {
    const card = document.createElement("div");
    card.className = "stat-card";

    const title = document.createElement("strong");
    title.textContent = stat.value;

    const body = document.createElement("span");
    body.textContent = stat.label;

    card.append(title, body);
    heroStats.append(card);
  }
}

function renderPreview() {
  previewChat.replaceChildren();
  const messages = getValue("site.previewMessages");
  if (!Array.isArray(messages)) {
    return;
  }
  for (const item of messages) {
    const bubble = document.createElement("div");
    bubble.className = `preview-bubble ${item.role === "assistant" ? "assistant" : "member"}`;

    const label = document.createElement("span");
    label.className = "preview-name";
    label.textContent = item.speaker;

    const text = document.createElement("div");
    text.textContent = item.text;

    bubble.append(label, text);
    previewChat.append(bubble);
  }
}

function renderCards(target, items, cardClass) {
  target.replaceChildren();
  if (!Array.isArray(items)) {
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = cardClass;

    const eyebrow = document.createElement("div");
    eyebrow.className = cardClass === "feature-card" ? "feature-eyebrow" : "scenario-eyebrow";
    eyebrow.textContent = item.eyebrow;

    const title = document.createElement("h3");
    title.textContent = item.title;

    const body = document.createElement("p");
    body.textContent = item.body;

    card.append(eyebrow, title, body);
    target.append(card);
  }
}

function renderSetupSteps() {
  setupGrid.replaceChildren();
  const steps = getValue("site.setupSteps");
  if (!Array.isArray(steps)) {
    return;
  }

  for (const item of steps) {
    const card = document.createElement("article");
    card.className = "setup-card";
    if (item.featured) {
      card.classList.add("setup-card-featured");
    }
    if (typeof item.variant === "string" && item.variant.trim() !== "") {
      card.classList.add(`setup-card-${item.variant.trim().toLowerCase()}`);
    }

    const stepLabel = document.createElement("div");
    stepLabel.className = "setup-step-label";
    stepLabel.textContent = item.step;

    const title = document.createElement("h3");
    title.textContent = item.title;

    const body = document.createElement("p");
    body.textContent = item.body;

    card.append(stepLabel, title, body);

    if (Array.isArray(item.commands) && item.commands.length > 0) {
      const commands = document.createElement("div");
      commands.className = "setup-command-list";
      for (const command of item.commands) {
        const pre = document.createElement("pre");
        pre.className = "setup-command";

        const code = document.createElement("code");
        code.textContent = command;

        pre.append(code);
        commands.append(pre);
      }
      card.append(commands);
    }

    if (item.note) {
      const note = document.createElement("p");
      note.className = "setup-note";
      note.textContent = item.note;
      card.append(note);
    }

    setupGrid.append(card);
  }
}

function renderWebEntry() {
  const mobile = isMobileDevice();
  webEntry.hidden = false;
  webEntry.classList.remove("hidden");
  deviceHintCopy.textContent = t(mobile ? "site.heroMobileHint" : "site.heroDesktopHint");
}

function renderPage() {
  applyTranslations();
  document.title = t("site.documentTitle");
  renderWebEntry();
  renderStats();
  renderPreview();
  renderCards(featureGrid, getValue("site.features"), "feature-card");
  renderCards(scenarioGrid, getValue("site.scenarios"), "scenario-card");
  renderSetupSteps();
}

window.addEventListener("resize", renderWebEntry);
onLocaleChange(renderPage);
renderPage();
