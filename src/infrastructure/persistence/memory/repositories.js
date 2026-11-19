import { ConflictError } from '../../../domain/errors.js';
import { createMemoryAccess } from './access.js';

/** Adaptador em memória (desenvolvimento e testes). Mesma interface do adaptador Postgres. */
export function createMemoryPersistence() {
  const state = { users: [], projects: [], images: new Map(), requests: [], authorizations: [], verifications: [], audit: [] };
  const users = {
    all: async () => state.users,
    count: async () => state.users.length,
    findById: async (id) => state.users.find((u) => u.id === id),
    findByIds: async (ids) => state.users.filter((u) => ids.includes(u.id)),
    findByEmail: async (email) => state.users.find((u) => u.email === email),
    findBySlug: async (slug) => state.users.find((u) => u.slug === slug),
    slugExists: async (slug) => state.users.some((u) => u.slug === slug),
    async add(user) {
      if (state.users.some((u) => u.email === user.email)) throw new ConflictError('Este e-mail já está cadastrado.');
      state.users.push(user);
    },
    update: async () => {}, // os objetos já são mutados no lugar
    allSkills: async () => state.users.flatMap((u) => u.skills),
    async list({ status, search, limit, offset }) {
      const term = (search ?? '').toLowerCase();
      const rows = state.users.filter((u) => (!status || (u.status ?? 'ACTIVE') === status) && (!term || `${u.name} ${u.email}`.toLowerCase().includes(term)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { total: rows.length, items: rows.slice(offset, offset + limit).map((u) => ({ ...u, role: u.role ?? 'STUDENT', status: u.status ?? 'ACTIVE' })) };
    },
    setStatus: async (id, status) => { const u = state.users.find((x) => x.id === id); if (u) u.status = status; },
    setRole: async (id, role) => { const u = state.users.find((x) => x.id === id); if (u) u.role = role; },
  };
  const projects = {
    all: async () => state.projects,
    count: async () => state.projects.length,
    findBySlug: async (slug) => state.projects.find((p) => p.slug === slug),
    slugExists: async (slug) => state.projects.some((p) => p.slug === slug),
    findByAuthor: async (userId) => state.projects.filter((p) => p.authorIds.includes(userId)),
    add: async (project) => { state.projects.push(project); },
    update: async () => {},
    remove: async (id) => { state.projects = state.projects.filter((p) => p.id !== id); },
    setAuthors: async (id, authorIds) => { const p = state.projects.find((x) => x.id === id); if (p) p.authorIds = [...authorIds]; },
    async toggleLike(id, userId) {
      const p = state.projects.find((x) => x.id === id), i = p.likes.indexOf(userId);
      if (i >= 0) p.likes.splice(i, 1); else p.likes.push(userId);
    },
    async countsByAuthor() {
      const out = {};
      for (const p of state.projects) for (const id of p.authorIds) out[id] = (out[id] ?? 0) + 1;
      return out;
    },
    allTags: async () => state.projects.flatMap((p) => p.tags),
  };
  const images = {
    add: async (image) => { state.images.set(image.id, image); },
    find: async (id) => state.images.get(id),
    meta: async (id) => { const image = state.images.get(id); return image && { id: image.id, ownerId: image.ownerId }; },
    remove: async (id) => { state.images.delete(id); },
  };
  const access = createMemoryAccess(state);
  return {
    users, projects, images, access, audit: access.audit, auditLog: () => state.audit,
    init: async () => {},
    reset: async () => { state.users = []; state.projects = []; state.images.clear(); state.requests = []; state.authorizations = []; state.verifications = []; state.audit = []; },
    ping: async () => true,
    close: async () => {},
  };
}
