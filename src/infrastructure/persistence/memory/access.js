import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../domain/errors.js';
import { STATUS, transition } from '../../../domain/access.js';

/** Solicitações, autorizações, verificações e auditoria em memória (mesma interface do adaptador Postgres). */
export function createMemoryAccess(state) {
  const live = (s) => s === STATUS.PENDING || s === STATUS.APPROVED;
  const nameOf = (id) => state.users.find((u) => u.id === id)?.name ?? null;
  const match = (search, ...fields) => !search || fields.join(' ').toLowerCase().includes(search.toLowerCase());
  const slice = (rows, { limit, offset }) => ({ total: rows.length, items: rows.slice(offset, offset + limit) });
  const newest = (a, b) => b.createdAt.localeCompare(a.createdAt);
  const audit = (actorId, action, targetType, targetId) =>
    state.audit.push({ id: randomUUID(), actorId: actorId ?? null, action, targetType, targetId: String(targetId), createdAt: new Date().toISOString() });

  const requestView = ({ ...r }) => ({
    ...r, decidedByName: nameOf(r.decidedBy),
    authorizationId: state.authorizations.find((a) => a.requestId === r.id)?.id ?? null,
  });
  const authView = ({ ...a }) => ({
    ...a, name: state.requests.find((r) => r.id === a.requestId)?.name ?? '',
    approvedByName: nameOf(a.approvedBy), revokedByName: nameOf(a.revokedBy),
  });
  const authById = (id) => state.authorizations.find((a) => a.id === id);
  const requestById = (id) => state.requests.find((r) => r.id === id);

  return {
    audit: { add: async ({ actorId, action, targetType, targetId }) => audit(actorId, action, targetType, targetId) },

    // --- solicitações ---
    findLiveRequestByEmail: async (email) => state.requests.find((r) => r.email === email && live(r.status)),
    async addRequest(request) {
      if (state.requests.some((r) => r.email === request.email && live(r.status))) throw new ConflictError('Já existe uma solicitação ativa para este e-mail.');
      state.requests.push({ decidedBy: null, decidedAt: null, ...request });
    },
    async listRequests({ status, search, limit, offset }) {
      const rows = state.requests.filter((r) => (!status || r.status === status) && match(search, r.name, r.email)).sort(newest);
      const page = slice(rows, { limit, offset });
      return { ...page, items: page.items.map(requestView) };
    },
    getRequest: async (id) => { const r = requestById(id); return r ? requestView(r) : null; },
    async summary() {
      const requests = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
      for (const r of state.requests) requests[r.status]++;
      return { requests, users: state.users.length };
    },

    // --- decisões administrativas (atômicas: o corpo roda sem await) ---
    async approve(requestId, adminId, now) {
      const r = requestById(requestId);
      if (!r) throw new NotFoundError('Solicitação não encontrada.');
      const next = transition(r.status, 'approve');
      if (state.users.some((u) => u.email === r.email)) throw new ConflictError('Já existe uma conta com este e-mail.');
      if (state.authorizations.some((a) => a.email === r.email && (a.status === STATUS.APPROVED || a.status === STATUS.USED))) throw new ConflictError('Este e-mail já possui uma autorização.');
      r.status = next; r.decidedBy = adminId; r.decidedAt = now;
      const a = { id: randomUUID(), requestId: r.id, email: r.email, institution: r.institution, status: STATUS.APPROVED, approvedBy: adminId, approvedAt: now, usedAt: null, usedBy: null, revokedAt: null, revokedBy: null };
      state.authorizations.push(a);
      audit(adminId, 'REQUEST_APPROVED', 'registration_request', r.id);
    },
    async reject(requestId, adminId, now) {
      const r = requestById(requestId);
      if (!r) throw new NotFoundError('Solicitação não encontrada.');
      r.status = transition(r.status, 'reject'); r.decidedBy = adminId; r.decidedAt = now;
      audit(adminId, 'REQUEST_REJECTED', 'registration_request', r.id);
    },
    async revoke(authorizationId, adminId, now) {
      const a = authById(authorizationId);
      if (!a) throw new NotFoundError('Autorização não encontrada.');
      a.status = transition(a.status, 'revoke'); a.revokedAt = now; a.revokedBy = adminId;
      const r = requestById(a.requestId);
      if (r) r.status = STATUS.REVOKED;
      audit(adminId, 'AUTHORIZATION_REVOKED', 'registration_authorization', a.id);
    },

    // --- autorizações ---
    findAuthorizationByEmail: async (email) => state.authorizations.find((a) => a.email === email && (a.status === STATUS.APPROVED || a.status === STATUS.USED)),
    async listAuthorizations({ status, search, limit, offset }) {
      const rows = state.authorizations.map(authView).filter((a) => (!status || a.status === status) && match(search, a.name, a.email))
        .sort((x, y) => y.approvedAt.localeCompare(x.approvedAt));
      return slice(rows, { limit, offset });
    },
    getAuthorization: async (id) => { const a = authById(id); return a ? authView(a) : null; },

    /** Cria a conta e consome a autorização + verificação numa única operação indivisível. */
    async registerUser({ user, verificationId, now }) {
      const v = state.verifications.find((x) => x.id === verificationId);
      if (!v || v.email !== user.email || !v.verifiedAt || v.consumedAt) throw new ForbiddenError('Confirmação de e-mail inválida ou já utilizada.');
      const a = state.authorizations.find((x) => x.email === user.email && (x.status === STATUS.APPROVED || x.status === STATUS.USED));
      if (!a) throw new ForbiddenError('Este e-mail não está autorizado a criar uma conta.');
      if (a.status !== STATUS.APPROVED) throw new ConflictError('Esta autorização já foi utilizada.');
      if (state.users.some((u) => u.email === user.email || u.slug === user.slug)) throw new ConflictError('Não foi possível concluir o cadastro. Tente novamente.');
      state.users.push(user);
      a.status = transition(a.status, 'use'); a.usedAt = now; a.usedBy = user.id;
      const r = requestById(a.requestId);
      if (r) r.status = STATUS.USED;
      v.consumedAt = now;
      audit(user.id, 'USER_REGISTERED', 'user', user.id);
    },

    // --- verificação de e-mail ---
    getVerification: async (email) => state.verifications.find((v) => v.email === email),
    getVerificationById: async (id) => state.verifications.find((v) => v.id === id),
    async saveVerification({ id, email, codeHash, expiresAt, now }) {
      state.verifications = state.verifications.filter((v) => v.email !== email);
      state.verifications.push({ id, email, codeHash, expiresAt, attempts: 0, lastSentAt: now, verifiedAt: null, consumedAt: null });
    },
    async incrementAttempts(email) { const v = state.verifications.find((x) => x.email === email); return v ? ++v.attempts : 0; },
    async markVerified(id, now) {
      const v = state.verifications.find((x) => x.id === id);
      if (!v || v.verifiedAt || v.consumedAt) return false;
      v.verifiedAt = now; return true;
    },

    /** Retenção: apaga solicitações rejeitadas/revogadas antigas e verificações vencidas. */
    async purge({ requestsBefore, verificationsBefore }) {
      const doomed = new Set(state.requests.filter((r) => (r.status === STATUS.REJECTED || r.status === STATUS.REVOKED) && r.createdAt < requestsBefore).map((r) => r.id));
      state.requests = state.requests.filter((r) => !doomed.has(r.id));
      state.authorizations = state.authorizations.filter((a) => !doomed.has(a.requestId));
      const before = state.verifications.length;
      state.verifications = state.verifications.filter((v) => v.expiresAt >= verificationsBefore);
      return { requests: doomed.size, verifications: before - state.verifications.length };
    },
  };
}
