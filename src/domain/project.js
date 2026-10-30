import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';
import { COURSES, YEARS, clean, splitList, uniqueSlug } from './shared.js';

export function parseProject(input) {
  const data = {
    title: clean(input.title), subtitle: clean(input.subtitle), summary: clean(input.summary),
    description: clean(input.description), course: clean(input.course), year: clean(input.year),
    tags: splitList(input.tags, 8), link: clean(input.link),
  };
  const errors = {};
  if (data.title.length < 3 || data.title.length > 80) errors.title = 'O título precisa ter de 3 a 80 caracteres.';
  if (data.subtitle.length > 120) errors.subtitle = 'Máximo de 120 caracteres.';
  if (data.summary.length < 10 || data.summary.length > 300) errors.summary = 'O resumo precisa ter de 10 a 300 caracteres.';
  if (data.description.length > 4000) errors.description = 'Máximo de 4000 caracteres.';
  if (!COURSES.includes(data.course)) errors.course = 'Selecione o curso.';
  if (!YEARS.includes(data.year)) errors.year = 'Selecione o ano.';
  if (data.link && !/^https?:\/\/\S+$/i.test(data.link)) errors.link = 'Use um link começando com http:// ou https://';
  if (Object.keys(errors).length) throw new ValidationError('Verifique os campos.', errors);
  return data;
}

export function buildProject({ input, authorId, slugExists }) {
  return {
    id: randomUUID(), slug: uniqueSlug(input.title, slugExists), ...input,
    authorIds: [authorId], likes: [], featured: false,
    hue: Math.floor(Math.random() * 360), createdAt: new Date().toISOString(),
  };
}
