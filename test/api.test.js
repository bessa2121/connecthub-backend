import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistence } from '../src/infrastructure/persistence/index.js';
import { seedDemo } from '../src/infrastructure/seed.js';
import { createApp } from '../src/main.js';

// Roda a mesma suíte em memória e, se TEST_DATABASE_URL existir, também em PostgreSQL.
const persistence = createPersistence(process.env.TEST_DATABASE_URL);
await persistence.init(); await persistence.reset(); await seedDemo(persistence);
const server = createApp({ persistence, secret: 'test', allowedOrigins: ['https://site.exemplo.com'] }).listen(0);
const base = `http://localhost:${server.address().port}`;
const call = async (path, { method = 'GET', body, token, headers = {} } = {}) => {
  const res = await fetch(base + path, { method, body: body && JSON.stringify(body), headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers } });
  return { status: res.status, headers: res.headers, data: res.status === 204 ? null : await res.json().catch(() => null) };
};
test.after(async () => { server.close(); await persistence.close(); });

test('health e raiz', async () => {
  assert.equal((await call('/api/health')).data.status, 'ok');
  assert.equal((await call('/')).data.service, 'connecthub-api');
});

test('CORS: libera só origens permitidas e responde preflight', async () => {
  const ok = await call('/api/meta', { headers: { Origin: 'https://site.exemplo.com' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'https://site.exemplo.com');
  const bad = await call('/api/meta', { headers: { Origin: 'https://invasor.com' } });
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const pre = await call('/api/projects', { method: 'OPTIONS', headers: { Origin: 'https://site.exemplo.com' } });
  assert.equal(pre.status, 204);
});

test('lista, filtra e mostra autores', async () => {
  const all = (await call('/api/projects')).data;
  assert.equal(all.length, 4);
  assert.equal(all[0].authors.length >= 1, true);
  assert.equal((await call('/api/projects?course=Marketing')).data.length, 1);
  assert.equal((await call('/api/projects?q=react')).data[0].slug, 'agenda-etec');
  assert.equal((await call('/api/projects?featured=1')).data.length, 3);
  assert.equal((await call('/api/projects/agenda-etec')).data.authors.length, 2);
  assert.equal((await call('/api/projects/nao-existe')).status, 404);
});

test('comunidade, talentos e meta', async () => {
  const members = (await call('/api/members')).data;
  assert.equal(members.length, 7);
  assert.equal(members.find((m) => m.slug === 'lucas-almeida').projectCount, 1);
  assert.equal((await call('/api/members?skill=React')).data.length, 1);
  assert.equal((await call('/api/members/joao-pereira')).data.projects.length, 1);
  const meta = (await call('/api/meta')).data;
  assert.ok(meta.tags.includes('React') && meta.skills.includes('Node.js') && meta.courses.length === 5);
  assert.equal(members[0].email, undefined);
});

test('fluxo: cadastro, publicar, curtir, perfil e excluir', async () => {
  const reg = await call('/api/auth/register', { method: 'POST', body: { name: 'Aluno Teste', email: 'teste@x.com', password: '12345678', course: 'Nutrição', year: '1º ano', skills: 'Saúde' } });
  assert.equal(reg.status, 201);
  assert.equal((await call('/api/auth/register', { method: 'POST', body: { name: 'Outro', email: 'teste@x.com', password: '12345678', course: 'Nutrição', year: '1º ano' } })).status, 409);
  const token = reg.data.token;
  assert.equal((await call('/api/auth/me', { token })).data.email, 'teste@x.com');
  assert.equal((await call('/api/projects', { method: 'POST', body: { title: 'x' }, token })).status, 400);
  const pub = await call('/api/projects', { method: 'POST', token, body: { title: 'Cardápio Escolar', summary: 'Cardápio equilibrado para a cantina.', course: 'Nutrição', year: '1º ano', tags: 'Saúde, Nutrição' } });
  assert.equal(pub.status, 201);
  assert.equal(pub.data.authors[0].slug, 'aluno-teste');
  const like = await call('/api/projects/cardapio-escolar/like', { method: 'POST', token });
  assert.deepEqual([like.data.likes, like.data.liked], [1, true]);
  assert.equal((await call('/api/projects/cardapio-escolar/like', { method: 'POST', token })).data.likes, 0);
  const prof = await call('/api/profile', { method: 'PUT', token, body: { bio: 'Olá!', skills: 'Saúde, Receitas', course: 'Nutrição', year: '2º ano' } });
  assert.deepEqual([prof.data.bio, prof.data.skills.length], ['Olá!', 2]);
  assert.equal((await call('/api/projects', { method: 'POST', body: {} })).status, 401);
  assert.equal((await call('/api/projects/agenda-etec', { method: 'DELETE', token })).status, 403);
  assert.equal((await call('/api/projects/cardapio-escolar', { method: 'DELETE', token })).status, 204);
  assert.equal((await call('/api/projects/cardapio-escolar')).status, 404);
});

test('login: credenciais do seed e senha errada', async () => {
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'lucas@exemplo.com', password: 'connecthub123' } })).status, 200);
  assert.equal((await call('/api/auth/login', { method: 'POST', body: { email: 'lucas@exemplo.com', password: 'errada' } })).status, 401);
});
