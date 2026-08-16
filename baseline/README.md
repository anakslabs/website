# Baseline — the control the motion layer was measured against

Everything in this directory describes the homepage **as it was before the
motion layer**, recorded at commit `a471c75`. It is frozen: the scripts never
write here again. It exists so that "did this regress?" has a numeric answer
instead of an opinion, and so that what the old homepage already got wrong is
on the record as inherited rather than blamed on the new work.

**The current homepage lives in `../verification/`**, recorded by the same
scripts in the same way. Diff the two to see what the motion layer changed.

| | `baseline/` | `verification/` |
| --- | --- | --- |
| what | the outgoing homepage | the homepage as it stands now |
| regenerated | never | on every run |
| copy inventory | 82 strings | the current frozen inventory |
| role in `verify` | reported as a delta, never fails | the hard gate |

The split matters: a redesign is allowed to change copy, and a build regression
is not. `verify-acceptance.mjs` fails if the *current* page drops one of its own
strings, and merely reports how the current copy differs from the outgoing
page's, because that difference is a decision somebody made on purpose.

## Files

| File | What it is |
| --- | --- |
| `BASELINE.json` | Every recorded number in one place. Diff against `../verification/BASELINE.json`. |
| `copy-strings.json` | The 82 visible strings the outgoing homepage served. `verify` reports how many of them the current page still carries; it does not fail on the difference. |
| `lighthouse.json` | Both Lighthouse runs, with the numeric metrics and the evidence behind each failing audit. |
| `report.json` | Screenshot-pass output: paint metrics, weights, overflow sweep, degraded modes. |
| `*-top.png` | Above the fold at rest, after the entrance animation settles (1440 / 768 / 390). |
| `*-entrance.png` | The same three widths at network-idle, mid-fade — what a visitor sees on the way in. |
| `*-full.png` | Full page, scrolled through first so the reveals have fired. |
| `nojs-1440-*.png` | Scripting disabled. |
| `reducedmotion-1440-top.png` | `prefers-reduced-motion: reduce`. |
| `nobundle-*.png` | First paint with every `.js` request aborted. |

## Re-running

One server, three scripts, in this order. All paths are relative to the repo
root, and `npm install` must have been run once.

```sh
node scripts/serve.mjs 4311 &

node scripts/lighthouse.mjs http://localhost:4311 --runs 2 \
      --json verification/lighthouse.json --expect-lcp h1
node scripts/snapshot.mjs        http://localhost:4311 --out verification
node scripts/record-baseline.mjs http://localhost:4311 --out verification
```

`--expect-lcp h1` is not optional decoration. Type that animates in from
opacity 0 still looks correct on screen while being permanently disqualified
from Largest Contentful Paint candidacy, so the only way to catch the
regression is to assert which element Lighthouse attributed LCP to.

Then, to check the site against what was recorded:

```sh
node scripts/verify-acceptance.mjs http://localhost:4311
```

`npm run serve` / `lighthouse` / `snapshot` / `record` / `verify` are the same
commands.

**Use `scripts/serve.mjs`, not a generic static server.** It reproduces two
things about Vercel that a naive local server gets wrong and that then read as
site defects: production's `cache-control: public, max-age=0, must-revalidate`
(a server sending `no-store` fails Lighthouse's bf-cache audit), and a 200 for
`/_vercel/insights/script.js` (off Vercel it 404s and fails errors-in-console).
Measured with `http-server -c-1`, this homepage scores **best-practices 96**;
measured with `serve.mjs`, it scores **100**. Both failures were the harness.

Every script exits non-zero on failure and prints the evidence — the selector,
the two colours, the element and its box — not just the verdict.

## What each script checks

**`verify-acceptance.mjs`** — 43 checks, no browser, reads response text only.
Copy present in server HTML with JavaScript disabled, against both `index.html`
and the frozen `verification/copy-strings.json`; one h1 and no skipped heading
levels; the recorded section ids and h2 count still present; canonical, `html lang`, meta
description, Open Graph and Twitter tags; JSON-LD parses and declares
`Organization` and `Service`; every `<img>` has `alt`, `width` and `height`;
every internal link on the homepage resolves; robots.txt names and allows
GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot and Google-Extended and links
the sitemap; every sitemap URL resolves.

**`snapshot.mjs`** — Playwright. Screenshots; paint metrics and CLS; transferred
weight by resource type; scripting disabled; reduced motion; the horizontal
overflow sweep across 16 widths from 320 to 1600; first paint with the JS bundle
blocked, **judged on visible pixels** (greyscale ink share of the screenshot),
not DOM presence, because a heading sitting at opacity 0 is not copy anyone can
read; a hero opacity check that fails unless the H1 and its parent are already
opaque in the first sampled frame; a reveal sweep driven through the page's own
dot rail; and a **focus sweep** that tabs the whole page in three modes
(desktop, mobile, reduced-motion), reading each stop twice — opacity the instant
focus arrives, position after motion settles. A reveal that has to be waited out
is a reveal that can be tabbed past, so those are two different failures and are
reported separately.

**`lighthouse.mjs`** — mobile preset, two runs. Prints both and flags any
category whose two runs differ by more than 2 points, because one Lighthouse
number is not reproducible enough to be a baseline.

**`verify-paint.mjs`** — every page in the sitemap, not just the homepage. Each
must complete a Lighthouse run without a `NO_FCP` error and must have an
identified LCP element. This is the guard behind a defect that shipped
unnoticed: `/clinics/` rendered correctly for a human while emitting no
contentful paint, so it could not be scored at all and reported no Core Web
Vitals. Nothing looked wrong. Its sibling pages escaped only because they happen
to carry an unanimated form label or footer line that paints first — luck, not
design, which is what this check replaces.

**`record-baseline.mjs`** — reads what the other two wrote, adds the structural
inventory off the wire, writes `BASELINE.json` and `copy-strings.json`.

## Ported from, and what is missing

The harness is a port of `../website-next/scripts/{verify-acceptance,snapshot,lighthouse}.mjs`.
Playwright, Lighthouse and sharp are all available here, so no check is degraded
for want of a tool — `--headless` Chrome was not needed as a fallback.

What did not come across, and why:

- **The DESIGN-SPEC source rules** (effective-alpha compositing, the §3.3
  placement table, the rank ladder, banned words, the no-hardcoded-price rule,
  `--cite` usage, backdrop-filter / text-shadow / scroll-snap bans). These read
  the Next.js app's TypeScript content and token modules. There is no equivalent
  source of truth in this repo — the copy lives in the HTML — so porting them
  would have meant inventing a spec this site was never built to.
- **Copy extracted from typed content modules.** Replaced by extraction from
  `index.html`, plus the frozen `copy-strings.json`, which is the stronger check
  for this job: it is what fails when a homepage replacement drops a sentence.
- **FAQ `<details>`, form, and consent-checkbox checks.** The homepage has no
  FAQ block and no form; both live on `/clinics/` and `/contact/`. Not ported —
  this baseline is the homepage.
- **hreflang assertions.** Single language, no alternates emitted; there is
  nothing to assert.

## Five defects whose visible symptom was absent

All of them shipped or nearly did. All were found by a person, not by this harness, and all
four are the same shape: **the page rendered correctly and something underneath
it was wrong.** A check that only looks at what was painted passes every one of
them. They are written together because the set is the lesson, not any one
alone.

**A guard that returns before `preventDefault()` does not decline the gesture —
it hands it to native scrolling.** The deck's wheel handler read
`if (Math.abs(ev.deltaY) < 6) return;`, which is correct for a mouse wheel
emitting one delta of about 100. A trackpad emits a stream of 3–5px deltas, and
every one was discarded individually; because the guard returned before
`preventDefault()`, the browser scrolled the page a few pixels each time. So the
page moved, which looked like sluggishness, while the deck never advanced at
all. Reported as "the text appears too late, about two scrolls"; measured, fine
trackpad scrolling did not reach section 2 after six full gestures.

This harness had been passing that check for weeks, because a synthetic wheel
event defaults to one large delta — it had only ever tested a mouse. The deck
input sweep in `snapshot.mjs` now drives four profiles, three of them trackpad,
and asserts that one burst of deltas advances exactly one section. Negative-
tested by reinstating the old guard: the mouse-wheel profile still passes and
both fine-trackpad profiles report DEAD, which is the whole point.

**A document that still reports a wider `scrollWidth` is still overflowing,
whatever the paint looks like.** The hero photograph was set to bleed 4vw past
the viewport edge, and `body{overflow-x:clip}` was added so it would not create
a scrollbar. The page looked right. `document.documentElement.scrollWidth` still
came back 40–80px wider than `innerWidth` at every desktop width from 901px up,
and a real horizontal scroll was reachable. `clip` changed the appearance and
not the fact. The bleed now stops at the viewport edge; the overflow sweep
additionally scrolls to `x=9999` and asserts `scrollX` is still 0, because
measuring the geometry alone was what let this through the first time.

**Fixing the deaf deck made it greedy, and the harness could not see that
either.** Once every delta counted, the momentum a trackpad keeps emitting for
up to two seconds after the fingers lift banked into a second advance the moment
the 760ms snap released: one flick, two sections. It did not reproduce under
instrumentation for the same reason the first failure did not — Chrome's own
scroll synthesizer stops dead at the end of the gesture. On macOS the momentum
comes from the OS and Chrome only forwards it, so **CDP cannot generate a
momentum tail at all** and the tail has to be driven frame by frame with
`Input.dispatchMouseEvent`. Driven that way across the plausible range of decay
constants, 9 of 12 flicks overshot, almost all by exactly one section.

The fix is not a cooldown — a cooldown long enough to outlast the tail also
makes a genuine long swipe stutter. It is that **coasting only ever slows
down**: the gesture remembers its own peak, and deltas that fall well under it
stop counting until they climb back, which only a hand can do. Note that the
test is against the gesture's peak rather than against the previous delta,
because a quantised tail ties on consecutive frames and "smaller than the last
one" reads a tie as a push. `snapshot.mjs` now asserts both directions — one
flick lands exactly one section, and a swipe that never lifts keeps walking
without skipping — because this regressed twice, in opposite directions.

**A broken `<img>` is not a broken page, and nothing here was looking at the
files.** `scripts/build-artwork.mjs` emptied its whole output directory before
writing the tiles it owns, which deleted `assets/artwork/specimen.*` — the
specimen screenshot, which is a screenshot and not something that script
generates. The markup went on pointing at it. Lighthouse still scored 100, the
copy checker still found every string, the overflow sweep was still clean, and
the section still had its heading, its paragraphs and its link in the right
places. The only symptom was alt text where a screenshot should have been, in a
section no checker had a reason to open. `scripts/verify-assets.mjs` now parses
every page for every same-origin URL it references — `src`, every candidate in
every `srcset`, `href`, and `url()` in both inline and linked CSS — and fetches
each one. Parsed rather than observed in a browser, because a lazily-loaded
image below the fold is never requested and watching the network would not have
caught this one. The build's sweep now deletes only the files it emits.

**A counter is not a set, and the difference was a feature that never ran.** The
hero's search field types a query; the CTA has a second copy of the same field.
The loop sleeps whenever no field is on screen, and "no field is on screen" was
tracked by incrementing a counter per intersecting target and decrementing per
non-intersecting one. An IntersectionObserver reports **every** target on its
first callback, so the CTA's field — correctly off screen at the top of the
page — decremented what the hero's field had just incremented, the total came
to zero, and the loop went to sleep before typing a single character. The page
looked completely normal: the field held the query that is in the markup, which
is exactly what it is supposed to show under reduced motion, so there was
nothing to see. Held as a `Set` of visible elements it cannot go wrong this way.
`snapshot.mjs` now samples the field for six seconds in both motion modes and
fails if it does not type, if it types when asked not to, or if its line box
ever changes size — that last one because a typing loop is the classic way to
turn a CLS of 0 into something.

## Known limits of these numbers

- Transfer sizes are measured against a local server that does not compress.
  Vercel serves HTML, CSS and JS brotli-compressed, so those three are smaller
  in production. Font and image bytes are already compressed and are identical.
- Lighthouse over localhost has no network latency. Treat the category scores as
  meaningful and the raw millisecond timings as a floor.
- **A transparent first frame does not lose LCP; a delayed keyframe entrance
  does.** Re-adding `opacity: 0` with a *transition* still leaves the H1 as the
  LCP element — the transparent state lasts about a frame. Reproducing a
  keyframe entrance with `animation-delay: 200ms`, which is what the outgoing
  homepage and every page still on `site.css` use, does reproduce the failure:
  LCP falls through to whatever else is on screen, and the browser emits no
  `first-contentful-paint` entry at all, which makes Lighthouse abort the run
  with `NO_FCP` and refuse to score the page. The exclusion needs a *sustained*
  transparent paint. Transform-only above the fold is the construction that
  cannot get this wrong, and `--expect-lcp` is what catches it if someone does.
- **The Playwright LCP probe is unreliable in this environment, independent of
  the page.** A control page containing nothing but an `<h1>` also reports no
  `largest-contentful-paint` entry. Treat `lcpMs`/`lcpElement` in `report.json`
  as absent-by-default and use Lighthouse's `lcp-breakdown-insight`, which
  `lighthouse.mjs` reads and `--expect-lcp` asserts, as the real signal. The
  pre-motion numbers in this directory record the probe's nulls; they are not
  evidence that the old page emitted no LCP, though Lighthouse separately
  confirmed it identified no LCP element.
