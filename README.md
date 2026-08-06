# Anaks Labs — website

Static multi-page site (no build step, no framework) deployed on Vercel.
The whole site inherits one design system from `assets/site.css` + `assets/site.js`.

## Structure

```
index.html            Root — English product landing, industry-neutral
clinics/index.html    Clinics vertical — the audit findings and the clinic offer
clinics/example/      Specimen rebuild — two builds of one fictional clinic, and the diff
about/index.html      Company and corporate information
assets/site.css       Shared styles (design tokens, layers, header/footer, cards, landing)
assets/site.js        Shared JS (year stamp, particles, mobile nav, tabs, scroll reveal)
tools/                Repo scripts, not part of the site
sitemap.xml           All URLs · robots.txt · vercel.json (redirects)
```

### The specimen (`clinics/example/`)

We have no client rebuild we are allowed to publish, so the reference on the
site is a specimen: **both sides of it are ours.**

```
clinics/example/index.html          the specimen page — disclosure, viewer, diff, mechanism
clinics/example/before/index.html   fictional clinic, built in the shape the audit kept finding
clinics/example/after/index.html    the same content, rebuilt so a machine can read it
clinics/example/assets/             CSS/JS/images for the two builds only (never site.css)
tools/measure-specimen.py           produced the five numbers in the diff panel
```

Three rules hold this page up, and none of them is cosmetic:

1. **No real practice appears.** Not a screenshot, not a link, not anonymised
   copy. Specimen Dental is invented; both builds were written here. The
   disclosure sits at the top of the page, unfolded, and must stay there.
2. **The diff numbers are measured, never asserted.** They come from
   `tools/measure-specimen.py`, which parses the HTML each build serves with
   the standard library and counts. Change either build and re-run it:

   ```
   python3 tools/measure-specimen.py --section=questions \
     clinics/example/before/index.html clinics/example/after/index.html
   ```

   Then update the five `.diff-val` figures — three of which carry a
   denominator (`3 of 5`, `2 of 5`, `716 of 1,506`) — and the subtraction note
   in `clinics/example/index.html` to match. A number on that page that the
   script does not reproduce is a defect.

   The last row's denominator is what a **visitor** can read: the HTML body
   text plus the strings the page's own script injects, read out of the
   `SLIDES` array in `before.js`. That is why the before build's two figures
   differ and the after build's do not. Cross-check in a browser by loading
   the before build with JavaScript disabled (it reports the numerator) and
   enabled (one more than the denominator — inserting the slides splits a run
   of whitespace in two).
3. **Both builds are `noindex, nofollow`.** A fictional dental practice must
   never turn up in a search result. Only `clinics/example/` itself is
   indexable and in the sitemap.

### Language

The site is **English only**. There is no runtime i18n and no language toggle:
every page ships the language it is written in.

There are no longer any exceptions: **no file in the repository may contain
Hangul.** Treat that as a hard rule when reviewing changes. The syllable block
is U+AC00–U+D7A3; this check must print nothing at all:

```
python3 - <<'EOF'
import pathlib, re
han = re.compile('[\\uac00-\\ud7a3]')   # escaped, so this file stays clean itself
for p in sorted(pathlib.Path('.').rglob('*')):
    if p.is_file() and not {'.git', '.claude'} & set(p.parts) \
       and p.suffix in {'.html', '.css', '.js', '.xml', '.txt', '.json', '.md', '.py'} \
       and han.search(p.read_text(encoding='utf-8', errors='replace')):
        print(p)
EOF
```

**Do not use `grep -rlP` for this.** BSD grep, which is what macOS ships, has no
`-P`; it exits with a usage error that an eye skimming for output reads as a
clean pass. This check has to be able to fail.

### Corporate identity — settled

The site belongs to **Anaks Labs Inc.**, a US corporation. That name is the
`legalName` in the `Organization` JSON-LD on every page, the © line and the
legal line in every footer, and the "Legal name" row on `about/`. The brand
name shown to readers stays `Anaks Labs`; `legalName` carries the `Inc.`

| shown         | `Anaks Labs Inc.`, `contact@anakslabs.com`             |
| ------------- | ------------------------------------------------------ |
| **not shown** | any address, the director's name, a registration number |

The `Organization` node (`@id` `https://anakslabs.com/#org`) is **duplicated
word-for-word in `index.html` and `about/index.html`** — same `@id`, same
`description`. Changing the company description means editing both files in the
same commit; one alone publishes two different answers to "what is Anaks Labs?".
That description names **no vertical**: clinics is who we sell to today, not what
the company is, so `for businesses` stays and the vertical framing lives only on
`clinics/` and the specimen. The check, which must print two identical lines:

```
grep -ho '"description":"Anaks Labs Inc\.[^"]*"' index.html about/index.html
```

The address is omitted because the US one has not been supplied yet, not
because it is secret. **Do not invent a placeholder address** — when the real
one arrives it lands in the `footer-legal` line and a "Head office" row on
`about/`, in its own commit. The checks:

```
grep -rn 'legalName' --include='*.html' .   # every Organization node carries it
grep -rnE 'Co\., Ltd|Republic of Korea|Director|registration number' \
  --include='*.html' .                      # must print nothing
```

### "Build", not "rebuild" — on hold for nobody, this one is decided

Two segments buy this: clinics with a site worth rebuilding, and clinics with
no usable site at all — not open yet, dead domain, or nothing a crawler can
reach. **No page may state generically that what we do is a rebuild.** A
sentence that tells the reader what we will do *for them* must not presuppose
they already have a site; the thing we deliver is "the build".

Where a rebuild is a fact about one case — `clinics/example/` is a rebuild,
because there was a site to start from — the word is correct and stays. The
check, which must print nothing:

```
grep -nE 'We rebuild|the rebuild we|One rebuild' index.html clinics/index.html about/index.html
```

Two traps when editing this copy:

- **The FAQ answers exist twice** on both landing pages: as visible copy and
  inside the `FAQPage` JSON-LD. They must stay word-for-word identical —
  changing one alone publishes structured data that contradicts the page.
- **The root stays industry-neutral.** Its "How do we start?" answer says
  *your business*; the clinics page says *your practice*. Do not unify them.

### Verticals

The root sells the product in industry-neutral terms and carries **none of our
own measured figures** — we only have measured data for clinics, so every claim
we produced (`141`, `72%`, `1 in 3`) lives on `clinics/`. It may carry external
market figures, but only industry-neutral ones: the health figure is a vertical
claim and belongs on `clinics/` even though it is somebody else's research.
Sorting rule when a figure is added: *would this sentence still make sense to a
restaurant?* If not, it is not a root figure.

A new vertical is a new sibling directory (`restaurants/`, …) plus one more card
in the root's "Who we build for" section. Never list a vertical there that does
not have a live page behind it.

### Figures, sources and the small-print layer

Every figure anywhere on the site is listed on `sources/index.html` with its
sample, its field dates and the date its link was last checked. Three rules,
and the first is the one that keeps the page honest:

1. **No primary link, no figure.** If the original publication cannot be linked,
   the number comes off the page — it does not get softened, hedged or
   attributed to "studies". Aggregator blogs and second-hand citations are not
   sources. Our own three measurements are the only figures without an external
   link, and they carry their sample definition instead.
2. **Each `/sources/` entry states which pages it appears on.** That claim is
   checkable and goes stale the moment a figure moves between pages, so re-check
   it whenever one does:

   ```
   grep -c '/sources/#ai-health' index.html clinics/index.html
   ```

3. **The small print is evidence, not a second reader.** There is one reader:
   the practice owner. A page with a web person on staff has already fixed this,
   and if there is one, they work for a competing agency — so nothing on the site
   is written to them. Small print exists so the large type is believed, and it
   must survive being skipped. In practice:
   - it carries a source, a sample, or what was counted — never an explanation
     of a term, and never how to fix the problem, which is what we sell;
   - the mechanism copy names the **symptom** and stops there. "Text in a slider
     never reaches Google" is a symptom. "Put it back as real text" is a recipe
     for a competitor. Describing what **our** build does is neither — the
     specimen's after-caption is correct as written;
   - **the skip test, which every copy change must pass:** strip every `.src`,
     every `<small>` and the whole `.method` block, then read the page back. If
     the argument no longer closes on the large type alone, the large type is
     leaning on the small print and has to be rewritten.

   ```
   python3 tools/skip-test.py            # prints large type only, per page
   ```

### Removed pages

`products/`, `contact/` and `blog/hello/` were Korean pages retired when the
site became English-only. `vercel.json` 301s those paths so old links and any
remaining search-engine records land somewhere sensible.

`blog/` was the statutory Korean electronic-notice board of the former Korean
entity. It was deleted when the site became the site of Anaks Labs Inc., and it
is **not** redirected: the US company publishes no statutory notices, so the
path 404s deliberately. Do not resurrect `/blog/` as a redirect target.

## Preview locally

Clean URLs (`/about/`) need a real server — `file://` won't resolve them.
Note that `vercel.json` redirects are applied by Vercel, not by a local server.

```
python3 -m http.server 8000   # then open http://localhost:8000
```
