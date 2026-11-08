# ConnectHub API

Serviço de back-end do ConnectHub (ETEC Camargo Aranha): autenticação, projetos (criar, editar, excluir), comunidade, talentos,
contatos (Instagram, LinkedIn, e-mail) e fotos de perfil/projeto.
Node.js 20+ · PostgreSQL · Clean Architecture · contrato em `docs/openapi.yaml`.

## Rodar localmente

```bash
npm install
cp .env.example .env     # opcional; sem DATABASE_URL usa memória
npm run dev              # http://localhost:3000
npm test                 # testes em memória
TEST_DATABASE_URL=postgres://user:senha@localhost:5432/teste npm test   # mesma suíte em PostgreSQL
```

Com `SEED_DEMO=true`, cria alunos e projetos de exemplo (login `lucas@exemplo.com` / `connecthub123`).

## Arquitetura

```
src/
├─ domain/          entidades, regras e validações puras (sem dependências)
├─ application/     casos de uso: auth, projetos, comunidade, imagens
├─ infrastructure/  config, hash scrypt, token HMAC, seed e persistência
│  └─ persistence/  memory/ e postgres/ (mesma interface — "ports & adapters")
├─ presentation/http/  router, rotas, servidor, CORS e rate limit
└─ main.js          composition root
docs/openapi.yaml   contrato da API
```

## Migração futura para Java

1. Implemente o contrato `docs/openapi.yaml` (ex.: Spring Boot + Spring Data JPA).
2. O esquema SQL está em `src/infrastructure/persistence/postgres/schema.js` — converta para Flyway/Liquibase.
   O mesmo banco PostgreSQL continua funcionando (UUIDs, `text[]`), então os dados migram sem conversão.
3. Senhas usam scrypt (`salt:hash`, 64 bytes); para manter logins, reimplemente a verificação em Java
   (ou force redefinição de senha). Tokens são HMAC-SHA256 próprios — no Java use JWT e atualize o front.
4. Aponte `API_URL` do front-end para o novo serviço. Nada mais muda no front.

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta HTTP (padrão 3000) |
| `AUTH_SECRET` | Segredo dos tokens — **obrigatório em produção** |
| `DATABASE_URL` | Conexão PostgreSQL. Vazio = memória |
| `ALLOWED_ORIGINS` | Sites autorizados (CORS), separados por vírgula |
| `SEED_DEMO` | `true` cria dados de demonstração se o banco estiver vazio |

## Fotos e contatos

- **Fotos**: o navegador reduz a imagem (avatar 320×320, capa 1280×720) e envia para `POST /api/images`. O servidor valida o tipo
  pelos bytes reais (JPEG/PNG/WebP, até 450 KB), guarda no PostgreSQL (`images.data bytea`) e serve em `GET /api/images/:id` com
  cache de 1 ano. Perfil e projeto guardam só a referência `/api/images/<uuid>`; trocar ou excluir apaga a imagem antiga.
  Sem `DATABASE_URL` as imagens ficam em memória (somem ao reiniciar, como o resto).
- **Contatos**: `instagram` e `linkedin` guardam só o usuário (aceitam `@usuario` ou o link). `contactEmail` é opcional e **público**;
  o e-mail de login nunca é exposto.
- **Banco existente**: o esquema usa `ADD COLUMN IF NOT EXISTS`; basta reiniciar a API e as colunas/tabelas novas são criadas.

## Desempenho

JSON acima de 1 KB sai com gzip; `GET`s têm `ETag` (respondem `304` sem corpo); listas não carregam a descrição longa dos projetos;
slugs são checados com uma consulta em vez de carregar todos os registros. Em hospedagem gratuita, o maior atraso costuma ser o
**cold start** do serviço (e do banco serverless): um ping periódico em `/api/health` (ex.: UptimeRobot a cada 10 min) evita isso.
Mantenha API e banco **na mesma região**.

Deploy: veja **DEPLOY.md**.
