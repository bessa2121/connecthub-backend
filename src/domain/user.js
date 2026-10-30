import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';
import { COURSES, YEARS, clean, splitList, uniqueSlug } from './shared.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function parseRegistration(input) {
  const data = {
    name: clean(input.name), email: clean(input.email).toLowerCase(), password: String(input.password ?? ''),
    course: clean(input.course), year: clean(input.year), skills: splitList(input.skills),
  };
  const errors = {};
  if (data.name.length < 2 || data.name.length > 80) errors.name = 'Informe seu nome (2 a 80 caracteres).';
  if (!EMAIL.test(data.email)) errors.email = 'E-mail inválido.';
  if (data.password.length < 8) errors.password = 'A senha precisa ter ao menos 8 caracteres.';
  if (!COURSES.includes(data.course)) errors.course = 'Selecione seu curso.';
  if (!YEARS.includes(data.year)) errors.year = 'Selecione seu ano.';
  if (Object.keys(errors).length) throw new ValidationError('Verifique os campos.', errors);
  return data;
}

export function parseProfile(input) {
  const data = { bio: clean(input.bio), skills: splitList(input.skills), course: clean(input.course), year: clean(input.year) };
  const errors = {};
  if (data.bio.length > 300) errors.bio = 'A bio pode ter até 300 caracteres.';
  if (!COURSES.includes(data.course)) errors.course = 'Curso inválido.';
  if (!YEARS.includes(data.year)) errors.year = 'Ano inválido.';
  if (Object.keys(errors).length) throw new ValidationError('Verifique os campos.', errors);
  return data;
}

export function buildUser({ input, passwordHash, slugExists }) {
  return {
    id: randomUUID(), slug: uniqueSlug(input.name, slugExists), name: input.name, email: input.email,
    passwordHash, course: input.course, year: input.year, bio: '', skills: input.skills,
    createdAt: new Date().toISOString(),
  };
}

export const toSelf = ({ passwordHash, ...user }) => user;
export const toPublicUser = ({ passwordHash, email, ...user }) => user;
