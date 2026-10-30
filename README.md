# ConnectHub API

Serviço de back-end do ConnectHub (ETEC Camargo Aranha): autenticação, projetos, comunidade e talentos.
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
├─ application/     casos de uso: auth, projetos, comunidade
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

Deploy: veja **DEPLOY.md**.
