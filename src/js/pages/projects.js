import { html, fmtDate } from '../lib/html.js';
import { api } from '../services/api.js';
import { session } from '../services/session.js';
import { navigate, redirect } from '../router.js';
import { bindForm, cover, projectCard, authorsLine, options, toast } from '../components/ui.js';

export async function projectsPage({ query }) {
  const [list, meta] = await Promise.all([api.projects(query), api.meta()]);
  const url = (patch) => { const p = new URLSearchParams({ ...query, ...patch }); [...p].forEach(([k, v]) => !v && p.delete(k)); return `/projetos${p.size ? `?${p}` : ''}`; };
  return {
    title: 'Projetos',
    view: html`<section class="wrap section" style="padding-top:40px">
      <span class="eyebrow">Projetos</span><h1 style="font-size:2.4rem">Explore o que os alunos estão criando</h1>
      <form class="toolbar" data-filters role="search">
        <input name="q" type="search" placeholder="Buscar por título, tecnologia ou autor…" value="${query.q ?? ''}" aria-label="Buscar projetos">
        <select name="course" aria-label="Curso">${options(meta.courses, query.course, 'Todos os cursos')}</select>
      </form>
      <div class="chips" style="margin-bottom:24px">${meta.tags.map((t) => html`<a class="chip" style="${query.tag === t ? 'background:var(--brand);color:#fff' : ''}" href="${url({ tag: query.tag === t ? '' : t })}">${t}</a>`)}</div>
      ${list.length ? html`<div class="grid g3">${list.map(projectCard)}</div>` : html`<div class="empty"><p>Nenhum projeto encontrado com esses filtros.</p><a class="btn ghost" href="/projetos">Limpar filtros</a></div>`}
    </section>`,
    mount(root) {
      const form = root.querySelector('[data-filters]');
      const go = () => navigate(url({ q: form.q.value.trim(), course: form.course.value }));
      form.addEventListener('submit', (e) => { e.preventDefault(); go(); });
      form.course.addEventListener('change', go);
      if (query.q) { form.q.focus(); form.q.setSelectionRange(99, 99); }
    },
  };
}

export async function projectDetailPage({ params }) {
  const p = await api.project(params.slug);
  const me = session.user, mine = me && p.authors.some((a) => a.id === me.id);
  return {
    title: p.title,
    view: html`<article class="wrap section" style="padding-top:32px">
      <a class="muted" href="/projetos">← Todos os projetos</a>
      <div style="margin:16px 0 28px">${cover(p, true)}</div>
      <div class="wide" style="margin:0">
        <span class="eyebrow">${p.course} · ${p.year}</span>
        <h1>${p.title}</h1>${p.subtitle ? html`<p class="lead muted" style="font-size:1.2rem">${p.subtitle}</p>` : ''}
        <p class="meta">${authorsLine(p.authors)} · ${fmtDate(p.createdAt)}</p>
        <div class="chips" style="margin:16px 0">${p.tags.map((t) => html`<a class="chip" href="/projetos?tag=${encodeURIComponent(t)}">${t}</a>`)}</div>
        <p><strong>${p.summary}</strong></p>
        ${p.description ? html`<p class="prose muted">${p.description}</p>` : ''}
        <div class="row" style="margin-top:24px">
          <button class="btn ghost" data-like aria-pressed="${String(p.liked)}">${p.liked ? '♥' : '♡'} <span>${p.likes}</span></button>
          ${p.link ? html`<a class="btn" href="${p.link}" target="_blank" rel="noopener noreferrer">Ver material do projeto ↗</a>` : ''}
          ${mine ? html`<button class="btn danger sm" data-delete>Excluir</button>` : ''}
        </div>
      </div>
    </article>`,
    mount(root) {
      const likeBtn = root.querySelector('[data-like]');
      likeBtn.onclick = async () => {
        if (!session.user) { toast('Entre para curtir projetos.', true); return navigate(`/entrar?next=${location.pathname}`); }
        const r = await api.like(p.slug);
        likeBtn.innerHTML = `${r.liked ? '♥' : '♡'} <span>${r.likes}</span>`;
        likeBtn.setAttribute('aria-pressed', String(r.liked));
      };
      root.querySelector('[data-delete]')?.addEventListener('click', async () => {
        if (!confirm('Excluir este projeto definitivamente?')) return;
        await api.removeProject(p.slug); toast('Projeto excluído.'); navigate('/projetos');
      });
    },
  };
}

export async function publishPage() {
  if (!session.user) throw redirect('/entrar?next=/projetos/publicar');
  const meta = await api.meta(), u = session.user;
  return {
    title: 'Publicar projeto',
    view: html`<section class="wrap section"><div class="wide">
      <span class="eyebrow">Publicar projeto</span><h1 style="font-size:2.2rem">Mostre o que você criou</h1>
      <form class="form" data-form novalidate>
        <label>Título<input name="title" required maxlength="80" placeholder="Ex.: Agenda ETEC"></label>
        <label>Subtítulo (opcional)<input name="subtitle" maxlength="120"></label>
        <div class="grid g2">
          <label>Curso<select name="course">${options(meta.courses, u.course)}</select></label>
          <label>Ano<select name="year">${options(meta.years, u.year)}</select></label>
        </div>
        <label>Resumo<textarea name="summary" rows="3" maxlength="300" required placeholder="Em poucas linhas, o que é o projeto?"></textarea></label>
        <label>Descrição completa (opcional)<textarea name="description" rows="7" maxlength="4000"></textarea></label>
        <label>Tags (separadas por vírgula)<input name="tags" placeholder="Inovação, React, Design"></label>
        <label>Link do material (opcional)<input name="link" type="url" placeholder="https://"></label>
        <button class="btn" type="submit">Publicar projeto</button>
      </form></div></section>`,
    mount: (root) => bindForm(root.querySelector('[data-form]'), async (data) => {
      const p = await api.publish(data); toast('Projeto publicado!'); navigate(`/projetos/${p.slug}`);
    }),
  };
}
