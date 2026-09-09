#!/usr/bin/env node
/**
 * Build the deployable site into dist/.
 *
 * WHY THIS EXISTS. assets/site.css is 360KB on disk and roughly 155KB of that
 * is CSS; the rest is prose. The comments are the project's documentation —
 * every non-obvious rule in that file carries the measurement or the defect
 * that produced it — so they are not going anywhere. They just do not need to
 * travel to the browser on the critical path of every first paint.
 *
 * So: the source stylesheet keeps its comments, and the deployment gets a copy
 * with them removed. Nothing else about the site changes. Every other file is
 * copied byte-for-byte, which this script proves on every run by printing a
 * sha256 of the source and the destination side by side.
 *
 *   node scripts/build.mjs            # writes ./dist
 *   node scripts/build.mjs --out X    # writes ./X
 *   node scripts/build.mjs --quiet    # only the summary
 *
 * WHAT IS COPIED. Everything the deployment serves today. The exclusions below
 * are the two categories that are already not served: the dev-time harness
 * (scripts/, tools/, baseline/, verification/, package.json — the .vercelignore
 * list, all of which answer 404 in production today) and the repo's own
 * metadata (README.md, vercel.json, dotfiles — which also answer 404 today,
 * because Vercel does not publish them). Confirmed against the live site
 * before this list was written; see the check in the header of .vercelignore.
 *
 * WHY A TOKENIZER AND NOT A REGEX. `/\/\*[\s\S]*?\*\//g` over a stylesheet is
 * wrong on two inputs this file could grow at any time:
 *
 *     .a::after { content: "*\/"; }      a comment terminator inside a string
 *     background: url(a/*b.png);         a comment opener inside a url token
 *
 * The first makes the regex end a comment early — or, worse, treat the rest of
 * the file as one — and the second makes it start a comment that never ends.
 * Neither is in the file today. Both are legal CSS, and a stylesheet is edited
 * by hand every week. The scanner below walks the file in one pass with the
 * three states CSS actually has (code, string, url) so that the answer does not
 * depend on the file staying lucky.
 *
 * WHAT IS NOT DONE. No minification, no property reordering, no whitespace
 * crunching beyond collapsing the blank lines a removed comment leaves behind.
 * The output is meant to stay diffable against the source, and every
 * transformation that is not "delete a comment" is a transformation whose
 * equivalence would have to be argued separately.
 */
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const OUT_NAME = (() => {
  const i = args.indexOf("--out");
  return i === -1 ? "dist" : args[i + 1];
})();
const OUT = resolve(ROOT, OUT_NAME);
const QUIET = args.includes("--quiet");

/* Not served today, and not served after this change either. The first group
   is .vercelignore's list; the second is what Vercel itself withholds. Both
   were checked against https://anakslabs.com before being written down —
   every one of them answers 404 there right now. */
const EXCLUDE = new Set([
  "node_modules",
  "scripts",
  "tools",
  "baseline",
  "verification",
  "package.json",
  "package-lock.json",
  "README.md",
  "vercel.json",
  ".wt",
  ".git",
  ".claude",
  ".DS_Store",
  OUT_NAME,
]);

/* Anything beginning with a dot: .gitignore, .vercelignore, .env, editor
   droppings. None of them are on the site today and none should arrive on it
   by accident because someone added a dotfile to the repo. */
const isHidden = (name) => name.startsWith(".");

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* ---------------------------------------------------------------------------
   The comment scanner.

   One pass, four states. `code` is everything outside a string or a url token;
   only there does `/*` open a comment. Strings are entered on a quote and left
   on the matching quote, honouring backslash escapes, so a quote that is part
   of the content does not end them. Unquoted url() contents are their own state
   because their grammar is not the string grammar — anything up to the closing
   paren is content, `/` and `*` included.

   A removed comment is replaced by ONE SPACE, never by nothing. A comment
   written between two values with no space around it — `margin:0`, comment,
   `1px` — is legal CSS meaning `margin:0 1px`, and deleting it outright would
   weld the two into `margin:01px`. A space cannot weld anything, and costs one
   byte per comment against a file that is losing two hundred thousand.

   `/*!` is left alone in full. Nothing in the stylesheet uses it today; it is
   the universal convention for "this comment is a licence, do not strip it",
   and the day someone vendors a licensed snippet in here the licence should
   survive without them having to know this script exists.
   --------------------------------------------------------------------------- */
export function stripCssComments(css) {
  const out = [];
  let removed = 0;
  let bytesRemoved = 0;
  let preserved = 0;
  /* Set if any string or url token turns out to span a newline. The blank-line
     collapse below is only safe when none do; see there. */
  let multilineToken = false;

  const n = css.length;
  let i = 0;

  while (i < n) {
    const c = css[i];

    /* An escape in code position: `.a\/\*b` is a class literally named a/*b.
       Copy the backslash and whatever it protects, and do not look at the
       protected character again. */
    if (c === "\\" && i + 1 < n) {
      out.push(css[i], css[i + 1]);
      i += 2;
      continue;
    }

    if (c === '"' || c === "'") {
      const start = i;
      const quote = c;
      i += 1;
      while (i < n) {
        if (css[i] === "\\" && i + 1 < n) {
          i += 2;
          continue;
        }
        if (css[i] === quote) {
          i += 1;
          break;
        }
        /* An unescaped newline ends a bad string in CSS's own grammar. Stop
           there rather than swallowing the rest of the file. */
        if (css[i] === "\n") break;
        i += 1;
      }
      const token = css.slice(start, i);
      if (token.includes("\n")) multilineToken = true;
      out.push(token);
      continue;
    }

    /* url( … ) with unquoted contents. Matched only when `url` is a whole
       identifier — `blurl(` and `--my-url(` are not url tokens — and only
       when what follows the paren is not a quote, because a quoted url is just
       a string and the string branch above already handles it correctly. */
    if ((c === "u" || c === "U") && /^url\(/i.test(css.slice(i, i + 4))) {
      const prev = i === 0 ? "" : css[i - 1];
      const identChar = /[A-Za-z0-9_\-\\]/.test(prev);
      if (!identChar) {
        let j = i + 4;
        while (j < n && /\s/.test(css[j])) j += 1;
        if (css[j] !== '"' && css[j] !== "'") {
          const start = i;
          while (j < n) {
            if (css[j] === "\\" && j + 1 < n) {
              j += 2;
              continue;
            }
            if (css[j] === ")") {
              j += 1;
              break;
            }
            j += 1;
          }
          const token = css.slice(start, j);
          if (token.includes("\n")) multilineToken = true;
          out.push(token);
          i = j;
          continue;
        }
      }
    }

    if (c === "/" && css[i + 1] === "*") {
      const bang = css[i + 2] === "!";
      let end = css.indexOf("*/", i + 2);
      /* An unterminated comment runs to end of file — that is what a browser
         does with it, so that is what this does with it. */
      end = end === -1 ? n : end + 2;
      const comment = css.slice(i, end);
      if (bang) {
        out.push(comment);
        preserved += 1;
      } else {
        out.push(" ");
        removed += 1;
        bytesRemoved += comment.length;
      }
      i = end;
      continue;
    }

    out.push(c);
    i += 1;
  }

  let text = out.join("");

  /* Collapsing what the removals left behind. A comment that occupied its own
     lines leaves those lines holding one space, and this file has hundreds of
     block comments, so the run-of-blank-lines is most of what would otherwise
     be saved back.

     This pass is textual, which is only safe if no string or url token contains
     a newline — otherwise trimming a line end could reach inside one. The
     scanner has just checked exactly that. If a multi-line token ever appears,
     the comments still come out; only this cosmetic pass is skipped. */
  if (!multilineToken) {
    text = text
      .split("\n")
      .map((line) => (line.trim() === "" ? "" : line.replace(/[ \t]+$/, "")))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n");
  }

  return { text, removed, preserved, bytesRemoved, multilineToken };
}

/* ---------------------------------------------------------------------------
   Everything below runs only when this file is the program. The scanner above
   is exported so the equivalence checks can call it directly, and importing it
   must not trigger a build.
   --------------------------------------------------------------------------- */
function walk(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = relative(base, join(dir, entry.name));
    if (EXCLUDE.has(entry.name) || isHidden(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(abs, base));
    else if (entry.isFile() || entry.isSymbolicLink()) files.push(rel);
  }
  return files;
}

const brotli = (buf) =>
  brotliCompressSync(buf, {
    params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });

  const files = walk(ROOT).sort();
  const CSS = join("assets", "site.css");

  let identical = 0;
  const mismatched = [];

  for (const rel of files) {
    const src = join(ROOT, rel);
    const dest = join(OUT, rel);
    mkdirSync(dirname(dest), { recursive: true });
    if (rel === CSS) continue; // written below, deliberately not a copy
    cpSync(src, dest);
    const a = sha256(readFileSync(src));
    const b = sha256(readFileSync(dest));
    if (a === b) identical += 1;
    else mismatched.push({ rel, a, b });
    if (!QUIET) console.log(`  ${a.slice(0, 12)}  ${b.slice(0, 12)}  ${rel}`);
  }

  const srcCss = readFileSync(join(ROOT, CSS));
  const result = stripCssComments(srcCss.toString("utf8"));
  const outCss = Buffer.from(result.text, "utf8");
  writeFileSync(join(OUT, CSS), outCss);

  const srcRaw = srcCss.length;
  const outRaw = outCss.length;
  const srcBr = brotli(srcCss);
  const outBr = brotli(outCss);

  const kb = (b) => `${(b / 1024).toFixed(1)}KB`;
  const pct = (a, b) => `${(((a - b) / a) * 100).toFixed(1)}%`;

  console.log("");
  console.log(`  copied      ${files.length - 1} files byte-for-byte, ${identical} sha256 matches`);
  if (mismatched.length) {
    for (const m of mismatched) console.log(`  MISMATCH    ${m.rel}\n    src ${m.a}\n    out ${m.b}`);
    console.error("\nbuild failed: a copied file does not match its source");
    process.exit(1);
  }
  console.log(`  ${CSS}`);
  console.log(`    comments  ${result.removed} removed, ${result.preserved} preserved (/*!)`);
  console.log(`    raw       ${kb(srcRaw)} -> ${kb(outRaw)}   (${pct(srcRaw, outRaw)} smaller, ${srcRaw} -> ${outRaw} bytes)`);
  console.log(`    brotli    ${kb(srcBr)} -> ${kb(outBr)}   (${pct(srcBr, outBr)} smaller, ${srcBr} -> ${outBr} bytes)`);
  console.log(`    sha256    ${sha256(srcCss).slice(0, 12)} -> ${sha256(outCss).slice(0, 12)}  (expected to differ)`);
  if (result.multilineToken) {
    console.log("    note      a string or url token spans a newline; blank-line collapse skipped");
  }
  console.log(`\n  ${relative(ROOT, OUT)}/ ready`);

  /* A comment marker left in the output means the scanner missed a case, and
     the whole point of the exercise is that it does not. A comment opener can
     legitimately survive inside a string or a url token, so the check is on
     what the scanner itself reports rather than on a search of the finished
     text: it re-runs on its own output and requires that there is nothing left
     to remove. */
  const second = stripCssComments(result.text);
  if (second.removed !== 0) {
    console.error(`\nbuild failed: ${second.removed} comments survived the first pass`);
    process.exit(1);
  }
}

/* Run only when this file is the program. The scanner is exported so the
   equivalence checks can call it directly, and importing it must not build. */
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) main();
