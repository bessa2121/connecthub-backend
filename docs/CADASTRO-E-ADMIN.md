# Cadastro por autorização e painel administrativo

Fluxo: **solicitação pública → aprovação manual (ADMIN) → cadastro do aluno com e-mail confirmado → autorização consumida**.
Três conceitos separados: `registration_requests` (pedido), `registration_authorizations` (permissão de criar UMA conta) e `users` (conta).

## Estados
| De | Ação | Para |
|---|---|---|
| PENDING | approve | APPROVED (cria autorização) |
| PENDING | reject | REJECTED (terminal) |
| APPROVED | revoke | REVOKED (terminal) |
| APPROVED | cadastro concluído | USED (terminal) |

Qualquer outra transição responde **409**. Autorização USED não é revogável (a conta já existe: use *suspender*).

## Cadastro (backend decide tudo)
1. `POST /api/access-requests` → sempre 202 com a mesma mensagem (não revela se o e-mail já está autorizado ou tem conta).
2. Admin aprova em `/admin`.
3. `POST /api/auth/register` (sem `verificationToken`) valida os dados e, **só se** houver autorização APPROVED e nenhuma conta, envia código de 6 dígitos. Resposta 202 idêntica para qualquer e-mail.
4. `POST /api/auth/verify-email {email, code}` → `verificationToken` (15 min, uso único).
5. `POST /api/auth/register` (com `verificationToken`) → cria conta + marca autorização/solicitação USED + consome verificação, **numa transação** (`SELECT … FOR UPDATE` na autorização).

Código: `crypto.randomInt`, HMAC-SHA256 no banco (nunca o código), validade 10 min, 5 tentativas (depois bloqueia até vencer), uso único, reenvio no mínimo a cada 60 s e 5/hora **por e-mail** (vale para qualquer e-mail, para não virar oráculo de enumeração). Códigos nunca vão para log nem resposta.

## Banco
Schema idempotente em `schema.js` (executa a cada start, sem passo manual): colunas `users.role` (`STUDENT`|`ADMIN`, padrão STUDENT) e `users.status` (`ACTIVE`|`SUSPENDED`) e tabelas `registration_requests`, `registration_authorizations`, `email_verifications`, `audit_log`.
Unicidade: 1 solicitação "viva" (PENDING/APPROVED) por e-mail; 1 autorização APPROVED/USED por e-mail; 1 verificação por e-mail; `users.email` único.

## Variáveis de ambiente (novas)
| Variável | Para quê |
|---|---|
| `BREVO_API_KEY` | Chave de API (v3) do [Brevo](https://www.brevo.com). |
| `BREVO_SENDER_EMAIL` | E-mail do remetente, validado no Brevo (Senders, Domains & Dedicated IPs). |
| `BREVO_SENDER_NAME` | Nome exibido do remetente, ex.: `ConnectHub`. |
| `EMAIL_FROM` | Alternativa opcional: `ConnectHub <nao-responda@seudominio.com.br>`. Só vale se `BREVO_SENDER_EMAIL` estiver vazio. |
| `RETENTION_DAYS` | Dias até apagar solicitações rejeitadas/revogadas (padrão 90). |

Sem `BREVO_API_KEY` e remetente (`BREVO_SENDER_EMAIL` ou `EMAIL_FROM`), `register` e `resend-verification` respondem **503** para todos os e-mails; o sistema nunca finge ter enviado. Para outro provedor (SES, etc.) crie outro adaptador com `sendVerificationCode({to, code, ttlMinutes})` em `src/infrastructure/emailSender.js`.
No Brevo, o remetente (ou domínio) precisa estar validado e, para boa entrega, o domínio deve ter SPF/DKIM/DMARC configurados; sem isso os e-mails podem cair em spam ou ser recusados.

## Primeiro administrador
Nunca por API nem credencial no código. No servidor/terminal com acesso ao banco:
```bash
DATABASE_URL="postgres://..." npm run admin:create -- --email=coordenacao@escola.com --name="Coordenação"
# pede a senha (mín. 12 caracteres) sem ecoar; ou use ADMIN_PASSWORD=... em ambiente não interativo
```
Se o e-mail já tem conta, ela é promovida a ADMIN (senha mantida). Cada provisionamento entra no `audit_log`. Outros admins: rode o mesmo comando. O papel não é alterável por nenhum endpoint.

## Endpoints administrativos (exigem ADMIN; 401 sem login, 403 para aluno)
`GET /api/admin/summary` · `GET /api/admin/access-requests[?status&q&limit&offset]` · `GET …/{id}` · `PATCH …/{id}/approve|reject` · `GET /api/admin/authorizations` · `PATCH /api/admin/authorizations/{id}/revoke` · `GET /api/admin/users` · `PATCH /api/admin/users/{id}/suspend|reactivate`.
Suspensão: a conta perde o acesso na hora (token deixa de valer) e some do diretório público. Admins também não aparecem no diretório. Não é possível suspender admins nem a si mesmo.

## Auditoria e LGPD
`audit_log` guarda ator, ação e id do alvo (sem dados pessoais). Limpeza diária automática: solicitações REJECTED/REVOKED com mais de `RETENTION_DAYS` e verificações vencidas há 24 h. Política de privacidade atualizada no front.

## Rodar local
```bash
npm install && npm test                      # memória
TEST_DATABASE_URL=postgres://... npm test    # mesma suíte contra PostgreSQL
```
Em dev local (sem Postgres) os dados ficam em memória; para exercitar o cadastro é preciso um admin e e-mail configurado (Brevo). Atalho para desenvolvimento: use `DATABASE_URL` + `npm run admin:create`.
