import { randomUUID } from 'node:crypto';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../domain/errors.js';
import { STATUS, transition } from '../../../domain/access.js';

const REQUEST = `SELECT r.id::text AS id, r.name, r.email, r.institution, r.status, r.created_at AS "createdAt", r.decided_at AS "decidedAt",
  r.decided_by::text AS "decidedBy", d.name AS "decidedByName", a.id::text AS "authorizationId"
  FROM registration_requests r LEFT JOIN users d ON d.id = r.decided_by LEFT JOIN registration_authorizations a ON a.request_id = r.id`;
const AUTHORIZATION = `SELECT a.id::text AS id, a.request_id::text AS "requestId", a.email, a.institution, a.status, r.name,
  a.approved_at AS "approvedAt", ap.name AS "approvedByName", a.used_at AS "usedAt", a.revoked_at AS "revokedAt", rv.name AS "revokedByName"
  FROM registration_authorizations a JOIN registration_requests r ON r.id = a.request_id
  LEFT JOIN users ap ON ap.id = a.approved_by LEFT JOIN users rv ON rv.id = a.revoked_by`;

/** Filtro por status e busca textual (curingas do usuário são escapados). */
export function where({ status, search }, statusCol, textCols) {
  const params = [], conds = [];
  if (status) { params.push(status); conds.push(`${statusCol} = $${params.length}`); }
  if (search) { params.push(`%${search.replace(/[\\%_]/g, '\\$&')}%`); conds.push(`(${textCols.map((c) => `${c} ILIKE $${params.length}`).join(' OR ')})`); }
  return { clause: conds.length ? `WHERE ${conds.join(' AND ')}` : '', params };
}

export function createPostgresAccess({ q, many, one, tx }) {
  const audit = (c, actorId, action, targetType, targetId) =>
    c.query('INSERT INTO audit_log (id, actor_id, action, target_type, target_id) VALUES ($1::uuid,$2::uuid,$3,$4,$5)', [randomUUID(), actorId ?? null, action, targetType, String(targetId)]);
  const lockRequest = async (c, id) => {
    const { rows: [r] } = await c.query('SELECT id::text AS id, email, institution, status FROM registration_requests WHERE id = $1::uuid FOR UPDATE', [id]);
    if (!r) throw new NotFoundError('Solicitação não encontrada.');
    return r;
  };
  const page = async (select, from, filters, textCols, statusCol, order, { limit, offset }) => {
    const { clause, params } = where(filters, statusCol, textCols);
    const total = (await q(`SELECT count(*)::int AS n ${from} ${clause}`, params)).rows[0].n;
    const items = await many(`${select} ${clause} ORDER BY ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
    return { total, items };
  };

  return {
    audit: { add: ({ actorId, action, targetType, targetId }) => audit({ query: q }, actorId, action, targetType, targetId) },

    // --- solicitações ---
    findLiveRequestByEmail: (email) => one(`${REQUEST} WHERE r.email = $1 AND r.status IN ('PENDING','APPROVED')`, [email]),
    async addRequest(r) {
      try {
        await q('INSERT INTO registration_requests (id, name, email, institution, status, created_at) VALUES ($1::uuid,$2,$3,$4,$5,$6)',
          [r.id, r.name, r.email, r.institution, r.status, r.createdAt]);
      } catch (e) { if (e.code === '23505') throw new ConflictError('Já existe uma solicitação ativa para este e-mail.'); throw e; }
    },
    listRequests: ({ status, search, limit, offset }) =>
      page(REQUEST, 'FROM registration_requests r', { status, search }, ['r.name', 'r.email'], 'r.status', 'r.created_at DESC', { limit, offset }),
    getRequest: (id) => one(`${REQUEST} WHERE r.id = $1::uuid`, [id]),
    async summary() {
      const requests = Object.fromEntries(Object.values(STATUS).map((s) => [s, 0]));
      for (const row of (await q('SELECT status, count(*)::int AS n FROM registration_requests GROUP BY status')).rows) requests[row.status] = row.n;
      return { requests, users: (await q('SELECT count(*)::int AS n FROM users')).rows[0].n };
    },

    // --- decisões administrativas: linha bloqueada (FOR UPDATE) dentro de transação ---
    approve: (requestId, adminId, now) => tx(async (c) => {
      const r = await lockRequest(c, requestId);
      const next = transition(r.status, 'approve');
      if ((await c.query('SELECT 1 FROM users WHERE email = $1', [r.email])).rowCount) throw new ConflictError('Já existe uma conta com este e-mail.');
      await c.query('UPDATE registration_requests SET status=$2, decided_by=$3::uuid, decided_at=$4 WHERE id=$1::uuid', [r.id, next, adminId, now]);
      try {
        await c.query(`INSERT INTO registration_authorizations (id, request_id, email, institution, status, approved_by, approved_at)
                       VALUES ($1::uuid,$2::uuid,$3,$4,'APPROVED',$5::uuid,$6)`, [randomUUID(), r.id, r.email, r.institution, adminId, now]);
      } catch (e) { if (e.code === '23505') throw new ConflictError('Este e-mail já possui uma autorização.'); throw e; }
      await audit(c, adminId, 'REQUEST_APPROVED', 'registration_request', r.id);
    }),
    reject: (requestId, adminId, now) => tx(async (c) => {
      const r = await lockRequest(c, requestId);
      const next = transition(r.status, 'reject');
      await c.query('UPDATE registration_requests SET status=$2, decided_by=$3::uuid, decided_at=$4 WHERE id=$1::uuid', [r.id, next, adminId, now]);
      await audit(c, adminId, 'REQUEST_REJECTED', 'registration_request', r.id);
    }),
    revoke: (authorizationId, adminId, now) => tx(async (c) => {
      const { rows: [a] } = await c.query('SELECT id::text AS id, request_id::text AS "requestId", status FROM registration_authorizations WHERE id = $1::uuid FOR UPDATE', [authorizationId]);
      if (!a) throw new NotFoundError('Autorização não encontrada.');
      const next = transition(a.status, 'revoke');
      await c.query('UPDATE registration_authorizations SET status=$2, revoked_at=$3, revoked_by=$4::uuid WHERE id=$1::uuid', [a.id, next, now, adminId]);
      await c.query("UPDATE registration_requests SET status='REVOKED' WHERE id=$1::uuid", [a.requestId]);
      await audit(c, adminId, 'AUTHORIZATION_REVOKED', 'registration_authorization', a.id);
    }),

    // --- autorizações ---
    findAuthorizationByEmail: (email) => one(`${AUTHORIZATION} WHERE a.email = $1 AND a.status IN ('APPROVED','USED')`, [email]),
    listAuthorizations: ({ status, search, limit, offset }) =>
      page(AUTHORIZATION, 'FROM registration_authorizations a JOIN registration_requests r ON r.id = a.request_id', { status, search }, ['r.name', 'a.email'], 'a.status', 'a.approved_at DESC', { limit, offset }),
    getAuthorization: (id) => one(`${AUTHORIZATION} WHERE a.id = $1::uuid`, [id]),

    /** Conta + consumo da autorização + consumo da verificação: tudo ou nada; a autorização fica bloqueada (FOR UPDATE). */
    registerUser: ({ user: u, verificationId, now }) => tx(async (c) => {
      const { rows: [v] } = await c.query('SELECT email, verified_at, consumed_at FROM email_verifications WHERE id = $1::uuid FOR UPDATE', [verificationId]);
      if (!v || v.email !== u.email || !v.verified_at || v.consumed_at) throw new ForbiddenError('Confirmação de e-mail inválida ou já utilizada.');
      const { rows: [a] } = await c.query("SELECT id, request_id, status FROM registration_authorizations WHERE email = $1 AND status IN ('APPROVED','USED') FOR UPDATE", [u.email]);
      if (!a) throw new ForbiddenError('Este e-mail não está autorizado a criar uma conta.');
      if (a.status !== STATUS.APPROVED) throw new ConflictError('Esta autorização já foi utilizada.');
      const next = transition(a.status, 'use');
      try {
<<<<<<< HEAD
        await c.query(`INSERT INTO users (id, slug, name, email, password_hash, course, year, bio, skills, avatar, instagram, linkedin, contact_email, banner, portfolio, about, role, status, created_at)
                       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [u.id, u.slug, u.name, u.email, u.passwordHash, u.course, u.year, u.bio, u.skills, u.avatar ?? '', u.instagram ?? '', u.linkedin ?? '', u.contactEmail ?? '', u.banner ?? '', u.portfolio ?? '', u.about ?? '', u.role ?? 'STUDENT', u.status ?? 'ACTIVE', u.createdAt]);
=======
        await c.query(`INSERT INTO users (id, slug, name, email, password_hash, course, year, bio, skills, avatar, instagram, linkedin, contact_email, banner, portfolio, role, status, created_at)
                       VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [u.id, u.slug, u.name, u.email, u.passwordHash, u.course, u.year, u.bio, u.skills, u.avatar ?? '', u.instagram ?? '', u.linkedin ?? '', u.contactEmail ?? '', u.banner ?? '', u.portfolio ?? '', u.role ?? 'STUDENT', u.status ?? 'ACTIVE', u.createdAt]);
>>>>>>> bc34e0d15975f678d2b740c31df1877b77cca2d9
      } catch (e) { if (e.code === '23505') throw new ConflictError('Não foi possível concluir o cadastro. Tente novamente.'); throw e; }
      await c.query('UPDATE registration_authorizations SET status=$2, used_at=$3, used_by=$4::uuid WHERE id=$1::uuid', [a.id, next, now, u.id]);
      await c.query("UPDATE registration_requests SET status='USED' WHERE id=$1::uuid", [a.request_id]);
      await c.query('UPDATE email_verifications SET consumed_at=$2 WHERE id=$1::uuid', [verificationId, now]);
      await audit(c, u.id, 'USER_REGISTERED', 'user', u.id);
    }),

    // --- verificação de e-mail ---
    getVerification: (email) => one('SELECT id::text AS id, email, code_hash AS "codeHash", expires_at AS "expiresAt", attempts, last_sent_at AS "lastSentAt", verified_at AS "verifiedAt", consumed_at AS "consumedAt" FROM email_verifications WHERE email = $1', [email]),
    getVerificationById: (id) => one('SELECT id::text AS id, email, code_hash AS "codeHash", expires_at AS "expiresAt", attempts, last_sent_at AS "lastSentAt", verified_at AS "verifiedAt", consumed_at AS "consumedAt" FROM email_verifications WHERE id = $1::uuid', [id]),
    saveVerification: ({ id, email, codeHash, expiresAt, now }) => q(
      `INSERT INTO email_verifications (id, email, code_hash, expires_at, attempts, last_sent_at, verified_at, consumed_at) VALUES ($1::uuid,$2,$3,$4,0,$5,NULL,NULL)
       ON CONFLICT (email) DO UPDATE SET id=EXCLUDED.id, code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0, last_sent_at=EXCLUDED.last_sent_at, verified_at=NULL, consumed_at=NULL`,
      [id, email, codeHash, expiresAt, now]),
    incrementAttempts: async (email) => (await q('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = $1 RETURNING attempts', [email])).rows[0]?.attempts ?? 0,
    // UPDATE condicional: de duas confirmações simultâneas com o mesmo código, só uma consegue.
    markVerified: async (id, now) => (await q('UPDATE email_verifications SET verified_at=$2 WHERE id=$1::uuid AND verified_at IS NULL AND consumed_at IS NULL', [id, now])).rowCount > 0,

    async purge({ requestsBefore, verificationsBefore }) {
      const r = await q("DELETE FROM registration_requests WHERE status IN ('REJECTED','REVOKED') AND created_at < $1", [requestsBefore]);
      const v = await q('DELETE FROM email_verifications WHERE expires_at < $1', [verificationsBefore]);
      return { requests: r.rowCount, verifications: v.rowCount };
    },
  };
}
