#!/usr/bin/env python3
"""Measure the structural difference between the two specimen builds.

This is the script that produced the numbers in the diff panel on
/clinics/example/. It reads the HTML each URL serves — the bytes, before any
JavaScript runs — and counts five things:

  1. headings a machine can read   <h1>-<h6> whose text content is not empty
  2. headings shipped as a picture <h1>-<h6> whose text content is empty and
                                   which contain at least one <img>
  3. FAQ schema                    an application/ld+json block declaring
                                   "@type": "FAQPage"
  4. structured data blocks        <script type="application/ld+json"> elements
  5. body text characters          every text node outside <script> and
                                   <style>, whitespace collapsed to single
                                   spaces, then measured in characters

Run it against the files on disk:

    python3 tools/measure-specimen.py \
        clinics/example/before/index.html clinics/example/after/index.html

or against a running server:

    python3 tools/measure-specimen.py \
        http://localhost:8000/clinics/example/before/ \
        http://localhost:8000/clinics/example/after/

Pass --section=<id> to also report the text characters inside one element,
which is how the FAQ subtotal quoted on the page was produced.

No third-party packages. Standard library only, so the numbers are
reproducible on any machine with Python 3.
"""

import json
import re
import sys
from html.parser import HTMLParser

HEADINGS = {"h1", "h2", "h3", "h4", "h5", "h6"}
SKIP_TEXT_IN = {"script", "style"}
VOID = {"img", "br", "hr", "meta", "link", "input", "source", "area", "col",
        "base", "embed", "param", "track", "wbr"}


class Measure(HTMLParser):
    """Collect headings, ld+json blocks and body text from a served document."""

    def __init__(self, section_id=None):
        super().__init__(convert_charrefs=True)
        self.stack = []           # names of the currently open elements
        self.body_text = []       # text nodes outside <script> / <style>
        self.headings = []        # one {"text", "imgs"} record per h1-h6
        self.ldjson = []          # raw contents of each ld+json block
        self.section_id = section_id
        self.section_text = []
        self._heading = None      # the heading currently being read, if any
        self._ldjson = False
        self._section_depth = None

    def _in_skip(self):
        return any(tag in SKIP_TEXT_IN for tag in self.stack)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)

        if tag == "script" and (attrs.get("type") or "").strip() == "application/ld+json":
            self._ldjson = True
            self.ldjson.append("")

        if tag == "img" and self._heading is not None:
            self._heading["imgs"] += 1

        if tag in HEADINGS:
            self._heading = {"text": "", "imgs": 0}
            self.headings.append(self._heading)

        if self.section_id and self._section_depth is None and attrs.get("id") == self.section_id:
            self._section_depth = len(self.stack)

        if tag not in VOID:
            self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag == "script":
            self._ldjson = False
        if tag in HEADINGS:
            self._heading = None
        while self.stack:
            popped = self.stack.pop()
            if (self._section_depth is not None
                    and len(self.stack) < self._section_depth):
                self._section_depth = None
            if popped == tag:
                break

    def handle_data(self, data):
        if self._ldjson:
            self.ldjson[-1] += data
            return
        if self._in_skip():
            return
        self.body_text.append(data)
        if self._heading is not None:
            self._heading["text"] += data
        if self._section_depth is not None:
            self.section_text.append(data)


def collapse(chunks):
    """Join text nodes and collapse every run of whitespace to one space."""
    return re.sub(r"\s+", " ", "".join(chunks)).strip()


def ldjson_types(blocks):
    """Every @type declared across the ld+json blocks, in document order."""
    types = []
    for raw in blocks:
        try:
            data = json.loads(raw)
        except ValueError:
            types.append("(unparseable)")
            continue
        if isinstance(data, dict):
            nodes = data.get("@graph", [data])
        else:
            nodes = data
        if not isinstance(nodes, list):
            nodes = [nodes]
        for node in nodes:
            if isinstance(node, dict) and node.get("@type"):
                types.append(node["@type"])
    return types


def measure(html, section_id=None):
    p = Measure(section_id=section_id)
    p.feed(html)

    readable = sum(1 for h in p.headings if collapse([h["text"]]))
    as_image = sum(1 for h in p.headings
                   if not collapse([h["text"]]) and h["imgs"] > 0)
    types = ldjson_types(p.ldjson)

    return {
        "headings_readable": readable,
        "headings_as_image": as_image,
        "faq_schema": "FAQPage" in types,
        "ldjson_blocks": len(p.ldjson),
        "ldjson_types": types,
        "body_text_chars": len(collapse(p.body_text)),
        "section_text_chars": len(collapse(p.section_text)) if section_id else None,
    }


def load(target):
    if target.startswith(("http://", "https://")):
        from urllib.request import urlopen
        with urlopen(target) as response:
            return response.read().decode("utf-8")
    with open(target, encoding="utf-8") as f:
        return f.read()


def main(argv):
    section_id = None
    targets = []
    for arg in argv[1:]:
        if arg.startswith("--section="):
            section_id = arg.split("=", 1)[1]
        else:
            targets.append(arg)

    if not targets:
        print(__doc__)
        return 1

    for target in targets:
        r = measure(load(target), section_id=section_id)
        print("=" * 72)
        print(target)
        print("  headings a machine can read      %d" % r["headings_readable"])
        print("  headings shipped as a picture    %d" % r["headings_as_image"])
        print("  FAQ schema                       %s" % ("yes" if r["faq_schema"] else "no"))
        print("  structured data blocks           %d%s" % (
            r["ldjson_blocks"],
            "  [" + ", ".join(r["ldjson_types"]) + "]" if r["ldjson_types"] else ""))
        print("  body text characters             %d" % r["body_text_chars"])
        if section_id and r["section_text_chars"] is not None:
            print("  text characters inside #%s%s%d" % (
                section_id, " " * max(1, 25 - len(section_id)), r["section_text_chars"]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
