import { randomBytes } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.AUTH_SECRET) console.warn('[aviso] AUTH_SECRET não definido: usando segredo temporário (sessões expiram a cada reinício).');
if (isProd && !process.env.DATABASE_URL) console.warn('[aviso] DATABASE_URL não definido: usando memória (dados serão perdidos ao reiniciar).');

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  secret: process.env.AUTH_SECRET || (isProd ? randomBytes(32).toString('hex') : 'dev-secret-change-me'),
  databaseUrl: process.env.DATABASE_URL || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  seedDemo: (process.env.SEED_DEMO ?? (isProd ? 'false' : 'true')) === 'true',
};
