import { randomBytes } from 'node:crypto';

const isProd = process.env.NODE_ENV === 'production';
if (isProd && !process.env.AUTH_SECRET) console.warn('[aviso] AUTH_SECRET não definido: usando segredo temporário (sessões expiram a cada reinício).');
if (isProd && !(process.env.BREVO_API_KEY && (process.env.BREVO_SENDER_EMAIL || process.env.EMAIL_FROM))) console.warn('[aviso] BREVO_API_KEY e BREVO_SENDER_EMAIL (ou EMAIL_FROM) não definidos: o cadastro de novos alunos (envio do código por e-mail) ficará indisponível.');
if (isProd && !process.env.DATABASE_URL) console.warn('[aviso] DATABASE_URL não definido: usando memória (dados serão perdidos ao reiniciar).');

export const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  secret: process.env.AUTH_SECRET || (isProd ? randomBytes(32).toString('hex') : 'dev-secret-change-me'),
  databaseUrl: process.env.DATABASE_URL || '',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean),
  brevoApiKey: process.env.BREVO_API_KEY || '',
  emailFrom: process.env.EMAIL_FROM || '',
  brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || '',
  brevoSenderName: process.env.BREVO_SENDER_NAME || '',
  retentionDays: Number(process.env.RETENTION_DAYS) || 90,
  seedDemo: (process.env.SEED_DEMO ?? (isProd ? 'false' : 'true')) === 'true',
};
