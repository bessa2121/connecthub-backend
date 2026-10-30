import { toPublicUser } from '../domain/user.js';

/** Monta a representação pública de projetos (autores, likes, "curtido por mim") com uma única busca de usuários. */
export function createProjectViewer({ users }) {
  return async function hydrate(list, viewerId) {
    const ids = [...new Set(list.flatMap((p) => p.authorIds))];
    const byId = new Map((await users.findByIds(ids)).map((u) => [u.id, u]));
    return list.map(({ authorIds, ...p }) => ({
      ...p,
      likes: p.likes.length,
      liked: !!viewerId && p.likes.includes(viewerId),
      authors: authorIds.map((id) => byId.get(id)).filter(Boolean).map(toPublicUser),
    }));
  };
}
