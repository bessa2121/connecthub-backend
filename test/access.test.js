import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './helpers.js';
import { CODE_TTL_MS, MAX_ATTEMPTS } from '../src/application/registrationUseCases.js';

const h = await createHarness();
const { call, admin, outbox, time, persistence } = h;
test.after(h.close);
const ok = (res, status) => assert.equal(res.status, status, JSON.stringify(res.data));
let seq = 0;
const email = (tag = 'aluno') => `${tag}${++seq}@exemplo.test`;
const NOTICE_RE = /Sua solicitação foi recebida/;

// ---------------------------------------------------------------- solicitações
test('solicitação válida: fica PENDING, e-mail normalizado, mensagem sem revelar nada', async () => {
  const res = await call('/api/access-requests', { method: 'POST', body: { name: '  Ana   Souza ', email: '  Ana.Nova@Exemplo.TEST ', emailConfirm: 'ana.nova@exemplo.test', institution: '012' } });
  ok(res, 202); assert.match(res.data.message, NOTICE_RE);
  const stored = await h.findRequest('ana.nova@exemplo.test');
  assert.deepEqual([stored.name, stored.status, stored.institution], ['Ana Souza', 'PENDING', '012']);
});

test('solicitação inválida: e-mail, confirmação, nome e instituição', async () => {
  const bad = (body) => call('/api/access-requests', { method: 'POST', body });
  const good = h.requestBody('Fulano de Tal', email());
  assert.ok((await bad({ ...good, email: 'sem-arroba', emailConfirm: 'sem-arroba' })).data.details.email);
  assert.ok((await bad({ ...good, emailConfirm: 'outro@exemplo.test' })).data.details.emailConfirm);
  assert.ok((await bad({ ...good, name: 'x' })).data.details.name);
  assert.ok((await bad({ ...good, institution: '999' })).data.details.institution);
  assert.ok((await bad({ ...good, institution: '' })).data.details.institution);
});

test('solicitação duplicada: resposta idêntica e uma única linha', async () => {
  const e = email('dup');
  const [a, b] = [await h.requestAccess('Dup Licado', e), await h.requestAccess('Dup Licado', e)];
  assert.deepEqual([a.status, b.status, a.data.message === b.data.message], [202, 202, true]);
  assert.equal((await admin(`/api/admin/access-requests?q=${e}`)).data.total, 1);
  // e-mail que já tem conta também recebe a mesma resposta, sem criar solicitação
  const seeded = await h.requestAccess('Lucas Almeida', 'lucas@exemplo.com');
  ok(seeded, 202);
  assert.equal((await admin('/api/admin/access-requests?q=lucas@exemplo.com')).data.total, 0);
});

test('o cliente não controla status nem perfil', async () => {
  const e = email('tamper');
  ok(await call('/api/access-requests', { method: 'POST', body: { ...h.requestBody('Espertinho Dois', e), status: 'APPROVED', role: 'ADMIN', decidedBy: 'x' } }), 202);
  assert.equal((await h.findRequest(e)).status, 'PENDING');
  const before = outbox.length;
  ok(await h.startRegistration('Espertinho Dois', e), 202);
  assert.equal(outbox.length, before, 'sem aprovação não há código');
});

test('abuso: limite por IP, por e-mail e honeypot', async () => {
  const same = { 'X-Forwarded-For': '203.0.113.9' };
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call('/api/access-requests', { method: 'POST', headers: same, body: h.requestBody('Robô Spammer', email('bot')) })).status);
  assert.deepEqual([codes.slice(0, 10).every((c) => c === 202), codes[10]], [true, 429]);

  const e = email('mesmo');
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await h.requestAccess('Repetidor Chato', e)).status);
  assert.deepEqual(statuses, [202, 202, 202, 429]);

  const trap = email('honey');
  ok(await call('/api/access-requests', { method: 'POST', body: { ...h.requestBody('Robô Esperto', trap), website: 'http://spam' } }), 202);
  assert.equal(await h.findRequest(trap), undefined);
});

// ---------------------------------------------------------------- administração
test('rotas administrativas: 401 sem login, 403 para aluno', async () => {
  const student = await h.signup('Aluna Comum', email('comum'));
  const routes = [['GET', '/api/admin/summary'], ['GET', '/api/admin/access-requests'], ['GET', '/api/admin/access-requests/x'], ['PATCH', '/api/admin/access-requests/x/approve'],
    ['PATCH', '/api/admin/access-requests/x/reject'], ['GET', '/api/admin/authorizations'], ['PATCH', '/api/admin/authorizations/x/revoke'],
    ['GET', '/api/admin/users'], ['PATCH', '/api/admin/users/x/suspend'], ['PATCH', '/api/admin/users/x/reactivate']];
  for (const [method, path] of routes) {
    assert.equal((await call(path, { method })).status, 401, `${method} ${path} sem login`);
    assert.equal((await call(path, { method, token: student })).status, 403, `${method} ${path} como aluno`);
  }
  // aluno não consegue aprovar nem a própria solicitação
  const e = email('self');
  await h.requestAccess('Auto Aprovador', e);
  const r = await h.findRequest(e);
  assert.equal((await call(`/api/admin/access-requests/${r.id}/approve`, { method: 'PATCH', token: student })).status, 403);
  assert.equal((await h.findRequest(e)).status, 'PENDING');
});

test('usuário comum não vira ADMIN (perfil, cadastro e token adulterado)', async () => {
  const e = email('escala');
  await h.requestAccess('Escala Dora', e); await h.approve(e);
  await h.startRegistration('Escala Dora', e);
  const { data: { verificationToken } } = await h.verify(e, h.lastCode(e));
  const reg = await h.complete('Escala Dora', e, verificationToken, { role: 'ADMIN', status: 'ACTIVE' });
  ok(reg, 201); assert.equal(reg.data.user.role, 'STUDENT');
  const token = reg.data.token;
  const prof = await call('/api/profile', { method: 'PUT', token, body: { bio: '', skills: '', course: 'Marketing', year: '2º ano', role: 'ADMIN' } });
  assert.equal(prof.data.role, 'STUDENT');
  assert.equal((await call('/api/auth/me', { token })).data.role, 'STUDENT');
  assert.equal((await call('/api/admin/summary', { token })).status, 403);
  const forged = token.split('.')[0] + '.assinatura-falsa';
  assert.equal((await call('/api/admin/summary', { token: forged })).status, 401);
});

test('aprovar, rejeitar, revogar e transições inválidas', async () => {
  const [a, b, c] = [email('apr'), email('rej'), email('rev')];
  for (const e of [a, b, c]) await h.requestAccess('Fulana Pessoa', e);
  const [ra, rb, rc] = [await h.findRequest(a), await h.findRequest(b), await h.findRequest(c)];
  const patch = (path) => admin(path, { method: 'PATCH' });

  const approved = await patch(`/api/admin/access-requests/${ra.id}/approve`);
  ok(approved, 200);
  assert.deepEqual([approved.data.status, !!approved.data.authorizationId, approved.data.decidedByName], ['APPROVED', true, 'Admin Teste']);
  assert.equal((await patch(`/api/admin/access-requests/${ra.id}/approve`)).status, 409); // já aprovada
  assert.equal((await patch(`/api/admin/access-requests/${ra.id}/reject`)).status, 409);  // APPROVED não rejeita

  const rejected = await patch(`/api/admin/access-requests/${rb.id}/reject`);
  ok(rejected, 200); assert.equal(rejected.data.status, 'REJECTED');
  assert.equal((await patch(`/api/admin/access-requests/${rb.id}/approve`)).status, 409); // REJECTED é terminal
  assert.equal((await patch(`/api/admin/access-requests/${rb.id}/reject`)).status, 409);

  await patch(`/api/admin/access-requests/${rc.id}/approve`);
  const authId = (await admin(`/api/admin/access-requests/${rc.id}`)).data.authorizationId;
  assert.equal((await patch(`/api/admin/authorizations/${rb.id}/revoke`)).status, 404);
  const revoked = await patch(`/api/admin/authorizations/${authId}/revoke`);
  ok(revoked, 200); assert.deepEqual([revoked.data.status, (await h.findRequest(c)).status], ['REVOKED', 'REVOKED']);
  assert.equal((await patch(`/api/admin/authorizations/${authId}/revoke`)).status, 409);

  assert.equal((await patch('/api/admin/access-requests/nao-e-uuid/approve')).status, 404);
  assert.equal((await patch('/api/admin/access-requests/00000000-0000-4000-8000-000000000000/approve')).status, 404);
  assert.equal((await admin('/api/admin/access-requests?status=QUALQUER')).status, 400);

  const log = await persistence.auditLog();
  for (const action of ['REQUEST_APPROVED', 'REQUEST_REJECTED', 'AUTHORIZATION_REVOKED']) assert.ok(log.some((l) => l.action === action), action);
});

test('listagens: filtro por status, busca, resumo e autorizações utilizadas', async () => {
  const e = email('listagem');
  await h.fullSignup('Pessoa Listada', e);
  const used = (await admin('/api/admin/authorizations?status=USED')).data;
  assert.ok(used.items.some((a) => a.email === e && a.name === 'Pessoa Listada' && a.usedAt));
  assert.equal((await admin(`/api/admin/access-requests?status=USED&q=${e}`)).data.total, 1);
  assert.equal((await admin(`/api/admin/access-requests?status=PENDING&q=${e}`)).data.total, 0);
  const summary = (await admin('/api/admin/summary')).data;
  assert.ok(summary.requests.PENDING >= 1 && summary.requests.USED >= 1 && summary.users >= 8);
  assert.equal((await admin('/api/admin/access-requests?limit=1')).data.items.length, 1);
  const users = (await admin('/api/admin/users')).data;
  assert.ok(users.items.every((u) => u.passwordHash === undefined && u.role && u.status));
});

test('aprovar e-mail que já tem conta: 409 (conta duplicada)', async () => {
  const r = await h.requestAccess('Alguém Qualquer', 'x@exemplo.test');
  ok(r, 202);
  await persistence.access.addRequest({ id: '11111111-1111-4111-8111-111111111111', name: 'Lucas', email: 'lucas@exemplo.com', institution: '012', status: 'PENDING', createdAt: new Date().toISOString() });
  const res = await admin('/api/admin/access-requests/11111111-1111-4111-8111-111111111111/approve', { method: 'PATCH' });
  assert.equal(res.status, 409);
});

test('suspender e reativar conta: perde acesso na hora, some do diretório público', async () => {
  const e = email('susp');
  const token = await h.signup('Conta Suspensa', e);
  const id = (await admin(`/api/admin/users?q=${e}`)).data.items[0].id;
  assert.equal((await call('/api/auth/me', { token })).status, 200);
  assert.equal((await call('/api/members/conta-suspensa')).status, 200);

  ok(await admin(`/api/admin/users/${id}/suspend`, { method: 'PATCH' }), 200);
  assert.equal((await call('/api/auth/me', { token })).status, 401);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: e, password: '12345678' } })).status, 403);
  assert.equal((await call('/api/members/conta-suspensa')).status, 404);

  ok(await admin(`/api/admin/users/${id}/reactivate`, { method: 'PATCH' }), 200);
  assert.equal((await call('/api/auth/me', { token })).status, 200);

  const adminId = (await admin('/api/admin/users?q=admin@escola.test')).data.items[0].id;
  assert.equal((await admin(`/api/admin/users/${adminId}/suspend`, { method: 'PATCH' })).status, 409);
  // administradores não aparecem no diretório de alunos
  assert.ok(!(await call('/api/members')).data.some((m) => m.name === 'Admin Teste'));
  assert.equal((await call('/api/members/admin')).status, 404);
});

// ---------------------------------------------------------------- cadastro
test('cadastro com e-mail aprovado: cria conta e consome a autorização', async () => {
  const e = email('feliz');
  const res = await h.fullSignup('Feliz Aluna', e);
  ok(res, 201);
  assert.deepEqual([res.data.user.email, res.data.user.role, res.data.user.slug], [e, 'STUDENT', 'feliz-aluna']);
  assert.equal((await call('/api/auth/me', { token: res.data.token })).status, 200);
  assert.equal((await h.findRequest(e)).status, 'USED');
  assert.equal((await persistence.access.findAuthorizationByEmail(e)).status, 'USED');
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: e, password: '12345678' } })).status, 200);
});

test('e-mail sem autorização válida: mesma resposta e nenhum código enviado', async () => {
  const [pending, rejected, revoked, unknown, used] = [email('p'), email('r'), email('v'), email('n'), email('u')];
  for (const e of [pending, rejected, revoked, used]) await h.requestAccess('Pessoa Teste', e);
  await admin(`/api/admin/access-requests/${(await h.findRequest(rejected)).id}/reject`, { method: 'PATCH' });
  await h.approve(revoked);
  await admin(`/api/admin/authorizations/${(await h.findRequest(revoked)).authorizationId}/revoke`, { method: 'PATCH' });
  await h.fullSignup('Pessoa Teste', used); // autorização já consumida

  const approved = email('aprovado');
  await h.requestAccess('Pessoa Teste', approved); await h.approve(approved);

  time.advance(61_000); // passa o intervalo mínimo entre envios do cadastro anterior
  const before = outbox.length;
  const answers = [];
  for (const e of [pending, rejected, revoked, unknown, used, approved]) answers.push(await h.startRegistration('Pessoa Teste', e));
  assert.ok(answers.every((a) => a.status === 202 && a.data.message === answers[0].data.message), 'respostas idênticas');
  assert.deepEqual(outbox.slice(before).map((m) => m.to), [approved], 'só o aprovado recebe código');
  assert.equal(h.lastCode(pending), undefined);
});

test('token de verificação falso, de outro e-mail ou reaproveitado é recusado', async () => {
  const [a, b] = [email('ta'), email('tb')];
  for (const e of [a, b]) { await h.requestAccess('Pessoa Token', e); await h.approve(e); await h.startRegistration('Pessoa Token', e); }
  assert.equal((await h.complete('Pessoa Token', a, 'lixo.lixo')).status, 401);
  const tokenA = (await h.verify(a, h.lastCode(a))).data.verificationToken;
  assert.equal((await h.complete('Pessoa Token', b, tokenA)).status, 403); // token de A não serve para B
  assert.equal((await call('/api/auth/register', { method: 'POST', body: h.requestBody('x', a) })).status, 400); // formato errado
  ok(await h.complete('Pessoa Token', a, tokenA), 201);
  assert.equal((await h.complete('Pessoa Token', a, tokenA)).status, 403); // uso único
  assert.equal((await persistence.access.findAuthorizationByEmail(b)).status, 'APPROVED'); // B intacto
});

test('requisições simultâneas: só uma conta nasce da mesma autorização', async () => {
  const e = email('corrida');
  await h.requestAccess('Corrida Dupla', e); await h.approve(e); await h.startRegistration('Corrida Dupla', e);
  const { data: { verificationToken } } = await h.verify(e, h.lastCode(e));
  const results = await Promise.all(Array.from({ length: 5 }, () => h.complete('Corrida Dupla', e, verificationToken)));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses.filter((s) => s === 201).length, 1, statuses.join(','));
  assert.ok(statuses.every((s) => s === 201 || s === 403 || s === 409));
  assert.equal((await admin(`/api/admin/users?q=${e}`)).data.total, 1);
});

test('cadastro direto sem passar pela autorização não existe mais', async () => {
  const res = await h.startRegistration('Penetra Total', email('penetra'));
  ok(res, 202);
  assert.equal(res.data.token, undefined);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'penetra@x.com', password: '12345678' } })).status, 401);
});

// ---------------------------------------------------------------- confirmação de e-mail
const approvedWithCode = async (tag) => {
  const e = email(tag);
  await h.requestAccess('Pessoa Código', e); await h.approve(e); await h.startRegistration('Pessoa Código', e);
  return { e, code: h.lastCode(e) };
};

test('código: 6 dígitos, só o hash é guardado, nunca aparece em respostas', async () => {
  const { e, code } = await approvedWithCode('cod');
  assert.match(code, /^\d{6}$/);
  const stored = await persistence.access.getVerification(e);
  assert.notEqual(stored.codeHash, code);
  assert.match(stored.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(Date.parse(stored.expiresAt) - Date.parse(stored.lastSentAt), CODE_TTL_MS);
  const res = await h.startRegistration('Pessoa Código', email('cod2'));
  assert.ok(!JSON.stringify(res.data).includes(code));
  const ok1 = await h.verify(e, code);
  assert.ok(!JSON.stringify(ok1.data).includes(code));
});

test('código incorreto não confirma e o correto ainda funciona dentro do limite', async () => {
  const { e, code } = await approvedWithCode('err');
  const wrong = code === '000000' ? '111111' : '000000';
  const bad = await h.verify(e, wrong);
  assert.deepEqual([bad.status, bad.data.error], [400, 'Código inválido ou expirado.']);
  assert.equal((await h.verify(e, 'abc')).status, 400);
  assert.equal((await h.verify(email('nunca'), '123456')).status, 400); // mesma resposta para e-mail sem código
  assert.equal((await h.verify(e, code)).status, 200);
});

test('código expirado após 10 minutos', async () => {
  const { e, code } = await approvedWithCode('exp');
  time.advance(CODE_TTL_MS - 1000);
  const stillOk = await h.verify(e, code);
  ok(stillOk, 200);
  const second = await approvedWithCode('exp2');
  time.advance(CODE_TTL_MS + 1000);
  assert.equal((await h.verify(second.e, second.code)).status, 400);
});

test('código só vale uma vez', async () => {
  const { e, code } = await approvedWithCode('uso');
  ok(await h.verify(e, code), 200);
  assert.equal((await h.verify(e, code)).status, 400);
});

test('excesso de tentativas bloqueia até o código vencer, mesmo com o código certo', async () => {
  const { e, code } = await approvedWithCode('blq');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < MAX_ATTEMPTS; i++) assert.equal((await h.verify(e, wrong)).status, 400);
  assert.equal((await h.verify(e, wrong)).status, 429);
  assert.equal((await h.verify(e, code)).status, 429, 'bloqueado inclusive com o código certo');
  time.advance(61_000);
  assert.equal((await h.call('/api/auth/resend-verification', { method: 'POST', body: { email: e } })).status, 429, 'reenvio não destrava');
  time.advance(CODE_TTL_MS);
  ok(await h.call('/api/auth/resend-verification', { method: 'POST', body: { email: e } }), 202); // vencido: novo código liberado
  assert.equal((await h.verify(e, h.lastCode(e))).status, 200);
});

test('reenvio: respeita o intervalo, invalida o código anterior e não revela autorização', async () => {
  const { e, code } = await approvedWithCode('rsv');
  const resend = (to) => h.call('/api/auth/resend-verification', { method: 'POST', body: { email: to } });
  assert.equal((await resend(e)).status, 429, 'reenvio imediato');
  time.advance(61_000);
  const before = outbox.length;
  const again = await resend(e);
  ok(again, 202);
  assert.equal(outbox.length, before + 1);
  const fresh = h.lastCode(e);
  assert.notEqual(fresh, code);
  if (fresh !== code) assert.equal((await h.verify(e, code)).status, 400, 'código antigo não vale mais');
  ok(await h.verify(e, fresh), 200);

  // e-mail desconhecido: mesma resposta e mesmo limite, sem envio
  const stranger = email('estranho');
  const r1 = await resend(stranger), r2 = await resend(stranger);
  assert.deepEqual([r1.status, r1.data.message === again.data.message, r2.status], [202, true, 429]);
  assert.equal(h.lastCode(stranger), undefined);
});

test('sem serviço de e-mail configurado o cadastro falha (não finge envio)', async () => {
  const off = await createHarness({ emailConfigured: false, shared: persistence, adminEmail: 'admin2@escola.test' });
  try {
    const e = 'sem.email@exemplo.test';
    await off.requestAccess('Sem Email', e); await off.approve(e);
    const res = await off.startRegistration('Sem Email', e);
    assert.equal(res.status, 503);
    assert.equal((await off.startRegistration('Outro Qualquer', 'qualquer@exemplo.test')).status, 503, 'mesma resposta para qualquer e-mail');
    assert.equal(off.outbox.length, 0);
  } finally { await off.close(); }
});

test('retenção: remove rejeitadas/revogadas antigas e verificações vencidas, preserva o resto', async () => {
  const [old, keep] = [email('antiga'), email('viva')];
  await h.requestAccess('Pessoa Antiga', old); await h.requestAccess('Pessoa Viva', keep);
  await admin(`/api/admin/access-requests/${(await h.findRequest(old)).id}/reject`, { method: 'PATCH' });
  const future = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const out = await persistence.access.purge({ requestsBefore: future, verificationsBefore: future });
  assert.ok(out.requests >= 1);
  assert.equal(await h.findRequest(old), undefined);
  assert.equal((await h.findRequest(keep)).status, 'PENDING');
});
