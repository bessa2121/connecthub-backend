import { ForbiddenError, UnauthorizedError } from '../domain/errors.js';
import { toSelf } from '../domain/user.js';

export function createAuthUseCases({ users, hasher, tokens }) {
  const session = (user) => ({ token: tokens.sign(user.id), user: toSelf(user) });
  return {
    async login({ email, password } = {}) {
      const user = await users.findByEmail(String(email ?? '').trim().toLowerCase());
      if (!user || !hasher.verify(String(password ?? ''), user.passwordHash)) throw new UnauthorizedError('E-mail ou senha incorretos.');
      if (user.status === 'SUSPENDED') throw new ForbiddenError('Esta conta está suspensa. Procure a coordenação do projeto.');
      return session(user);
    },
    async me(userId) {
      const user = await users.findById(userId);
      if (!user) throw new UnauthorizedError();
      return toSelf(user);
    },
  };
}
