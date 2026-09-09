#!/usr/bin/env node
/**
 * Layout gate for the hm-* pages, and the screenshot pass the review runs on.
 *
 *   node scripts/serve.mjs 4399 &
 *   node scripts/verify-hm-layout.mjs http://localhost:4399 --shots <dir>
 *
 * WHY THIS EXISTS RATHER THAN verify-layout.mjs. That script asserts the OLD
 * homepage: #why's sticky frame, #verticals, #cap, figure.shot, p.lp-sub. Those
 * sections do not exist on the new page, so every one of its checks would be
 * vacuous or wrong. Hacking it to pass would have produced a green run that
 * measured nothing. This is the replacement for the new construction, and the
 * old script is left alone for the pages still built on .lp-*.
 *
 * WHAT IS ASSERTED, at 1440, 768 and 390 on all five pages:
 *
 *   1. document.documentElement.scrollWidth <= clientWidth. Not "looks fine":
 *      baseline/README.md records a bleed that was hidden with overflow-x:clip
 *      and went on reporting a wider scrollWidth, with a real horizontal scroll
 *      still reachable. So the page is also scrolled to x=9999 and scrollX must
 *      still be 0.
 *   2. No element's border box crosses the viewport edge, EXCEPT inside a
 *      declared scroll container — an ancestor whose computed overflow-x is
 *      auto or scroll. The dark band's dimension table is 620px wide on a 390px
 *      phone on purpose; it lives in .scrollx and scrolls there. Anything wide
 *      that is NOT in one of those is the defect this catches.
 *   3. Every screenshot's real pixel width, read back off the file with sharp.
 *      A full-page capture silently widens to the document when the document
 *      overflows, so a 390 shot that comes back 620 wide is not a wide picture,
 *      it is proof of the overflow that check 1 is supposed to have caught. The
 *      two checks are kept separate because each has caught what the other
 *      missed in this repo.
 */
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";
import sharp from "sharp";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? "http://localhost:4399").replace(/\/$/, "");
const shotFlag = args.indexOf("--shots");
const SHOTS = shotFlag > -1 ? resolve(args[shotFlag + 1]) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const PAGES = [
  ["home", "/"],
  ["products", "/products/"],
  ["articles", "/articles/"],
  ["about", "/about/"],
  ["contact", "/contact/"],
];
const VIEWS = [
  ["1440", 1440, 900, false],
  ["768", 768, 1024, false],
  ["390", 390, 844, true],
];

const browser = await chromium.launch();
const rows = [];
const failures = [];
const shotSizes = [];
const externals = new Set();

for (const [vLabel, width, height, isMobile] of VIEWS) {
  const ctx = await browser.newContext({
    viewport: { width, height }, isMobile, hasTouch: isMobile, deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();

  page.on("request", (r) => {
    const u = r.url();
    if (!u.startsWith("http")) return;
    if (u.startsWith(BASE)) return;
    externals.add(u);
  });

  for (const [pLabel, path] of PAGES) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });

    /* Walk the page so every [data-reveal] has fired and every entrance has
       settled. An element still at translateY(18px) reports a different box. */
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.6;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 140));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
    await page.waitForFunction(
      () => [...document.querySelectorAll("img")].every((i) => i.complete),
      null, { timeout: 20000 },
    );

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      window.scrollTo(9999, 0);
      const scrolledX = window.scrollX;
      window.scrollTo(0, 0);

      const vw = de.clientWidth;
      const wide = [];
      for (const el of document.querySelectorAll("body *")) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (cs.position === "fixed") continue;          /* .layer backgrounds, the header */
        const r = el.getBoundingClientRect();
        if (r.width < 1 && r.height < 1) continue;
        /* RIGHT EDGE ONLY, in an LTR document. A box at left:-9999px cannot be
           reached by scrolling — there is nothing to the left of the origin —
           so it creates no overflow and no scrollbar. The contact form's
           honeypot lives exactly there on purpose, and flagging it reported a
           spam defence as a layout defect. Reachability is separately asserted
           by scrolling to x=9999 and requiring scrollX to still be 0. */
        if (r.right <= vw + 0.5) continue;

        /* Contained if any ancestor either scrolls it (auto/scroll) or clips it
           (hidden/clip). Only auto/scroll was accepted at first, which flagged
           the three .aurora blobs — 62vmax circles that are wider than a phone
           by construction and sit inside .aurora{overflow:hidden}. A clipped
           box cannot widen the document, so treating clip as a defect would
           mean the check could never pass on any page carrying the background. */
        let p = el.parentElement, contained = false;
        while (p) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") { contained = true; break; }
          p = p.parentElement;
        }
        if (contained) continue;

        wide.push({
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""),
          left: Math.round(r.left), right: Math.round(r.right),
        });
      }
      return {
        scrollWidth: de.scrollWidth, clientWidth: de.clientWidth,
        docHeight: de.scrollHeight, scrolledX, wide: wide.slice(0, 6), wideCount: wide.length,
      };
    });

    const overflow = m.scrollWidth - m.clientWidth;
    rows.push({ page: pLabel, view: vLabel, ...m, overflow });
    if (overflow > 0) failures.push(`${pLabel} @${vLabel}: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth} (+${overflow}px)`);
    if (m.scrolledX !== 0) failures.push(`${pLabel} @${vLabel}: reachable horizontal scroll, scrollX ${m.scrolledX}`);
    if (m.wideCount > 0) failures.push(`${pLabel} @${vLabel}: ${m.wideCount} element(s) outside the viewport with no scroll container — ${m.wide.map((w) => `${w.sel} [${w.left}..${w.right}]`).join("; ")}`);

    if (SHOTS && (vLabel === "1440" || vLabel === "390")) {
      /* fullPage, then the file's real width is read back off disk. A clip
         without fullPage is silently capped at the viewport — the first run of
         this script produced 900px-tall "full page" shots of six-screen pages
         and they looked fine. And a fullPage capture of an OVERFLOWING document
         comes back document-wide, so the width assertion below is a second,
         independent witness to check 1 rather than a formality. */
      const file = `${SHOTS}/${pLabel}-${vLabel}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const meta = await sharp(file).metadata();
      shotSizes.push({ file: `${pLabel}-${vLabel}.png`, want: width, got: meta.width, height: meta.height });
      if (meta.width !== width) failures.push(`${file}: captured ${meta.width}px wide, expected ${width}`);

      if (pLabel === "home" && vLabel === "1440") {
        const hero = `${SHOTS}/home-1440-hero.png`;
        await page.screenshot({ path: hero, clip: { x: 0, y: 0, width, height: 900 } });
        const hm = await sharp(hero).metadata();
        shotSizes.push({ file: "home-1440-hero.png", want: width, got: hm.width, height: hm.height });
      }
    }
  }
  await ctx.close();
}
await browser.close();

console.log("\npage        view   scrollWidth  clientWidth  overflow  offscreen");
console.log("--------------------------------------------------------------------");
for (const r of rows) {
  console.log(
    `${r.page.padEnd(11)} ${r.view.padEnd(6)} ${String(r.scrollWidth).padStart(11)} ${String(r.clientWidth).padStart(12)} ${String(r.overflow).padStart(9)} ${String(r.wideCount).padStart(10)}`,
  );
}
if (shotSizes.length) {
  console.log("\nscreenshot            expected  actual px   height");
  for (const s of shotSizes) {
    console.log(`${s.file.padEnd(22)} ${String(s.want).padStart(8)} ${String(s.got).padStart(10)} ${String(s.height).padStart(8)}`);
  }
}
console.log("\nexternal requests (anything but /_vercel/insights is a failure):");
const bad = [...externals].filter((u) => !u.includes("/_vercel/insights"));
console.log(externals.size ? [...externals].map((u) => "  " + u).join("\n") : "  none");
for (const u of bad) failures.push(`external request: ${u}`);

if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S)`);
  for (const f of failures) console.log("  " + f);
  process.exit(1);
}
console.log("\nOK — no horizontal overflow, no stray offscreen element, every capture at its viewport width.");
