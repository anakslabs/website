# Anaks Labs — website

Static multi-page site (no build step, no framework) deployed on Vercel.
The whole site inherits one design system from `assets/site.css` + `assets/site.js`.

## Structure

```
index.html            Root — English product landing, industry-neutral
clinics/index.html    Clinics vertical — the audit findings and the clinic offer
clinics/example/      Specimen rebuild — two builds of one fictional clinic, and the diff
about/index.html      Company and corporate information
blog/index.html       Statutory public notice board (Korean — legal, do not move)
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

The single exception is `blog/`, the statutory public notice board, which is
Korean because the notices themselves are a legal filing of a Korean company.
It is the only file in the repository that may contain Hangul — treat that as
a hard rule when reviewing changes. The syllable block is U+AC00–U+D7A3; this
check must print `blog/index.html` and nothing else:

```
grep -rlP '[\x{AC00}-\x{D7A3}]' . --exclude-dir=.git --exclude-dir=.claude
```

### Corporate identity on the English pages — on hold

The English pages name the company and nothing more:

| shown            | `Anaks Labs Co., Ltd.`, the English head-office address, `help@anakslabs.com` |
| ---------------- | ---------------------------------------------------------------------------- |
| **not shown**    | the director's name, any business registration number                        |

That omission is a decision, not an oversight: a US entity may be formed, so
which company the US-facing site belongs to is not settled. **Do not add a
director or a registration number to `index.html`, `clinics/` or `about/`** —
lifting this is a call for the project lead, not a tidy-up. The check:

```
grep -nE 'Director|director|registration number|business number|[0-9]{3}-[0-9]{2}-[0-9]{5}' \
  index.html clinics/index.html about/index.html
# must print nothing
```

The Korean legal footer on `blog/` is unaffected — it is the statutory
disclosure of the Korean company and stands whatever happens in the US.

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

The root sells the product in industry-neutral terms and carries **no figures**
— we only have measured data for clinics, so every measured claim lives on
`clinics/`. A new vertical is a new sibling directory (`restaurants/`, …) plus
one more card in the root's "Who we build for" section. Never list a vertical
there that does not have a live page behind it.

### Public notices (legal)

`blog/` is the statutory public notice board for Anaks Labs Co., Ltd. Its URL is
the company's published electronic-notice location, so **the path must not
change**. It is reachable from the footer of every English page and from the
corporate information list on `about/`.

To publish a notice: add a `post-list` entry in `blog/index.html` linking to a
new `blog/<slug>/` page, and add a `<url>` to `sitemap.xml`. Notices are written
in Korean; nothing else on the site is.

### Removed pages

`products/`, `contact/` and `blog/hello/` were Korean pages retired when the
site became English-only. `vercel.json` 301s those paths so old links and any
remaining search-engine records land somewhere sensible.

## Preview locally

Clean URLs (`/about/`) need a real server — `file://` won't resolve them.
Note that `vercel.json` redirects are applied by Vercel, not by a local server.

```
python3 -m http.server 8000   # then open http://localhost:8000
```
