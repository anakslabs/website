#!/usr/bin/env node
/**
 * Every page must paint something contentful, and something must win LCP.
 *
 *   node scripts/verify-paint.mjs http://localhost:4311
 *
 * This is the permanent guard behind a defect that shipped and went unnoticed
 * for a long time: /clinics/ rendered perfectly well for a human and emitted no
 * `first-contentful-paint` at all, so Lighthouse aborted with NO_FCP and could
 * not score the page. Nothing looked wrong. The page was simply invisible to
 * every measurement anyone would run on it.
 *
 * The cause is a sustained transparent paint. Chromium excludes content painted
 * while fully transparent from contentful-paint candidacy, and a keyframe
 * entrance with `animation-delay` holds it there long enough to be excluded
 * permanently. One page was hit because every one of its above-the-fold
 * elements was inside that entrance; its siblings survived only because they
 * happen to carry an unanimated form label or status line that paints first.
 * That is luck, not design, and luck is what this file replaces.
 *
 * Two assertions per page:
 *   1. Lighthouse completes — no NO_FCP runtime error, and a real FCP.
 *   2. Something is identified as the LCP element. Which element wins is a
 *      design decision and is deliberately not asserted.
 */
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

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

const chrome = await launch({
  chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
});

const rows = [];
let failures = 0;

for (const path of PAGES) {
  const lhr = (
    await lighthouse(BASE + path, { port: chrome.port, output: "json", logLevel: "error" })
  ).lhr;

  const runtimeError = lhr.runtimeError?.code ?? null;
  const node = lhr.audits["lcp-breakdown-insight"]?.details?.items?.find((i) => i.type === "node");
  const fcp = lhr.audits["first-contentful-paint"]?.displayValue ?? null;
  const lcp = lhr.audits["largest-contentful-paint"]?.displayValue ?? null;
  const perf = lhr.categories.performance?.score;

  const problems = [];
  if (runtimeError) problems.push(runtimeError);
  if (!fcp) problems.push("no FCP");
  if (!node) problems.push("no LCP element");
  if (problems.length) failures += 1;

  rows.push({
    page: path,
    performance: perf == null ? "UNSCOREABLE" : Math.round(perf * 100),
    FCP: fcp ?? "—",
    LCP: lcp ?? "—",
    lcpElement: node ? node.selector.replace(/^.*?([a-z0-9#.\-]+ > [a-z0-9#.\-]+)$/i, "$1") : "NONE",
    verdict: problems.length ? problems.join(", ") : "ok",
  });
}

await chrome.kill();
console.table(rows);

if (failures) {
  console.error(
    `\nFAIL  ${failures} of ${PAGES.length} pages do not paint measurably.\n` +
      `      A page that renders for a human but emits no contentful paint cannot be\n` +
      `      scored, cannot report Core Web Vitals, and looks fine while being invisible\n` +
      `      to every measurement. Check for above-the-fold content that animates in from\n` +
      `      opacity 0 with a delay — use a transform-only entrance instead.`,
  );
  process.exit(1);
}
console.log(`\nPASS  all ${PAGES.length} pages emit a contentful paint and identify an LCP element.`);
