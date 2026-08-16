#!/usr/bin/env node
/**
 * Static server for the checkers. Deliberately not a general-purpose one — it
 * exists to reproduce the three things about Vercel's serving that a naive
 * local server gets wrong and that then show up as site defects:
 *
 *   1. Cache-Control. `http-server -c-1` sends `no-store`, which blocks
 *      back/forward cache, so Lighthouse fails the bf-cache audit against a
 *      page that passes it in production. Production sends
 *      `public, max-age=0, must-revalidate`; so does this.
 *
 *   2. /_vercel/insights/script.js. Vercel injects this at the edge and it is
 *      200 in production; off Vercel it 404s, Chrome logs a console error, and
 *      Lighthouse fails errors-in-console. Served here as an empty script, for
 *      the same reason: so the measurement is of the site, not of the absence
 *      of Vercel.
 *
 *   3. Compression. Verified against the live site while chasing a
 *      Lighthouse performance score that would not reach 100:
 *
 *        $ curl -sI -H 'Accept-Encoding: br, gzip' https://anakslabs.com/assets/site.css
 *          content-encoding: br
 *
 *      This server used to send text uncompressed, so every run measured a
 *      56.8KB render-blocking stylesheet where production sends 12.0KB of
 *      brotli — a 4.7x overstatement of the one resource on the critical path.
 *      The whole point of this file is that the measurement is of the site and
 *      not of the harness, and on the single number the harness most affects
 *      it was wrong by a factor of nearly five.
 *
 * Also mirrors vercel.json's trailingSlash: true, so /about redirects to
 * /about/ and directory URLs resolve to index.html.
 *
 *   node scripts/serve.mjs 4311
 */
import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync, existsSync } from "node:fs";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2] ?? 4311);

/* Only text. Compressing AVIF, WebP or woff2 costs CPU and gains nothing —
   they are already compressed — and Vercel does not do it either. */
const COMPRESSIBLE = /^(text\/|application\/(json|xml|javascript)|image\/svg)/;

/* Compressed bodies are cached in memory, keyed by file and encoding. Without
   this every request re-compresses, which on a Lighthouse run of a dozen
   navigations makes the server itself the slowest thing in the measurement. */
const cache = new Map();

function encodeFor(file, type, acceptEncoding) {
  if (!COMPRESSIBLE.test(type)) return null;
  const accept = String(acceptEncoding ?? "");
  const enc = /\bbr\b/.test(accept) ? "br" : /\bgzip\b/.test(accept) ? "gzip" : null;
  if (!enc) return null;
  const { mtimeMs } = statSync(file);
  const key = `${enc}:${file}:${mtimeMs}`;
  let body = cache.get(key);
  if (!body) {
    const raw = readFileSync(file);
    body =
      enc === "br"
        ? brotliCompressSync(raw, {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
          })
        : gzipSync(raw, { level: 9 });
    cache.set(key, body);
  }
  return { enc, body };
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/* vercel.json's redirects, so a link the homepage carries to a retired URL
   behaves locally the way it behaves in production. */
const REDIRECTS = [
  [/^\/products\/(.*)$/, "/"],
  [/^\/guides\/$/, "/articles/"],
  [/^\/guides\/(.+)$/, "/articles/$1"],
  [/^\/blog\/hello\/(.*)$/, "/"],
];

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/_vercel/insights/script.js") {
    res.writeHead(200, {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    });
    res.end("/* local stand-in for Vercel's edge-injected analytics script */\n");
    return;
  }

  for (const [re, to] of REDIRECTS) {
    if (re.test(pathname)) {
      res.writeHead(308, { location: pathname.replace(re, to) });
      res.end();
      return;
    }
  }

  // trailingSlash: true — /about becomes /about/ before anything is resolved.
  if (!pathname.endsWith("/") && !extname(pathname)) {
    res.writeHead(308, { location: pathname + "/" + url.search });
    res.end();
    return;
  }

  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, safe);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");

  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<!doctype html><title>404</title><h1>404</h1>");
    return;
  }

  const { size } = statSync(file);
  const headers = {
    "content-type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
    // Exactly what anakslabs.com serves today.
    "cache-control": "public, max-age=0, must-revalidate",
    "accept-ranges": "bytes",
  };

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : size - 1;
    res.writeHead(206, {
      ...headers,
      "content-range": `bytes ${start}-${end}/${size}`,
      "content-length": end - start + 1,
    });
    createReadStream(file, { start, end }).pipe(res);
    return;
  }

  const encoded = encodeFor(file, headers["content-type"], req.headers["accept-encoding"]);
  if (encoded) {
    res.writeHead(200, {
      ...headers,
      "content-encoding": encoded.enc,
      "content-length": encoded.body.length,
      vary: "Accept-Encoding",
    });
    if (req.method === "HEAD") return void res.end();
    res.end(encoded.body);
    return;
  }

  res.writeHead(200, { ...headers, "content-length": size });
  if (req.method === "HEAD") return void res.end();
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} on http://localhost:${PORT}`);
});
