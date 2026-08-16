#!/usr/bin/env node
/**
 * Measures the homepage against the acceptance gates and writes the evidence.
 *
 *   node scripts/serve.mjs 4311 &
 *   node scripts/snapshot.mjs http://localhost:4311 --out verification
 *
 * Rewritten from the motion-layer-prep version. That one measured a
 * scroll-snap deck — wheel gestures, section advance counts, a typing hero —
 * none of which exists on this page, so most of it asserted against selectors
 * that are absent and would have passed vacuously. What is carried over
 * verbatim is the part that was expensive to learn:
 *
 *   · Overflow is judged by scrollWidth vs innerWidth AND by asking the page
 *     to scroll right and seeing whether it moved. `overflow-x: clip` changes
 *     the paint and not the scrollWidth, and a real scrollbar got through once
 *     on the strength of the paint alone.
 *
 *   · Mobile uses a real Playwright viewport with isMobile, never a headless
 *     --window-size, which does not emulate the layout viewport at all.
 *
 *   · LCP is read over the DevTools protocol. The page-level
 *     PerformanceObserver API delivers no largest-contentful-paint entries in
 *     this environment for any document, including a control containing
 *     nothing but an <h1>, so a null from it would say nothing.
 *
 *   · Readability is judged on rendered pixels, not on DOM presence. A heading
 *     sitting at opacity 0 because its reveal never fired is copy nobody can
 *     read, and the DOM reports it as perfectly fine.
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

const ORIGIN = new URL(BASE).origin;
const report = {};
const failures = [];
const fail = (s) => failures.push(s);

/* The two the brief asks for, plus the tablet width between them. 390 is a real
   phone viewport, so it is driven as one. */
const VIEWPORTS = [
  ["1440", 1440, 900, false],
  ["768", 768, 1024, false],
  ["390", 390, 844, true],
];

/** Every width where a fixed measure could leak across a breakpoint. */
const SWEEP_WIDTHS = [
  320, 360, 375, 390, 412, 430, 480, 481, 600, 640, 700, 720, 768, 769, 900,
  1024, 1280, 1440, 1600,
];

const browser = await chromium.launch();

/** Records every response's encoded size, bucketed, and every origin touched. */
function meter(page) {
  const bytes = { html: 0, css: 0, js: 0, font: 0, image: 0, other: 0, total: 0 };
  const files = [];
  const origins = new Set();
  page.on("request", (r) => origins.add(new URL(r.url()).origin));
  page.on("response", async (res) => {
    let size = 0;
    try {
      size = (await res.request().sizes()).responseBodySize || 0;
      if (!size) size = (await res.body()).length;
    } catch {
      /* an aborted request has no body; it also transferred nothing */
    }
    const url = new URL(res.url()).pathname;
    const ext = url.split(".").pop().toLowerCase();
    const bucket =
      ext === "css" ? "css"
      : ext === "js" ? "js"
      : /woff2?|ttf|otf/.test(ext) ? "font"
      : /png|jpe?g|webp|avif|gif|svg|ico/.test(ext) ? "image"
      : url === "/" || ext === "html" ? "html"
      : "other";
    bytes[bucket] += size;
    bytes.total += size;
    files.push({ url, bucket, bytes: size });
  });
  return { bytes, files, origins };
}

/* Layout shift is collected as entries, not only as a total. "CLS is 0" and
   "nothing shifted" are different claims and the brief asks for the second. */
const VITALS_PROBE = `
new Promise((done) => {
  let cls = 0;
  const shifts = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      cls += e.value;
      shifts.push({
        value: Number(e.value.toFixed(5)),
        sources: (e.sources ?? []).map((s) => {
          const el = s.node;
          if (!el || !el.tagName) return 'unknown';
          return el.tagName.toLowerCase()
            + (el.id ? '#' + el.id : '')
            + (typeof el.className === 'string' && el.className.trim()
               ? '.' + el.className.trim().split(/\\s+/).join('.') : '');
        }),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  setTimeout(() => {
    const paints = Object.fromEntries(
      performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)]),
    );
    done({
      firstPaintMs: paints['first-paint'] ?? null,
      firstContentfulPaintMs: paints['first-contentful-paint'] ?? null,
      cls: Number(cls.toFixed(5)),
      layoutShiftEntries: shifts.length,
      shifts: shifts.slice(0, 8),
    });
  }, 3200);
});`;

/** Which element did the renderer actually pick for LCP? Read over CDP. */
async function lcpElementAt(width, height, isMobile) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const events = [];
  cdp.on("PerformanceTimeline.timelineEventAdded", (e) => events.push(e.event));
  await cdp.send("DOM.enable");
  await cdp.send("PerformanceTimeline.enable", { eventTypes: ["largest-contentful-paint"] });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2600);

  const last = events.filter((e) => e.lcpDetails).at(-1);
  let node = null;
  let snippet = null;
  if (last?.lcpDetails?.nodeId) {
    try {
      const d = await cdp.send("DOM.describeNode", { backendNodeId: last.lcpDetails.nodeId });
      node = d.node.nodeName.toLowerCase();
      const attrs = d.node.attributes ?? [];
      for (let i = 0; i < attrs.length; i += 2) {
        if (attrs[i] === "class") node += "." + attrs[i + 1].trim().split(/\s+/).join(".");
        if (attrs[i] === "src") snippet = attrs[i + 1];
      }
    } catch {
      node = `backendNodeId ${last.lcpDetails.nodeId}`;
    }
  }
  const timeMs = last ? Math.round(last.time * 1000 - (last.timestamp ? 0 : 0)) : null;
  await ctx.close();
  return { element: node, src: snippet, sawEvent: Boolean(last), rawTime: last?.time ?? null, timeMs };
}

// --- the reference widths: screenshots, vitals, weight, image sizing ---------
report.viewports = [];
for (const [name, width, height, isMobile] of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile,
    hasTouch: isMobile,
    deviceScaleFactor: isMobile ? 3 : 1,
  });
  const page = await ctx.newPage();
  const net = meter(page);
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 160)));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));

  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.screenshot({ path: resolve(outDir, `${name}-entrance.png`) });
  await page.waitForTimeout(1700);
  await page.screenshot({ path: resolve(outDir, `${name}-top.png`) });

  const vitals = await page.evaluate(VITALS_PROBE);
  if (vitals.cls > 0 || vitals.layoutShiftEntries > 0) {
    fail(`${name}: CLS ${vitals.cls} across ${vitals.layoutShiftEntries} layout-shift entries — the gate is exactly 0`);
  }

  /* Scroll through so every reveal has fired, then return to the top: a
     full-page shot taken cold is a page of blanks and says nothing. */
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 190));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(outDir, `${name}-full.png`), fullPage: true });

  /* Now that everything has loaded, is each image's source bigger than the box
     it is painted into? The gate is "sized to their actual render size", so
     the number that matters is intrinsic width over CSS width times DPR. */
  const images = await page.evaluate(() => {
    const dpr = window.devicePixelRatio;
    return [...document.querySelectorAll("img")].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        src: (el.currentSrc || el.src).split("/").pop(),
        natural: el.naturalWidth,
        cssWidth: Math.round(r.width),
        needed: Math.round(r.width * dpr),
        loading: el.getAttribute("loading") ?? "eager",
        decoding: el.getAttribute("decoding") ?? null,
        hasDims: el.hasAttribute("width") && el.hasAttribute("height"),
        alt: el.getAttribute("alt"),
      };
    });
  });
  const oversized = images.filter((i) => i.needed > 0 && i.natural > i.needed * 1.35);
  if (oversized.length) {
    fail(
      `${name}: ${oversized.length} image(s) served larger than their render box — ` +
        oversized.map((i) => `${i.src} ${i.natural}px for ${i.needed}px`).join(", "),
    );
  }
  const noDims = images.filter((i) => !i.hasDims);
  if (noDims.length) fail(`${name}: ${noDims.length} <img> without width/height (CLS risk)`);

  const offOrigin = [...net.origins].filter((o) => o !== ORIGIN);
  if (offOrigin.length) fail(`${name}: requests to off-origin hosts — ${offOrigin.join(", ")}`);
  if (consoleErrors.length) fail(`${name}: ${consoleErrors.length} console error(s) — ${consoleErrors[0]}`);

  report.viewports.push({
    view: `${name}px${isMobile ? " (mobile)" : ""}`,
    ...vitals,
    consoleErrors,
    origins: [...net.origins],
    weightKB: Object.fromEntries(
      Object.entries(net.bytes).map(([k, v]) => [k, +(v / 1024).toFixed(1)]),
    ),
    imageFiles: net.files
      .filter((f) => f.bucket === "image")
      .map((f) => `${f.url.split("/").pop()} ${(f.bytes / 1024).toFixed(1)}KB`),
    fontFiles: net.files.filter((f) => f.bucket === "font").map((f) => f.url),
    images,
  });
  await ctx.close();
}

// --- LCP, over CDP -----------------------------------------------------------
report.lcp = {
  "1440": await lcpElementAt(1440, 900, false),
  "390": await lcpElementAt(390, 844, true),
};
for (const [k, v] of Object.entries(report.lcp)) {
  if (!v.sawEvent || !v.element) fail(`${k}: no LCP element identified by the renderer`);
}

// --- scripting disabled ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(outDir, "nojs-1440-top.png") });
  await page.screenshot({ path: resolve(outDir, "nojs-1440-full.png"), fullPage: true });
  /* Every block the reveal layer would otherwise hide, plus every heading and
     paragraph, must be fully opaque with the bundle never having run. */
  const state = await page.evaluate(() => {
    const items = [...document.querySelectorAll("[data-reveal], h1, h2, h3, p, li")];
    const faint = items.filter((el) => Number(getComputedStyle(el).opacity) < 0.9);
    return {
      blocks: items.length,
      hidden: faint.length,
      first: faint.slice(0, 4).map((el) => el.tagName.toLowerCase() + ":" + (el.textContent ?? "").trim().slice(0, 40)),
    };
  });
  if (state.hidden > 0) fail(`no-JS: ${state.hidden}/${state.blocks} blocks below opacity 0.9 — ${state.first.join(" | ")}`);
  report.noJS = { ...state, verdict: state.hidden ? "HIDDEN COPY" : "all visible" };
  await ctx.close();
}

// --- reduced motion ----------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: resolve(outDir, "reducedmotion-1440-top.png") });
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.7;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: resolve(outDir, "reducedmotion-1440-full.png"), fullPage: true });

  /* Two claims: nothing is hidden, and nothing is animating. The second is
     read off computed style rather than trusted to the media query, because
     a rule added later can reintroduce a transition without anyone noticing. */
  const state = await page.evaluate(() => {
    const items = [...document.querySelectorAll("[data-reveal], h1, h2, h3, p, li, img")];
    const faint = items.filter((el) => Number(getComputedStyle(el).opacity) < 0.9);
    const moving = [...document.querySelectorAll("body *")].filter((el) => {
      const s = getComputedStyle(el);
      const dur = (v) => v.split(",").some((x) => parseFloat(x) > 0);
      return (s.animationName !== "none" && dur(s.animationDuration)) || dur(s.transitionDuration);
    });
    return {
      blocks: items.length,
      hidden: faint.length,
      animating: moving.length,
      animatingFirst: moving.slice(0, 5).map((el) => el.tagName.toLowerCase() + "." + String(el.className).trim().split(/\s+/).join(".")),
      runningAnimations: document.getAnimations().filter((a) => a.playState === "running").length,
    };
  });
  if (state.hidden > 0) fail(`reduced-motion: ${state.hidden} blocks stuck below opacity 0.9`);
  if (state.animating > 0) fail(`reduced-motion: ${state.animating} element(s) still carry a duration — ${state.animatingFirst.join(", ")}`);
  report.reducedMotion = { ...state, verdict: state.hidden || state.animating ? "FAIL" : "static and readable" };
  await ctx.close();
}

// --- horizontal overflow, 320 to 1600 ----------------------------------------
{
  const perWidth = [];
  const offenders = [];
  for (const width of SWEEP_WIDTHS) {
    const isMobile = width <= 480;
    const ctx = await browser.newContext({
      viewport: { width, height: 844 },
      isMobile,
      hasTouch: isMobile,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    /* Reveals can change geometry, so the sweep runs after the page has been
       walked, not on the cold document. */
    await page.evaluate(async () => {
      const step = window.innerHeight * 0.8;
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    const r = await page.evaluate(() => {
      const win = window.innerWidth;
      const over = [];
      for (const el of document.querySelectorAll("body *")) {
        if (el.closest('[aria-hidden="true"]')) continue;
        const b = el.getBoundingClientRect();
        if (b.width === 0 || b.height === 0) continue;
        if (b.right > win + 1 || b.left < -1) {
          over.push(
            el.tagName.toLowerCase() +
              (el.id ? `#${el.id}` : "") +
              (typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).join(".")}` : "") +
              ` [${Math.round(b.left)}..${Math.round(b.right)}]`,
          );
        }
      }
      return { doc: document.documentElement.scrollWidth, win, over };
    });
    /* Geometry alone let a real scrollbar through once: overflow-x:clip changed
       the paint and not the scrollWidth. So the page is asked to move. */
    const scrolled = await page.evaluate(() => {
      window.scrollTo(9999, 0);
      const x = Math.round(window.scrollX);
      window.scrollTo(0, 0);
      return x;
    });
    const bad = r.doc > r.win || scrolled > 0;
    perWidth.push({ width, scrollWidth: r.doc, innerWidth: r.win, scrollXAfterScrollRight: scrolled, scrolls: bad, offenders: r.over });
    if (bad) offenders.push(`${width}px doc=${r.doc} win=${r.win} scrollX=${scrolled} — ${r.over.slice(0, 3).join(", ") || "no non-decorative element identified"}`);
    await ctx.close();
  }
  if (offenders.length) fail(`horizontal overflow at ${offenders.length} width(s): ${offenders.slice(0, 3).join(" | ")}`);
  report.overflow = { widthsTested: SWEEP_WIDTHS.length, overflowing: offenders.length, detail: offenders.slice(0, 4), perWidth };
}

// --- keyboard focus never lands on something invisible or off-screen ---------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const stops = [];
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    /* Read after the focus styles have settled, not on the same tick. The skip
       link is parked off-screen and slides in over 180ms when focused, so
       sampling immediately caught it mid-transition and reported the one
       control on the page that is *designed* to appear on focus as a control
       the keyboard can reach and the eye cannot. That is a measurement
       artifact, and reporting it as a defect would have buried the ten real
       ones underneath it. */
    await page.waitForTimeout(260);
    const stop = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      let opacity = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        opacity = Math.min(opacity, Number(getComputedStyle(n).opacity));
        if (getComputedStyle(n).visibility === "hidden" || getComputedStyle(n).display === "none") opacity = 0;
      }
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 44),
        opacity: Number(opacity.toFixed(2)),
        rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        inViewport: r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth,
        outlineOnFocus: getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none",
      };
    });
    if (!stop) break;
    const key = stop.tag + "|" + stop.label + "|" + stop.rect.top + "," + stop.rect.left;
    if (seen.has(key)) break;
    seen.add(key);
    stops.push(stop);
  }
  /* The browser scrolls a focused element into view by itself, so anything
     still reported off-screen or transparent here is genuinely unreachable —
     which is the failure mode: a tab stop the keyboard can reach and the eye
     cannot find. The skip link is the deliberate case and it passes, because
     focusing it is what brings it on screen. */
  const bad = stops.filter((s) => s.opacity < 0.9 || !s.inViewport || s.rect.w === 0 || s.rect.h === 0);
  if (bad.length) {
    fail(`keyboard: ${bad.length} focus stop(s) invisible or off-screen — ${bad.map((s) => `${s.tag}"${s.label}" op=${s.opacity} inView=${s.inViewport}`).join(" | ")}`);
  }
  report.keyboard = { stops: stops.length, invisible: bad.length, detail: stops };
  await ctx.close();
}

// --- first paint with the JS bundle blocked, judged on pixels ----------------
report.noBundle = [];
for (const [label, width, height, isMobile] of [["390", 390, 844, true], ["1440", 1440, 900, false]]) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch: isMobile, deviceScaleFactor: 1 });
  await ctx.route((u) => u.pathname.endsWith(".js"), (r) => r.abort());
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const geom = await page.evaluate(() => {
    const vh = window.innerHeight;
    const items = [...document.querySelectorAll(".lp-hero h1, .lp-hero .eyebrow, .lp-hero .btn, .lp-hero .lp-lead, .lp-hero .lp-note")];
    const onScreen = items.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < vh && r.bottom > 0 && r.width > 0;
    });
    return { total: onScreen.length, visible: onScreen.filter((el) => Number(getComputedStyle(el).opacity) > 0.9).length };
  });

  const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height } });
  const { data, info } = await sharp(shot).greyscale().raw().toBuffer({ resolveWithObject: true });
  let min = 255, max = 0, dark = 0;
  for (let i = 0; i < data.length; i++) {
    if (data[i] < min) min = data[i];
    if (data[i] > max) max = data[i];
    if (data[i] < 128) dark += 1;   // dark type on a near-white wash
  }
  const darkPct = (dark / (info.width * info.height)) * 100;
  await page.screenshot({ path: resolve(outDir, `nobundle-${label}.png`) });

  const readable = geom.visible === geom.total && geom.total > 0 && darkPct > 0.5;
  if (!readable) fail(`no-bundle ${label}: hero not readable at first paint (${geom.visible}/${geom.total} opaque, ${darkPct.toFixed(2)}% ink)`);
  report.noBundle.push({ view: label, heroItemsVisible: `${geom.visible}/${geom.total}`, luminanceRange: `${min}–${max}`, inkPixelsPct: +darkPct.toFixed(2), verdict: readable ? "readable" : "BLANK" });
  await ctx.close();
}

// --- the hero must be opaque in its first painted frame ----------------------
// Anything Chromium first paints fully transparent is out of contentful-paint
// candidacy permanently, so "it fades in quickly" is still a failure.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "commit" });
  const timeline = [];
  let elapsed = 0;
  for (const t of [120, 350, 700, 1200, 2200]) {
    await page.waitForTimeout(t - elapsed);
    elapsed = t;
    timeline.push({
      tMs: t,
      ...(await page.evaluate(() => {
        const op = (sel) => {
          const el = document.querySelector(sel);
          return el ? Number(Number(getComputedStyle(el).opacity).toFixed(2)) : null;
        };
        const h1 = document.querySelector(".lp-hero h1");
        return {
          h1: op(".lp-hero h1"),
          h1Parent: h1?.parentElement ? Number(Number(getComputedStyle(h1.parentElement).opacity).toFixed(2)) : null,
          lead: op(".lp-hero .lp-lead"),
          actions: op(".lp-hero .lp-actions"),
        };
      })),
    });
  }
  const first = timeline[0];
  const opaque = first.h1 >= 1 && (first.h1Parent === null || first.h1Parent >= 1);
  if (!opaque) fail(`hero h1 is not opaque at first paint (h1=${first.h1}, parent=${first.h1Parent} at ${first.tMs}ms) — it cannot be an LCP candidate`);
  report.heroOpacity = { opaqueAtFirstPaint: opaque, timeline };
  await ctx.close();
}

// --- the signature transition: frame 2 resolves when the demand section enters
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const read = () =>
    page.evaluate(() => {
      const f2 = document.querySelector(".pair .frame-answered");
      const pair = document.querySelector(".pair");
      if (!f2 || !pair) return null;
      const b1 = document.querySelector(".pair .frame-asked").getBoundingClientRect();
      const b2 = f2.getBoundingClientRect();
      return {
        answeredOpacity: Number(Number(getComputedStyle(f2).opacity).toFixed(3)),
        resolved: pair.classList.contains("resolved"),
        /* The two frames are the same objects photographed twice, so they must
           occupy exactly the same box — a one-pixel offset would read as the
           whole picture sliding rather than the answer arriving. */
        aligned: Math.round(b1.top) === Math.round(b2.top) && Math.round(b1.left) === Math.round(b2.left) && Math.round(b1.width) === Math.round(b2.width),
        transition: getComputedStyle(f2).transitionDuration,
      };
    });

  const atRest = await read();
  await page.evaluate(() => document.querySelector("#demand").scrollIntoView({ block: "center", behavior: "instant" }));
  await page.waitForTimeout(1600);
  const afterScroll = await read();

  if (!atRest) fail("signature transition: .pair / .frame-answered not found in the page");
  else {
    if (atRest.answeredOpacity > 0.01) fail(`signature transition: the answered frame is already visible at rest (opacity ${atRest.answeredOpacity})`);
    if (!afterScroll.resolved || afterScroll.answeredOpacity < 0.99) fail(`signature transition: the answer did not resolve on entering #demand (opacity ${afterScroll?.answeredOpacity})`);
    if (!atRest.aligned) fail("signature transition: the two frames are not pixel-aligned — the swap will read as a slide");
  }
  report.signature = { atRest, afterScroll };
  await ctx.close();
}

await browser.close();

writeFileSync(resolve(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");

console.log("\n=== viewports ===");
console.table(
  report.viewports.map((v) => ({
    view: v.view,
    FCP: v.firstContentfulPaintMs,
    CLS: v.cls,
    shiftEntries: v.layoutShiftEntries,
    imageKB: v.weightKB.image,
    totalKB: v.weightKB.total,
    consoleErrors: v.consoleErrors.length,
  })),
);
console.log("\n=== LCP (over CDP) ===");
console.table(Object.entries(report.lcp).map(([k, v]) => ({ view: k, element: v.element ?? "NONE", src: v.src ?? "—" })));
console.log("\n=== degraded modes ===");
console.table([
  { mode: "no JS", detail: report.noJS.verdict, hidden: report.noJS.hidden },
  { mode: "reduced motion", detail: report.reducedMotion.verdict, hidden: report.reducedMotion.hidden, animating: report.reducedMotion.animating },
  ...report.noBundle.map((n) => ({ mode: `no bundle ${n.view}`, detail: n.verdict, hidden: n.heroItemsVisible })),
]);
console.log("\n=== overflow ===");
console.log(`  ${report.overflow.widthsTested} widths tested, ${report.overflow.overflowing} overflowing`);
console.log("\n=== keyboard ===");
console.log(`  ${report.keyboard.stops} focus stops, ${report.keyboard.invisible} invisible or off-screen`);
console.log("\n=== signature transition ===");
console.log(`  at rest: answered frame opacity ${report.signature.atRest?.answeredOpacity}; after entering #demand: ${report.signature.afterScroll?.answeredOpacity} (aligned: ${report.signature.atRest?.aligned})`);

console.log(`\nWrote ${outDir}`);
if (failures.length) {
  console.error(`\nFAIL  ${failures.length} gate(s) not met:`);
  for (const f of failures) console.error(`  · ${f}`);
  process.exit(1);
}
console.log("\nPASS  every measured gate met.");
