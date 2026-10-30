// Template literal seguro: tudo que é interpolado é escapado, exceto trechos gerados por html``.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const render = (v) => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : v == null || v === false ? '' : esc(v);
export const html = (strings, ...values) => new Raw(strings.reduce((out, s, i) => out + s + (i < values.length ? render(values[i]) : ''), ''));
export const fmtDate = (iso) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
export const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
// Mantém todas as cores geradas na faixa azul (220°) → roxo (280°) → vermelho (350°)
export const brandHue = (n) => 220 + (Math.abs(n) % 130);
export const hueOf = (text) => brandHue([...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
export const ICONS = { 'Desenvolvimento de Sistemas': '💻', Marketing: '📣', Eventos: '🎭', 'Nutrição': '🥗', Gastronomia: '🍳' };
