import assert from 'node:assert/strict';
import { createPersistence } from '../src/infrastructure/persistence/index.js';
import { seedDemo } from '../src/infrastructure/seed.js';
import { passwordHasher } from '../src/infrastructure/passwordHasher.js';
import { buildUser } from '../src/domain/user.js';
import { createApp } from '../src/main.js';

/** Sobe a API com persistência (memória ou TEST_DATABASE_URL), e-mail capturado e relógio controlável. */
export async function createHarness({ allowedOrigins = ['https://site.exemplo.com'], seed = true, emailConfigured = true, shared, adminEmail = 'admin@escola.test' } = {}) {
  // `shared`: reaproveita a persistência de outro harness (sem reset), para não apagar o banco dele.
  const persistence = shared ?? createPersistence(process.env.TEST_DATABASE_URL);
  if (!shared) { await persistence.init(); await persistence.reset(); if (seed) await seedDemo(persistence); }
  const outbox = [];
  const emailSender = { configured: emailConfigured, async sendVerificationCode(msg) { outbox.push(msg); } };
  const time = { now: Date.now(), advance(ms) { this.now += ms; } };
  const server = createApp({ persistence, secret: 'test', allowedOrigins, emailSender, clock: () => time.now }).listen(0);
  const base = `http://localhost:${server.address().port}`;

  let n = 0; // cada chamada vem de um "IP" diferente, para os limites por IP não interferirem entre testes
  const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n++ & 255}`, ...(token && { Authorization: `Bearer ${token}` }), ...headers } });
    return { status: res.status, headers: res.headers, data: res.status === 204 ? null : await res.json().catch(() => null) };
  };
  const close = async () => { server.close(); if (!shared) await persistence.close(); };

  // O primeiro administrador é provisionado direto no banco (como faz scripts/create-admin.js), nunca pela API.
  const makeAdmin = async (email = adminEmail) => {
    const user = { ...buildUser({ input: { name: 'Admin Teste', email, course: 'Administração', year: '3º ano', skills: [] }, passwordHash: passwordHasher.hash('senha-admin-123'), slug: email.split('@')[0] }), role: 'ADMIN' };
    await persistence.users.add(user);
    return (await call('/api/auth/login', { method: 'POST', body: { email, password: 'senha-admin-123' } })).data.token;
  };
  const adminToken = await makeAdmin();
  const admin = (path, opts = {}) => call(path, { token: adminToken, ...opts });

  const requestBody = (name, email) => ({ name, email, emailConfirm: email, institution: '012' });
  const requestAccess = (name, email) => call('/api/access-requests', { method: 'POST', body: requestBody(name, email) });
  const findRequest = async (email) => (await admin(`/api/admin/access-requests?q=${encodeURIComponent(email)}`)).data.items.find((r) => r.email === email.toLowerCase());
  const approve = async (email) => { const r = await findRequest(email); return admin(`/api/admin/access-requests/${r.id}/approve`, { method: 'PATCH' }); };
  const lastCode = (email) => outbox.filter((m) => m.to === email).at(-1)?.code;

  const regBody = (name, email, extra = {}) => ({ name, email, password: '12345678', course: 'Marketing', year: '2º ano', ...extra });
  const startRegistration = (name, email, extra) => call('/api/auth/register', { method: 'POST', body: regBody(name, email, extra) });
  const verify = (email, code) => call('/api/auth/verify-email', { method: 'POST', body: { email, code } });
  const complete = (name, email, verificationToken, extra) => call('/api/auth/register', { method: 'POST', body: regBody(name, email, { verificationToken, ...extra }) });

  /** Fluxo completo até a conta existir. Devolve a resposta final do cadastro. */
  const fullSignup = async (name, email) => {
    assert.equal((await requestAccess(name, email)).status, 202);
    assert.equal((await approve(email)).status, 200);
    assert.equal((await startRegistration(name, email)).status, 202);
    const checked = await verify(email, lastCode(email));
    assert.equal(checked.status, 200);
    return complete(name, email, checked.data.verificationToken);
  };
  const signup = async (name, email) => { const res = await fullSignup(name, email); assert.equal(res.status, 201); return res.data.token; };

  return { persistence, call, base, time, outbox, close, adminToken, admin, makeAdmin, requestBody, requestAccess, findRequest, approve, lastCode, startRegistration, verify, complete, fullSignup, signup };
}
