#!/usr/bin/env node
/**
 * Encodes the six approved section photographs into AVIF and WebP ladders.
 *
 *   node scripts/build-images.mjs
 *
 * The masters are 2752x1536 studio photographs of machined models. They live
 * outside the repo, at ../section-images/, and are not committed: only the
 * encoded ladders are, which is why the geometry and the quality settings are
 * written down here rather than left in somebody's shell history.
 *
 * WHY A LADDER AND NOT ONE FILE. The gate is that an image is sized to the box
 * it is actually painted into. The widest that box ever gets is the 1080px
 * content column at a device pixel ratio of 2, so 2160 is the top of the
 * ladder; a phone at 390 CSS pixels and DPR 3 needs about 1080. One file
 * cannot serve both without wasting most of itself on one of them.
 *
 * WHY THESE STEPS. Each rung is about 1.27x the one below it. That bound is
 * not cosmetic: the browser picks the smallest candidate at or above what it
 * needs, so the step ratio IS the worst-case oversupply, and the checker in
 * snapshot.mjs fails anything above 1.35x. A coarser ladder passes on a 1440
 * desktop and fails on a 768 tablet, which is exactly the kind of defect that
 * only shows up on the width nobody screenshots.
 *
 * WHY 4:4:4. These renders are neutral aluminium with a saturated blue accent
 * and hard specular edges. Chroma subsampling smears precisely that blue, and
 * it is the only colour in the photographs.
 *
 * Nothing here crops, recolours or resamples the composition: every output is
 * the full frame at its native 16:9, which is a condition of using them.
 */
import sharp from "sharp";
import { mkdirSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = resolve(ROOT, "../section-images");
const OUT = resolve(ROOT, "assets/sections");

const NATIVE = { width: 2752, height: 1536 };
/* Extended for the full-bleed layout. The image now spans the whole
   section rather than a 1080px column, so at 1440 CSS pixels it paints
   into 1440 and a retina desktop asks for 2880 — past the master's own
   2752, which is therefore the top rung. Undersupply of 4.4% at that one
   combination is reported by the checker rather than hidden; upscaling a
   photograph to invent the difference would be worse. */
const WIDTHS = [480, 640, 840, 1080, 1360, 1720, 2160, 2560, 2752];
const NAMES = [
  "01-asking",
  "02-competitor",
  "03-unreadable",
  "04-verticals",
  "05-winning",
  "06-exclusivity",
];

if (!existsSync(SRC)) {
  console.error(`FAIL  masters not found at ${SRC}`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/* Clear only what this script emits. Emptying the directory outright is how a
   screenshot nobody generates gets silently deleted and the markup goes on
   pointing at it — that has happened in this repo before, under
   assets/artwork/, and it survived every other check in scripts/. */
const OWNED = new Set(NAMES.flatMap((n) => WIDTHS.flatMap((w) => [`${n}-${w}.avif`, `${n}-${w}.webp`])));
for (const f of readdirSync(OUT)) if (OWNED.has(f)) statSync(join(OUT, f)) && (await import("node:fs")).unlinkSync(join(OUT, f));

const rows = [];
let totalAvif = 0;
let totalWebp = 0;

for (const name of NAMES) {
  const master = join(SRC, `${name}.png`);
  const meta = await sharp(master).metadata();
  if (meta.width !== NATIVE.width || meta.height !== NATIVE.height) {
    console.error(`FAIL  ${name}.png is ${meta.width}x${meta.height}, expected ${NATIVE.width}x${NATIVE.height}`);
    process.exit(1);
  }

  for (const w of WIDTHS) {
    const h = Math.round((w * NATIVE.height) / NATIVE.width);
    const base = sharp(master).resize({ width: w, height: h, fit: "fill", kernel: "lanczos3" });

    const avif = join(OUT, `${name}-${w}.avif`);
    await base.clone().avif({ quality: 58, effort: 6, chromaSubsampling: "4:4:4" }).toFile(avif);

    const webp = join(OUT, `${name}-${w}.webp`);
    await base.clone().webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(webp);

    const a = statSync(avif).size;
    const b = statSync(webp).size;
    totalAvif += a;
    totalWebp += b;
    if (w === 1080 || w === 2160) {
      rows.push({ image: name, width: w, avifKB: +(a / 1024).toFixed(1), webpKB: +(b / 1024).toFixed(1) });
    }
  }
}

console.table(rows);
console.log(
  `\n${NAMES.length} photographs x ${WIDTHS.length} widths x 2 formats = ` +
    `${NAMES.length * WIDTHS.length * 2} files\n` +
    `  whole AVIF ladder on disk: ${(totalAvif / 1024 / 1024).toFixed(2)} MB\n` +
    `  whole WebP ladder on disk: ${(totalWebp / 1024 / 1024).toFixed(2)} MB\n` +
    `  (what a visitor downloads is one rung per image — see snapshot.mjs)`,
);
