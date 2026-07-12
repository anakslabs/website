# Anaks Labs — website

Static multi-page site (no build step, no framework) deployed on Vercel.
The whole site inherits one design system from `assets/site.css` + `assets/site.js`.

## Structure

```
index.html            Home (coming-soon hero, video background)
products/index.html   SaaS portfolio
about/index.html      Company / mission
contact/index.html    Email + KakaoTalk
blog/index.html       Post list
blog/hello/index.html First post (stub)
assets/site.css       Shared styles (design tokens, layers, header/footer, cards)
assets/site.js        Shared JS (EN/KO i18n, particles, hero video, mobile nav)
sitemap.xml           All URLs · robots.txt
```

Each page keeps its own `<title>`/meta/OG tags and a `window.ANAKS_I18N` block
(page-specific EN/KO strings). The chosen language is stored in `localStorage`
and follows the visitor across pages.

## Preview locally

Clean URLs (`/products/`) need a real server — `file://` won't resolve them.

```
python3 -m http.server 8000   # then open http://localhost:8000
```

## Add a blog post (copy → edit → list)

1. Copy `blog/hello/` to `blog/<slug>/` (e.g. `blog/first-launch/`).
2. Edit its `<title>`, `window.ANAKS_I18N` (title/date/body), and `<time>`.
3. Add a `<li>` link in `blog/index.html` and a `<url>` in `sitemap.xml`.
