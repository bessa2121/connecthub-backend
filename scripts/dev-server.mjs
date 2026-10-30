// Servidor estático local com fallback de SPA. Uso: npm run dev   |   npm start (serve dist/)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, process.argv[2] ?? 'src');
const port = Number(process.env.PORT) || 5173;
const apiUrl = process.env.API_URL ?? 'http://localhost:3000';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname === '/config.js' && dir.endsWith('src')) {
    return void res.writeHead(200, { 'Content-Type': MIME['.js'] }).end(`window.__CONNECTHUB__ = ${JSON.stringify({ API_URL: apiUrl })};`);
  }
  let file = join(dir, normalize(decodeURIComponent(pathname)));
  if (!file.startsWith(dir)) return void res.writeHead(403).end();
  if (!extname(file)) file = join(dir, 'index.html');
  try {
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(await readFile(file));
  } catch { res.writeHead(404).end('Não encontrado'); }
}).listen(port, () => console.log(`Front-end em http://localhost:${port}  →  API: ${apiUrl}`));
