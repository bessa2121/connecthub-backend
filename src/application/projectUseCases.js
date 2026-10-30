import { ForbiddenError, NotFoundError } from '../domain/errors.js';
import { buildProject, parseProject } from '../domain/project.js';
import { createProjectViewer } from './projectView.js';

export function createProjectUseCases({ projects, users }) {
  const hydrate = createProjectViewer({ users });
  const find = async (slug) => {
    const project = await projects.findBySlug(slug);
    if (!project) throw new NotFoundError('Projeto não encontrado.');
    return project;
  };

  return {
    async list({ q = '', course = '', tag = '', featured = '' } = {}, viewerId) {
      const term = q.trim().toLowerCase();
      return (await hydrate(await projects.all(), viewerId))
        .filter((p) => !course || p.course === course)
        .filter((p) => !tag || p.tags.includes(tag))
        .filter((p) => !featured || p.featured)
        .filter((p) => !term || [p.title, p.subtitle, p.summary, p.course, ...p.tags, ...p.authors.map((a) => a.name)]
          .join(' ').toLowerCase().includes(term))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async get(slug, viewerId) { return (await hydrate([await find(slug)], viewerId))[0]; },
    async create(userId, body) {
      const input = parseProject(body);
      const taken = new Set((await projects.all()).map((p) => p.slug));
      const project = buildProject({ input, authorId: userId, slugExists: (s) => taken.has(s) });
      await projects.add(project);
      return (await hydrate([project], userId))[0];
    },
    async remove(userId, slug) {
      const project = await find(slug);
      if (!project.authorIds.includes(userId)) throw new ForbiddenError('Apenas autores podem excluir o projeto.');
      await projects.remove(project.id);
    },
    async toggleLike(userId, slug) {
      const project = await find(slug);
      await projects.toggleLike(project.id, userId);
      return (await hydrate([await find(slug)], userId))[0];
    },
  };
}
