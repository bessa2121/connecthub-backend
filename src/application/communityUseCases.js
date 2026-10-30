import { NotFoundError } from '../domain/errors.js';
import { parseProfile, toPublicUser, toSelf } from '../domain/user.js';
import { COURSES, YEARS } from '../domain/shared.js';
import { createProjectViewer } from './projectView.js';

export function createCommunityUseCases({ users, projects }) {
  const hydrate = createProjectViewer({ users });
  const uniq = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return {
    async list({ q = '', course = '', skill = '' } = {}) {
      const term = q.trim().toLowerCase();
      const counts = await projects.countsByAuthor();
      return (await users.all()).map(toPublicUser)
        .filter((u) => !course || u.course === course)
        .filter((u) => !skill || u.skills.includes(skill))
        .filter((u) => !term || [u.name, u.course, u.bio, ...u.skills].join(' ').toLowerCase().includes(term))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        .map((u) => ({ ...u, projectCount: counts[u.id] ?? 0 }));
    },
    async get(slug) {
      const user = await users.findBySlug(slug);
      if (!user) throw new NotFoundError('Membro não encontrado.');
      const authored = (await hydrate(await projects.findByAuthor(user.id))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { ...toPublicUser(user), projects: authored };
    },
    async updateProfile(userId, body) {
      const user = await users.findById(userId);
      Object.assign(user, parseProfile(body));
      await users.update(user);
      return toSelf(user);
    },
    async meta() {
      return { courses: COURSES, years: YEARS, tags: uniq(await projects.allTags()), skills: uniq(await users.allSkills()) };
    },
  };
}
