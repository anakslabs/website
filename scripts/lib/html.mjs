/**
 * HTML reading helpers shared by the checkers.
 *
 * Nothing here parses with a DOM: every function operates on the response text
 * a server actually returned, which is the same condition the "works with
 * JavaScript disabled" criterion describes. A crawler that never runs the
 * bundle sees exactly these bytes.
 */

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  rarr: "→",
  larr: "←",
  copy: "©",
  hellip: "…",
  middot: "·",
  times: "×",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

export function decode(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (whole, name) => ENTITIES[name.toLowerCase()] ?? whole);
}

/** Collapse every run of whitespace, including the NBSPs the footer uses. */
export function norm(s) {
  return decode(s).replace(/[\s ]+/g, " ").trim();
}

const STRIPPABLE = /<(script|style|template|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * The whole page as one normalised string, tags replaced by a space.
 *
 * Replacing a tag with a space rather than nothing is deliberate: it is what
 * makes the check survive a motion layer that wraps each word in its own
 * element, and what makes it fail a layer that wraps each *character* — the
 * second really does destroy the sentence a crawler would otherwise be handed.
 */
export function textOf(html) {
  return norm(
    html.replace(STRIPPABLE, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " "),
  );
}

/** Does the string carry anything a reader would call content? */
function meaningful(s) {
  return s.length > 1 && /[\p{L}\p{N}]/u.test(s);
}

/**
 * Every visible text node, in document order, normalised and de-duplicated.
 *
 * This is the copy inventory: the list of strings the page promises to hand a
 * crawler. Each one is asserted to survive as a substring of `textOf()`.
 */
export function visibleStrings(html) {
  const body = html.replace(STRIPPABLE, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const seen = new Set();
  const out = [];
  for (const chunk of body.split(/<[^>]+>/)) {
    const s = norm(chunk);
    if (!meaningful(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/**
 * The document with script, style and comments removed — the elements a
 * browser actually builds a tree from.
 *
 * Element-level checks must run on this rather than on the raw response. A
 * stylesheet comment explaining why an <img> carries width and height is not
 * an <img>, and a check that counts it is reporting on its own prose. That
 * really happened: the alt-attribute and dimensions checks both failed on a
 * page whose every image was correct.
 */
export function markupOnly(html) {
  return html.replace(STRIPPABLE, " ").replace(/<!--[\s\S]*?-->/g, " ");
}

export function headingSequence(html) {
  return [...markupOnly(html).matchAll(/<(h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => ({
    level: Number(m[1][1]),
    text: norm(m[2].replace(/<[^>]+>/g, " ")),
  }));
}

export function sectionIds(html) {
  return [...markupOnly(html).matchAll(/<section\b[^>]*\sid="([^"]+)"/gi)].map((m) => m[1]);
}

/** Every element that opens a <section>, whether or not it carries an id. */
export function sectionCount(html) {
  return [...markupOnly(html).matchAll(/<section\b[^>]*>/gi)].length;
}

export function jsonLd(html) {
  const blocks = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  return blocks.map((m, i) => {
    try {
      const node = JSON.parse(decode(m[1]));
      const graph = node["@graph"] ?? [node];
      return { index: i, ok: true, types: graph.map((n) => n["@type"]).flat(), node };
    } catch (e) {
      return { index: i, ok: false, error: String(e), types: [] };
    }
  });
}

export function attr(html, re) {
  return html.match(re)?.[1] ?? null;
}
