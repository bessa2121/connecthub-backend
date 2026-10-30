import http from 'node:http';
import { AppError } from '../../domain/errors.js';

const MAX_BODY = 100 * 1024;

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new AppError('Corpo da requisição muito grande.', 413)); req.destroy(); } else chunks.push(c); });
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

export function createServer({ router, authenticate, allowedOrigins = ['*'] }) {
  const allowAuth = rateLimiter(30, 60_000);

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
    const send = (status, body) => res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body === undefined ? '' : JSON.stringify(body));
    try {
      const url = new URL(req.url, 'http://localhost');
      const matched = router.match(req.method, url.pathname);
      if (!matched) throw new AppError('Rota não encontrada.', 404);
      if (url.pathname.startsWith('/api/auth/') && req.method === 'POST' && !allowAuth(clientIp(req))) throw new AppError('Muitas tentativas. Aguarde um minuto.', 429);
      const user = await authenticate(req);
      if (matched.route.auth && !user) throw new AppError('Faça login para continuar.', 401);
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : {};
      const result = await matched.route.handler({ params: matched.params, query: Object.fromEntries(url.searchParams), body, user });
      result?.__reply ? send(result.status, result.body) : send(200, result);
    } catch (err) {
      if (err instanceof AppError) return send(err.status, { error: err.message, details: err.details });
      console.error(err);
      send(500, { error: 'Erro interno do servidor.' });
    }
  });
}
