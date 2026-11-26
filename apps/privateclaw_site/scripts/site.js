import { applyTranslations, bindLocaleSelect, getValue, localeFromPath, localizedPath, normalizeLocale, onLocaleChange, t } from "./i18n.js?v=20261126-1";

const localeSelect = document.getElementById("locale-select");
const webEntry = document.getElementById("web-entry");
const deviceHintCopy = document.getElementById("device-hint-copy");
const heroStats = document.getElementById("hero-stats");
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
  renderCards(featureGrid, getValue("site.features"), "feature-card");
  renderCards(scenarioGrid, getValue("site.scenarios"), "scenario-card");
  renderSetupSteps();
}

window.addEventListener("resize", renderWebEntry);

// --- Hero 3D stage: pointer-driven parallax with gentle idle drift ---
(() => {
  const stage = document.getElementById("hero-stage");
  if (!stage) {
    return;
  }
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduceMotion) {
    return;
  }
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let pointerActive = false;

  const applyFrame = () => {
    // Idle drift when the pointer is away keeps the scene alive.
    const idleX = pointerActive ? 0 : Math.sin(Date.now() / 2600) * 2.2;
    const idleY = pointerActive ? 0 : Math.cos(Date.now() / 3100) * 1.6;
    currentX += (targetX - currentX) * 0.08;
    currentY += (targetY - currentY) * 0.08;
    stage.style.setProperty("--rx", `${currentY + idleY}deg`);
    stage.style.setProperty("--ry", `${currentX + idleX}deg`);
    globalThis.requestAnimationFrame(applyFrame);
  };
  globalThis.requestAnimationFrame(applyFrame);

  const hero = stage.closest(".hero-redesign") ?? stage.parentElement;
  hero.addEventListener("pointermove", (event) => {
    const rect = stage.getBoundingClientRect();
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    pointerActive = true;
    targetX = Math.max(-10, Math.min(10, nx * 14));
    targetY = Math.max(-6, Math.min(6, -ny * 8));
  });
  hero.addEventListener("pointerleave", () => {
    pointerActive = false;
    targetX = 0;
    targetY = 0;
  });
})();

// --- Scroll reveal for showcase cards ---
(() => {
  const targets = document.querySelectorAll("[data-reveal]");
  if (!targets.length) {
    return;
  }
  if (!("IntersectionObserver" in globalThis)) {
    for (const el of targets) {
      el.classList.add("is-visible");
    }
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const siblings = [...entry.target.parentElement.children].filter((c) => c.hasAttribute("data-reveal"));
          const index = siblings.indexOf(entry.target);
          entry.target.style.transitionDelay = `${Math.max(0, index) * 110}ms`;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.18, rootMargin: "0px 0px -40px 0px" },
  );
  for (const el of targets) {
    observer.observe(el);
  }
})();

// --- Showcase cards: subtle 3D tilt toward the pointer ---
(() => {
  const reduceMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  if (reduceMotion || globalThis.matchMedia?.("(pointer: coarse)")?.matches) {
    return;
  }
  for (const card of document.querySelectorAll(".showcase-tilt")) {
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width - 0.5;
      const ny = (event.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `translateY(-6px) rotateX(${-ny * 6}deg) rotateY(${nx * 8}deg) scale(1.01)`;
    });
    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  }
})();

// --- Locale suggestion: "/" is always English (one language per URL), so offer
// the localized page once to visitors whose browser prefers another language.
(() => {
  const current = localeFromPath(window.location.pathname);
  const preferred = normalizeLocale(navigator.language || "");
  if (current !== "en" || !preferred || preferred === "en") {
    return;
  }
  const storageKey = `privateclaw.site.localeHint.${preferred}`;
  try {
    if (window.localStorage.getItem(storageKey)) {
      return;
    }
  } catch {
    return;
  }
  const labels = { "zh-CN": "本站有简体中文版本", "zh-Hant": "本站有繁體中文版本" };
  const hint = document.createElement("div");
  hint.className = "locale-hint";
  hint.setAttribute("role", "status");
  const link = document.createElement("a");
  link.href = localizedPath(preferred);
  link.hreflang = preferred;
  link.textContent = labels[preferred] ?? preferred;
  const close = document.createElement("button");
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // storage unavailable: just hide it for this visit
    }
    hint.remove();
  });
  hint.append(link, close);
  document.body.append(hint);
})();

onLocaleChange(renderPage);
renderPage();
