#!/usr/bin/env node
/**
 * Lighthouse, mobile preset, against the static site.
 *
 *   npx http-server -p 4311 -s -c-1 .
 *   node scripts/lighthouse.mjs http://localhost:4311 [--runs 2] [--json out.json]
 *
 * Localhost has no network latency, so the raw timings here are better than a
 * real 4G connection will give. Treat the category scores as meaningful and the
 * raw timings as a floor, not a measurement.
 *
 * Ported from ../website-next/scripts/lighthouse.mjs. Changed: the same page is
 * measured twice by default and both runs are printed, because a single
 * Lighthouse number is not reproducible enough to be a baseline — a two-run
 * range is. Also records the metric audits' numeric values, not just their
 * display strings, so a later run can be compared arithmetically.
 */
import { writeFileSync } from "node:fs";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? "http://localhost:4311").replace(/\/$/, "");
const runsFlag = args.indexOf("--runs");
const RUNS = runsFlag > -1 ? Number(args[runsFlag + 1]) : 2;
const jsonFlag = args.indexOf("--json");
const PATHS = ["/"];

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

const chrome = await launch({
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});

const rows = [];
const detail = [];

for (const path of PATHS) {
  for (let run = 1; run <= RUNS; run++) {
    const result = await lighthouse(
      BASE + path,
      { port: chrome.port, output: "json", logLevel: "error" },
      undefined,
    );
    const lhr = result.lhr;
    const pct = (k) => Math.round((lhr.categories[k]?.score ?? 0) * 100);
    const num = (id) => lhr.audits[id]?.numericValue ?? null;
    const row = {
      page: path,
      run,
      performance: pct("performance"),
      accessibility: pct("accessibility"),
      "best-practices": pct("best-practices"),
      seo: pct("seo"),
      FCP: lhr.audits["first-contentful-paint"]?.displayValue ?? "n/a",
      LCP: lhr.audits["largest-contentful-paint"]?.displayValue ?? "n/a",
      CLS: lhr.audits["cumulative-layout-shift"]?.displayValue ?? "n/a",
      TBT: lhr.audits["total-blocking-time"]?.displayValue ?? "n/a",
      SI: lhr.audits["speed-index"]?.displayValue ?? "n/a",
    };
    rows.push(row);

    /* Record what each failing audit actually pointed at. "color-contrast
       fails" is an assertion; the selector and the two colours are evidence,
       and evidence is what makes the finding actionable a month later. */
    const evidenceOf = (a) => {
      const items = a.details?.items ?? [];
      return items.slice(0, 6).map((it) => {
        const node = it.node ?? it.subItems?.items?.[0]?.node;
        return {
          selector: node?.selector ?? null,
          snippet: node?.snippet?.slice(0, 140) ?? null,
          explanation: node?.explanation ?? it.reason ?? it.description ?? null,
          source: it.source?.url ?? it.url ?? null,
          text: typeof it.description === "string" ? it.description : undefined,
        };
      });
    };

    const failedBinary = Object.values(lhr.audits)
      .filter((a) => a.score !== null && a.score < 1 && a.scoreDisplayMode === "binary")
      .map((a) => ({ id: a.id, title: a.title, evidence: evidenceOf(a) }));

    detail.push({
      page: path,
      run,
      scores: Object.fromEntries(CATEGORIES.map((c) => [c, pct(c)])),
      metricsMs: {
        firstContentfulPaint: num("first-contentful-paint"),
        largestContentfulPaint: num("largest-contentful-paint"),
        speedIndex: num("speed-index"),
        totalBlockingTime: num("total-blocking-time"),
        cumulativeLayoutShift: num("cumulative-layout-shift"),
      },
      /* Lighthouse 13 reports the LCP node inside lcp-breakdown-insight. The
         old `largest-contentful-paint-element` audit no longer exists, and
         reading it returned undefined for every page — including pages that do
         identify an element — so it could not distinguish "no LCP candidate"
         from "wrong key". Null here now means Lighthouse genuinely found no
         element: Chromium excludes anything painted while fully transparent
         from LCP candidacy, so a page whose type animates in from opacity 0
         reports an LCP time with nothing behind it. */
      lcpElement: (() => {
        const node = lhr.audits["lcp-breakdown-insight"]?.details?.items?.find(
          (i) => i.type === "node",
        );
        return node ? { selector: node.selector, label: node.nodeLabel, snippet: node.snippet } : null;
      })(),
      failedBinaryAudits: failedBinary,
      lighthouseVersion: lhr.lighthouseVersion,
      formFactor: lhr.configSettings?.formFactor,
      throttling: lhr.configSettings?.throttlingMethod,
    });

    if (failedBinary.length) {
      console.log(`\n${path} run ${run} — failing binary audits:`);
      for (const a of failedBinary) console.log(`  · ${a.id}: ${a.title}`);
    }
  }
}

await chrome.kill();
console.log("");
console.table(rows);

// A two-run spread wider than 2 points is reported, not averaged away.
const spread = [];
for (const path of PATHS) {
  for (const cat of CATEGORIES) {
    const vals = rows.filter((r) => r.page === path).map((r) => r[cat]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    if (hi - lo > 2) spread.push(`${path} ${cat}: ${lo}–${hi} (spread ${hi - lo})`);
  }
}
if (spread.length) {
  console.log("\nRuns differ by more than 2 points — record the range, not one number:");
  for (const s of spread) console.log(`  · ${s}`);
} else {
  console.log("\nAll categories reproduced within 2 points across runs.");
}

if (jsonFlag > -1) {
  writeFileSync(args[jsonFlag + 1], JSON.stringify({ rows, detail }, null, 2), "utf8");
  console.log(`\nWrote ${args[jsonFlag + 1]}`);
}

/* The homepage's hero must be the LCP element. It is asserted rather than
   eyeballed because the failure is silent: type that animates in from opacity 0
   still looks right on screen, and only the trace shows that the browser never
   considered it. Pass --expect-lcp h1 to require it. */
const expectFlag = args.indexOf("--expect-lcp");
if (expectFlag > -1) {
  const want = args[expectFlag + 1];
  for (const d of detail) {
    const sel = d.lcpElement?.selector ?? null;
    const ok = Boolean(sel && sel.includes(want));
    console.log(
      `${ok ? "PASS" : "FAIL"}  run ${d.run}: LCP element matches "${want}" — ` +
        (sel ? `${sel} ("${(d.lcpElement.label ?? "").slice(0, 48)}")` : "Lighthouse identified no LCP element"),
    );
    if (!ok) process.exitCode = 1;
  }
}

const under = rows.filter((r) => CATEGORIES.some((k) => r[k] < 90));
if (under.length) {
  console.log("\nBelow 90 on at least one category:");
  for (const r of under) {
    console.log(
      `  · ${r.page} run ${r.run}: ` +
        CATEGORIES.filter((k) => r[k] < 90).map((k) => `${k}=${r[k]}`).join(", "),
    );
  }
  process.exit(1);
}
