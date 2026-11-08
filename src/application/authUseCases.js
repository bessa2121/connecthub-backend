import { ConflictError, UnauthorizedError } from '../domain/errors.js';
import { buildUser, parseRegistration, toSelf } from '../domain/user.js';
import { uniqueSlugAsync } from '../domain/shared.js';

export function createAuthUseCases({ users, hasher, tokens }) {
  const session = (user) => ({ token: tokens.sign(user.id), user: toSelf(user) });
  return {
    async register(input) {
      const data = parseRegistration(input);
      if (await users.findByEmail(data.email)) throw new ConflictError('Este e-mail já está cadastrado.');
      const slug = await uniqueSlugAsync(data.name, (s) => users.slugExists(s));
      const user = buildUser({ input: data, passwordHash: hasher.hash(data.password), slug });
      await users.add(user);
      return session(user);
    },
    async login({ email, password } = {}) {
      const user = await users.findByEmail(String(email ?? '').trim().toLowerCase());
      if (!user || !hasher.verify(String(password ?? ''), user.passwordHash)) throw new UnauthorizedError('E-mail ou senha incorretos.');
      return session(user);
    },
    async me(userId) {
      const user = await users.findById(userId);
      if (!user) throw new UnauthorizedError();
      return toSelf(user);
    },
  };
}
