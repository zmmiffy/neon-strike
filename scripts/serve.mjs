#!/usr/bin/env node
/**
 * Tiny zero-dependency static server for local development.
 * Usage: npm start  (or: node scripts/serve.mjs --port 4173)
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function parsePort(argv) {
  const flag = argv.indexOf("--port");
  const raw = flag >= 0 ? argv[flag + 1] : process.env.PORT;
  const port = Number.parseInt(raw ?? "4173", 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 4173;
}

const port = parsePort(process.argv.slice(2));

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";

    const target = normalize(join(ROOT, pathname));
    if (target !== ROOT && !target.startsWith(ROOT + sep)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const info = await stat(target);
    if (info.isDirectory()) {
      res.writeHead(302, { location: `${pathname.replace(/\/?$/, "/")}` });
      res.end();
      return;
    }

    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
      "content-length": body.length,
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (error) {
    const missing = error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    res.writeHead(missing ? 404 : 500, { "content-type": "text/plain; charset=utf-8" });
    res.end(missing ? "Not found" : "Internal server error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`\n  NEON STRIKE  →  http://127.0.0.1:${port}/\n`);
});
