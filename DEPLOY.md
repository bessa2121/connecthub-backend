# Deploy da API — Neon (banco) + Render (servidor)

Tudo no plano gratuito. Ordem: **1) banco → 2) API → 3) front-end → 4) liberar CORS**.

## 0. Pré-requisito: repositório no GitHub

```bash
cd connecthub-api
git init && git add . && git commit -m "ConnectHub API"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/connecthub-api.git
git push -u origin main
```

## 1. Banco de dados PostgreSQL (Neon)

1. Crie conta em https://neon.com e clique em **New Project** (nome: `connecthub`, região mais próxima do Brasil disponível).
2. Na tela do projeto, clique em **Connect** e copie a *connection string* (formato `postgresql://usuario:senha@host/neondb?sslmode=require`).
   - Se vier com `&channel_binding=require` no final, **remova** esse trecho.
3. Guarde essa string: é o `DATABASE_URL`. As tabelas são criadas automaticamente no primeiro start da API.

## 2. API (Render)

1. Crie conta em https://render.com e conecte o GitHub.
2. **New → Web Service** → escolha o repositório `connecthub-api`.
3. Configure: **Runtime: Docker** · **Instance Type: Free** · Health Check Path: `/api/health`.
   (Alternativa: **New → Blueprint** — o `render.yaml` já preenche tudo.)
4. Em **Environment**, adicione:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `AUTH_SECRET` | string longa aleatória (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `DATABASE_URL` | a string do Neon |
| `ALLOWED_ORIGINS` | `*` por enquanto — troque pela URL do front no passo 4 |
| `SEED_DEMO` | `true` na 1ª vez (cria alunos/projetos de exemplo); depois mude para `false` |

5. **Create Web Service**. Quando aparecer *Live*, abra `https://SEU-SERVICO.onrender.com/api/health` → deve responder `{"status":"ok"}`.
   Essa URL (sem barra no final) é o `API_URL` que o front-end vai usar.

### Deploy automático a cada commit

Cada `git push` (ou merge) na branch ligada ao serviço gera um deploy novo, sem precisar abrir o Render.
O `render.yaml` já traz `autoDeployTrigger: commit`, mas ele só vale se o serviço foi criado por **New → Blueprint**.
Se você criou por **New → Web Service**, confira no painel: serviço → **Settings → Build & Deploy → Auto-Deploy** → **On Commit**
(é o padrão em serviço novo).

- **Pular um commit** (ex.: só mexeu no README): inclua `[skip render]` na mensagem. Também valem `[render skip]`, `[skip deploy]` e `[skip cd]`.
- **Deploy parou de acontecer sozinho?** As causas mais comuns:
  1. Alguém usou **Manual Deploy → Deploy a specific commit**: isso desliga o auto-deploy do serviço. Volte a **On Commit** em Settings.
  2. Auto-Deploy está em **After CI Checks Pass**, mas o repositório não tem CI: sem nenhum check, o Render não faz deploy.
  3. O serviço foi criado a partir de uma URL pública de Git ou de imagem Docker pronta: esses só fazem deploy manual.
- **Commit quebrado não derruba o site**: se o build ou a inicialização falhar, o Render mantém a última versão que funcionou no ar
  (veja o erro em **Deploys → Logs**). Para nem tentar publicar commits que reprovam nos testes, use **After CI Checks Pass**
  com um workflow de CI (GitHub Actions rodando `npm test`).
- Cada deploy reinicia a API. No plano gratuito, a primeira chamada depois disso pode demorar alguns segundos.

## 3. Front-end

Siga o `DEPLOY.md` do `connecthub-web` usando o `API_URL` acima.
(Vercel, Netlify e Cloudflare Pages também publicam sozinhos a cada push na branch principal.)

## 4. Travar o CORS

Com a URL do front (ex.: `https://connecthub.vercel.app`), no Render altere `ALLOWED_ORIGINS` para essa URL
(várias separadas por vírgula, sem barra final). O serviço reinicia sozinho.

## Observações do plano gratuito

- **Render Free dorme após ~15 min sem acesso** e leva cerca de 1 minuto para acordar no próximo acesso
  (o site mostra um aviso). Para evitar, use um monitor gratuito (ex.: UptimeRobot) chamando `/api/health` a cada 5 minutos
  ou mude a instância para o plano pago.
- **Neon Free** tem 0,5 GB e suspende o banco quando ocioso (a primeira consulta demora alguns segundos).
- Não use o Postgres gratuito do próprio Render: ele expira.
- Confira os limites atuais em render.com/pricing e neon.com/pricing.

## Alternativas de hospedagem

A API é um container Docker comum (`Dockerfile`) que lê `PORT`, `DATABASE_URL`, `AUTH_SECRET` e `ALLOWED_ORIGINS`.
Funciona igual em Railway, Fly.io, Google Cloud Run ou qualquer VPS com Docker:

```bash
docker build -t connecthub-api .
docker run -p 3000:3000 -e AUTH_SECRET=segredo -e DATABASE_URL=... -e ALLOWED_ORIGINS=https://seu-front.com connecthub-api
```
