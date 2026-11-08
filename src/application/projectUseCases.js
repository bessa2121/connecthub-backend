import { ForbiddenError, NotFoundError } from '../domain/errors.js';
import { buildProject, parseProject } from '../domain/project.js';
import { uniqueSlugAsync } from '../domain/shared.js';
import { createProjectViewer } from './projectView.js';

export function createProjectUseCases({ projects, users, imageGuard }) {
  const hydrate = createProjectViewer({ users });
  const find = async (slug) => {
    const project = await projects.findBySlug(slug);
    if (!project) throw new NotFoundError('Projeto não encontrado.');
    return project;
  };
  const assertAuthor = (project, userId, action) => {
    if (!project.authorIds.includes(userId)) throw new ForbiddenError(`Apenas autores podem ${action} o projeto.`);
  };

  return {
    async list({ q = '', course = '', tag = '', featured = '' } = {}, viewerId) {
      const term = q.trim().toLowerCase();
      return (await hydrate(await projects.all(), viewerId, { brief: true }))
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
      await imageGuard.check(input.image, userId, '', 'image');
      const slug = await uniqueSlugAsync(input.title, (s) => projects.slugExists(s));
      const project = buildProject({ input, authorId: userId, slug });
      await projects.add(project);
      return (await hydrate([project], userId))[0];
    },
    /** Edita os dados do projeto. O slug (endereço) nunca muda, para não quebrar links já compartilhados. */
    async update(userId, slug, body) {
      const project = await find(slug);
      assertAuthor(project, userId, 'editar');
      const input = parseProject(body, project);
      await imageGuard.check(input.image, userId, project.image, 'image');
      const previousImage = project.image;
      Object.assign(project, input);
      await projects.update(project);
      await imageGuard.discard(previousImage, input.image);
      return (await hydrate([project], userId))[0];
    },
    async remove(userId, slug) {
      const project = await find(slug);
      assertAuthor(project, userId, 'excluir');
      await projects.remove(project.id);
      await imageGuard.discard(project.image, '');
    },
    async toggleLike(userId, slug) {
      const project = await find(slug);
      await projects.toggleLike(project.id, userId);
      return (await hydrate([await find(slug)], userId))[0];
    },
  };
}
