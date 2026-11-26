#!/usr/bin/env node
// Pre-renders the English copy of the marketing site into the static HTML.
//
// The site localizes everything at runtime (scripts/i18n.js, scripts/policy.js
// fill [data-i18n] nodes and build the feature / scenario / setup cards), so
// without JavaScript the page is an empty shell: search engines that do not
// render JS, and every AI crawler, saw no text at all. This script bakes the
// English bundle into index.html, chat/index.html and the policy pages. The
// runtime still replaces the content on load (replaceChildren/textContent), so
// other locales keep working exactly as before.
//
// Usage (repository root): node scripts/prerender-site.mjs [--check]
//   --check  exit 1 when the committed HTML is stale (used before a release)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = join(ROOT, "apps", "privateclaw_site");
const CHECK = process.argv.includes("--check");

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evaluate(relativePath, expose, { cutBefore } = {}) {
  let source = readFileSync(join(SITE, relativePath), "utf8");
  if (cutBefore) {
    const index = source.indexOf(cutBefore);
    if (index < 0) throw new Error(`${relativePath}: marker ${cutBefore} not found`);
    source = source.slice(0, index);
  }
  const code = source
    .replace(/^import .*?;\s*$/gm, "")
    .replace(/^export (function|const|let) /gm, "$1 ");
  const context = {
    window: { localStorage: { getItem: () => null, setItem() {} }, matchMedia: undefined },
    navigator: { language: "en-US", languages: ["en-US"] },
    document: { documentElement: { lang: "en" } },
    console,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(`${code}\nglobalThis.__exposed = { ${expose} };`, context);
  return context.__exposed;
}

const { BUNDLES } = evaluate("scripts/i18n.js", "BUNDLES");
const { POLICY_BUNDLES } = evaluate("scripts/policy.js", "POLICY_BUNDLES", {
  cutBefore: "const localeSelect = document.getElementById",
});

function get(bundle, keyPath) {
  return keyPath.split(".").reduce((node, key) => (node == null ? undefined : node[key]), bundle);
}

function text(bundle, keyPath) {
  const value = get(bundle, keyPath);
  return typeof value === "string" ? value : undefined;
}

// Fill <tag ... data-i18n="key"></tag> nodes that are still empty.
function fillI18n(html, bundle) {
  return html.replace(
    /<([a-zA-Z][\w-]*)([^>]*\sdata-i18n="([^"]+)"[^>]*)>(\s*)<\/\1>/g,
    (match, tag, attrs, keyPath, inner) => {
      const value = text(bundle, keyPath.trim());
      return value === undefined ? match : `<${tag}${attrs}>${esc(value)}</${tag}>`;
    },
  );
}

// Replace a container's pre-rendered block. The block is wrapped in comment
// markers so the script can be re-run after the bundle changes, independent
// of nested tags inside the block.
function setInnerById(html, id, innerHtml) {
  const open = html.match(new RegExp(String.raw`<[a-zA-Z][\w-]*[^>]*\sid="${id}"[^>]*>`));
  if (!open) {
    throw new Error(`container #${id} not found`);
  }
  const start = `<!-- prerender:${id}:start -->`;
  const end = `<!-- prerender:${id}:end -->`;
  const block = `${start}${innerHtml}${end}`;
  const startIndex = html.indexOf(start);
  if (startIndex >= 0) {
    const endIndex = html.indexOf(end, startIndex);
    return `${html.slice(0, startIndex)}${block}${html.slice(endIndex + end.length)}`;
  }
  const openIndex = html.indexOf(open[0]);
  const insertAt = openIndex + open[0].length;
  return `${html.slice(0, insertAt)}${block}${html.slice(insertAt)}`;
}

function setElementTextById(html, id, value) {
  const pattern = new RegExp(String.raw`(<[a-zA-Z][\w-]*[^>]*\sid="${id}"[^>]*>)([\s\S]*?)(</[a-zA-Z][\w-]*>)`);
  if (!pattern.test(html)) {
    throw new Error(`element #${id} not found`);
  }
  return html.replace(pattern, (_, open, _inner, close) => `${open}${esc(value)}${close}`);
}

function setTitle(html, title) {
  return html.replace(/<title>.*?<\/title>/, `<title>${esc(title)}</title>`);
}

function renderStats(stats) {
  return (Array.isArray(stats) ? stats : [])
    .map((s) => `<div class="stat-card"><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`)
    .join("\n");
}

function renderCards(items, cardClass) {
  const eyebrowClass = cardClass === "feature-card" ? "feature-eyebrow" : "scenario-eyebrow";
  return (Array.isArray(items) ? items : [])
    .map(
      (item) =>
        `<article class="${cardClass}"><div class="${eyebrowClass}">${esc(item.eyebrow)}</div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p></article>`,
    )
    .join("\n");
}

function renderSetupSteps(steps) {
  return (Array.isArray(steps) ? steps : [])
    .map((item) => {
      const classes = ["setup-card"];
      if (item.featured) classes.push("setup-card-featured");
      if (typeof item.variant === "string" && item.variant.trim() !== "") {
        classes.push(`setup-card-${item.variant.trim().toLowerCase()}`);
      }
      const commands = Array.isArray(item.commands) && item.commands.length > 0
        ? `<div class="setup-command-list">${item.commands
            .map((c) => `<pre class="setup-command"><code>${esc(c)}</code></pre>`)
            .join("")}</div>`
        : "";
      const note = item.note ? `<p class="setup-note">${esc(item.note)}</p>` : "";
      return `<article class="${classes.join(" ")}"><div class="setup-step-label">${esc(item.step)}</div><h3>${esc(item.title)}</h3><p>${esc(item.body)}</p>${commands}${note}</article>`;
    })
    .join("\n");
}

function renderPolicySections(policy) {
  return policy.sections
    .map((section) => {
      const paragraphs = (section.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("");
      const items = Array.isArray(section.items) && section.items.length > 0
        ? `<ul class="policy-list">${section.items.map((li) => `<li>${esc(li)}</li>`).join("")}</ul>`
        : "";
      return `<article class="policy-section glass-panel"><h2>${esc(section.title)}</h2>${paragraphs}${items}</article>`;
    })
    .join("\n");
}

function setMetaDescription(html, description) {
  const tag = `<meta name="description" content="${esc(description)}" />`;
  if (/<meta name="description" content="[^"]*" \/>/.test(html)) {
    return html.replace(/<meta name="description" content="[^"]*" \/>/, tag);
  }
  return html.replace(/<meta name="viewport"[^>]*\/>/, (m) => `${m}\n    ${tag}`);
}

const changes = [];

function writeIfChanged(relativePath, before, after) {
  if (before === after) return;
  changes.push(relativePath);
  if (!CHECK) writeFileSync(join(SITE, relativePath), after);
}

// ---- marketing page
{
  const file = "index.html";
  const before = readFileSync(join(SITE, file), "utf8");
  const en = BUNDLES.en;
  let html = fillI18n(before, en);
  html = setInnerById(html, "hero-stats", `\n            ${renderStats(get(en, "site.heroStats"))}\n          `);
  html = setInnerById(html, "feature-grid", `\n            ${renderCards(get(en, "site.features"), "feature-card")}\n          `);
  html = setInnerById(html, "scenario-grid", `\n            ${renderCards(get(en, "site.scenarios"), "scenario-card")}\n          `);
  html = setInnerById(html, "setup-grid", `\n            ${renderSetupSteps(get(en, "site.setupSteps"))}\n          `);
  html = setTitle(html, text(en, "site.documentTitle") ?? "PrivateClaw");
  writeIfChanged(file, before, html);
}

// ---- web chat page
{
  const file = "chat/index.html";
  const before = readFileSync(join(SITE, file), "utf8");
  const html = fillI18n(before, BUNDLES.en);
  writeIfChanged(file, before, html);
}

// ---- privacy + terms
for (const [dir, type] of [["privacy", "privacy"], ["terms", "terms"]]) {
  const file = `${dir}/index.html`;
  const before = readFileSync(join(SITE, file), "utf8");
  const policy = POLICY_BUNDLES.en[type];
  let html = fillI18n(before, BUNDLES.en);
  html = setElementTextById(html, "policy-kicker", policy.kicker);
  html = setElementTextById(html, "policy-title", policy.title);
  html = setElementTextById(html, "policy-body", policy.body);
  html = setElementTextById(html, "policy-updated-label", policy.updatedLabel);
  html = setElementTextById(html, "policy-updated-value", policy.updatedValue);
  html = setInnerById(html, "policy-sections", `\n          ${renderPolicySections(policy)}\n        `);
  html = setTitle(html, policy.documentTitle);
  const summary = policy.body.length > 155 ? `${policy.body.slice(0, 152).trimEnd()}...` : policy.body;
  html = setMetaDescription(html, summary);
  writeIfChanged(file, before, html);
}

if (changes.length === 0) {
  console.log("prerender: site HTML is up to date");
} else {
  console.log(`${CHECK ? "stale" : "updated"}: ${changes.join(", ")}`);
  if (CHECK) process.exit(1);
}
