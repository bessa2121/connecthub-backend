import { randomBytes } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.AUTH_SECRET) console.warn('[aviso] AUTH_SECRET não definido: usando segredo temporário (sessões expiram a cada reinício).');
if (isProd && !process.env.RESEND_API_KEY) console.warn('[aviso] RESEND_API_KEY/EMAIL_FROM não definidos: o cadastro de novos alunos (envio do código por e-mail) ficará indisponível.');
if (isProd && !process.env.DATABASE_URL) console.warn('[aviso] DATABASE_URL não definido: usando memória (dados serão perdidos ao reiniciar).');

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  secret: process.env.AUTH_SECRET || (isProd ? randomBytes(32).toString('hex') : 'dev-secret-change-me'),
  databaseUrl: process.env.DATABASE_URL || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  resendApiKey: process.env.RESEND_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  retentionDays: Number(process.env.RETENTION_DAYS) || 90,
  seedDemo: (process.env.SEED_DEMO ?? (isProd ? 'false' : 'true')) === 'true',
};
