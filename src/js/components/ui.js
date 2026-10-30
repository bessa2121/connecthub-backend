import { html, initials, hueOf, brandHue, ICONS, fmtDate } from '../lib/html.js';

export function toast(message, bad = false) {
  const el = document.createElement('div');
  el.className = `toast${bad ? ' bad' : ''}`; el.textContent = message;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 3500);
}

export const cover = (p, big = false) => html`<div class="cover${big ? ' big' : ''}" style="background:linear-gradient(135deg,hsl(${brandHue(p.hue)} 72% 38%),hsl(${(brandHue(p.hue) + 40) % 360} 78% 52%))" role="img" aria-label="Capa do projeto ${p.title}">${ICONS[p.course] ?? '💡'}${p.featured && !big ? html`<span class="badge">Destaque</span>` : ''}</div>`;
export const avatar = (u, lg = false) => html`<span class="avatar${lg ? ' lg' : ''}" style="background:hsl(${hueOf(u.name)} 60% 46%)" aria-hidden="true">${initials(u.name)}</span>`;
export const authorsLine = (authors) => html`por ${authors.map((a, i) => html`${i ? ', ' : ''}<a href="/comunidade/${a.slug}"><strong>${a.name}</strong></a>`)}`;

export const projectCard = (p) => html`
  <article class="card">
    <a href="/projetos/${p.slug}" aria-label="Abrir ${p.title}">${cover(p)}</a>
    <div class="body">
      <span class="meta">${p.course} · ${p.year}</span>
      <h3><a href="/projetos/${p.slug}">${p.title}</a></h3>
      ${p.subtitle ? html`<strong class="muted">${p.subtitle}</strong>` : ''}
      <p class="muted">${p.summary}</p>
      <div class="chips">${p.tags.slice(0, 5).map((t) => html`<span class="chip">${t}</span>`)}</div>
      <p class="meta" style="margin:auto 0 0">${authorsLine(p.authors)} · ${fmtDate(p.createdAt)} · ♥ ${p.likes}</p>
      <a class="btn ghost sm" href="/projetos/${p.slug}" style="align-self:flex-start">Ver projeto</a>
    </div>
  </article>`;

export const memberCard = (m) => html`
  <a class="card member" href="/comunidade/${m.slug}">
    ${avatar(m)}
    <div><h3>${m.name}</h3><span class="meta">${m.course} · ${m.year}</span>
      <p class="muted" style="margin:.5em 0">${m.bio || 'Ainda sem bio.'}</p>
      <div class="chips">${m.skills.slice(0, 4).map((s) => html`<span class="chip">${s}</span>`)}</div></div>
  </a>`;

export const fieldError = (errors, name) => errors?.[name] ? html`<span class="err">${errors[name]}</span>` : '';
export const options = (list, selected = '', placeholder) => html`${placeholder ? html`<option value="">${placeholder}</option>` : ''}${list.map((o) => html`<option ${o === selected ? 'selected' : ''}>${o}</option>`)}`;

/** Liga um <form> a um handler async, tratando loading e erros de validação do servidor. */
export function bindForm(form, onSubmit) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]'); btn.disabled = true;
    form.querySelectorAll('.err,.alert').forEach((n) => n.remove());
    try { await onSubmit(Object.fromEntries(new FormData(form))); }
    catch (err) {
      for (const [name, msg] of Object.entries(err.details ?? {})) {
        const field = form.elements[name]; if (!field) continue;
        const s = document.createElement('span'); s.className = 'err'; s.textContent = msg; field.closest('label').append(s);
      }
      const a = document.createElement('div'); a.className = 'alert'; a.setAttribute('role', 'alert'); a.textContent = err.message;
      form.prepend(a);
    } finally { btn.disabled = false; }
  });
}
