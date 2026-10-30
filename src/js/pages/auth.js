import { html } from '../lib/html.js';
import { api } from '../services/api.js';
import { session } from '../services/session.js';
import { navigate, redirect } from '../router.js';
import { bindForm, options, toast } from '../components/ui.js';

const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');

export async function loginPage({ query }) {
  if (session.user) throw redirect('/');
  return {
    title: 'Entrar',
    view: html`<section class="wrap section"><div class="narrow">
      <h1 style="font-size:2rem">Entrar</h1><p class="muted">Acesse sua conta para publicar projetos e curtir ideias.</p>
      <form class="form" data-form novalidate>
        <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Senha<input name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn" type="submit">Entrar</button>
        <p class="meta center" style="margin:0">Novo por aqui? <a href="/cadastro"><strong>Cadastre-se</strong></a></p>
      </form>
      <p class="meta center" style="margin-top:16px">Demonstração: <code>lucas@exemplo.com</code> / <code>connecthub123</code></p>
    </div></section>`,
    mount: (root) => bindForm(root.querySelector('[data-form]'), async (data) => {
      session.start(await api.login(data)); toast('Bem-vindo de volta!'); navigate(safeNext(query.next));
    }),
  };
}

export async function registerPage() {
  if (session.user) throw redirect('/');
  const meta = await api.meta();
  return {
    title: 'Cadastro',
    view: html`<section class="wrap section"><div class="narrow">
      <h1 style="font-size:2rem">Criar conta</h1><p class="muted">Faça parte da comunidade do ConnectHub.</p>
      <form class="form" data-form novalidate>
        <label>Nome completo<input name="name" autocomplete="name" required></label>
        <label>E-mail<input name="email" type="email" autocomplete="email" required></label>
        <label>Senha (mín. 8 caracteres)<input name="password" type="password" autocomplete="new-password" required></label>
        <div class="grid g2"><label>Curso<select name="course">${options(meta.courses, '', 'Selecione')}</select></label>
          <label>Ano<select name="year">${options(meta.years, '', 'Selecione')}</select></label></div>
        <label>Habilidades (opcional, separadas por vírgula)<input name="skills" placeholder="Design, React, Redação"></label>
        <button class="btn" type="submit">Criar conta</button>
        <p class="meta center" style="margin:0">Ao se cadastrar você concorda com os <a href="/termos"><strong>Termos</strong></a> e a <a href="/privacidade"><strong>Privacidade</strong></a>.</p>
      </form></div></section>`,
    mount: (root) => bindForm(root.querySelector('[data-form]'), async (data) => {
      session.start(await api.register(data)); toast('Conta criada com sucesso!'); navigate('/');
    }),
  };
}
