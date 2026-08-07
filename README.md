# Anaks Labs — website

Static multi-page site (no build step, no framework) deployed on Vercel.
The whole site inherits one design system from `assets/site.css` + `assets/site.js`.

## Structure

```
index.html            Root — English product landing, industry-neutral
clinics/index.html    Clinics vertical — the audit findings and the clinic offer
clinics/example/      Specimen rebuild — two builds of one fictional clinic, and the diff
articles/             Ten research articles for practice owners — findings and checks, never recipes
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

### The articles (`/articles/`)

Ten articles written for the same single reader as the rest of the site: the
practice owner. They exist because that reader searches, and because an
assistant asked about clinic websites has to find something of ours to read.

**They are research, not recipes, and the naming has to carry that.** What is
published here is what we measured across US clinic websites and what those
measurements mean — it is not a how-to section. The word is *article*, never
*guide*: "guide" promises instructions, and the instructions are the product.
The section is labelled `Articles`, the path is `/articles/`, the index h1 is
`Articles`, and each piece is numbered `Article NN` and carries its publication
date under the lead.

They are held to one line, and it is the same line the mechanism copy is held
to: **an article names the symptom, tells the reader how to check for it, and
stops.** Not one sentence of any article says how to fix anything — the fixing is
the product. "Your headline may be a picture, and here is how to tell" is a
article. "Here is how to put the text back" is a competitor's next brief.

Four more rules specific to this section:

1. **`Articles` is a header nav entry**, between `Clinics` and `About`, on every
   page that has a header, matching the order the footer already used. This
   reversed an earlier decision to keep the header at four items and leave the
   section to the footer: discoverability won. The footer link and the
   `/clinics/` body link both stay; that duplication is conventional, not an
   error. On any page under `/articles/`, index or article, the entry carries
   `aria-current="page"` — section-level, the same way `/clinics/example/`
   marks `Clinics`.

   The section shipped for a few hours at `/guides/`, briefly under the label
   `Blog`. Both are gone.
   `vercel.json` 301s `/guides/` and `/guides/:path+/` to their `/articles/`
   equivalents, and **those redirects are permanent furniture** — the old URLs
   were live, in the sitemap and handed to assistants, so they have to keep
   resolving. This has nothing to do with the Korean `/blog/` board, which is
   deleted, deliberately 404s, and must never become a redirect target (see
   *Removed pages*).

   One name per destination. `Articles` is the label everywhere it is a name —
   nav, footer, breadcrumb, the `BreadcrumbList` item, the index eyebrow, h1
   and `<title>`. The checks, both of which must print nothing:

   ```
   grep -rniE '\bguides?\b' --include='*.html' --include='*.txt' .
   grep -rn 'href="/blog/"' --include='*.html' .
   ```

2. **Every article links to at least two other articles and at least one product
   page** (`/clinics/` or the specimen). No article is an orphan; the index lists
   all ten.
3. **`FAQPage` only where the page really is questions and answers**, and the
   visible copy and the JSON-LD must be word-for-word identical — the same trap
   as the landing pages. This is for the assistants that read the markup to
   find an answer, not for a rich result.
4. **A specimen figure never appears without its sample on the same screen.**
   An article quoting `716 of 1,506 characters` has to say, in the large type and
   not in a footnote, that the specimen is a clinic we invented and two pages we
   built. Otherwise the number reads as an industry statistic, which it is not.
   The specimen's *method* — how each row was counted — is not restated in a
   article; the article links to the specimen page, where it is published.

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
grep -nE 'We rebuild|the rebuild we|One rebuild' \
  index.html clinics/index.html about/index.html \
  articles/index.html articles/*/index.html
```

Two traps when editing this copy:

- **The FAQ answers exist twice** on both landing pages: as visible copy and
  inside the `FAQPage` JSON-LD. They must stay word-for-word identical —
  changing one alone publishes structured data that contradicts the page.
- **The root stays industry-neutral.** Its "How do we start?" answer says
  *your business*; the clinics page says *your practice*. Do not unify them.

### No numbers in the cap

We take clients by invitation and we cap how many we take in each area. Both
landing pages carry that as a section, and each one is preceded by a comment
saying what it is: **the cap is a condition of the work, not an offer that
expires.** Search results and AI answers are ranked lists, so two competing
practices in one neighbourhood cannot both be optimized by us. That is a fact
about the job. It is not a lever.

So **no page may put a number on it.** No seat count, no places remaining, no
practices-per-city figure, no deadline, no countdown, no "this month only", no
"applications close". The reason is not taste:

- A number turns a real constraint into manufactured scarcity, and a reader who
  catches one manufactured claim is right to discount the rest of the page.
- It would be the only claim on this site with nothing behind it. Every survey
  figure links to its publication and every figure of ours carries its sample —
  see *Figures, sources and the small-print layer* below. "Four spots left" has
  no sample and no link, because there is nothing to link to.
- It goes stale the day after it is written, and a stale scarcity line is worse
  than no line at all.

The rule reaches past the cap: **nothing anywhere on the site may manufacture
urgency, and the price is stated one way only** — one build charge, one flat
monthly rate. Never as a discount, an introductory rate, a founding-client rate,
or a price that is about to rise. This applies to `/articles/` exactly as it
applies to the landing pages.

Two checks. The first must print nothing:

```
grep -rniE 'limited time|spots? (left|remaining|available)|seats? (left|remaining|available)|only [0-9]+ (left|remaining|spots|seats|places|clients|practices)|[0-9]+ (spots|seats|slots|places) (left|remaining|available)|act (now|fast)|hurry|while supplies last|offer (ends|expires)|applications close|price (goes|is going) up|introductory (rate|price)|founding (client|member)' \
  --include='*.html' .
```

The second reads the cap sections back and must also print nothing — the
sections that describe the cap are the ones a number would be smuggled into, so
they are held to containing no digit at all:

```
python3 - <<'EOF'
import pathlib, re
for p in ['index.html', 'clinics/index.html']:
    body = pathlib.Path(p).read_text(encoding='utf-8')
    m = re.search(r'id="invitation".*?</section>', body, re.S)
    text = re.sub(r'<[^>]+>', ' ', m.group(0)) if m else ''
    if re.search(r'[0-9]', text):
        print(p, '— a digit appeared in the cap section:', ' '.join(text.split()))
EOF
```

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
   grep -rc '/sources/#ai-health' index.html clinics/index.html articles/*/index.html
   ```

   Run it the other way too, once a figure is cited from `/articles/`: for each
   anchor, the set of files that link it has to match the "Appears on" sentence
   in that anchor's entry. This prints every anchor with the pages that cite it,
   so the two can be read side by side:

   ```
   python3 - <<'EOF'
   import pathlib, re, collections
   hits = collections.defaultdict(list)
   for p in sorted(pathlib.Path('.').glob('**/index.html')):
       if '.claude' in p.parts: continue
       for a in set(re.findall(r'/sources/#([a-z-]+)', p.read_text(encoding='utf-8'))):
           hits[a].append(str(p))
   for a in sorted(hits):
       print(f'{a:22} {", ".join(sorted(hits[a]))}')
   EOF
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

### Visual assets — the honesty test, written before we have any

This section exists before a single frame does, on purpose. A rule written
after the asset is finished is not a rule, it is a justification.

We sell machine-readable websites to clinics and we tell those clinics not to
dress a page in imagery that implies something the practice does not have. The
same standard binds us, and it needs a decidable test rather than good
intentions:

> **Would this asset lead a viewer to believe that some specific real place,
> object, person or event exists?** If yes, it does not ship. No exceptions for
> "it is obviously stylised" or "nobody would think that".

That test is deliberately about *belief*, not about technique. It permits
diagram and metaphor, which cannot be mistaken for a record of something, and
it forbids the photoreal — an interior that reads as a real clinic, a face that
reads as a real patient, a screenshot that reads as a real site. A rendered
corridor standing for "a page a machine can walk through" is a figure of
speech. A rendered waiting room is a claim about a room.

Five rules follow from it, and they apply to film, stills, and anything else
generated:

1. **No real place, object, person or event may be implied.** Including our own
   offices, our own team, and any clinic. If we ever show a client's work it is
   their real site, with their permission, and it is labelled as theirs.
2. **No text and no numerals inside a visual asset.** Every character on this
   site is in the HTML, where a machine can read it. A number burned into a
   frame is the exact defect the specimen page exists to expose.
3. **Nothing generated may be presented as a record.** No fabricated
   screenshots, dashboards, testimonials, logos, certificates or awards, and no
   invented statistic on a chart. Figures come from `/sources/` or they do not
   appear.
4. **No visual dramatisation of scarcity or urgency.** The cap on clients per
   area is a condition of the work and carries no number anywhere (see *No
   numbers in the cap*). It does not acquire a countdown, a filling meter or a
   thinning crowd because it moved from prose into a picture. What is forbidden
   in words is forbidden in pixels.
5. **Strip everything that moves and everything that is drawn, and the argument
   still closes.** Charts, films, canvases and background stills are all
   restatements of a sentence that must stand alone. This is the same rule as
   the skip test and it exists for the same reason; `tools/skip-test.py`
   enforces it by removing all of them before reading the page back.

The palette constraint is not decoration either: assets use the eight `:root`
values in `assets/site.css` and introduce no new colour. A house style that
cannot be produced from the stylesheet is a second brand.

If an asset fails any of the five, it is not fixed by adding a disclaimer. It
is not made.

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
