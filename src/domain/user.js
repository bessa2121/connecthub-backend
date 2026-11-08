import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';
import { COURSES, YEARS, clean, splitList, imageIdOf } from './shared.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INSTAGRAM_URL = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]{1,30})\/?(?:[?#].*)?$/i;
const INSTAGRAM_USER = /^[A-Za-z0-9._]{1,30}$/;
const LINKEDIN_URL = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9_%-]{3,100})\/?(?:[?#].*)?$/i;
const LINKEDIN_USER = /^(?:in\/)?([A-Za-z0-9_%-]{3,100})$/;

/** Aceita "@usuario", "usuario" ou o link do perfil e devolve só o usuário ('' = vazio, null = inválido). */
export function parseInstagram(value) {
  const text = clean(value).replace(/^@/, '');
  if (!text) return '';
  const match = INSTAGRAM_URL.exec(text) ?? (INSTAGRAM_USER.test(text) ? [text, text] : null);
  return match ? match[1] : null;
}

/** Aceita o link do perfil, "in/usuario" ou "usuario" e devolve só o identificador ('' = vazio, null = inválido). */
export function parseLinkedin(value) {
  const text = clean(value);
  if (!text) return '';
  const match = LINKEDIN_URL.exec(text) ?? LINKEDIN_USER.exec(text);
  return match ? match[1] : null;
}

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

/** Campos de contato e foto são opcionais: se o cliente não os enviar, o valor atual é mantido. */
export function parseProfile(input, current = {}) {
  const keep = (key) => (input[key] === undefined ? current[key] ?? '' : input[key]);
  const instagram = parseInstagram(keep('instagram'));
  const linkedin = parseLinkedin(keep('linkedin'));
  const data = {
    bio: clean(input.bio), skills: splitList(input.skills), course: clean(input.course), year: clean(input.year),
    avatar: clean(keep('avatar')), contactEmail: clean(keep('contactEmail')).toLowerCase(),
    instagram: instagram ?? '', linkedin: linkedin ?? '',
  };
  const errors = {};
  if (data.bio.length > 300) errors.bio = 'A bio pode ter até 300 caracteres.';
  if (!COURSES.includes(data.course)) errors.course = 'Curso inválido.';
  if (!YEARS.includes(data.year)) errors.year = 'Ano inválido.';
  if (instagram === null) errors.instagram = 'Use seu @usuario ou o link do seu perfil.';
  if (linkedin === null) errors.linkedin = 'Use o link do seu perfil (linkedin.com/in/...).';
  if (data.contactEmail && (data.contactEmail.length > 120 || !EMAIL.test(data.contactEmail))) errors.contactEmail = 'E-mail inválido.';
  if (data.avatar && !imageIdOf(data.avatar)) errors.avatar = 'Imagem inválida.';
  if (Object.keys(errors).length) throw new ValidationError('Verifique os campos.', errors);
  return data;
}

export function buildUser({ input, passwordHash, slug }) {
  return {
    id: randomUUID(), slug, name: input.name, email: input.email,
    passwordHash, course: input.course, year: input.year, bio: '', skills: input.skills,
    avatar: '', instagram: '', linkedin: '', contactEmail: '',
    createdAt: new Date().toISOString(),
  };
}

export const toSelf = ({ passwordHash, ...user }) => user;
// O e-mail de login nunca é público; "contactEmail" só existe se o aluno optar por divulgá-lo.
export const toPublicUser = ({ passwordHash, email, ...user }) => user;
