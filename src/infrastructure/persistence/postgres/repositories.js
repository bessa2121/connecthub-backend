import pg from 'pg';
import { ConflictError } from '../../../domain/errors.js';
import { SCHEMA } from './schema.js';

const USER = `id::text AS id, slug, name, email, password_hash AS "passwordHash", course, year, bio, skills, created_at AS "createdAt"`;
const PROJECT = `SELECT p.id::text AS id, p.slug, p.title, p.subtitle, p.summary, p.description, p.course, p.year, p.tags, p.link,
  p.featured, p.hue, p.created_at AS "createdAt",
  COALESCE((SELECT array_agg(a.user_id::text ORDER BY a.position) FROM project_authors a WHERE a.project_id = p.id), '{}'::text[]) AS "authorIds",
  COALESCE((SELECT array_agg(l.user_id::text) FROM project_likes l WHERE l.project_id = p.id), '{}'::text[]) AS likes
  FROM projects p`;
const iso = (row) => row && { ...row, createdAt: new Date(row.createdAt).toISOString() };

export function createPostgresPersistence(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 15_000 });
  pool.on('error', (e) => console.error('[pg] erro em conexão ociosa:', e.message));
  const q = (text, params) => pool.query(text, params);
  const one = async (text, params) => iso((await q(text, params)).rows[0]);
  const many = async (text, params) => (await q(text, params)).rows.map(iso);

  const users = {
    all: () => many(`SELECT ${USER} FROM users`),
    count: async () => (await q('SELECT count(*)::int AS n FROM users')).rows[0].n,
    findById: (id) => one(`SELECT ${USER} FROM users WHERE id = $1::uuid`, [id]),
    findByIds: async (ids) => (ids.length ? many(`SELECT ${USER} FROM users WHERE id = ANY($1::uuid[])`, [ids]) : []),
    findByEmail: (email) => one(`SELECT ${USER} FROM users WHERE email = $1`, [email]),
    findBySlug: (slug) => one(`SELECT ${USER} FROM users WHERE slug = $1`, [slug]),
    async add(u) {
      try {
        await q(`INSERT INTO users (id, slug, name, email, password_hash, course, year, bio, skills, created_at)
                 VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10)`,
          [u.id, u.slug, u.name, u.email, u.passwordHash, u.course, u.year, u.bio, u.skills, u.createdAt]);
      } catch (e) { if (e.code === '23505') throw new ConflictError('Este e-mail já está cadastrado.'); throw e; }
    },
    update: (u) => q('UPDATE users SET bio=$2, skills=$3::text[], course=$4, year=$5 WHERE id=$1::uuid', [u.id, u.bio, u.skills, u.course, u.year]),
    allSkills: async () => (await q('SELECT DISTINCT unnest(skills) AS s FROM users')).rows.map((r) => r.s),
  };

  const projects = {
    all: () => many(`${PROJECT} ORDER BY p.created_at DESC`),
    count: async () => (await q('SELECT count(*)::int AS n FROM projects')).rows[0].n,
    findBySlug: (slug) => one(`${PROJECT} WHERE p.slug = $1`, [slug]),
    findByAuthor: (userId) => many(`${PROJECT} WHERE EXISTS (SELECT 1 FROM project_authors a WHERE a.project_id = p.id AND a.user_id = $1::uuid) ORDER BY p.created_at DESC`, [userId]),
    async add(p) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`INSERT INTO projects (id, slug, title, subtitle, summary, description, course, year, tags, link, featured, hue, created_at)
          VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13)`,
          [p.id, p.slug, p.title, p.subtitle, p.summary, p.description, p.course, p.year, p.tags, p.link, p.featured, p.hue, p.createdAt]);
        for (const [i, userId] of p.authorIds.entries())
          await client.query('INSERT INTO project_authors (project_id, user_id, position) VALUES ($1::uuid,$2::uuid,$3)', [p.id, userId, i]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        if (e.code === '23505') throw new ConflictError('Já existe um projeto com esse título. Tente outro.');
        throw e;
      } finally { client.release(); }
    },
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

  return {
    users, projects,
    init: () => q(SCHEMA),
    reset: () => q('TRUNCATE project_likes, project_authors, projects, users'),
    ping: () => q('SELECT 1'),
    close: () => pool.end(),
  };
}
