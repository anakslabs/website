#!/usr/bin/env node
/**
 * Text-over-photograph contrast, measured on rendered pixels.
 *
 *   node scripts/serve.mjs 4311 &
 *   node scripts/verify-contrast.mjs http://localhost:4311 [--out verification]
 *
 * The homepage lays copy over full-bleed photographs. Every text element in a
 * .bleed section is therefore checked against what is ACTUALLY BEHIND IT, not
 * against the page background colour it would have had.
 *
 * HOW. For each text element: hide that element (visibility:hidden, which keeps
 * layout identical so nothing reflows), screenshot its exact rectangle, and walk
 * every pixel. Then compute the WCAG contrast between the element's computed
 * colour and the worst pixel in that rectangle.
 *
 * WHY BOTH EXTREMES, and not just the brightest. The brief asked for the
 * brightest pixel that can fall under a text block, and that is the right test
 * for LIGHT text. All the type on this page is dark — #141A3A ink, #545C70 grey,
 * #2D63F0 blue — and for dark text the worst case is the DARKEST pixel, not the
 * brightest: a bright specular highlight raises dark-on-light contrast, while a
 * navy panel or an engraved map line destroys it. These photographs are full of
 * both. So the minimum contrast over all pixels is what gets reported, whichever
 * end it comes from, and the direction is named in the output. Testing only the
 * bright end would have passed the map section, whose engraved grid puts 1.2:1
 * regions under most of the frame.
 *
 * Sampling is on the real device-pixel screenshot at deviceScaleFactor 1 and
 * every pixel in the rect is visited: a text block is a few thousand pixels and
 * the failure being hunted is a small dark feature under one word, which any
 * stride large enough to be fast is large enough to miss.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? "http://localhost:4311").replace(/\/$/, "");
const outFlag = args.indexOf("--out");
const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "..", outFlag > -1 ? args[outFlag + 1] : "verification");
mkdirSync(outDir, { recursive: true });

const srgb = (v) => {
  v /= 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** WCAG large text is 18.66px bold or 24px+; its floor is 3:1 rather than 4.5:1. */
const floorFor = (px, weight) => (px >= 24 || (px >= 18.66 && Number(weight) >= 700) ? 3.0 : 4.5);

const VIEWS = [
  ["1440", 1440, 900, false],
  ["390", 390, 844, true],
];

const browser = await chromium.launch();
const report = [];
const failures = [];

for (const [label, width, height, isMobile] of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });

  /* Walk the page so every reveal has fired and every lazy photograph has
     arrived. A text block measured over an image that has not loaded is
     measured over the placeholder colour, which always passes. */
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.6;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 220));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll("img").length);
  await page.waitForFunction(() => [...document.querySelectorAll("img")].every((i) => i.complete), null, { timeout: 20000 });

  const targets = await page.evaluate(() => {
    const out = [];
    let n = 0;
    /* Every text node on the page, not only the ones over photographs. Scoped to
       .bleed at first, which missed the actual generality of the problem: the
       decorative .aurora blobs are multiply at opacity .5 and .vignette adds up
       to 5% more, both position:fixed, so the "page background" under small
       print is nowhere near --bg and is darker in some viewport positions than
       others. That is a site-wide contrast reduction which has nothing to do
       with the photographs, and a checker aimed only at the photographs would
       have reported the homepage clean while the same text failed everywhere. */
    for (const el of document.querySelectorAll("main h1, main h2, main h3, main p, main a, main span, main li, footer p, footer a")) {
      const text = (el.textContent ?? "").trim();
      if (!text) continue;
      /* Only elements that paint their own glyphs. A wrapper whose text lives
         entirely in child elements would be measured over its children's boxes
         and report a rectangle no glyph of its own occupies. */
      const ownText = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
      if (!ownText) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;

      /* An element that paints its own opaque background is not text over a
         photograph — it is text over its own ground, and what is behind it is
         irrelevant. The primary button is white on solid #2D63F0; sampling what
         the button covers reported 1.07:1 and would have had me "fix" a control
         that was never wrong. Its own pair is checked instead. */
      const ownBg = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
      const bgAlpha = ownBg ? (ownBg[1].split(",")[3] === undefined ? 1 : parseFloat(ownBg[1].split(",")[3])) : 0;
      const opaqueOwnBg = bgAlpha >= 0.95;

      /* Gradient-filled text. A background-clip:text span has color:transparent,
         so the glyphs are painted by the gradient and the computed colour is
         nothing at all — measured naively it reports 1.00:1 against everything.
         The worst case for dark type on a light ground is the LIGHTEST stop, so
         that is what stands in for the colour. */
      let color = cs.color;
      let note = null;
      const transparentText = /rgba?\([^)]*,\s*0\)$/.test(cs.webkitTextFillColor || cs.color);
      if (transparentText) {
        const stops = (cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []);
        if (!stops.length) continue;
        const L = (s) => { const m = s.match(/\d+/g).map(Number);
          const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
        color = stops.reduce((a, b) => (L(b) > L(a) ? b : a));
        note = "gradient text, measured at its lightest stop";
      }

      el.setAttribute("data-contrast-id", String(n));
      out.push({
        id: n++,
        section: el.closest("section")?.id || "(hero)",
        plate: el.closest(".bleed")?.dataset.plate ?? "-",
        tag: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""),
        text: text.slice(0, 46),
        color,
        ownBackground: opaqueOwnBg ? cs.backgroundColor : null,
        note,
        fontPx: parseFloat(cs.fontSize),
        weight: cs.fontWeight,
      });
    }
    return out;
  });

  /* Record every line fragment in DOCUMENT coordinates while the text is still
     visible, then strip all type from the page and photograph the result. What
     is left is the true ground: page colour, decorative layers, photographs,
     and the opaque fills of things like buttons and badges.

     Hiding only the element under test was not enough, and the reason is worth
     writing down. With line-height 1.04 on a 48px heading, the descenders of the
     line ABOVE intrude into the line box below it. So a fragment's rectangle
     contained its own heading's ink, and "and that is the cap" reported 2.74:1
     against the comma and the "p" of the line above — glyphs no reader could
     mistake for background. Stripping every glyph on the page removes that whole
     class of artifact at once, and it turns hundreds of screenshots into one. */
  await page.addStyleTag({
    content: `*, *::before, *::after {
      color: transparent !important;
      -webkit-text-fill-color: transparent !important;
      text-shadow: none !important;
      text-decoration-color: transparent !important;
      caret-color: transparent !important;
    }`,
  });
  await page.waitForTimeout(300);

  /* THE GROUND MOVES. .aurora's blobs run `drift1..3` on a 30-42s infinite
     alternate, so the luminance under any given line of type changes
     continuously, and the same element measured twice came back 4.29:1 and then
     4.47:1 — a spread wide enough to straddle the 4.5 floor depending on when
     the run happened to sample. A gate that reports a different verdict on the
     same build is not a gate.

     So the drift is stopped and the page is measured at BOTH ends of it: the
     keyframes' start position, and their end position applied directly. The
     worst of the two is what gets reported, which is the worst a reader can
     actually be shown. */
  const DRIFT_ENDS = [
    { b1: "translate(0,0)", b2: "translate(0,0)", b3: "translate(0,0)" },
    { b1: "translate(4%, 3%)", b2: "translate(-3%, 4%)", b3: "translate(3%, -3%)" },
  ];
  async function setDrift(i) {
    await page.evaluate((d) => {
      const set = (sel, tr) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.style.animation = "none";
        el.style.transform = tr;
        el.style.opacity = "0.5";
      };
      set(".aurora .b1", d.b1);
      set(".aurora .b2", d.b2);
      set(".aurora .b3", d.b3);
    }, DRIFT_ENDS[i]);
    await page.waitForTimeout(150);
  }

  /* Viewport-sized captures, scrolled, and deliberately NOT one fullPage shot.
     fullPage resizes the viewport to the document height, and every decorative
     layer on this page is position:fixed and sized in viewport units — .aurora's
     blobs are 62vmax, .vignette is a radial gradient across the viewport, #net
     is a canvas drawn to innerWidth/innerHeight. Captured full-page they render
     at a geometry no visitor ever sees, and the ground came back so wrong that
     the h1 over a solid plate measured 2.74:1. The fixed layers are exactly what
     is being measured here, so the capture has to be the size they are built for. */
  /* Type is stripped once, globally; then each element is scrolled into view and
     only its OWN line boxes are sampled from a capture taken at that position.
     One screenshot per element is slower than one per scroll step, and it is
     what makes the result unambiguous — every earlier attempt to be clever about
     batching got the pairing between a rectangle and a capture wrong in a way
     that surfaced as a plausible-looking number rather than as an error:

       cached document coordinates    stale once reveal transitions settled
       one fullPage capture           resizes the viewport, so the fixed
                                      decorative layers (62vmax aurora blobs, a
                                      viewport-sized vignette, a canvas drawn to
                                      innerHeight) render at a geometry no
                                      visitor sees — an h1 on a solid plate came
                                      back at 2.74:1
       whole-viewport scroll steps    a fragment straddling a step boundary was
                                      never wholly inside any capture

     Nothing here is batched. The rect and the pixels come from the same moment. */
  const byId = new Map();
  for (const tg of targets) {
    /* The element itself is hidden as well as the page's type, and that last
       step is what finally made the numbers mean something. visibility:hidden
       suppresses the element's own background, border and pseudo-elements too,
       so the rectangle shows only what is BEHIND it. Without it, every
       remaining failure was an element being measured against its own
       decoration:

         span.badge  1.38:1  its own 6px --blue-bright dot, beside the label
         p.lp-note   2.59:1  its own 18px rgba(45,99,240,.5) rule
         h1          2.74:1  the gradient glyphs of its own .accent span, which
                             survive `color: transparent` because they are
                             painted by background-clip:text, not by color

       None of those is a background any reader could confuse with one. */
    await page.evaluate((id) => {
      const el = document.querySelector(`[data-contrast-id="${id}"]`);
      el.style.visibility = "hidden";
      el.scrollIntoView({ block: "center", behavior: "instant" });
    }, tg.id);
    await page.waitForTimeout(70);
    const rects = await page.evaluate((id) => {
      const el = document.querySelector(`[data-contrast-id="${id}"]`);
      return [...el.getClientRects()]
        .map((r) => ({
          x: Math.max(0, Math.floor(r.left)),
          y: Math.max(0, Math.floor(r.top)),
          width: Math.min(Math.ceil(r.width), window.innerWidth - Math.max(0, Math.floor(r.left))),
          height: Math.min(Math.ceil(r.height), window.innerHeight - Math.max(0, Math.floor(r.top))),
        }))
        .filter((r) => r.width >= 2 && r.height >= 2 && r.y >= 0);
    }, tg.id);
    const rec = { minL: 2, maxL: -1, frags: 0 };
    for (let d = 0; d < DRIFT_ENDS.length; d++) {
      await setDrift(d);
      for (const r of rects) {
        const shot = await page.screenshot({ clip: r });
        const { data } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        for (let i = 0; i < data.length; i += 3) {
          const l = lum(data[i], data[i + 1], data[i + 2]);
          if (l < rec.minL) rec.minL = l;
          if (l > rec.maxL) rec.maxL = l;
        }
        if (d === 0) rec.frags += 1;
      }
    }
    await page.evaluate((id) => {
      document.querySelector(`[data-contrast-id="${id}"]`).style.visibility = "";
    }, tg.id);
    byId.set(tg.id, rec);
  }

  for (const t of targets) {
    const rec = byId.get(t.id);
    if (!rec || rec.frags === 0) {
      failures.push(`${label} ${t.section} ${t.tag}: no sampleable line fragment`);
      continue;
    }
    let { minL, maxL } = rec;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(t.color);
    const textL = lum(Number(m[1]), Number(m[2]), Number(m[3]));
    if (t.ownBackground) {
      /* Its own opaque ground replaces whatever the photograph is doing. */
      const b = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(t.ownBackground);
      const bL = lum(Number(b[1]), Number(b[2]), Number(b[3]));
      minL = bL;
      maxL = bL;
    }
    const vsDarkest = ratio(textL, minL);
    const vsBrightest = ratio(textL, maxL);
    const worst = Math.min(vsDarkest, vsBrightest);
    const floor = floorFor(t.fontPx, t.weight);
    const pass = worst >= floor;
    if (!pass) {
      failures.push(
        `${label} ${t.section} ${t.tag} "${t.text}": ${worst.toFixed(2)}:1 against the ` +
          `${vsDarkest < vsBrightest ? "darkest" : "brightest"} pixel behind it (floor ${floor})`,
      );
    }
    report.push({
      view: label,
      section: t.section,
      plate: t.plate,
      element: t.tag,
      text: t.text,
      fontPx: t.fontPx,
      lineFragments: rec.frags,
      floor,
      vsDarkest: +vsDarkest.toFixed(2),
      vsBrightest: +vsBrightest.toFixed(2),
      worst: +worst.toFixed(2),
      worstEnd: vsDarkest < vsBrightest ? "darkest" : "brightest",
      note: t.note,
      verdict: pass ? "pass" : "FAIL",
    });
  }
  await ctx.close();
}
await browser.close();

writeFileSync(resolve(outDir, "contrast.json"), JSON.stringify(report, null, 2), "utf8");

for (const [label] of VIEWS) {
  const rows = report.filter((r) => r.view === label);
  console.log(`\n=== ${label} — ${rows.length} text elements over photographs ===`);
  console.table(
    rows.map((r) => ({
      section: r.section,
      plate: r.plate,
      element: r.element,
      px: r.fontPx,
      floor: r.floor,
      "vs darkest": r.vsDarkest,
      "vs brightest": r.vsBrightest,
      worst: r.worst,
      verdict: r.verdict,
    })),
  );
  const worst = rows.reduce((a, b) => (b.worst < a.worst ? b : a), rows[0]);
  if (worst) console.log(`  worst on this view: ${worst.worst}:1 — ${worst.section} ${worst.element} (floor ${worst.floor})`);
}

console.log(`\nWrote ${resolve(outDir, "contrast.json")}`);
if (failures.length) {
  console.error(`\nFAIL  ${failures.length} text element(s) below their contrast floor:`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log(`\nPASS  all ${report.length} measurements clear their floor.`);
