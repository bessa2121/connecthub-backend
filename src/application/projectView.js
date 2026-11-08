import { toPublicUser } from '../domain/user.js';

/**
 * Monta a representação pública de projetos (autores, likes, "curtido por mim") com uma única busca de usuários.
 * Em listas ("brief") a descrição longa é omitida: só a página do projeto precisa dela.
 */
export function createProjectViewer({ users }) {
  return async function hydrate(list, viewerId, { brief = false } = {}) {
    const ids = [...new Set(list.flatMap((p) => p.authorIds))];
    const byId = new Map((await users.findByIds(ids)).map((u) => [u.id, u]));
    return list.map(({ authorIds, description, ...p }) => ({
      ...p,
      ...(brief ? {} : { description }),
      likes: p.likes.length,
      liked: !!viewerId && p.likes.includes(viewerId),
      authors: authorIds.map((id) => byId.get(id)).filter(Boolean).map(toPublicUser),
    }));
  };
}
