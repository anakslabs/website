#!/usr/bin/env node
/**
 * Two layout gates that exist because the page failed both of them in front of
 * the founder.
 *
 *   node scripts/serve.mjs 4311 &
 *   node scripts/verify-layout.mjs http://localhost:4311
 *
 * A — CO-VISIBILITY. "The image and the text don't show at the same time — then
 * what is the image even for?" Every section that carries a photograph must
 * have a scroll position at which its heading and the SUBJECT of its photograph
 * are on screen together. Before this gate, #why, #verticals and #cap stood
 * 1853, 1532 and 1304px tall at 1440 against an 804px picture, so in a 900px
 * viewport there was no such position for any of them: you read the copy, then
 * you scrolled, then you looked at a picture with nothing to say about it.
 *
 * The subject, not the image box. A photograph whose bottom 40px is peeking
 * over the fold is not on screen in any sense a reader would recognise, and an
 * assertion about the <img> rectangle would pass on exactly that. So the
 * subject's bounding box is measured from the asset itself — every pixel darker
 * than 0.72 luminance against a studio sweep that sits at 0.90 — and then
 * mapped through object-fit into page coordinates. Measured, not hard-coded, so
 * it cannot go stale when an image is re-cut.
 *
 * B — THE CTA IS NOT SEPARATED FROM ITS SENTENCE. At 390 the closing section
 * put its photograph between the paragraph that asks for the click and the
 * button that takes it: paragraph at y7173, band at y7283, button at y7523.
 * Nothing may come between them again.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] ?? "http://localhost:4311").replace(/\/$/, "");
const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");

const srgb = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const lum = (r, g, b) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);

let checks = 0, failures = 0;
const failed = [];
function check(name, ok, detail = "") {
  checks += 1;
  if (!ok) { failures += 1; failed.push(name); }
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** The subject's bounding box within the frame, as fractions of width/height. */
async function subjectBox(file) {
  const { data, info } = await sharp(resolve(ROOT, file)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      if (lum(data[i], data[i + 1], data[i + 2]) < 0.72) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return { x0: x0 / W, x1: (x1 + 1) / W, y0: y0 / H, y1: (y1 + 1) / H };
}

const SECTIONS = [
  { id: "why", asset: "assets/sections/03-unreadable-1360.webp" },
  { id: "verticals", asset: "assets/sections/04-verticals-1360.webp" },
  { id: "cap", asset: "assets/sections/06-exclusivity-1360.webp" },
];

const subjects = {};
for (const s of SECTIONS) subjects[s.id] = await subjectBox(s.asset);

const browser = await chromium.launch();

// --- A: co-visibility ------------------------------------------------------
console.log("\n--- co-visibility at 1440x900 ---");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.6;
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 160)); }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.querySelectorAll("img")].every((i) => i.complete), null, { timeout: 30000 });

  for (const { id } of SECTIONS) {
    const sub = subjects[id];
    const scan = await page.evaluate(async ({ id, sub }) => {
      const sec = document.getElementById(id);
      const h2 = sec.querySelector("h2");
      const img = sec.querySelector("figure img");
      const top = sec.getBoundingClientRect().top + window.scrollY;
      const bottom = top + sec.getBoundingClientRect().height;
      const out = [];
      /* from just before the section arrives to just after it leaves */
      for (let y = Math.max(0, top - window.innerHeight * 0.5); y <= bottom; y += 25) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(r));
        const vh = window.innerHeight;
        const box = (el) => { const r = el.getBoundingClientRect(); return { t: r.top, b: r.bottom, l: r.left, r: r.right, w: r.width, h: r.height }; };
        const vis = (r) => Math.max(0, Math.min(r.b, vh) - Math.max(r.t, 0)) / Math.max(1, r.h);

        /* the subject's rectangle inside the rendered image, through object-fit */
        const ir = box(img);
        const nat = { w: img.naturalWidth || 2752, h: img.naturalHeight || 1536 };
        const fit = getComputedStyle(img).objectFit;
        const posRaw = getComputedStyle(img).objectPosition.split(" ");
        const px = parseFloat(posRaw[0]) / 100, py = parseFloat(posRaw[1]) / 100;
        let scale;
        if (fit === "cover") scale = Math.max(ir.w / nat.w, ir.h / nat.h);
        else if (fit === "contain") scale = Math.min(ir.w / nat.w, ir.h / nat.h);
        else scale = ir.w / nat.w;
        const dw = nat.w * scale, dh = nat.h * scale;
        const dx = ir.l + (ir.w - dw) * (Number.isFinite(px) ? px : 0.5);
        const dy = ir.t + (ir.h - dh) * (Number.isFinite(py) ? py : 0.5);
        /* subject rect in viewport coords, then clipped to the image's own box */
        const sx0 = Math.max(dx + sub.x0 * dw, ir.l), sx1 = Math.min(dx + sub.x1 * dw, ir.r);
        const sy0 = Math.max(dy + sub.y0 * dh, ir.t), sy1 = Math.min(dy + sub.y1 * dh, ir.b);
        const area = Math.max(0, sx1 - sx0) * Math.max(0, sy1 - sy0);
        const visArea = Math.max(0, Math.min(sy1, vh) - Math.max(sy0, 0)) * Math.max(0, Math.min(sx1, window.innerWidth) - Math.max(sx0, 0));
        const subjVis = area > 0 ? visArea / area : 0;

        const h2Vis = vis(box(h2));
        /* any of the section's own copy, for the continuous test */
        let copyVis = 0;
        for (const el of sec.querySelectorAll(".wrap h2, .wrap h3, .wrap p, .wrap li")) {
          const v = vis(box(el)); if (v > copyVis) copyVis = v;
        }
        out.push({ y, h2Vis: +h2Vis.toFixed(3), copyVis: +copyVis.toFixed(3), subjVis: +subjVis.toFixed(3) });
      }
      window.scrollTo(0, 0);
      return { out, top: Math.round(top), bottom: Math.round(bottom) };
    }, { id, sub });

    const both = scan.out.filter((s) => s.h2Vis >= 0.9 && s.subjVis >= 0.6);
    check(
      `#${id}: the heading and the photograph's subject are on screen together`,
      both.length > 0,
      both.length
        ? `${both.length} scroll positions, y ${both[0].y}-${both[both.length - 1].y}; best subject ${Math.max(...both.map((b) => b.subjVis))}`
        : `never — best was h2 ${Math.max(...scan.out.map((s) => s.h2Vis))} with subject ${Math.max(...scan.out.map((s) => s.subjVis))}`,
    );

    /* Then the harder one, and only over the scroll range where the VIEWPORT IS
       ENTIRELY INSIDE THE SECTION. Outside that range the section is arriving or
       leaving and so is everything in it; asserting there would be asserting
       that a section never ends. A section shorter than the viewport has no such
       range at all, which is not a loophole — it means the whole thing is on
       screen at once and there is nothing to hold together.

       This is the assertion sticky exists to satisfy: #why is 1948px of table
       against a 900px viewport, so it has 1048px of scroll where a band would
       have shown copy alone or picture alone the entire time. */
    const inside = scan.out.filter((s) => s.y >= scan.top && s.y <= scan.bottom - 900);
    const broken = inside.filter((s) => !(s.copyVis >= 0.5 && s.subjVis >= 0.5));
    check(
      `#${id}: copy and subject stay together across ${inside.length ? `all ${inside.length} positions with the viewport inside the section (y${scan.top}-${scan.bottom - 900})` : "the section, which is shorter than the viewport"}`,
      broken.length === 0,
      broken.length ? `${broken.length} fail, first at y${Math.round(broken[0].y)} (copy ${broken[0].copyVis}, subject ${broken[0].subjVis})` : "",
    );
  }
  await ctx.close();
}

// --- B: the CTA and its sentence -------------------------------------------
console.log("\n--- the closing CTA at 390x844 ---");
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.6;
    for (let y = 0; y < document.body.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); }
  });
  await page.waitForFunction(() => [...document.querySelectorAll("img")].every((i) => i.complete), null, { timeout: 30000 });

  const r = await page.evaluate(() => {
    const sec = document.getElementById("contact");
    const para = sec.querySelector("p.lp-sub");
    const btn = sec.querySelector("a.btn-primary");
    /* every rendered box that starts after the paragraph ends and finishes
       before the button starts — an ancestor of either is not "between" them */
    const pb = para.getBoundingClientRect().bottom;
    const bt = btn.getBoundingClientRect().top;
    const between = [...sec.querySelectorAll("*")].filter((el) => {
      if (el.contains(para) || el.contains(btn) || para.contains(el) || btn.contains(el)) return false;
      const q = el.getBoundingClientRect();
      if (q.height < 2 || q.width < 2) return false;
      return q.top >= pb - 1 && q.bottom <= bt + 1;
    }).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""));
    return { gap: Math.round(bt - pb), between: [...new Set(between)] };
  });
  check("nothing is rendered between the closing paragraph and its button", r.between.length === 0, r.between.join(", "));
  check(`the button follows the paragraph within 200px (gap ${r.gap}px)`, r.gap >= 0 && r.gap < 200);
  await ctx.close();
}

await browser.close();
console.log(`\n${checks - failures}/${checks} passed, ${failures} failed.` + (failures ? `\nFailing: ${failed.join("; ")}` : ""));
process.exit(failures > 0 ? 1 : 0);
