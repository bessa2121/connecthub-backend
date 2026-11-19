import test from 'node:test';
import assert from 'node:assert/strict';
import { createHarness } from './helpers.js';

// Roda a mesma suíte em memória e, se TEST_DATABASE_URL existir, também em PostgreSQL.
const h = await createHarness();
const { call, base, signup } = h;
test.after(h.close);

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
  const token = await signup('Aluno Teste', 'teste@x.com');
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

// ---------- v1.1: edição, contatos, fotos e desempenho ----------
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const upload = (token, data = PNG) => call('/api/images', { method: 'POST', token, body: { data } });
const profileBody = (extra = {}) => ({ bio: '', skills: '', course: 'Marketing', year: '2º ano', ...extra });

test('editar projeto: só autores, endereço estável e validação', async () => {
  const [autor, outro] = [await signup('Autora Editora', 'editora@x.com'), await signup('Outro Aluno', 'outroaluno@x.com')];
  const base = { title: 'Projeto Editável', summary: 'Resumo inicial do projeto.', course: 'Marketing', year: '2º ano', tags: 'A, B' };
  assert.equal((await call('/api/projects', { method: 'POST', token: autor, body: base })).status, 201);

  assert.equal((await call('/api/projects/projeto-editavel', { method: 'PUT', body: base })).status, 401);
  assert.equal((await call('/api/projects/projeto-editavel', { method: 'PUT', token: outro, body: base })).status, 403);
  assert.equal((await call('/api/projects/projeto-editavel', { method: 'PUT', token: autor, body: { ...base, title: 'x' } })).status, 400);

  const edited = await call('/api/projects/projeto-editavel', { method: 'PUT', token: autor, body: { ...base, title: 'Título Novo', summary: 'Resumo atualizado do projeto.', link: 'https://exemplo.com/p', tags: 'C' } });
  assert.equal(edited.status, 200);
  assert.deepEqual([edited.data.slug, edited.data.title, edited.data.link, edited.data.tags], ['projeto-editavel', 'Título Novo', 'https://exemplo.com/p', ['C']]);
  assert.equal((await call('/api/projects/projeto-editavel')).data.summary, 'Resumo atualizado do projeto.');
  assert.equal((await call('/api/projects/projeto-editavel', { method: 'PUT', token: autor, body: { ...base, link: 'javascript:alert(1)' } })).data.details.link !== undefined, true);
});

test('marcar colegas: equipe na publicação, só o dono gerencia e exclui, colega pode sair', async () => {
  const [dono, colega, novo] = [await signup('Dona Equipe', 'equipe.dona@x.com'), await signup('Colega Marcado', 'equipe.colega@x.com'), await signup('Novo Integrante', 'equipe.novo@x.com')];
  const idOf = async (token) => (await call('/api/auth/me', { token })).data.id;
  const [donoId, colegaId, novoId] = [await idOf(dono), await idOf(colega), await idOf(novo)];
  const body = { title: 'Projeto em Equipe', summary: 'Projeto feito por várias pessoas.', course: 'Marketing', year: '2º ano', tags: 'Equipe' };
  const put = (token, extra) => call('/api/projects/projeto-em-equipe', { method: 'PUT', token, body: { ...body, ...extra } });
  const slugs = async () => (await call('/api/projects/projeto-em-equipe')).data.authors.map((a) => a.slug);

  // Publicar marcando um colega: duplicados e o próprio dono na lista são ignorados; o dono continua em primeiro.
  const pub = await call('/api/projects', { method: 'POST', token: dono, body: { ...body, authors: [colegaId, colegaId.toUpperCase(), donoId] } });
  assert.equal(pub.status, 201);
  assert.deepEqual(pub.data.authors.map((a) => a.slug), ['dona-equipe', 'colega-marcado']);
  assert.equal(pub.data.ownerId, donoId);
  assert.equal((await call('/api/members/colega-marcado')).data.projects.some((p) => p.slug === 'projeto-em-equipe'), true);
  assert.equal((await call('/api/members')).data.find((m) => m.slug === 'colega-marcado').projectCount, 1);

  // Lista inválida: id malformado, membro inexistente, administrador, conta suspensa e excesso de autores.
  const invalid = (authors) => call('/api/projects', { method: 'POST', token: dono, body: { ...body, title: 'Outro Projeto', authors } });
  assert.ok((await invalid(['nao-e-uuid'])).data.details.authors);
  assert.ok((await invalid(['2f1c0f0e-0000-4000-8000-000000000000'])).data.details.authors);
  const adminId = await idOf(await h.makeAdmin('admin2@escola.test'));
  assert.equal((await invalid([adminId])).status, 400);
  const sumido = await signup('Conta Suspensa', 'equipe.suspensa@x.com');
  const sumidoId = await idOf(sumido);
  assert.equal((await h.admin(`/api/admin/users/${sumidoId}/suspend`, { method: 'PATCH' })).status, 200);
  assert.equal((await invalid([sumidoId])).status, 400);
  const demais = Array.from({ length: 10 }, (_, i) => `2f1c0f0e-0000-4000-8000-${String(i).padStart(12, '0')}`);
  assert.match((await invalid(demais)).data.details.authors, /até 10/);
  assert.equal((await call('/api/projects/outro-projeto')).status, 404, 'nada é publicado quando a equipe é inválida');

  // Colega marcado edita o conteúdo, mas não a equipe nem exclui.
  assert.equal((await put(colega, { title: 'Projeto em Equipe', summary: 'Resumo ajustado pelo colega.' })).status, 200);
  assert.deepEqual(await slugs(), ['dona-equipe', 'colega-marcado'], 'sem o campo authors a equipe não muda');
  assert.equal((await put(colega, { authors: [] })).status, 403);
  assert.equal((await call('/api/projects/projeto-em-equipe', { method: 'DELETE', token: colega })).status, 403);
  assert.equal((await put(novo, {})).status, 403, 'quem não é autor não edita');

  // O dono troca a equipe (aceita texto separado por vírgula); o dono nunca sai da primeira posição.
  assert.deepEqual((await put(dono, { authors: `${novoId}, ${colegaId}` })).data.authors.map((a) => a.slug), ['dona-equipe', 'novo-integrante', 'colega-marcado']);
  assert.deepEqual((await put(dono, { authors: [novoId] })).data.authors.map((a) => a.slug), ['dona-equipe', 'novo-integrante']);
  assert.equal((await call('/api/members/colega-marcado')).data.projects.length, 0, 'quem foi removido deixa de ver o projeto no perfil');
  assert.deepEqual((await put(dono, { authors: [] })).data.authors.map((a) => a.slug), ['dona-equipe'], 'lista vazia remove todos os colegas');
  await put(dono, { authors: [novoId, colegaId] });

  // Sair do projeto: o colega pode; o dono não; quem já saiu não é mais autor.
  assert.equal((await call('/api/projects/projeto-em-equipe/authors/me', { method: 'DELETE', token: dono })).status, 409);
  assert.equal((await call('/api/projects/projeto-em-equipe/authors/me', { method: 'DELETE' })).status, 401);
  assert.equal((await call('/api/projects/projeto-em-equipe/authors/me', { method: 'DELETE', token: colega })).status, 204);
  assert.deepEqual(await slugs(), ['dona-equipe', 'novo-integrante']);
  assert.equal((await call('/api/projects/projeto-em-equipe/authors/me', { method: 'DELETE', token: colega })).status, 403);
  assert.equal((await put(colega, {})).status, 403);

  assert.equal((await call('/api/projects/projeto-em-equipe', { method: 'DELETE', token: dono })).status, 204);
  assert.equal((await call('/api/members/novo-integrante')).data.projects.length, 0);
});

test('contatos do perfil: normaliza, valida e nunca expõe o e-mail de login', async () => {
  const token = await signup('Aluna Contato', 'contato@x.com');
  const ok = await call('/api/profile', { method: 'PUT', token, body: profileBody({ instagram: '@aluna.contato', linkedin: 'https://www.linkedin.com/in/aluna-contato/', contactEmail: 'Aluna.Contato@Gmail.com' }) });
  assert.deepEqual([ok.data.instagram, ok.data.linkedin, ok.data.contactEmail], ['aluna.contato', 'aluna-contato', 'aluna.contato@gmail.com']);

  const bad = await call('/api/profile', { method: 'PUT', token, body: profileBody({ instagram: 'nome com espaço', linkedin: 'x', contactEmail: 'sem-arroba' }) });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.data.details).sort(), ['contactEmail', 'instagram', 'linkedin']);

  const publicProfile = (await call('/api/members/aluna-contato')).data;
  assert.deepEqual([publicProfile.instagram, publicProfile.contactEmail, publicProfile.email], ['aluna.contato', 'aluna.contato@gmail.com', undefined]);

  // clientes antigos (sem os campos novos) não apagam os contatos já salvos
  assert.equal((await call('/api/profile', { method: 'PUT', token, body: profileBody({ bio: 'Nova bio' }) })).data.instagram, 'aluna.contato');
  // string vazia remove
  assert.equal((await call('/api/profile', { method: 'PUT', token, body: profileBody({ instagram: '' }) })).data.instagram, '');
});

test('perfil: portfólio normalizado, bio curta + "Sobre" longo e banner só do dono', async () => {
  const [dono, intruso] = [await signup('Dona Banner', 'banner@x.com'), await signup('Intruso Banner', 'intruso-banner@x.com')];
  const put = (token, extra) => call('/api/profile', { method: 'PUT', token, body: profileBody(extra) });

  assert.equal((await put(dono, { portfolio: 'meusite.com.br' })).data.portfolio, 'https://meusite.com.br/');
  assert.equal((await put(dono, { portfolio: 'https://github.com/dona' })).data.portfolio, 'https://github.com/dona');
  for (const bad of ['javascript:alert(1)', 'ftp://site.com', 'sem espaço.com', 'localhost', 'https://u:p@site.com', `https://site.com/${'a'.repeat(200)}`]) {
    assert.ok((await put(dono, { portfolio: bad })).data.details.portfolio, `rejeita ${bad.slice(0, 30)}`);
  }
  // clientes antigos não apagam o portfólio; string vazia remove
  assert.equal((await put(dono, { bio: 'x' })).data.portfolio, 'https://github.com/dona');
  assert.equal((await put(dono, { portfolio: '' })).data.portfolio, '');

  // bio é curta (300); o texto longo vai em "about" (3000) e só aparece no perfil completo
  assert.equal((await put(dono, { bio: 'a'.repeat(300) })).status, 200);
  assert.ok((await put(dono, { bio: 'a'.repeat(301) })).data.details.bio);
  const about = 'Linha 1\n\n' + 'b'.repeat(2900);
  assert.equal((await put(dono, { about })).data.about, about);
  assert.ok((await put(dono, { about: 'c'.repeat(3001) })).data.details.about);
  assert.equal((await call('/api/members/dona-banner')).data.about, about);
  assert.equal((await call('/api/members')).data.find((m) => m.slug === 'dona-banner').about, undefined, 'lista não traz o texto longo');
  assert.equal((await put(dono, { bio: 'só a bio' })).data.about, about, 'cliente antigo não apaga o "Sobre"');
  assert.equal((await put(dono, { about: '' })).data.about, '');

  const sent = await upload(dono);
  assert.ok((await put(intruso, { banner: sent.data.url })).data.details.banner, 'banner de outra pessoa é recusado');
  assert.equal((await put(dono, { banner: sent.data.url })).data.banner, sent.data.url);
  assert.equal((await call('/api/members/dona-banner')).data.banner, sent.data.url);
  assert.ok((await put(dono, { banner: 'https://x.com/a.png' })).data.details.banner, 'só referências de imagem da própria API');
  // trocar ou remover o banner apaga o arquivo antigo
  assert.equal((await put(dono, { banner: '' })).data.banner, '');
  assert.equal((await fetch(base + sent.data.url)).status, 404);
});

test('imagens: valida, serve com cache longo e só aceita as do próprio usuário', async () => {
  const [dono, intruso] = [await signup('Dona Foto', 'dona@x.com'), await signup('Intruso Foto', 'intruso@x.com')];
  assert.equal((await upload(undefined)).status, 401);
  assert.equal((await upload(dono, 'data:text/html;base64,PGgxPmE8L2gxPg==')).status, 400);
  assert.equal((await upload(dono, 'data:image/png;base64,AAAA')).status, 400); // tipo declarado ≠ bytes reais

  const sent = await upload(dono);
  assert.equal(sent.status, 201);
  const res = await fetch(base + sent.data.url);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.match(res.headers.get('cache-control'), /immutable/);
  assert.equal((await fetch(base + sent.data.url, { headers: { 'If-None-Match': res.headers.get('etag') } })).status, 304);
  assert.equal((await fetch(`${base}/api/images/00000000-0000-4000-8000-000000000000`)).status, 404);

  assert.equal((await call('/api/profile', { method: 'PUT', token: intruso, body: profileBody({ avatar: sent.data.url }) })).data.details.avatar !== undefined, true);
  assert.equal((await call('/api/profile', { method: 'PUT', token: dono, body: profileBody({ avatar: sent.data.url }) })).data.avatar, sent.data.url);
  assert.equal((await call('/api/members/dona-foto')).data.avatar, sent.data.url);

  // trocar a foto apaga a antiga
  const second = await upload(dono);
  await call('/api/profile', { method: 'PUT', token: dono, body: profileBody({ avatar: second.data.url }) });
  assert.equal((await fetch(base + sent.data.url)).status, 404);

  // foto do projeto: criar, manter na edição sem reenviar o campo, remover ao excluir
  const cover = await upload(dono);
  const input = { title: 'Projeto Com Foto', summary: 'Projeto que tem uma foto de capa.', course: 'Marketing', year: '2º ano' };
  assert.equal((await call('/api/projects', { method: 'POST', token: dono, body: { ...input, image: cover.data.url } })).data.image, cover.data.url);
  assert.equal((await call('/api/projects/projeto-com-foto', { method: 'PUT', token: dono, body: input })).data.image, cover.data.url);
  assert.equal((await call('/api/projects/projeto-com-foto', { method: 'DELETE', token: dono })).status, 204);
  assert.equal((await fetch(base + cover.data.url)).status, 404);
});

test('listas omitem a descrição longa e usam ETag (304)', async () => {
  const first = await fetch(`${base}/api/projects`);
  const list = await first.json();
  assert.equal(list[0].description, undefined);
  assert.ok((await call('/api/projects/agenda-etec')).data.description.length > 20);
  const again = await fetch(`${base}/api/projects`, { headers: { 'If-None-Match': first.headers.get('etag') } });
  assert.equal(again.status, 304);
});
