import { randomUUID } from 'node:crypto';
import { passwordHasher } from './passwordHasher.js';
import { slugify } from '../domain/shared.js';

/** Dados de demonstração (só se o banco estiver vazio). Senha de todos: connecthub123 */
export async function seedDemo({ users, projects }) {
  if ((await users.count()) > 0) return false;
  const passwordHash = passwordHasher.hash('connecthub123');
  const mk = (name, course, year, bio, skills) => ({
    id: randomUUID(), slug: slugify(name), name, email: `${slugify(name).split('-')[0]}@exemplo.com`,
    passwordHash, course, year, bio, skills, createdAt: '2026-05-10T12:00:00.000Z',
  });
  const [lucas, beatriz, mariana, rafael, joao, ana, camila] = [
    mk('Lucas Almeida', 'Desenvolvimento de Sistemas', '3º ano', 'Apaixonado por interfaces e por resolver problemas reais da escola.', ['React', 'JavaScript', 'Banco de Dados']),
    mk('Beatriz Santos', 'Desenvolvimento de Sistemas', '3º ano', 'Back-end, APIs e organização de dados.', ['Node.js', 'Banco de Dados', 'UX']),
    mk('Mariana Costa', 'Marketing', '2º ano', 'Gosto de contar histórias através de campanhas.', ['Design Gráfico', 'Redes Sociais', 'Publicidade']),
    mk('Rafael Oliveira', 'Marketing', '2º ano', 'Pesquisa de público e planejamento de mídia.', ['Pesquisa', 'Marketing Digital', 'Redação']),
    mk('João Pereira', 'Gastronomia', '2º ano', 'Cozinha regional brasileira com técnica e afeto.', ['Cozinha Regional', 'Ficha Técnica', 'Confeitaria']),
    mk('Ana Souza', 'Gastronomia', '2º ano', 'Custos, empreendedorismo e sabores do Brasil.', ['Custos', 'Empreendedorismo', 'Cozinha Regional']),
    mk('Camila Ferreira', 'Eventos', '3º ano', 'Produção cultural e cerimonial.', ['Produção Cultural', 'Cerimonial', 'Logística']),
  ];
  for (const u of [lucas, beatriz, mariana, rafael, joao, ana, camila]) await users.add(u);
  const project = (slug, title, subtitle, summary, course, year, tags, authors, hue, createdAt, featured, description) =>
    ({ id: randomUUID(), slug, title, subtitle, summary, description, course, year, tags, link: '', authorIds: authors.map((a) => a.id), likes: [], featured, hue, createdAt });
  const list = [
    project('agenda-etec', 'Agenda ETEC', 'Organização escolar em um só lugar', 'Sistema web para alunos acompanharem provas, entregas e avisos das turmas, com lembretes automáticos.', 'Desenvolvimento de Sistemas', '3º ano', ['Tecnologia', 'Inovação', 'React', 'JavaScript', 'Banco de Dados'], [lucas, beatriz], 230, '2026-09-18T12:00:00.000Z', true, 'A Agenda ETEC nasceu da dificuldade de acompanhar prazos em vários grupos de mensagens. O sistema centraliza provas, trabalhos e avisos por turma e envia lembretes automáticos.\n\nO projeto foi desenvolvido em React com API própria e banco de dados relacional.'),
    project('campanha-orbit', 'Campanha Energia Jovem', 'Lançamento fictício de bebida para o público universitário', 'Campanha publicitária completa com pesquisa de público, identidade visual, peças impressas e plano para redes sociais.', 'Marketing', '2º ano', ['Comunicação', 'Design', 'Publicidade', 'Marketing Digital', 'Design Gráfico'], [mariana, rafael], 330, '2026-08-30T12:00:00.000Z', true, 'Da pesquisa de público ao plano de redes sociais, a equipe construiu uma campanha completa para uma marca fictícia de bebida energética.'),
    project('sabores-do-brasil', 'Sabores do Brasil', 'Menu degustação com ingredientes regionais', 'Releitura de pratos tradicionais de cinco regiões do país, com fichas técnicas e cálculo de custo por porção.', 'Gastronomia', '2º ano', ['Alimentação', 'Empreendedorismo', 'Gastronomia', 'Engenharia de Alimentos'], [joao, ana], 280, '2026-06-25T12:00:00.000Z', true, 'Cada prato representa uma região do Brasil e conta com ficha técnica, rendimento e custo por porção.'),
    project('noite-cultural', 'Noite Cultural Camargo Aranha', 'Um evento aberto à comunidade', 'Planejamento e produção de uma noite com apresentações artísticas, praça de alimentação e exposição de projetos dos alunos.', 'Eventos', '3º ano', ['Cultura', 'Produção', 'Comunidade'], [camila], 350, '2026-05-20T12:00:00.000Z', false, 'Cronograma, orçamento, captação de apoiadores e roteiro do evento.'),
  ];
  for (const p of list) await projects.add(p);
  return true;
}
