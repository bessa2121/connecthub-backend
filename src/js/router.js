import { html } from './lib/html.js';

const routes = [];
let outlet;
export const route = (pattern, page) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  routes.push({ re, keys, page });
};

export function navigate(path, { replace = false } = {}) {
  history[replace ? 'replaceState' : 'pushState'](null, '', path);
  return render();
}

export async function render() {
  const url = new URL(location.href);
  const found = routes.map((r) => ({ r, m: r.re.exec(url.pathname) })).find((x) => x.m);
  outlet.innerHTML = '<div class="spinner" role="status" aria-label="Carregando"></div>';
  const hint = setTimeout(() => outlet.insertAdjacentHTML('beforeend', '<p class="hint">Acordando o servidor… na primeira visita isso pode levar até 1 minuto.</p>'), 4000);
  let result;
  try {
    const params = found ? Object.fromEntries(found.r.keys.map((k, i) => [k, decodeURIComponent(found.m[i + 1])])) : {};
    result = found ? await found.r.page({ params, query: Object.fromEntries(url.searchParams) })
      : { title: 'Página não encontrada', view: html`<section class="wrap section center"><h1>404</h1><p class="muted">Não encontramos esta página.</p><a class="btn" href="/">Voltar ao início</a></section>` };
  } catch (err) {
    if (err.redirect) { clearTimeout(hint); return navigate(err.redirect, { replace: true }); }
    result = { title: 'Erro', view: html`<section class="wrap section center"><h2>${err.status === 404 ? 'Não encontrado' : 'Ops!'}</h2><p class="muted">${err.message}</p><a class="btn" href="/">Voltar ao início</a></section>` };
  }
  clearTimeout(hint);
  document.title = result.title ? `${result.title} · ConnectHub` : 'ConnectHub — Projetos e talentos da ETEC Camargo Aranha';
  outlet.innerHTML = result.view.toString();
  result.mount?.(outlet);
  window.scrollTo(0, 0);
  outlet.focus({ preventScroll: true });
  window.dispatchEvent(new Event('routechange'));
}

export function startRouter(el) {
  outlet = el;
  addEventListener('popstate', render);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target || a.origin !== location.origin || a.hasAttribute('download')) return;
    e.preventDefault();
    navigate(a.pathname + a.search);
  });
  return render();
}
export const redirect = (to) => Object.assign(new Error('redirect'), { redirect: to });
