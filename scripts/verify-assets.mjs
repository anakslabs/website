#!/usr/bin/env node
/**
 * Every file the site asks for must exist.
 *
 *   node scripts/verify-assets.mjs http://localhost:4311
 *
 * This is the permanent guard behind a defect that shipped and survived every
 * other check in this directory: assets/artwork/specimen.* — the specimen
 * screenshot on the "Our work" section — was deleted by scripts/build-artwork.mjs,
 * which emptied its whole output directory before writing the tiles it owns. The
 * screenshot is not something that script generates, so nothing put it back, and
 * the markup went on pointing at it.
 *
 * What made it invisible is worth stating plainly, because it is the same shape
 * as the two traps already in baseline/README.md: a broken <img> is not a broken
 * page. Lighthouse still scored 100, the copy checker still found every string,
 * the overflow sweep was still clean, and the section still had a paragraph, a
 * heading and a link in the right places. The only symptom was alt text where a
 * screenshot should have been, in a section a checker had no reason to open.
 *
 * So: parse every page's markup for every same-origin URL it references —
 * img src, every candidate in every srcset, link href, script src, and url() in
 * both inline and linked CSS — and fetch each one. Parsed rather than observed
 * in a browser, because a lazily-loaded image below the fold is never requested
 * and would not have been caught by watching the network.
 */
const BASE = (process.argv[2] ?? "http://localhost:4311").replace(/\/$/, "");

/** Every page the sitemap serves, plus the specimen pair. */
const PAGES = [
  "/",
  "/clinics/",
  "/check/",
  "/about/",
  "/articles/",
  "/sources/",
  "/contact/",
  "/clinics/example/",
];

/** Same-origin references, from markup and from CSS. */
function refsIn(text) {
  const out = new Set();
  const add = (u) => {
    if (!u) return;
    u = u.trim().replace(/^['"]|['"]$/g, "");
    // Root-relative only: absolute URLs point off this origin, and data: is inline.
    if (!u.startsWith("/") || u.startsWith("//")) return;
    out.add(u.split("#")[0]);
  };
  for (const m of text.matchAll(/\s(?:src|href)\s*=\s*("[^"]*"|'[^']*')/gi)) add(m[1]);
  for (const m of text.matchAll(/\ssrcset\s*=\s*("[^"]*"|'[^']*')/gi))
    for (const c of m[1].replace(/^['"]|['"]$/g, "").split(",")) add(c.trim().split(/\s+/)[0]);
  for (const m of text.matchAll(/url\(\s*([^)]+?)\s*\)/gi)) add(m[1]);
  return out;
}

const wanted = new Map(); // url -> pages that ask for it
const seenCss = new Set();

for (const path of PAGES) {
  const res = await fetch(BASE + path);
  if (!res.ok) {
    console.error(`FAIL  ${path} itself returned ${res.status}`);
    process.exit(1);
  }
  const html = await res.text();
  const refs = refsIn(html);
  // Follow stylesheets once each: fonts and background images live in there.
  for (const u of [...refs]) {
    if (!u.endsWith(".css") || seenCss.has(u)) continue;
    seenCss.add(u);
    const css = await fetch(BASE + u);
    if (css.ok) for (const r of refsIn(await css.text())) refs.add(r);
  }
  for (const u of refs) {
    if (!wanted.has(u)) wanted.set(u, []);
    wanted.get(u).push(path);
  }
}

const broken = [];
for (const [url, pages] of wanted) {
  const res = await fetch(BASE + url, { method: "GET" });
  if (!res.ok) broken.push({ url, status: res.status, referencedBy: pages.join(" ") });
}

console.log(`checked ${wanted.size} referenced URLs across ${PAGES.length} pages`);
if (broken.length) {
  console.table(broken);
  console.error(`FAIL  ${broken.length} referenced file(s) do not exist`);
  process.exit(1);
}
console.log("PASS  every file the site references exists");
