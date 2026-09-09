#!/usr/bin/env node
/* =========================================================================
   verify-specimen-counts.mjs — the rendered numbers equal the measured ones

   scripts/extract-specimen.mjs reads the two specimen builds off disk and
   prints what they contain. This walks the pages that publish those figures
   and asserts that every one of them still says what the builds say.

   THE CONTRACT IS IN THE MARKUP, which is what makes it survive an edit by
   somebody who never reads this file:

     data-xr="before.chars.received"          the element's text must equal
                                              that value, thousands-separated
     data-xr-type="after/MedicalProcedure"    a structured-data chip: its text
                                              must read "✓ Type ×N", or
                                              "✕ Type" when the count is 0
     data-xr-bar="a/b@120"                    the rect's width attribute must
                                              equal (a / b) × 120
     data-xr-bar="a/b@%"                      the inline style width must
                                              equal (a / b) × 100, as a
                                              percentage

   NO NETWORK AND NO BROWSER: it reads the built HTML files, which is the
   same text a crawler is served, so it runs in CI without a server.

   Usage:  node scripts/verify-specimen-counts.mjs
   ========================================================================= */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { extract, fmt } from "./extract-specimen.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = ["index.html", "clinics/example/index.html"];

const data = extract();

/* dot path into the extractor's output, with the two aliases the markup
   uses: `type` for the structured-data inventory and `chars.total` on a
   build that has no deferred text (it is the received count). */
function resolve(path) {
  const parts = path.split(".");
  let node = data;
  for (const p of parts) {
    if (node == null) return undefined;
    node = node[p];
  }
  return node;
}

const decode = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&rsquo;/g, "’")
    .replace(/&mdash;/g, "—").replace(/&middot;/g, "·").replace(/&times;/g, "×")
    .replace(/&check;/g, "✓").replace(/&ldquo;/g, "“").replace(/&rdquo;/g, "”")
    .replace(/&rarr;/g, "→").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
const inner = (html) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

let checks = 0;
const failures = [];
function check(page, label, got, want) {
  checks += 1;
  if (String(got) !== String(want)) failures.push({ page, label, got, want });
}

/* Matching an element and its content with a regex is only safe because the
   contract is narrow: every data-xr element in these pages is a <span>, a
   <p> or a <rect>, none of them nests another, and the attribute is unique
   on the tag. A parser would be the right tool the moment that stops being
   true, and that is exactly when this loop stops matching and the count of
   found elements drops — which is itself asserted below. */
for (const rel of PAGES) {
  const html = readFileSync(join(ROOT, rel), "utf8");

  /* --- data-xr: a value printed as text --- */
  const reVal = /<(span|p|b|em)\b[^>]*\bdata-xr="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
  let m;
  let n = 0;
  while ((m = reVal.exec(html))) {
    n += 1;
    const key = m[2];
    const got = inner(m[3]);
    const raw = resolve(key);
    if (raw === undefined) {
      failures.push({ page: rel, label: `data-xr="${key}"`, got, want: "(no such key in extract-specimen output)" });
      checks += 1;
      continue;
    }
    const want = typeof raw === "number" ? fmt(raw) : String(raw);
    check(rel, `data-xr="${key}"`, got, want);
  }

  /* --- data-xr-type: a structured-data chip --- */
  const reType = /<span\b[^>]*\bdata-xr-type="([^/]+)\/([^"]+)"[^>]*>([\s\S]*?)<\/span>/g;
  while ((m = reType.exec(html))) {
    n += 1;
    const [, build, type] = m;
    const got = inner(m[3]);
    const count = (data[build]?.structured?.types ?? {})[type] ?? 0;
    const want = count > 0 ? `✓ ${type} ×${count}` : `✕ ${type}`;
    check(rel, `data-xr-type="${build}/${type}"`, got, want);
  }

  /* --- data-xr-h1: the quoted headline, still the headline that ships ---
     The two pages quote each build's <h1> as a line of code. They are not
     byte-identical to the file — the specimen's "../assets/" prefix and its
     width/height attributes are artefacts of where the builds live and would
     be noise in a quotation — so what is asserted is the part that carries
     the argument: that the before h1 is still a picture, still that picture,
     and still has an empty alt; and that the after h1 still says exactly what
     the page says it says. Change either build's headline and both pages
     fail. */
  const reH1 = /<code\b[^>]*\bdata-xr-h1="(before|after)"[^>]*>([\s\S]*?)<\/code>/g;
  while ((m = reH1.exec(html))) {
    n += 1;
    const build = m[1];
    const got = inner(m[2]);
    const h1 = data[build].headings.h1;
    if (build === "after") {
      check(rel, `data-xr-h1="after" quotes the shipped headline`, got.includes(h1.text) && h1.readable, true);
    } else {
      check(
        rel,
        `data-xr-h1="before" quotes the shipped picture headline`,
        h1.picture && h1.imgSrc !== null && got.includes(h1.imgSrc) && /alt\s*=\s*""/.test(got),
        true
      );
    }
  }

  /* --- data-xr-bar: a drawn width --- */
  const reBar = /<(rect|b)\b([^>]*\bdata-xr-bar="([^"]+)"[^>]*)>/g;
  while ((m = reBar.exec(html))) {
    n += 1;
    const attrs = m[2];
    const spec = m[3];
    const mm = spec.match(/^([\w.]+)\/([\w.]+)@(120|%)$/);
    if (!mm) {
      failures.push({ page: rel, label: `data-xr-bar="${spec}"`, got: "(unparseable)", want: "num/den@120 or num/den@%" });
      checks += 1;
      continue;
    }
    const [, numKey, denKey, scale] = mm;
    const num = resolve(numKey);
    const den = resolve(denKey);
    if (typeof num !== "number" || typeof den !== "number" || den === 0) {
      failures.push({ page: rel, label: `data-xr-bar="${spec}"`, got: `${num}/${den}`, want: "two numbers, denominator non-zero" });
      checks += 1;
      continue;
    }
    if (scale === "120") {
      const want = ((num / den) * 120).toFixed(1);
      const got = (attrs.match(/\bwidth="([^"]+)"/) || [])[1];
      check(rel, `data-xr-bar width="${spec}"`, Number(got).toFixed(1), want);
    } else {
      const want = ((num / den) * 100).toFixed(1) + "%";
      const got = (attrs.match(/style="[^"]*width:\s*([^;"]+)/) || [])[1];
      check(rel, `data-xr-bar style width "${spec}"`, got ? got.trim() : "(none)", want);
    }
  }

  /* A page that silently loses every marker would otherwise pass with zero
     checks, which is the failure mode a verifier is least likely to notice
     about itself. */
  checks += 1;
  if (n === 0) failures.push({ page: rel, label: "markers present", got: "0", want: "at least one data-xr* marker" });
  console.log(`${rel}: ${n} markers`);
}

console.log("");
if (failures.length) {
  for (const f of failures) {
    console.log(`FAIL  ${f.page}  ${f.label}\n        rendered: ${JSON.stringify(f.got)}\n        measured: ${JSON.stringify(f.want)}`);
  }
  console.log(`\n${failures.length} of ${checks} checks failed. Run \`node scripts/extract-specimen.mjs\` to see what the builds now say.`);
  process.exit(1);
}
console.log(`PASS  all ${checks} rendered figures equal what scripts/extract-specimen.mjs reads from the two builds.`);
