# Anaks Labs — website

Static multi-page site (no build step, no framework) deployed on Vercel.
The whole site inherits one design system from `assets/site.css` + `assets/site.js`.

## Structure

```
index.html            Root — English product landing, industry-neutral
clinics/index.html    Clinics vertical — the audit findings and the clinic offer
about/index.html      Company and corporate information
blog/index.html       Statutory public notice board (Korean — legal, do not move)
assets/site.css       Shared styles (design tokens, layers, header/footer, cards, landing)
assets/site.js        Shared JS (year stamp, particles, mobile nav, scroll reveal)
sitemap.xml           All URLs · robots.txt · vercel.json (redirects)
```

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
