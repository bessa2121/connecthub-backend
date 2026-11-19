import pg from 'pg';
import { ConflictError } from '../../../domain/errors.js';
import { SCHEMA } from './schema.js';
import { createPostgresAccess, where } from './access.js';

const USER = `id::text AS id, slug, name, email, password_hash AS "passwordHash", course, year, bio, skills,
<<<<<<< HEAD
  avatar, instagram, linkedin, contact_email AS "contactEmail", banner, portfolio, about, role, status, created_at AS "createdAt"`;
=======
  avatar, instagram, linkedin, contact_email AS "contactEmail", banner, portfolio, role, status, created_at AS "createdAt"`;
>>>>>>> bc34e0d15975f678d2b740c31df1877b77cca2d9
const PROJECT = `SELECT p.id::text AS id, p.slug, p.title, p.subtitle, p.summary, p.description, p.course, p.year, p.tags, p.link, p.image,
  p.featured, p.hue, p.created_at AS "createdAt",
  COALESCE((SELECT array_agg(a.user_id::text ORDER BY a.position) FROM project_authors a WHERE a.project_id = p.id), '{}'::text[]) AS "authorIds",
  COALESCE((SELECT array_agg(l.user_id::text) FROM project_likes l WHERE l.project_id = p.id), '{}'::text[]) AS likes
  FROM projects p`;
const iso = (row) => row && Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v]));

export function createPostgresPersistence(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on('error', (e) => console.error('[pg] erro em conexão ociosa:', e.message));
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => iso((await q(text, params)).rows[0]);
  async function tx(fn) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); const out = await fn(client); await client.query('COMMIT'); return out; }
    catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; }
    finally { client.release(); }
  }
  const many = async (text, params) => (await q(text, params)).rows.map(iso);

  const users = {
    all: () => many(`SELECT ${USER} FROM users`),
    count: async () => (await q('SELECT count(*)::int AS n FROM users')).rows[0].n,
    findById: (id) => one(`SELECT ${USER} FROM users WHERE id = $1::uuid`, [id]),
    findByIds: async (ids) => (ids.length ? many(`SELECT ${USER} FROM users WHERE id = ANY($1::uuid[])`, [ids]) : []),
    findByEmail: (email) => one(`SELECT ${USER} FROM users WHERE email = $1`, [email]),
    findBySlug: (slug) => one(`SELECT ${USER} FROM users WHERE slug = $1`, [slug]),
    slugExists: async (slug) => (await q('SELECT 1 FROM users WHERE slug = $1', [slug])).rowCount > 0,
    async add(u) {
      try {
<<<<<<< HEAD
        await q(`INSERT INTO users (id, slug, name, email, password_hash, course, year, bio, skills, avatar, instagram, linkedin, contact_email, banner, portfolio, about, role, status, created_at)
                 VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [u.id, u.slug, u.name, u.email, u.passwordHash, u.course, u.year, u.bio, u.skills,
           u.avatar ?? '', u.instagram ?? '', u.linkedin ?? '', u.contactEmail ?? '', u.banner ?? '', u.portfolio ?? '', u.about ?? '', u.role ?? 'STUDENT', u.status ?? 'ACTIVE', u.createdAt]);
      } catch (e) { if (e.code === '23505') throw new ConflictError('Este e-mail já está cadastrado.'); throw e; }
    },
    update: (u) => q(`UPDATE users SET bio=$2, skills=$3::text[], course=$4, year=$5, avatar=$6, instagram=$7, linkedin=$8, contact_email=$9, banner=$10, portfolio=$11, about=$12
                      WHERE id=$1::uuid`, [u.id, u.bio, u.skills, u.course, u.year, u.avatar ?? '', u.instagram ?? '', u.linkedin ?? '', u.contactEmail ?? '', u.banner ?? '', u.portfolio ?? '', u.about ?? '']),
=======
        await q(`INSERT INTO users (id, slug, name, email, password_hash, course, year, bio, skills, avatar, instagram, linkedin, contact_email, banner, portfolio, role, status, created_at)
                 VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
          [u.id, u.slug, u.name, u.email, u.passwordHash, u.course, u.year, u.bio, u.skills,
           u.avatar ?? '', u.instagram ?? '', u.linkedin ?? '', u.contactEmail ?? '', u.banner ?? '', u.portfolio ?? '', u.role ?? 'STUDENT', u.status ?? 'ACTIVE', u.createdAt]);
      } catch (e) { if (e.code === '23505') throw new ConflictError('Este e-mail já está cadastrado.'); throw e; }
    },
    update: (u) => q(`UPDATE users SET bio=$2, skills=$3::text[], course=$4, year=$5, avatar=$6, instagram=$7, linkedin=$8, contact_email=$9, banner=$10, portfolio=$11
                      WHERE id=$1::uuid`, [u.id, u.bio, u.skills, u.course, u.year, u.avatar ?? '', u.instagram ?? '', u.linkedin ?? '', u.contactEmail ?? '', u.banner ?? '', u.portfolio ?? '']),
>>>>>>> bc34e0d15975f678d2b740c31df1877b77cca2d9
    allSkills: async () => (await q('SELECT DISTINCT unnest(skills) AS s FROM users')).rows.map((r) => r.s),
    async list({ status, search, limit, offset }) {
      const { clause, params } = where({ status, search }, 'status', ['name', 'email']);
      const total = (await q(`SELECT count(*)::int AS n FROM users ${clause}`, params)).rows[0].n;
      const items = await many(`SELECT id::text AS id, slug, name, email, course, year, role, status, created_at AS "createdAt" FROM users ${clause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limit, offset]);
      return { total, items };
    },
    setStatus: (id, status) => q('UPDATE users SET status = $2 WHERE id = $1::uuid', [id, status]),
    setRole: (id, role) => q('UPDATE users SET role = $2 WHERE id = $1::uuid', [id, role]),
  };

  const projects = {
    all: () => many(`${PROJECT} ORDER BY p.created_at DESC`),
    count: async () => (await q('SELECT count(*)::int AS n FROM projects')).rows[0].n,
    findBySlug: (slug) => one(`${PROJECT} WHERE p.slug = $1`, [slug]),
    slugExists: async (slug) => (await q('SELECT 1 FROM projects WHERE slug = $1', [slug])).rowCount > 0,
    findByAuthor: (userId) => many(`${PROJECT} WHERE EXISTS (SELECT 1 FROM project_authors a WHERE a.project_id = p.id AND a.user_id = $1::uuid) ORDER BY p.created_at DESC`, [userId]),
    async add(p) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO projects (id, slug, title, subtitle, summary, description, course, year, tags, link, image, featured, hue, created_at)
          VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,$14)`,
          [p.id, p.slug, p.title, p.subtitle, p.summary, p.description, p.course, p.year, p.tags, p.link, p.image ?? '', p.featured, p.hue, p.createdAt]);
        for (const [i, userId] of p.authorIds.entries())
          await client.query('INSERT INTO project_authors (project_id, user_id, position) VALUES ($1::uuid,$2::uuid,$3)', [p.id, userId, i]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') throw new ConflictError('Já existe um projeto com esse título. Tente outro.');
        throw e;
      } finally { client.release(); }
    },
    update: (p) => q(`UPDATE projects SET title=$2, subtitle=$3, summary=$4, description=$5, course=$6, year=$7, tags=$8::text[], link=$9, image=$10
                      WHERE id=$1::uuid`, [p.id, p.title, p.subtitle, p.summary, p.description, p.course, p.year, p.tags, p.link, p.image ?? '']),
    remove: (id) => q('DELETE FROM projects WHERE id = $1::uuid', [id]),
    async toggleLike(id, userId) {
      const del = await q('DELETE FROM project_likes WHERE project_id=$1::uuid AND user_id=$2::uuid', [id, userId]);
      if (!del.rowCount) await q('INSERT INTO project_likes (project_id, user_id) VALUES ($1::uuid,$2::uuid) ON CONFLICT DO NOTHING', [id, userId]);
    },
    async countsByAuthor() {
      const { rows } = await q('SELECT user_id::text AS id, count(*)::int AS n FROM project_authors GROUP BY user_id');
      return Object.fromEntries(rows.map((r) => [r.id, r.n]));
    },
    allTags: async () => (await q('SELECT DISTINCT unnest(tags) AS t FROM projects')).rows.map((r) => r.t),
  };

  // Imagens (já reduzidas pelo navegador, até 450 KB) ficam no banco; o conteúdo é imutável e servido com cache longo.
  const images = {
    add: (img) => q('INSERT INTO images (id, owner_id, mime, data, created_at) VALUES ($1::uuid,$2::uuid,$3,$4,$5)', [img.id, img.ownerId, img.mime, img.data, img.createdAt]),
    find: async (id) => (await q('SELECT id::text AS id, mime, data FROM images WHERE id = $1::uuid', [id])).rows[0],
    meta: async (id) => (await q('SELECT id::text AS id, owner_id::text AS "ownerId" FROM images WHERE id = $1::uuid', [id])).rows[0],
    remove: (id) => q('DELETE FROM images WHERE id = $1::uuid', [id]),
  };

  const access = createPostgresAccess({ q, many, one, tx });
  return {
    users, projects, images, access, audit: access.audit,
    auditLog: async () => (await q('SELECT action, target_type AS "targetType", target_id AS "targetId", actor_id::text AS "actorId" FROM audit_log ORDER BY created_at')).rows,
    init: () => q(SCHEMA),
    reset: () => q('TRUNCATE audit_log, email_verifications, registration_authorizations, registration_requests, images, project_likes, project_authors, projects, users CASCADE'),
    ping: () => q('SELECT 1'),
    close: () => pool.end(),
  };
}
