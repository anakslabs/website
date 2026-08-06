#!/usr/bin/env python3
"""Print each page's large type only, with the small-print layer stripped out.

The site has two layers of copy. The large type is the argument, written for
one reader: the practice owner. The small print underneath it — `.src`, the
`<small>` inside a metric or a stat number, the `.method` block on the specimen
page — is evidence. It is there so the large type is believed, and most readers
will never read it.

That only works if it can be skipped. This script removes the small-print layer
and prints what is left, so you can read the page back the way someone who
skips it does. If the argument no longer closes — a dangling "see the table
below", a claim whose subject only appears in a footnote, a section that stops
making sense — then the large type is leaning on the small print and needs
rewriting. That is the defect this catches.

It only reads; it never edits a page.

    python3 tools/skip-test.py                    # every page
    python3 tools/skip-test.py clinics/index.html # one page

No third-party packages. Standard library only.
"""

from __future__ import annotations

import html
import re
import sys
from pathlib import Path

# Pages that carry an argument. The specimen builds are excluded on purpose:
# they are artefacts being measured, not pages making a case.
#
# Every article is listed here by hand rather than globbed. A glob would quietly
# start passing the day an article is added, and this list is the record of which
# pages are meant to survive being skimmed — a new article has to be put on it
# deliberately, and running this script with no arguments has to cover all of
# them. Do not replace the article entries with a directory scan.
DEFAULT_PAGES = [
    "index.html",
    "clinics/index.html",
    "clinics/example/index.html",
    "sources/index.html",
    "about/index.html",
    "articles/index.html",
    "articles/patients-ask-ai-first/index.html",
    "articles/ask-an-assistant-about-your-practice/index.html",
    "articles/why-the-ai-quotes-your-competitor/index.html",
    "articles/beautiful-but-invisible/index.html",
    "articles/what-patients-see-what-machines-receive/index.html",
    "articles/what-a-machine-can-tell-checklist/index.html",
    "articles/what-monthly-content-actually-does/index.html",
    "articles/redesign-or-rebuild/index.html",
    "articles/counting-inquiries-not-people/index.html",
    "articles/evaluating-an-agency-seo-claims/index.html",
]

# The small-print layer, in the order it has to come out.
#
# Not every <small> belongs to it. The one riding on a .stat-num ("of US adults
# — about 66 million people") and the one on a .diff-val ("of 5 titles") are the
# subject and the denominator of their numbers — read at 15px next to the
# figure, they are part of the claim, and stripping them would fake a failure by
# leaving a percentage with nothing to be a percentage of. Only the <small>
# inside a .diff-metric is evidence: it says what was counted.
STRIP = [
    (r"<head>.*?</head>", "head"),
    (r"<script.*?</script>", "scripts"),
    (r"<svg.*?</svg>", "charts"),
    (r"<header.*?</header>", "site header"),
    (r"<footer.*?</footer>", "site footer"),
    (r'<p class="src">.*?</p>', ".src source lines"),
    (r'<div class="method".*?</div>\s*</div>\s*</section>', ".method block"),
    (r'(<p class="diff-metric">[^<]*)<small>.*?</small>', ".diff-metric definitions"),
]

INDENT = {"h1": "H1   ", "h2": "H2   ", "h3": "  h3 ", "p": "     ", "li": "   · "}


def large_type(markup: str) -> list[tuple[str, str]]:
    """Return [(tag, text)] for the copy that survives the strip."""
    for pattern, _ in STRIP:
        # a capturing group means "keep group 1, drop the rest of the match"
        markup = re.sub(pattern, r"\1" if "(" in pattern else "", markup, flags=re.S)
    # .method is closed by two divs and a section; if that shape ever changes the
    # regex above quietly does nothing, so fail loudly rather than pass a page
    # that still has its method block in it.
    if 'class="method"' in markup:
        raise SystemExit(
            "skip-test: the .method block did not strip — its markup shape changed.\n"
            "Fix the pattern in STRIP before trusting this output."
        )
    out: list[tuple[str, str]] = []
    for m in re.finditer(r"<(h1|h2|h3|p|li)\b[^>]*>(.*?)</\1>", markup, re.S):
        tag = m.group(1)
        text = html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))
        text = re.sub(r"\s+", " ", text).strip()
        if text:
            out.append((tag, text))
    return out


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parent.parent
    pages = argv[1:] or DEFAULT_PAGES
    missing = [p for p in pages if not (root / p).exists()]
    if missing:
        print(f"skip-test: no such page: {', '.join(missing)}", file=sys.stderr)
        return 2

    for page in pages:
        markup = (root / page).read_text(encoding="utf-8")
        print("=" * 78)
        print(f"{page}   — large type only, small print stripped")
        print("=" * 78)
        for tag, text in large_type(markup):
            print(f"{INDENT[tag]}{text}")
        print()

    print("Read each page back as written above. It passes if the argument")
    print("closes without the small print: no sentence depends on a footnote,")
    print("and no claim loses its subject.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
