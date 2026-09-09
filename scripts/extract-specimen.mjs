#!/usr/bin/env node
/* =========================================================================
   extract-specimen.mjs — the X-ray's numbers, read out of the two builds.

   WHY THIS EXISTS. Six figures about the specimen builds are published in
   four places — the counted table on /clinics/example/, the new X-ray
   section beside it, the card in that page's opener, and the article
   /articles/what-patients-see-what-machines-receive/. They were typed into
   each of those by hand. The moment anybody edits before/index.html or
   after/index.html — adds a service, answers a fifth question, gives the
   practice a phone number — every one of those figures becomes a lie that
   nothing in the build would catch.

   So the numbers are computed here, from the files themselves, and
   verify-specimen-counts.mjs asserts that what is rendered equals what this
   prints. Editing a build without editing the pages now fails a gate.

   NO NETWORK, NO BROWSER, NO DEPENDENCY. It reads three files off disk:
   the two builds and the before build's slider script. That last one is not
   an indulgence — the "of 1,506" denominator on the before build is text
   that only exists inside that script until the page has loaded, which is
   the entire point being made about it, so the only honest place to read it
   is the script itself.

   THE COUNTING RULE, ONCE, FOR EVERY FIGURE: take the <body>, drop
   <script>, <style> and <noscript> whole, drop comments, drop tags, decode
   the entities these files actually use, collapse every run of whitespace
   to one space, trim. That is "what arrives". It reproduces the published
   716 and 2,629 exactly, and 716 + the 790 characters sitting in the
   slider's array is the published 1,506.

   Usage:  node scripts/extract-specimen.mjs            # pretty JSON
           node scripts/extract-specimen.mjs --compact  # one line
   ========================================================================= */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  before: join(ROOT, "clinics/example/before/index.html"),
  after: join(ROOT, "clinics/example/after/index.html"),
  beforeJs: join(ROOT, "clinics/example/assets/before.js"),
};

/* ---- text extraction ---------------------------------------------------
   Only the entities these two files contain are decoded, and unknown ones
   are left alone rather than guessed at: a silent wrong decode would move a
   character count by one and nothing would notice. */
const ENT = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  "&nbsp;": " ", "&middot;": "·", "&mdash;": "—",
  "&ndash;": "–", "&copy;": "©", "&rsquo;": "’",
  "&lsquo;": "‘", "&ldquo;": "“", "&rdquo;": "”",
  "&hellip;": "…", "&times;": "×", "&#8249;": "‹",
  "&#8250;": "›",
};
const decode = (s) => s.replace(/&[a-zA-Z#0-9]+;/g, (m) => (m in ENT ? ENT[m] : m));

const bodyOf = (html) => {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m ? m[1] : html;
};
/* strip: the one counting rule. Exported shape is a plain string so every
   figure below is a length or a match on the same normalised text. */
const strip = (html) =>
  decode(
    html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, "")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\s+/g, " ")
    .trim();

/* ---- headings ----------------------------------------------------------
   "Readable" is a heading that arrives carrying text. "A picture" is a
   heading that arrives carrying an <img> and no text — which is not the
   same as a heading with a decorative image beside its words, so both
   conditions are tested rather than one inferred from the other. */
function headings(html) {
  const out = [];
  const re = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let m;
  while ((m = re.exec(bodyOf(html)))) {
    const inner = m[2];
    const text = strip(inner);
    /* the file name only, not the path: the pages that quote this line quote
       it as it would read on the practice's own site, and the specimen's
       "../assets/" prefix is an artefact of where the two builds live. */
    const src = (inner.match(/<img\b[^>]*\bsrc="([^"]+)"/i) || [])[1] || null;
    out.push({
      level: Number(m[1]),
      text,
      readable: text.length > 0,
      picture: text.length === 0 && /<img\b/i.test(inner),
      imgSrc: src ? src.split("/").pop() : null,
    });
  }
  return out;
}

/* ---- structured data ---------------------------------------------------
   Every @type in every application/ld+json block, counted wherever it
   appears in the tree — a Question nested three levels down is still a
   Question the machine receives. */
function structured(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) blocks.push(m[1]);
  const types = new Map();
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (typeof n["@type"] === "string") types.set(n["@type"], (types.get(n["@type"]) || 0) + 1);
    for (const v of Object.values(n)) walk(v);
  };
  const parsed = blocks.map((b) => {
    try { return JSON.parse(b); } catch (e) { throw new Error("ld+json did not parse: " + e.message); }
  });
  parsed.forEach(walk);
  return {
    blocks: blocks.length,
    types: Object.fromEntries([...types.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    trees: parsed,
  };
}

/* find a key anywhere in the parsed JSON-LD, so "is there a phone number"
   does not depend on where the practice record happens to nest it. */
function hasKey(trees, key) {
  let found = null;
  const walk = (n) => {
    if (found !== null) return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (key in n && typeof n[key] === "string") { found = n[key]; return; }
    for (const v of Object.values(n)) walk(v);
  };
  walk(trees);
  return found;
}

/* ---- the hours, spelled the way a sentence spells them ------------------
   The answer cards on the landing and on /clinics/example/ quote the
   practice's opening times inside a sentence: "open Saturdays, 9am to 1pm".
   A clock face typed into an HTML file is a number typed by hand, which is
   the one thing this file exists to prevent — add a late night to the after
   build and the sentence would go on saying 6pm with nothing to catch it.

   So the two OpeningHoursSpecification records are rendered here, once, and
   the pages print what this returns. `clock` is the only formatting rule:
   24-hour "09:00" to "9am", and a record with minutes keeps them. */
const clock = (t) => {
  const [h, m] = String(t).split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "am" : "pm"}`;
};
function hourSpans(trees) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== "object") return;
    if (n["@type"] === "OpeningHoursSpecification") {
      out.push({
        days: [].concat(n.dayOfWeek ?? []),
        opens: n.opens ?? null,
        closes: n.closes ?? null,
        text: n.opens && n.closes ? `${clock(n.opens)} to ${clock(n.closes)}` : null,
      });
    }
    for (const v of Object.values(n)) walk(v);
  };
  walk(trees);
  return out;
}

/* ---- the deferred text -------------------------------------------------
   The slider's array, read as data. Each slide is appended as an <h3> and a
   <p> with no text node between them, so the characters it adds to the page
   are exactly title.length + body.length per slide — which is why this is a
   sum and not a re-render. */
function deferredFromScript(js) {
  const re = /title:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?body:\s*"((?:[^"\\]|\\.)*)"/g;
  const items = [];
  let m;
  while ((m = re.exec(js))) items.push({ title: m[1], body: m[2] });
  return {
    count: items.length,
    names: items.map((i) => i.title),
    chars: items.reduce((n, i) => n + i.title.length + i.body.length, 0),
  };
}

/* ---- one build --------------------------------------------------------- */
function readBuild(path, { deferred } = {}) {
  const html = readFileSync(path, "utf8");
  const hs = headings(html);
  const sd = structured(html);
  const received = strip(bodyOf(html)).length;
  const total = received + (deferred ? deferred.chars : 0);

  const t = sd.types;
  const q = t.Question || 0;
  /* services: named MedicalProcedure records, or an h3 inside the services
     section. Both builds are checked the same way; on the before build both
     come back zero because the six live in the script. */
  const servicesInPage =
    (html.match(/<section id="services"[\s\S]*?<\/section>/i) || [""])[0]
      .match(/<h3\b[^>]*>[\s\S]*?<\/h3>/gi) || [];

  const text = strip(bodyOf(html));
  return {
    file: path.slice(path.indexOf("clinics/")),
    headings: {
      total: hs.length,
      readable: hs.filter((h) => h.readable).length,
      pictures: hs.filter((h) => h.picture).length,
      h1: hs.find((h) => h.level === 1) || null,
    },
    structured: { blocks: sd.blocks, types: t },
    services: {
      inPage: servicesInPage.length,
      records: t.MedicalProcedure || 0,
      deferred: deferred ? deferred.count : 0,
      names: (deferred && deferred.names.length
        ? deferred.names
        : servicesInPage.map((h) => strip(h))),
    },
    questions: {
      count: q,
      recognised: (t.FAQPage || 0) > 0,
      names: (function () {
        const names = [];
        const walk = (n) => {
          if (Array.isArray(n)) return n.forEach(walk);
          if (!n || typeof n !== "object") return;
          if (n["@type"] === "Question" && typeof n.name === "string") names.push(n.name);
          for (const v of Object.values(n)) walk(v);
        };
        walk(sd.trees);
        return names;
      })(),
    },
    hours: (function () {
      const spans = hourSpans(sd.trees);
      /* named by the day the sentence names, not by index: a build that
         reorders its two records must not silently swap the two clauses. */
      const sat = spans.find((s) => s.days.includes("Saturday")) || null;
      const wk = spans.find((s) => s.days.includes("Monday")) || null;
      return {
        records: t.OpeningHoursSpecification || 0,
        inText: /Monday to Friday, 9am to 6pm/.test(text),
        spans,
        saturday: sat ? sat.text : null,
        weekday: wk ? wk.text : null,
      };
    })(),
    practice: {
      name: hasKey(sd.trees, "name") || (text.match(/Specimen Dental/) ? "Specimen Dental" : null),
      locality: hasKey(sd.trees, "addressLocality") || (/\bAnytown\b/.test(text) ? "Anytown" : null),
      /* street address: a PostalAddress with a streetAddress, or a line in
         the page that reads as one. Neither build has one — recorded as
         absent rather than left out, because "we did not check" and "it is
         not there" are different claims. */
      streetAddress: hasKey(sd.trees, "streetAddress"),
      /* phone: a telephone record or a tel: link. Neither build has one. */
      phone: hasKey(sd.trees, "telephone") || (html.match(/href="tel:([^"]+)"/) || [])[1] || null,
      addressText: (text.match(/Anytown\. Parking behind the building\./) || [])[0] || null,
    },
    chars: { received, total, deferred: deferred ? deferred.chars : 0 },
  };
}

/* ---- the pair ---------------------------------------------------------- */
export function extract() {
  const deferred = deferredFromScript(readFileSync(P.beforeJs, "utf8"));
  const before = readBuild(P.before, { deferred });
  const after = readBuild(P.after);

  /* the fairness subtraction the page states in words: how many of the
     after build's characters are the question section, which the before
     build never carried in any form. Measured, not assumed — the section is
     located and stripped with the same rule as everything else. */
  const afterHtml = readFileSync(P.after, "utf8");
  const qSection = (afterHtml.match(/<section id="questions">[\s\S]*?<\/section>/i) || [""])[0];
  const questionChars = strip(qSection).length;

  return {
    generatedBy: "scripts/extract-specimen.mjs",
    before,
    after,
    delta: {
      readableTitles: `${before.headings.readable} of ${before.headings.total} → ${after.headings.readable} of ${after.headings.total}`,
      pictureTitles: `${before.headings.pictures} of ${before.headings.total} → ${after.headings.pictures} of ${after.headings.total}`,
      questions: `${before.questions.count} → ${after.questions.count}`,
      blocks: `${before.structured.blocks} → ${after.structured.blocks}`,
      charsReceived: `${before.chars.received} of ${before.chars.total} → ${after.chars.received} of ${after.chars.total}`,
      textMultiple: +(after.chars.received / before.chars.received).toFixed(1),
      questionChars,
      afterWithoutQuestions: after.chars.received - questionChars,
    },
  };
}

/* thousands separators, once, so every renderer prints a figure the same
   way and the verifier can compare strings rather than guess at formats. */
export const fmt = (n) => n.toLocaleString("en-US");

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = extract();
  process.stdout.write(
    process.argv.includes("--compact")
      ? JSON.stringify(data) + "\n"
      : JSON.stringify(data, null, 2) + "\n"
  );
}
