import { html } from '../lib/html.js';
import { api } from '../services/api.js';
import { projectCard } from '../components/ui.js';

const PILLARS = [
  ['👥', 'Comunidade', 'Conheça estudantes de diferentes cursos e descubra pessoas com interesses em comum.'],
  ['🤝', 'Networking', 'Construa conexões, troque experiências e encontre possíveis parceiros para novos projetos.'],
  ['🚀', 'Projetos', 'Explore trabalhos acadêmicos, ideias inovadoras e soluções desenvolvidas pelos alunos.'],
  ['🏆', 'Reconhecimento', 'Dê visibilidade às suas ideias, compartilhe suas conquistas e mostre o que você sabe fazer.'],
  ['✨', 'Talentos', 'Descubra habilidades, encontre colaboradores e apresente suas competências à comunidade.'],
  ['🌱', 'Oportunidades', 'Encontre pessoas, conhecimentos e possibilidades para desenvolver novas iniciativas.'],
];

export async function homePage() {
  const featured = (await api.projects({ featured: '1' })).slice(0, 3);
  return {
    view: html`
    <section class="hero"><div class="wrap">
      <span class="eyebrow" style="color:#d9d4ff">ETEC Camargo Aranha</span>
      <h1>Grandes ideias começam quando pessoas se conectam.</h1>
      <p class="lead">O ConnectHub é uma plataforma de divulgação de projetos e conexão entre alunos da ETEC Camargo Aranha. Descubra ideias criativas, conheça talentos e encontre pessoas para construir o próximo grande projeto.</p>
      <div class="cta"><a class="btn light" href="/projetos">Explorar projetos</a><a class="btn ghost" href="/comunidade">Conhecer a comunidade</a></div>
      <div class="chips">${featured.map((p) => html`<a class="chip" href="/projetos/${p.slug}"><strong>${p.course}</strong> · ${p.title}</a>`)}</div>
    </div></section>

    <section class="wrap section"><div class="wide center">
      <span class="eyebrow">Sobre o ConnectHub</span><h2>Muito mais do que uma vitrine de projetos</h2>
      <p class="muted">Aqui, alunos de Nutrição, Gastronomia, Desenvolvimento de Sistemas, Marketing e Eventos se encontram. Cada projeto publicado é um convite para conversar, colaborar e aprender com quem pensa diferente.</p>
      <p class="muted">Compartilhe o que você criou, encontre colaboradores e transforme trabalhos acadêmicos em oportunidades reais.</p>
    </div></section>

    <section class="wrap"><span class="eyebrow">Pilares</span><h2>O que você encontra no ConnectHub</h2>
      <div class="grid g3">${PILLARS.map(([i, t, d]) => html`<div class="card pillar"><span class="ico">${i}</span><h3>${t}</h3><p class="muted" style="margin:0">${d}</p></div>`)}</div>
    </section>

    <section class="wrap section">
      <div class="row" style="justify-content:space-between"><div><span class="eyebrow">Em destaque</span><h2>Projetos que estão chamando atenção</h2></div><a class="btn ghost" href="/projetos">Explorar todos os projetos</a></div>
      <div class="grid g3">${featured.map(projectCard)}</div>
      <p class="meta" style="margin-top:16px">Projetos de demonstração para apresentar a plataforma.</p>
    </section>

    <section class="wrap" style="padding-bottom:40px"><div class="cta-band">
      <h2>Sua próxima conexão pode transformar uma ideia em realidade.</h2>
      <p class="muted">Compartilhe o que você cria, conheça outros talentos e faça parte de uma comunidade que cresce junto.</p>
      <div class="row"><a class="btn" href="/comunidade">Conhecer a comunidade</a><a class="btn ghost" href="/talentos">Quero fazer parte</a></div>
    </div></section>`,
  };
}
