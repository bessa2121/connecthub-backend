import { ConflictError, NotFoundError, ValidationError } from '../domain/errors.js';
import { ROLES, STATUSES, USER_STATUS, isUuid } from '../domain/access.js';
import { clean } from '../domain/shared.js';
import { toAdminUser } from '../domain/user.js';

/** Casos de uso administrativos. A rota já exige ADMIN; `admin` chega aqui só para registrar o responsável. */
export function createAdminUseCases({ access, users, clock = Date.now }) {
  const now = () => new Date(clock()).toISOString();
  const paging = (query) => ({
    limit: Math.min(Math.max(parseInt(query.limit, 10) || 25, 1), 100),
    offset: Math.max(parseInt(query.offset, 10) || 0, 0),
  });
  const filters = (query, allowed) => {
    const status = clean(query.status).toUpperCase();
    if (status && !allowed.includes(status)) throw new ValidationError('Status inválido.');
    return { status, search: clean(query.q).slice(0, 100), ...paging(query) };
  };
  const id = (value, what) => { if (!isUuid(value)) throw new NotFoundError(`${what} não encontrada.`); return value; };
  const request = async (value) => (await access.getRequest(id(value, 'Solicitação'))) ?? Promise.reject(new NotFoundError('Solicitação não encontrada.'));

  async function setUserStatus(adminId, userId, status, action) {
    const target = await users.findById(id(userId, 'Conta'));
    if (!target) throw new NotFoundError('Conta não encontrada.');
    if (target.id === adminId) throw new ConflictError('Você não pode alterar a sua própria conta.');
    if (target.role === ROLES.ADMIN) throw new ConflictError('Contas de administradores não podem ser suspensas por aqui.');
    await users.setStatus(target.id, status);
    await access.audit.add({ actorId: adminId, action, targetType: 'user', targetId: target.id });
    return toAdminUser({ ...target, status });
  }

  return {
    summary: () => access.summary(),
    listRequests: (query) => access.listRequests(filters(query, STATUSES)),
    getRequest: request,
    async approve(adminId, requestId) { await access.approve(id(requestId, 'Solicitação'), adminId, now()); return request(requestId); },
    async reject(adminId, requestId) { await access.reject(id(requestId, 'Solicitação'), adminId, now()); return request(requestId); },
    listAuthorizations: (query) => access.listAuthorizations(filters(query, STATUSES)),
    async revoke(adminId, authorizationId) {
      await access.revoke(id(authorizationId, 'Autorização'), adminId, now());
      return access.getAuthorization(authorizationId);
    },
    async listUsers(query) {
      const f = filters(query, Object.values(USER_STATUS));
      const page = await users.list(f);
      return { ...page, items: page.items.map(toAdminUser) };
    },
    suspendUser: (adminId, userId) => setUserStatus(adminId, userId, USER_STATUS.SUSPENDED, 'USER_SUSPENDED'),
    reactivateUser: (adminId, userId) => setUserStatus(adminId, userId, USER_STATUS.ACTIVE, 'USER_REACTIVATED'),
  };
}
