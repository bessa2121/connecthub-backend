import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors.js';
import { MAX_AUTHORS, buildProject, parseCoAuthorIds, parseProject } from '../domain/project.js';
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
  // O dono é o primeiro autor (quem publicou). Colegas marcados editam, mas não excluem nem mexem na equipe.
  const assertOwner = (project, userId, action) => {
    if (project.authorIds[0] !== userId) throw new ForbiddenError(`Apenas quem publicou o projeto pode ${action}.`);
  };
  /**
   * Valida os colegas marcados: precisam existir e estar ativos (admins e contas suspensas não são marcáveis).
   * Quem já era autor (`keep`) permanece mesmo que a conta tenha sido suspensa depois. Devolve os ids sem o dono.
   */
  const resolveCoAuthors = async (ownerId, ids, keep = []) => {
    const others = ids.filter((id) => id !== ownerId);
    if (others.length > MAX_AUTHORS - 1) throw new ValidationError('Verifique os campos.', { authors: `Um projeto pode ter até ${MAX_AUTHORS} autores.` });
    const found = new Map((await users.findByIds(others)).map((u) => [u.id, u]));
    const valid = (id) => { const u = found.get(id); return !!u && (keep.includes(id) || (u.role !== 'ADMIN' && u.status !== 'SUSPENDED')); };
    if (!others.every(valid)) throw new ValidationError('Verifique os campos.', { authors: 'Algum membro marcado não foi encontrado.' });
    return others;
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
      const coAuthorIds = await resolveCoAuthors(userId, parseCoAuthorIds(body.authors) ?? []);
      await imageGuard.check(input.image, userId, '', 'image');
      const slug = await uniqueSlugAsync(input.title, (s) => projects.slugExists(s));
      const project = buildProject({ input, authorId: userId, coAuthorIds, slug });
      await projects.add(project);
      return (await hydrate([project], userId))[0];
    },
    /**
     * Edita os dados do projeto. O slug (endereço) nunca muda, para não quebrar links já compartilhados.
     * `authors` (ids dos colegas marcados) só é aceito do dono; se o campo não vier, a equipe continua como está.
     */
    async update(userId, slug, body) {
      const project = await find(slug);
      assertAuthor(project, userId, 'editar');
      const input = parseProject(body, project);
      const requested = parseCoAuthorIds(body.authors);
      if (requested !== undefined) assertOwner(project, userId, 'alterar os autores');
      const team = requested === undefined ? null : [userId, ...(await resolveCoAuthors(userId, requested, project.authorIds))];
      await imageGuard.check(input.image, userId, project.image, 'image');
      const previousImage = project.image;
      Object.assign(project, input);
      await projects.update(project);
      if (team && team.join() !== project.authorIds.join()) {
        await projects.setAuthors(project.id, team);
        project.authorIds = team;
      }
      await imageGuard.discard(previousImage, input.image);
      return (await hydrate([project], userId))[0];
    },
    /** Um colega marcado pode se desmarcar a qualquer momento. Quem publicou não sai: exclui o projeto. */
    async leave(userId, slug) {
      const project = await find(slug);
      if (!project.authorIds.includes(userId)) throw new ForbiddenError('Você não é autor deste projeto.');
      if (project.authorIds[0] === userId) throw new ConflictError('Quem publicou o projeto não pode sair dele. Exclua o projeto se não quiser mais mantê-lo.');
      await projects.setAuthors(project.id, project.authorIds.filter((id) => id !== userId));
    },
    async remove(userId, slug) {
      const project = await find(slug);
      assertOwner(project, userId, 'excluir');
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
