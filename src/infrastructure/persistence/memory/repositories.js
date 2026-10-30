import { ConflictError } from '../../../domain/errors.js';

/** Adaptador em memória (desenvolvimento e testes). Mesma interface do adaptador Postgres. */
export function createMemoryPersistence() {
  const state = { users: [], projects: [] };
  const users = {
    all: async () => state.users,
    count: async () => state.users.length,
    findById: async (id) => state.users.find((u) => u.id === id),
    findByIds: async (ids) => state.users.filter((u) => ids.includes(u.id)),
    findByEmail: async (email) => state.users.find((u) => u.email === email),
    findBySlug: async (slug) => state.users.find((u) => u.slug === slug),
    async add(user) {
      if (state.users.some((u) => u.email === user.email)) throw new ConflictError('Este e-mail já está cadastrado.');
      state.users.push(user);
    },
    update: async () => {},
    allSkills: async () => state.users.flatMap((u) => u.skills),
  };
  const projects = {
    all: async () => state.projects,
    count: async () => state.projects.length,
    findBySlug: async (slug) => state.projects.find((p) => p.slug === slug),
    findByAuthor: async (userId) => state.projects.filter((p) => p.authorIds.includes(userId)),
    add: async (project) => { state.projects.push(project); },
    remove: async (id) => { state.projects = state.projects.filter((p) => p.id !== id); },
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
  return { users, projects, init: async () => {}, reset: async () => { state.users = []; state.projects = []; }, ping: async () => true, close: async () => {} };
}
