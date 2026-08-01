# Anaks Labs — website

Static multi-page site (no build step, no framework) deployed on Vercel.
The whole site inherits one design system from `assets/site.css` + `assets/site.js`.

## Structure

```
index.html            Root — English product landing, industry-neutral
clinics/index.html    Clinics vertical — the audit findings and the clinic offer
about/index.html      Company, corporate information, link to the notices board
blog/index.html       Statutory public notice board (Korean — legal, do not move)
blog/hello/index.html First company notice
products/index.html   Korean corporate portfolio page (kept, unlinked from root)
contact/index.html    Korean contact page (kept, unlinked from root)
assets/site.css       Shared styles (design tokens, layers, header/footer, cards, landing)
assets/site.js        Shared JS (KO/EN i18n, particles, hero video, mobile nav, reveal)
sitemap.xml           All URLs · robots.txt
```

### Verticals

The root sells the product in industry-neutral terms and carries **no figures**
— we only have measured data for clinics, so every measured claim lives on
`clinics/`. A new vertical is a new sibling directory (`restaurants/`, …) plus
one more card in the root's "Who we build for" section. Never list a vertical
there that does not have a live page behind it.

### Languages

The root is **English only** and opts out of the i18n engine entirely with
`<html lang="en" data-no-i18n>`.

`about/` is bilingual but defaults to English via `<html data-lang-default="en">`;
a visitor's explicit choice (the 한국어 / English toggle) still wins and is
persisted to `localStorage`. The remaining Korean corporate pages
(`products/`, `contact/`, `blog/`) are unchanged and still default to Korean.

### Public notices (legal)

`blog/` is the statutory public notice board for 주식회사 아낙스랩스. Its URL is
the company's published electronic-notice location, so **the path must not
change**. It is linked from the root footer and from `about/`.

## Preview locally

Clean URLs (`/about/`) need a real server — `file://` won't resolve them.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Add a public notice (copy → edit → list)

1. Copy `blog/hello/` to `blog/<slug>/` (e.g. `blog/shareholder-notice/`).
2. Edit its `<title>`, `window.ANAKS_I18N` (title/date/body), and `<time>`.
3. Add a `<li>` link in `blog/index.html` and a `<url>` in `sitemap.xml`.
