#!/usr/bin/env node
/**
 * Per-page structure gate, off the wire, no browser.
 *
 *   node scripts/verify-hm-pages.mjs http://localhost:4399
 *
 * verify-acceptance.mjs is the homepage's gate and only ever fetches "/". These
 * are the same structural assertions applied to every page in the sitemap plus
 * the two specimen builds: exactly one h1, no skipped heading level, every img
 * with alt/width/height, every JSON-LD block parsing, and every internal link
 * resolving. Written page-agnostic on purpose — a page added later is covered
 * by adding it to the sitemap, which it has to be anyway.
 */
const BASE = (process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:4399").replace(/\/$/, "");

const get = async (u) => {
  const r = await fetch(u, { redirect: "manual" });
  return { status: r.status, body: r.status === 200 ? await r.text() : "" };
};

const sitemap = await get(BASE + "/sitemap.xml");
const paths = [...sitemap.body.matchAll(/<loc>https:\/\/anakslabs\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
paths.push("/clinics/example/before/", "/clinics/example/after/");

let fails = 0;
const bad = (p, msg) => { fails++; console.log(`  FAIL  ${p} — ${msg}`); };

/* Every id the site serves, so a cross-page #fragment can be checked against
   the page it points into. The link checker below only fetches paths, and a
   fetch of "/" succeeds whether or not the anchor after the hash exists — which
   is how /#how survived on /clinics/ pointing at a section the homepage has
   never had, and how /#why on the specimen kept pointing at a section this
   redesign removed. Both rendered as ordinary links and did nothing. */
const idsOf = new Map();
for (const path of new Set([...paths, "/"])) {
  const { status, body } = await get(BASE + path);
  if (status === 200) idsOf.set(path, new Set([...body.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
}

const linkCache = new Map();
async function resolves(u) {
  if (linkCache.has(u)) return linkCache.get(u);
  const r = await fetch(BASE + u, { redirect: "manual" });
  const ok = r.status === 200;
  linkCache.set(u, ok);
  return ok;
}

console.log(`Checking ${paths.length} pages against ${BASE}\n`);
for (const path of paths) {
  const { status, body } = await get(BASE + path);
  if (status !== 200) { bad(path, `status ${status}`); continue; }

  /* headings — comments and script bodies stripped first, or a commented-out
     <h2> in the markup counts as a heading that is not on the page */
  const clean = body.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  const heads = [...clean.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => ({ level: Number(m[1]), text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }));
  const h1s = heads.filter((h) => h.level === 1);
  if (h1s.length !== 1) bad(path, `${h1s.length} h1 (${h1s.map((h) => h.text).join(" | ")})`);
  if (heads[0] && heads[0].level !== 1) bad(path, `first heading is h${heads[0].level}`);
  for (let i = 1; i < heads.length; i++) {
    if (heads[i].level > heads[i - 1].level + 1) {
      bad(path, `heading skip h${heads[i - 1].level} → h${heads[i].level} at "${heads[i].text.slice(0, 40)}"`);
      break;
    }
  }

  /* images */
  for (const tag of clean.match(/<img\b[^>]*>/gi) ?? []) {
    for (const attr of ["alt", "width", "height"]) {
      if (!new RegExp(`\\b${attr}=`).test(tag)) bad(path, `<img> without ${attr}: ${tag.slice(0, 90)}`);
    }
  }

  /* JSON-LD */
  for (const m of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(m[1]); } catch (e) { bad(path, `JSON-LD does not parse: ${e.message}`); }
  }

  /* cross-page fragments */
  for (const m of clean.matchAll(/href="(\/[^"]*#[^"]+)"/g)) {
    const [page, frag] = [m[1].slice(0, m[1].indexOf("#")) || "/", m[1].slice(m[1].indexOf("#") + 1)];
    if (!idsOf.has(page)) bad(path, `link to a page that does not resolve: ${m[1]}`);
    else if (!idsOf.get(page).has(frag)) bad(path, `link to an anchor that does not exist: ${m[1]}`);
  }

  /* internal links */
  const hrefs = new Set(
    [...clean.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1]).filter((h) => !h.startsWith("//")),
  );
  for (const h of hrefs) {
    if (!(await resolves(h))) bad(path, `dead internal link ${h}`);
  }

  console.log(`  ok    ${path.padEnd(52)} h1:${h1s.length} headings:${heads.length} links:${hrefs.size}`);
}

console.log(fails ? `\n${fails} failure(s).` : "\nAll pages pass.");
process.exit(fails ? 1 : 0);
