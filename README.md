# ConnectHub Web

Front-end do ConnectHub (ETEC Camargo Aranha): SPA em JavaScript puro (ES Modules), **sem dependências e sem framework**.
Consome a API definida em `connecthub-api/docs/openapi.yaml` — por isso continua funcionando quando o back-end migrar para Java.

## Rodar localmente

```bash
# 1) suba a API (connecthub-api) em http://localhost:3000
npm run dev                       # http://localhost:5173
API_URL=https://minha-api.onrender.com npm run dev    # apontando para outra API
```

## Build

```bash
API_URL=https://sua-api.onrender.com npm run build    # gera dist/ (config.js + _redirects incluídos)
npm start                                             # serve dist/ localmente para conferir
```

## Estrutura

```
src/
├─ index.html · config.js (gerado) · css/styles.css · favicon.svg
└─ js/
   ├─ main.js           rotas da aplicação
   ├─ router.js         roteador SPA (History API)
   ├─ services/         api.js (HTTP), session.js (login)
   ├─ components/       layout, cards, formulários, toasts
   ├─ pages/            home, projetos, comunidade, auth, estáticas
   └─ lib/html.js       template literal com escape automático (anti-XSS)
scripts/                build.mjs, dev-server.mjs
```

## Paleta

Azul `#1f4bd8` + vermelho `#e0243f` que se fundem no roxo `#7a3bd6` — as cores da ETEC Camargo Aranha e da tecnologia.
Tokens em `:root` de `src/css/styles.css` (`--blue`, `--purple`, `--red`, `--grad`). Suporta tema escuro automático.

Deploy: veja **DEPLOY.md**.
