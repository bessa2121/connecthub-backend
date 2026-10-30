# Deploy do Front-end — Vercel, Netlify ou Cloudflare Pages

O front é 100% estático: o build gera a pasta `dist/`. Você só precisa informar **onde está a API**
com a variável **`API_URL`** (ex.: `https://connecthub-api.onrender.com`, sem barra no final).
Faça primeiro o deploy da API (veja `connecthub-api/DEPLOY.md`).

> `API_URL` é lida **no build**. Se mudar a URL da API (ex.: migração para Java), altere a variável e faça um novo deploy.

## 0. Repositório no GitHub

```bash
cd connecthub-web
git init && git add . && git commit -m "ConnectHub Web"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/connecthub-web.git
git push -u origin main
```

## Opção A — Vercel (recomendada)

1. https://vercel.com → **Add New → Project** → importe `connecthub-web`.
2. Framework Preset: **Other**. (Build Command `npm run build` e Output `dist` já vêm do `vercel.json`.)
3. **Environment Variables**: `API_URL` = URL da sua API.
4. **Deploy**. Você receberá uma URL como `https://connecthub-web.vercel.app`.

## Opção B — Netlify

1. https://app.netlify.com → **Add new site → Import an existing project** → escolha o repositório.
2. Build command `npm run build` · Publish directory `dist` (o `netlify.toml` já define).
3. **Site configuration → Environment variables**: `API_URL`.
4. **Deploy**.

## Opção C — Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git**.
2. Build command `npm run build` · Build output directory `dist`.
3. Em **Environment variables**, crie `API_URL`. **Save and Deploy**.

## Depois do deploy

1. Copie a URL final do site.
2. No Render (API), altere `ALLOWED_ORIGINS` para essa URL. Sem isso o navegador bloqueia as chamadas (erro de CORS).
3. Abra o site e teste: login `lucas@exemplo.com` / `connecthub123` (se `SEED_DEMO=true`), publicar projeto, curtir.

## Domínio próprio

Vercel/Netlify/Cloudflare: *Settings → Domains → Add*. Depois inclua o novo domínio em `ALLOWED_ORIGINS` da API.

## Docker (opcional)

```bash
docker build --build-arg API_URL=https://sua-api.onrender.com -t connecthub-web .
docker run -p 8080:80 connecthub-web
```

## Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| "Não foi possível conectar ao servidor" | `API_URL` errada, ou `ALLOWED_ORIGINS` na API não inclui a URL do site |
| Primeira abertura demora ~1 min | API gratuita no Render estava dormindo |
| Página 404 ao recarregar `/projetos` | Falta o rewrite de SPA — já incluso em `vercel.json`, `netlify.toml` e `_redirects` |
| Mudei `API_URL` e nada mudou | Refaça o deploy (variável é lida no build) |
