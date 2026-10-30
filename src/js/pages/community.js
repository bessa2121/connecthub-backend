import { html } from '../lib/html.js';
import { api } from '../services/api.js';
import { session } from '../services/session.js';
import { navigate } from '../router.js';
import { avatar, bindForm, memberCard, projectCard, options, toast } from '../components/ui.js';

export async function communityPage({ query }) {
  const [list, meta] = await Promise.all([api.members(query), api.meta()]);
  return {
    title: 'Comunidade',
    view: html`<section class="wrap section" style="padding-top:40px">
      <span class="eyebrow">Comunidade</span><h1 style="font-size:2.4rem">Conheça quem faz o ConnectHub acontecer</h1>
      <form class="toolbar" data-filters role="search">
        <input name="q" type="search" placeholder="Buscar por nome, curso ou habilidade…" value="${query.q ?? ''}" aria-label="Buscar">
        <select name="course" aria-label="Curso">${options(meta.courses, query.course, 'Todos os cursos')}</select>
      </form>
      ${list.length ? html`<div class="grid g3">${list.map(memberCard)}</div>` : html`<div class="empty">Ninguém encontrado.</div>`}
    </section>`,
    mount(root) {
      const f = root.querySelector('[data-filters]');
      const go = () => { const p = new URLSearchParams({ q: f.q.value.trim(), course: f.course.value }); [...p].forEach(([k, v]) => !v && p.delete(k)); navigate(`/comunidade${p.size ? `?${p}` : ''}`); };
      f.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      f.course.addEventListener('change', go);
    },
  };
}

export async function talentsPage({ query }) {
  const meta = await api.meta(), list = await api.members(query);
  return {
    title: 'Talentos',
    view: html`<section class="wrap section" style="padding-top:40px">
      <span class="eyebrow">Talentos</span><h1 style="font-size:2.4rem">Encontre habilidades para o seu próximo projeto</h1>
      <p class="muted">Filtre por habilidade e convide alguém para colaborar. ${session.user ? '' : html`<a href="/cadastro"><strong>Cadastre-se</strong></a> para aparecer aqui.`}</p>
      <div class="chips" style="margin:20px 0 28px">
        <a class="chip" style="${!query.skill ? 'background:var(--brand);color:#fff' : ''}" href="/talentos">Todas</a>
        ${meta.skills.map((s) => html`<a class="chip" style="${query.skill === s ? 'background:var(--brand);color:#fff' : ''}" href="/talentos?skill=${encodeURIComponent(s)}">${s}</a>`)}
      </div>
      <div class="grid g3">${list.map(memberCard)}</div>
    </section>`,
  };
}

export async function memberPage({ params }) {
  const m = await api.member(params.slug), me = session.user, own = me?.id === m.id;
  const meta = own ? await api.meta() : null;
  return {
    title: m.name,
    view: html`<section class="wrap section" style="padding-top:40px">
      <div class="row" style="gap:24px;align-items:flex-start">${avatar(m, true)}
        <div style="flex:1;min-width:240px"><span class="eyebrow">${m.course} · ${m.year}</span><h1 style="font-size:2.2rem;margin-bottom:.2em">${m.name}</h1>
          <p class="muted">${m.bio || 'Este membro ainda não escreveu uma bio.'}</p>
          <div class="chips">${m.skills.map((s) => html`<a class="chip" href="/talentos?skill=${encodeURIComponent(s)}">${s}</a>`)}</div></div></div>
      ${own ? html`<details style="margin:32px 0"><summary class="btn ghost sm" style="display:inline-flex">Editar perfil</summary>
        <form class="form wide" data-profile style="margin:16px 0 0" novalidate>
          <label>Bio<textarea name="bio" rows="3" maxlength="300">${m.bio}</textarea></label>
          <label>Habilidades (separadas por vírgula)<input name="skills" value="${m.skills.join(', ')}"></label>
          <div class="grid g2"><label>Curso<select name="course">${options(meta.courses, m.course)}</select></label><label>Ano<select name="year">${options(meta.years, m.year)}</select></label></div>
          <button class="btn" type="submit">Salvar perfil</button></form></details>` : ''}
      <h2 style="margin-top:40px">Projetos (${m.projects.length})</h2>
      ${m.projects.length ? html`<div class="grid g3">${m.projects.map(projectCard)}</div>` : html`<div class="empty">Nenhum projeto publicado ainda.</div>`}
    </section>`,
    mount(root) {
      const form = root.querySelector('[data-profile]');
      if (form) bindForm(form, async (data) => { session.setUser(await api.updateProfile(data)); toast('Perfil atualizado!'); navigate(`/comunidade/${m.slug}`); });
    },
  };
}
