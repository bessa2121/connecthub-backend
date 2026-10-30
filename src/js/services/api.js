const KEY = 'connecthub.token';
const BASE = (window.__CONNECTHUB__?.API_URL ?? '').replace(/\/$/, '');
export const tokenStore = { get: () => localStorage.getItem(KEY), set: (t) => localStorage.setItem(KEY, t), clear: () => localStorage.removeItem(KEY) };

export class ApiError extends Error { constructor(message, status, details) { super(message); this.status = status; this.details = details; } }

async function request(method, path, body) {
  const token = tokenStore.get();
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { ...(body && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.', 0);
  }
  const data = res.status === 204 ? null : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error ?? 'Algo deu errado.', res.status, data?.details);
  return data;
}
const qs = (obj) => { const p = new URLSearchParams(Object.entries(obj).filter(([, v]) => v)); return p.size ? `?${p}` : ''; };

export const api = {
  meta: () => request('GET', '/meta'),
  register: (b) => request('POST', '/auth/register', b),
  login: (b) => request('POST', '/auth/login', b),
  me: () => request('GET', '/auth/me'),
  projects: (f = {}) => request('GET', `/projects${qs(f)}`),
  project: (slug) => request('GET', `/projects/${slug}`),
  publish: (b) => request('POST', '/projects', b),
  removeProject: (slug) => request('DELETE', `/projects/${slug}`),
  like: (slug) => request('POST', `/projects/${slug}/like`),
  members: (f = {}) => request('GET', `/members${qs(f)}`),
  member: (slug) => request('GET', `/members/${slug}`),
  updateProfile: (b) => request('PUT', '/profile', b),
};
