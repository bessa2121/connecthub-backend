// Gera dist/ a partir de src/ e grava config.js com a URL da API (variável API_URL).
import { cpSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiUrl = (process.env.API_URL ?? '').trim().replace(/\/$/, '');

if (!apiUrl) console.warn('[aviso] API_URL não definida: o site chamará a API no mesmo domínio. Defina API_URL=https://sua-api.onrender.com');
else if (!/^https?:\/\//.test(apiUrl)) { console.error('API_URL deve começar com http:// ou https://'); process.exit(1); }

rmSync(resolve(root, 'dist'), { recursive: true, force: true });
cpSync(resolve(root, 'src'), resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/config.js'), `window.__CONNECTHUB__ = ${JSON.stringify({ API_URL: apiUrl })};\n`);
writeFileSync(resolve(root, 'dist/_redirects'), '/*  /index.html  200\n'); // Netlify e Cloudflare Pages (SPA)
console.log(`Build concluído em dist/ (API_URL=${apiUrl || '(mesmo domínio)'})`);
