import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';
import { COURSES, YEARS, clean, splitList, imageIdOf } from './shared.js';

/** "current" (opcional) preserva a imagem quando o cliente não envia o campo — útil na edição. */
export function parseProject(input, current = {}) {
  const data = {
    title: clean(input.title), subtitle: clean(input.subtitle), summary: clean(input.summary),
    description: clean(input.description), course: clean(input.course), year: clean(input.year),
    tags: splitList(input.tags, 8), link: clean(input.link),
    image: clean(input.image === undefined ? current.image : input.image),
  };
  const errors = {};
  if (data.title.length < 3 || data.title.length > 80) errors.title = 'O título precisa ter de 3 a 80 caracteres.';
  if (data.subtitle.length > 120) errors.subtitle = 'Máximo de 120 caracteres.';
  if (data.summary.length < 10 || data.summary.length > 300) errors.summary = 'O resumo precisa ter de 10 a 300 caracteres.';
  if (data.description.length > 4000) errors.description = 'Máximo de 4000 caracteres.';
  if (!COURSES.includes(data.course)) errors.course = 'Selecione o curso.';
  if (!YEARS.includes(data.year)) errors.year = 'Selecione o ano.';
  if (data.link && (data.link.length > 500 || !/^https?:\/\/\S+$/i.test(data.link))) errors.link = 'Use um link começando com http:// ou https://';
  if (data.image && !imageIdOf(data.image)) errors.image = 'Imagem inválida.';
  if (Object.keys(errors).length) throw new ValidationError('Verifique os campos.', errors);
  return data;
}

export const MAX_AUTHORS = 10; // quem publicou + até 9 colegas marcados
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Colegas marcados no projeto: array de ids ou texto "id1,id2". Devolve `undefined` quando o cliente não enviou o campo
 * (na edição, isso significa "não mexa na equipe"). Quem publicou não precisa constar: ele sempre é o primeiro autor.
 */
export function parseCoAuthorIds(value) {
  if (value === undefined) return undefined;
  const items = Array.isArray(value) ? value : String(value ?? '').split(',');
  const ids = [...new Set(items.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
  if (ids.some((id) => !UUID.test(id))) throw new ValidationError('Verifique os campos.', { authors: 'Membro inválido na lista de autores.' });
  return ids;
}

/** O primeiro autor é quem publicou ("dono"): só ele exclui o projeto e gerencia a equipe. */
export function buildProject({ input, authorId, coAuthorIds = [], slug }) {
  return {
    id: randomUUID(), slug, ...input,
    authorIds: [authorId, ...coAuthorIds], likes: [], featured: false,
    hue: Math.floor(Math.random() * 360), createdAt: new Date().toISOString(),
  };
}
