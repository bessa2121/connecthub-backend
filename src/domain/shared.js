export const COURSES = ['Desenvolvimento de Sistemas', 'Marketing', 'Eventos', 'Nutrição', 'Gastronomia'];
export const YEARS = ['1º ano', '2º ano', '3º ano'];

export const clean = (v) => String(v ?? '').trim();

export function slugify(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function uniqueSlug(base, exists) {
  const root = slugify(base) || 'item';
  let slug = root, n = 2;
  while (exists(slug)) slug = `${root}-${n++}`;
  return slug;
}

export function splitList(value, max = 10) {
  const items = Array.isArray(value) ? value : String(value ?? '').split(',');
  return [...new Set(items.map((s) => String(s).trim()).filter((s) => s && s.length <= 30))].slice(0, max);
}
