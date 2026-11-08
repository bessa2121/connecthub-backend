import http from 'node:http';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { AppError } from '../../domain/errors.js';

const gzip = promisify(zlib.gzip);
const DEFAULT_BODY_LIMIT = 100 * 1024;
const GZIP_MIN_BYTES = 1024;

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new AppError('Corpo da requisição muito grande.', 413)); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new AppError('JSON inválido.', 400)); }
    });
    req.on('error', reject);
  });
}

function rateLimiter(limit, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(), entry = hits.get(key);
    if (hits.size > 5000) hits.clear();
    if (!entry || entry.reset < now) { hits.set(key, { count: 1, reset: now + windowMs }); return true; }
    return ++entry.count <= limit;
  };
}

const clientIp = (req) => String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress).split(',')[0].trim();
const weakEtag = (buffer) => `W/"${createHash('sha1').update(buffer).digest('base64url').slice(0, 27)}"`;

export function createServer({ router, authenticate, allowedOrigins = ['*'] }) {
  const allowAuth = rateLimiter(30, 60_000);
  const allowUpload = rateLimiter(20, 60_000);

  function applyCors(req, res) {
    const origin = req.headers.origin;
    const any = allowedOrigins.includes('*');
    if (!origin || (!any && !allowedOrigins.includes(origin))) return;
    res.setHeader('Access-Control-Allow-Origin', any ? '*' : origin);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');
  }

  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    applyCors(req, res);
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();

    // JSON: compressão gzip (listas ficam ~5x menores) e ETag em GET para responder 304 sem reenviar o corpo.
    const sendJson = async (status, body) => {
      const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
      const headers = { 'Content-Type': 'application/json; charset=utf-8', Vary: 'Accept-Encoding' };
      if (req.method === 'GET' && status === 200 && payload) {
        const etag = weakEtag(payload);
        headers.ETag = etag;
        headers['Cache-Control'] = 'private, no-cache';
        if (req.headers['if-none-match'] === etag) return void res.writeHead(304, headers).end();
      } else headers['Cache-Control'] = 'no-store';
      let out = payload;
      if (payload && payload.length > GZIP_MIN_BYTES && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
        out = await gzip(payload);
        headers['Content-Encoding'] = 'gzip';
      }
      headers['Content-Length'] = out ? out.length : 0;
      res.writeHead(status, headers).end(out ?? undefined);
    };

    // Imagens são imutáveis (cada upload tem um id novo): cache de 1 ano no navegador e na CDN.
    const sendBinary = ({ mime, data, etag }) => {
      const headers = {
        'Content-Type': mime, ETag: etag, 'Content-Disposition': 'inline',
        'Cache-Control': 'public, max-age=31536000, immutable', 'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      if (req.headers['if-none-match'] === etag) return void res.writeHead(304, headers).end();
      res.writeHead(200, { ...headers, 'Content-Length': data.length }).end(data);
    };

    try {
      const url = new URL(req.url, 'http://localhost');
      const matched = router.match(req.method, url.pathname);
      if (!matched) throw new AppError('Rota não encontrada.', 404);
      if (url.pathname.startsWith('/api/auth/') && req.method === 'POST' && !allowAuth(clientIp(req))) throw new AppError('Muitas tentativas. Aguarde um minuto.', 429);
      if (url.pathname === '/api/images' && req.method === 'POST' && !allowUpload(clientIp(req))) throw new AppError('Muitos envios. Aguarde um minuto.', 429);
      const user = await authenticate(req);
      if (matched.route.auth && !user) throw new AppError('Faça login para continuar.', 401);
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req, matched.route.bodyLimit ?? DEFAULT_BODY_LIMIT) : {};
      const result = await matched.route.handler({ params: matched.params, query: Object.fromEntries(url.searchParams), body, user });
      if (result?.__binary) return sendBinary(result);
      return await sendJson(result?.__reply ? result.status : 200, result?.__reply ? result.body : result);
    } catch (err) {
      if (err instanceof AppError) return sendJson(err.status, { error: err.message, details: err.details });
      console.error(err);
      sendJson(500, { error: 'Erro interno do servidor.' });
    }
  });
}
