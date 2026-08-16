#!/usr/bin/env node
/**
 * Checks the acceptance criteria against the HTML the server actually returns.
 * No JavaScript is involved — this script only ever reads response text, which
 * is the condition a search crawler or an assistant reads the site under.
 *
 *   npx http-server -p 4311 -s -c-1 .
 *   node scripts/verify-acceptance.mjs http://localhost:4311
 *
 * Ported from ../website-next/scripts/verify-acceptance.mjs. The parts of that
 * script that read the Next.js content modules (`src/content/*.ts`) have no
 * counterpart here — this site's copy lives in the HTML itself — so the copy
 * inventory is extracted from index.html instead, and additionally compared
 * against the frozen inventory in baseline/copy-strings.json when that file
 * exists. That frozen list is what a homepage replacement is measured against.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  textOf,
  norm,
  visibleStrings,
  headingSequence,
  sectionIds,
  jsonLd,
  markupOnly,
} from "./lib/html.mjs";

const BASE = (process.argv[2] ?? "http://localhost:4311").replace(/\/$/, "");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://anakslabs.com";

let checks = 0;
let failures = 0;
const failed = [];

function check(name, ok, detail = "") {
  checks += 1;
  if (!ok) {
    failures += 1;
    failed.push(name);
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function get(path) {
  const res = await fetch(BASE + path, { redirect: "manual" });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

console.log(`Verifying ${BASE}\n`);

const home = await get("/");
check("/ returns 200", home.status === 200, `got ${home.status}`);
const html = home.body;
const text = textOf(html);

// --- copy reaches a crawler -------------------------------------------------
console.log("\n--- copy in server HTML, JavaScript disabled ---");

const onDisk = readFileSync(resolve(ROOT, "index.html"), "utf8");
{
  const strings = visibleStrings(onDisk);
  const missing = strings.filter((s) => !text.includes(s));
  check(
    `100% of index.html's visible copy survives into the served HTML (${strings.length} strings)`,
    missing.length === 0,
    missing.slice(0, 3).map((s) => `"${s.slice(0, 48)}…"`).join(" | "),
  );
}

/* The hard gate is the approved homepage's frozen inventory, recorded from the
   copy the founder signed off. This work is an image and motion layer over that
   copy, not a rewrite of it, so a dropped string is a defect and not a decision
   — which is the opposite of how this file treated the same inventory during
   the redesign it was written for, when it was printed as an advisory control
   and never failed. Under that reading a section could be reworded to nothing
   and the run still came back green. Every one of these strings must survive. */
const FROZEN = resolve(ROOT, "baseline/copy-strings.json");
if (existsSync(FROZEN)) {
  const frozen = JSON.parse(readFileSync(FROZEN, "utf8"));
  const missing = frozen.strings.filter((s) => !text.includes(norm(s)));
  check(
    `every one of the ${frozen.strings.length} approved copy strings is still served (recorded ${frozen.recordedAt})`,
    missing.length === 0,
    missing.length
      ? `${missing.length} missing, first: ${missing
          .slice(0, 3)
          .map((s) => `"${s.slice(0, 48)}…"`)
          .join(" | ")}`
      : "",
  );
} else {
  check(
    "baseline/copy-strings.json exists to compare against",
    false,
    "retrieve it from the motion-layer-prep branch",
  );
}

check(
  "no unresolved {{TOKEN}} or ${placeholder} left in the page",
  !/\{\{[A-Z0-9_]+\}\}|\$\{[a-zA-Z0-9_.]+\}/.test(text),
  (text.match(/\{\{[A-Z0-9_]+\}\}|\$\{[a-zA-Z0-9_.]+\}/g) ?? []).join(" "),
);

// --- document structure -----------------------------------------------------
console.log("\n--- structure ---");

const heads = headingSequence(html);
const h1s = heads.filter((h) => h.level === 1);
check("exactly one h1", h1s.length === 1, `found ${h1s.length}: ${h1s.map((h) => h.text).join(" | ")}`);
check("the h1 is the first heading in the document", heads[0]?.level === 1, `first is h${heads[0]?.level}`);

let skip = null;
for (let i = 1; i < heads.length; i++) {
  if (heads[i].level > heads[i - 1].level + 1) {
    skip = `h${heads[i - 1].level} → h${heads[i].level} at "${heads[i].text.slice(0, 40)}"`;
    break;
  }
}
check("heading order never skips a level", !skip, skip ?? "");

const ids = sectionIds(html);
const FROZEN_STRUCT = resolve(ROOT, "baseline/BASELINE.json");
if (existsSync(FROZEN_STRUCT)) {
  const b = JSON.parse(readFileSync(FROZEN_STRUCT, "utf8"));
  const want = b.structure?.sectionIds ?? [];
  const lost = want.filter((id) => !ids.includes(id));
  check(
    `every baseline section id still exists (${want.length} ids)`,
    lost.length === 0,
    lost.join(", "),
  );
  const wantH2 = b.structure?.h2Count ?? null;
  check(
    `h2 count matches the baseline (${wantH2})`,
    wantH2 === null || heads.filter((h) => h.level === 2).length === wantH2,
    `now ${heads.filter((h) => h.level === 2).length}`,
  );
} else {
  console.log(`SKIP  section-id and h2 comparison — baseline/BASELINE.json not written yet`);
}

check("a skip link is the first focusable thing in the body", /<body[^>]*>\s*(<a[^>]*class="skip-link"|<a[^>]*href="#main")/.test(html));
check("the skip link's target exists", /id="main"/.test(html));

/* Elements only: a stylesheet comment mentioning an img tag is prose, not
   an image, and counting it fails a page whose images are all correct. */
const imgs = [...markupOnly(html).matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
check(
  "every <img> carries an alt attribute",
  imgs.every((t) => /\salt=/.test(t)),
  imgs.filter((t) => !/\salt=/.test(t)).map((t) => t.slice(0, 60)).join(" | "),
);
check(
  "every <img> carries intrinsic width and height (CLS)",
  imgs.every((t) => /\swidth=/.test(t) && /\sheight=/.test(t)),
  imgs.filter((t) => !(/\swidth=/.test(t) && /\sheight=/.test(t))).map((t) => t.slice(0, 60)).join(" | "),
);

// --- machine-readable head --------------------------------------------------
console.log("\n--- head and structured data ---");

check("<html lang> is set", /<html[^>]*\slang="[a-z]{2}(-[A-Z]{2})?"/.test(html));
check(
  `canonical is ${SITE_ORIGIN}/`,
  new RegExp(`<link[^>]*rel="canonical"[^>]*href="${SITE_ORIGIN}/"`).test(html),
  html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0] ?? "absent",
);
check("meta description is present and non-empty", /<meta[^>]*name="description"[^>]*content="[^"]{40,}"/.test(html));
check("viewport meta is present", /<meta[^>]*name="viewport"/.test(html));
for (const tag of ["og:type", "og:title", "og:description", "og:image", "og:url"]) {
  check(`${tag}`, html.includes(`property="${tag}"`));
}
for (const tag of ["twitter:card", "twitter:title", "twitter:description"]) {
  check(`${tag}`, html.includes(`name="${tag}"`));
}

const blocks = jsonLd(html);
check("at least one JSON-LD block", blocks.length > 0, `${blocks.length} blocks`);
check(
  "every JSON-LD block parses",
  blocks.every((b) => b.ok),
  blocks.filter((b) => !b.ok).map((b) => b.error).join(" | "),
);
const types = blocks.flatMap((b) => b.types);
for (const t of ["Organization", "Service"]) {
  check(`JSON-LD declares ${t}`, types.includes(t), `types present: ${types.join(", ")}`);
}
{
  const org = blocks.flatMap((b) => b.node?.["@graph"] ?? [b.node]).find((n) => n?.["@type"] === "Organization");
  check("Organization has a logo", Boolean(org?.logo));
  check("Organization has a url", Boolean(org?.url));
}

// --- links ------------------------------------------------------------------
console.log("\n--- internal links ---");
{
  const hrefs = [...markupOnly(html).matchAll(/<a\b[^>]*href="(\/[^"#?]*)"/g)].map((m) => m[1]);
  const unique = [...new Set(hrefs)];
  const broken = [];
  for (const href of unique) {
    const r = await get(href);
    if (r.status >= 400) broken.push(`${href} → ${r.status}`);
  }
  check(`every internal link on the homepage resolves (${unique.length} links)`, broken.length === 0, broken.join(", "));
}

// --- site-wide --------------------------------------------------------------
console.log("\n--- site-wide ---");

const robots = await get("/robots.txt");
check("robots.txt returns 200", robots.status === 200, `got ${robots.status}`);
for (const agent of [
  "GPTBot",
  "OAI-SearchBot",
  "PerplexityBot",
  "ClaudeBot",
  "Google-Extended",
]) {
  check(
    `robots.txt names ${agent} and allows it`,
    new RegExp(`User-agent:\\s*${agent}\\s*\\r?\\nAllow:\\s*/`, "i").test(robots.body),
  );
}
check(
  "robots.txt links the sitemap",
  new RegExp(`Sitemap:\\s*${SITE_ORIGIN}/sitemap\\.xml`).test(robots.body),
);

const sitemap = await get("/sitemap.xml");
check("sitemap.xml serves XML", sitemap.status === 200 && sitemap.body.includes("<urlset"));
const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(`sitemap lists the homepage`, locs.includes(`${SITE_ORIGIN}/`), `${locs.length} entries`);
{
  const missing = [];
  for (const loc of locs) {
    const path = loc.replace(SITE_ORIGIN, "");
    const r = await get(path);
    if (r.status >= 400) missing.push(`${path} → ${r.status}`);
  }
  check(`every sitemap URL resolves locally (${locs.length} entries)`, missing.length === 0, missing.join(", "));
}
check(
  "the homepage is listed in the sitemap and canonicalises to itself",
  locs.includes(`${SITE_ORIGIN}/`) &&
    new RegExp(`href="${SITE_ORIGIN}/"`).test(html),
);

console.log(
  `\n${checks - failures}/${checks} passed, ${failures} failed.` +
    (failures ? `\nFailing: ${failed.join("; ")}` : ""),
);
process.exit(failures > 0 ? 1 : 0);
