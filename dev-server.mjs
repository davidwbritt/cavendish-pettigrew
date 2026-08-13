// Zero-dependency static file server for local development.
//
// `<script type="module" src="src/main.js">` is blocked by browsers when
// index.html is opened directly over file:// (both Chrome/Edge and Firefox
// refuse cross-origin module fetches from the filesystem). This server
// exists solely to work around that during development — it is never
// bundled into dist/index.html and adds no runtime dependency to the
// shipped instrument (see README.md and the project's zero-dependency
// constraint). `npm run build` remains the only thing that produces the
// artifact that actually ships.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, join, normalize } from 'node:path';

const ROOT = dirname(new URL(import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  // normalize() collapses any '..' before the join, and the startsWith
  // check below refuses to serve anything that still resolves outside
  // ROOT — this is a dev-only tool, but it's trivial to keep it from
  // serving arbitrary files off the taker's disk.
  const filePath = resolve(ROOT, '.' + normalize(join('/', rel)));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': TYPES[extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

server.listen(PORT, () => {
  console.log(`dev server: http://localhost:${PORT}/index.html`);
});
