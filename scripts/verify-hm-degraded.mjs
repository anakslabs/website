import { chromium } from "playwright";
const BASE = "http://localhost:4399";
const b = await chromium.launch();
let fails = 0;
const say = (ok, msg, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${msg}${extra ? " — " + extra : ""}`); };

// 1. reduced motion: the answer card must be shown resolved
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p = await c.newPage();
  await p.goto(BASE + "/", { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const g = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    return {
      h1: Number(g("main h1").opacity), ans: Number(g(".hm-ans").opacity),
      /* .hm-read and .hm-report were the dark card's sources row and monthly
         panel. The mock is a light assistant reply now: the citation lives in
         the inline chip row, and the monthly list moved into the monthly
         section where it was already named. */
      src: Number(g(".chiprow").opacity), card: Number(g(".hm-answer").opacity),
      /* .hm-lead was the old hero's opening paragraph and the homepage no
         longer has one — the cinematic rebuild opens on a title card whose
         lead is .cin-lead. Same element, same job, one class later, so the
         assertion follows it rather than being deleted; the fallback keeps
         this line honest on any page that still serves .hm-lead. Same call
         the .hm-read / .hm-report note above records. */
      report: Number(g(".hm-composer").opacity),
      lead: Number((g(".cin-lead") ?? g(".hm-lead")).opacity),
      mark: g(".hm-ans mark").backgroundColor,
      reveals: [...document.querySelectorAll("[data-reveal]")].map((e) => Number(getComputedStyle(e).opacity)).filter((o) => o < 1).length,
    };
  });
  console.log("  reduced-motion:", JSON.stringify(r));
  say(r.h1 === 1 && r.lead === 1 && r.card === 1 && r.report === 1, "reduced motion: hero is fully opaque");
  say(r.ans === 1 && r.src === 1, "reduced motion: the answer and its sources are shown resolved");
  say(!/rgba\(0, 0, 0, 0\)|transparent/.test(r.mark), "reduced motion: the name is already marked", r.mark);
  say(r.reveals === 0, "reduced motion: no [data-reveal] block is left transparent", `${r.reveals} hidden`);
  await c.close();
}

// 2. scripting disabled: everything must still be readable
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p = await c.newPage();
  for (const path of ["/", "/products/", "/articles/", "/about/", "/contact/"]) {
    await p.goto(BASE + path, { waitUntil: "load" });
    /* The hero entrances are CSS keyframes, and CSS keyframes run with
       scripting disabled — that is the point of building them that way. The
       longest chain on the home page is the answer card's sources at a 2500ms
       delay plus 500ms, so sampling at load reported four settling elements as
       four permanently invisible ones. Waited out, and the offenders are named
       rather than counted, because "1 invisible" is not a bug report. */
    await p.waitForTimeout(3600);
    const r = await p.evaluate(() => ({
      hidden: [...document.querySelectorAll("main *")].filter((e) => {
        const cs = getComputedStyle(e);
        return Number(cs.opacity) === 0 && e.textContent.trim().length > 0;
      }).map((e) => e.tagName.toLowerCase() + "." + (typeof e.className === "string" ? e.className.trim().split(/\s+/).join(".") : "")),
      chars: document.querySelector("main").innerText.replace(/\s+/g, " ").trim().length,
    }));
    say(r.hidden.length === 0 && r.chars > 400, `no-JS ${path}: all copy painted`, `${r.chars} chars` + (r.hidden.length ? `, invisible: ${r.hidden.join(", ")}` : ""));
  }
  await c.close();
}

// 3. the mobile nav toggle
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  for (const path of ["/", "/products/", "/articles/", "/about/", "/contact/"]) {
    await p.goto(BASE + path, { waitUntil: "networkidle" });
    const before = await p.locator("#site-nav").evaluate((e) => getComputedStyle(e).display);
    await p.locator(".nav-toggle").click();
    const open = await p.locator("#site-nav").evaluate((e) => getComputedStyle(e).display);
    const aria = await p.locator(".nav-toggle").getAttribute("aria-expanded");
    await p.locator("#site-nav a").first().click();
    await p.waitForTimeout(200);
    say(before === "none" && open === "flex" && aria === "true",
        `mobile nav toggles on ${path}`, `${before} -> ${open}, aria-expanded=${aria}`);
  }
  await c.close();
}
await b.close();
console.log(fails ? `\n${fails} failure(s)` : "\nAll degraded-mode checks pass.");
process.exit(fails ? 1 : 0);
