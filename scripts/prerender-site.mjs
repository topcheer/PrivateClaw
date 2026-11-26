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
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
    window: {
      localStorage: { getItem: () => null, setItem() {} },
      location: { pathname: "/", assign() {} },
      matchMedia: undefined,
    },
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

// Fill <tag ... data-i18n="key">...</tag> nodes. The runtime sets textContent
// from the same bundle, so overwriting is always correct and keeps the static
// copy in sync when the copy changes.
function fillI18n(html, bundle) {
  return html.replace(
    /<([a-zA-Z][\w-]*)([^>]*\sdata-i18n="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g,
    (match, tag, attrs, keyPath) => {
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

const ORIGIN = "https://privateclaw.us";
const PREFIX = { en: "/", "zh-CN": "/zh-CN/", "zh-Hant": "/zh-Hant/" };
const OG_LOCALE = { en: "en_US", "zh-CN": "zh_CN", "zh-Hant": "zh_TW" };
const LOCALES = Object.keys(PREFIX);

const changes = [];

function writeIfChanged(relativePath, before, after) {
  if (before === after) return;
  changes.push(relativePath);
  if (!CHECK) {
    mkdirSync(dirname(join(SITE, relativePath)), { recursive: true });
    writeFileSync(join(SITE, relativePath), after);
  }
}

function read(file) {
  return readFileSync(join(SITE, file), "utf8");
}

function block(start, end, inner) {
  return `${start}${inner}${end}`;
}

function replaceBetween(html, start, end, inner) {
  const a = html.indexOf(start);
  if (a < 0) return null;
  const b = html.indexOf(end, a);
  if (b < 0) return null;
  return `${html.slice(0, a)}${block(start, end, inner)}${html.slice(b + end.length)}`;
}

function insertAfter(html, anchor, content) {
  const a = html.indexOf(anchor);
  if (a < 0) return null;
  const at = a + anchor.length;
  return `${html.slice(0, at)}${content}${html.slice(at)}`;
}

function setMetaProperty(html, property, content) {
  const tag = `<meta property="${property}" content="${esc(content)}" />`;
  const re = new RegExp(String.raw`<meta property="${property}" content="[^"]*" />`);
  return re.test(html) ? html.replace(re, tag) : null;
}

function setMetaName(html, name, content) {
  const tag = `<meta name="${name}" content="${esc(content)}" />`;
  const re = new RegExp(String.raw`<meta name="${name}" content="[^"]*" />`);
  return re.test(html) ? html.replace(re, tag) : null;
}

function faqJsonLd(bundle) {
  const faq = [];
  for (let i = 1; text(bundle, `site.faqQ${i}`) !== undefined; i += 1) {
    const question = text(bundle, `site.faqQ${i}`);
    const answer = text(bundle, `site.faqA${i}`);
    if (answer !== undefined) faq.push({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } });
  }
  if (faq.length === 0) return null;
  return JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq }, null, 2).replace(/</g, "&lt;");
}

// Page links follow the locale prefix; assets, scripts and stylesheets always
// live at the site root.
function rewriteRelativeUrls(html, prefix) {
  return html.replace(/\b(href|src|poster)="(\.\.?\/)([^"]*)"/g, (m, attr, _rel, target) => {
    const isAsset = /\.(css|js|png|svg|jpe?g|webp|webm|mp4|ico)(\?|$)/.test(target);
    return `${attr}="${isAsset ? "/" : prefix}${target}"`;
  });
}

// Head fields every localized page needs: language, title, description,
// canonical, hreflang alternates, Open Graph locale (+alternates).
function finalizeHead(html, { locale, route, title, description }) {
  const lang = BUNDLES[locale].meta.htmlLang;
  html = html.replace(/<html lang="[^"]*">/, `<html lang="${lang}">`);
  html = setTitle(html, title);
  html = setMetaDescription(html, description);

  const canonical = `<link rel="canonical" href="${ORIGIN}${PREFIX[locale]}${route}" />`;
  const hrefStart = "<!-- prerender:hreflang:start -->";
  const hrefEnd = "<!-- prerender:hreflang:end -->";
  const alternates = LOCALES.map((l) => `    <link rel="alternate" hreflang="${l}" href="${ORIGIN}${PREFIX[l]}${route}" />`);
  alternates.push(`    <link rel="alternate" hreflang="x-default" href="${ORIGIN}${PREFIX.en}${route}" />`);
  const hrefBlock = `    ${hrefStart}\n${alternates.join("\n")}\n    ${hrefEnd}`;
  let out = replaceBetween(html, hrefStart, hrefEnd, `\n${alternates.join("\n")}\n    `);
  if (out === null) {
    const re = /    <link rel="canonical" href="[^"]*" \/>/;
    if (re.test(html)) {
      out = html.replace(re, `    ${canonical}\n${hrefBlock}`);
    } else {
      out = insertAfter(html, "</title>", `\n    ${canonical}\n${hrefBlock}`);
    }
  } else {
    out = out.replace(/<link rel="canonical" href="[^"]*" \/>/, canonical);
  }
  html = out;

  // Open Graph + Twitter: drop every hand-written or stale tag, then emit one
  // complete block so each page carries exactly one set.
  const ogStart = "<!-- prerender:og:start -->";
  const ogEnd = "<!-- prerender:og:end -->";
  html = replaceBetween(html, ogStart, ogEnd, "") ?? html;
  html = html.replace(/^    <meta (?:property="og:[^"]*"|name="twitter:[^"]*") content="[^"]*" \/>\n/gm, "");
  html = html.replace(/^    <link rel="image_src" href="[^"]*" \/>\n/gm, "");
  const imageUrl = `${ORIGIN}/assets/og-privateclaw.png`;
  const ogBlock = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="PrivateClaw" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${ORIGIN}${PREFIX[locale]}${route}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
    `<link rel="image_src" href="${imageUrl}" />`,
  ]
    .map((t) => `    ${t}`)
    .join("\n");
  const altStart = "<!-- prerender:og-locale:start -->";
  const altEnd = "<!-- prerender:og-locale:end -->";
  const altBlock = [`<meta property="og:locale" content="${OG_LOCALE[locale]}" />`]
    .concat(LOCALES.filter((l) => l !== locale).map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE[l]}" />`))
    .map((t) => `    ${t}`)
    .join("\n");
  const ogAll = `    ${ogStart}\n${ogBlock}\n    ${altStart}\n${altBlock}\n    ${altEnd}\n    ${ogEnd}`;
  out = replaceBetween(html, ogStart, ogEnd, `\n${ogBlock}\n    ${altStart}\n${altBlock}\n    ${altEnd}\n    `);
  html = out ?? insertAfter(html, hrefEnd, `\n    ${ogAll}`) ?? html;

  // The WebSite entity is language-specific.
  html = html.replace(/"@type": "WebSite",([\s\S]*?)"inLanguage": "[^"]*"/, (m, mid) => m.replace(/"inLanguage": "[^"]*"/, `"inLanguage": "${lang}"`));
  return html;
}

// ---- page definitions: [route, source file, kind]
const PAGES = [
  ["", "index.html", "site"],
  ["chat/", "chat/index.html", "chat"],
  ["privacy/", "privacy/index.html", "privacy"],
  ["terms/", "terms/index.html", "terms"],
];

function renderBody(html, locale, kind) {
  const bundle = BUNDLES[locale];
  html = fillI18n(html, bundle);
  if (kind === "site") {
    html = setInnerById(html, "hero-stats", `\n            ${renderStats(get(bundle, "site.heroStats"))}\n          `);
    html = setInnerById(html, "feature-grid", `\n            ${renderCards(get(bundle, "site.features"), "feature-card")}\n          `);
    html = setInnerById(html, "scenario-grid", `\n            ${renderCards(get(bundle, "site.scenarios"), "scenario-card")}\n          `);
    html = setInnerById(html, "setup-grid", `\n            ${renderSetupSteps(get(bundle, "site.setupSteps"))}\n          `);
    const ld = faqJsonLd(bundle);
    if (ld) {
      const faqStart = "<!-- prerender:faq-jsonld:start -->";
      const faqEnd = "<!-- prerender:faq-jsonld:end -->";
      const faqBlock = `${faqStart}\n    <script type="application/ld+json">\n${ld}\n    </script>\n    ${faqEnd}`;
      html = replaceBetween(html, faqStart, faqEnd, `\n    <script type="application/ld+json">\n${ld}\n    </script>\n    `) ?? html;
    }
  }
  if (kind === "privacy" || kind === "terms") {
    const policy = POLICY_BUNDLES[locale][kind];
    html = setElementTextById(html, "policy-kicker", policy.kicker);
    html = setElementTextById(html, "policy-title", policy.title);
    html = setElementTextById(html, "policy-body", policy.body);
    html = setElementTextById(html, "policy-updated-label", policy.updatedLabel);
    html = setElementTextById(html, "policy-updated-value", policy.updatedValue);
    html = setInnerById(html, "policy-sections", `\n          ${renderPolicySections(policy)}\n        `);
  }
  return html;
}

function headCopy(locale, kind) {
  const bundle = BUNDLES[locale];
  if (kind === "site" || kind === "chat") {
    return { title: text(bundle, `${kind}.documentTitle`), description: text(bundle, `${kind}.metaDescription`) };
  }
  const policy = POLICY_BUNDLES[locale][kind];
  const summary = policy.body.length > 155 ? `${policy.body.slice(0, 152).trimEnd()}...` : policy.body;
  return { title: policy.documentTitle, description: summary };
}

const GENERATED = "<!-- Generated by scripts/prerender-site.mjs for {locale}. Do not edit: change index.html / scripts/i18n.js and run npm run site:prerender. -->";

for (const [route, file, kind] of PAGES) {
  const source = read(file);
  // English page: prerendered in place, then head finalization.
  {
    let html = renderBody(source, "en", kind);
    const { title, description } = headCopy("en", kind);
    html = finalizeHead(html, { locale: "en", route, title, description });
    writeIfChanged(file, source, html);
  }
  // Localized pages, generated from the English source.
  for (const locale of LOCALES.filter((l) => l !== "en")) {
    let html = renderBody(source, locale, kind);
    const { title, description } = headCopy(locale, kind);
    html = finalizeHead(html, { locale, route, title, description });
    html = rewriteRelativeUrls(html, PREFIX[locale]);
    html = html.replace(/<!doctype html>\n?/i, (m) => `${m}${GENERATED.replace("{locale}", locale)}\n`);
    const target = `${PREFIX[locale].slice(1)}${route}index.html`;
    let before = "";
    try {
      before = read(target);
    } catch {
      before = "";
    }
    writeIfChanged(target, before, html);
  }
}

if (changes.length === 0) {
  console.log("prerender: site HTML is up to date");
} else {
  console.log(`${CHECK ? "stale" : "updated"}: ${changes.join(", ")}`);
  if (CHECK) process.exit(1);
}
