// Composition root: único lugar que conhece todas as camadas.
import { config } from './infrastructure/config.js';
import { createPersistence } from './infrastructure/persistence/index.js';
import { seedDemo } from './infrastructure/seed.js';
import { passwordHasher } from './infrastructure/passwordHasher.js';
import { createTokenService } from './infrastructure/tokenService.js';
import { createEmailSender } from './infrastructure/emailSender.js';
import { createRegistrationUseCases } from './application/registrationUseCases.js';
import { createAdminUseCases } from './application/adminUseCases.js';
import { createAuthUseCases } from './application/authUseCases.js';
import { createProjectUseCases } from './application/projectUseCases.js';
import { createCommunityUseCases } from './application/communityUseCases.js';
import { createImageGuard, createImageUseCases } from './application/imageUseCases.js';
import { buildRoutes } from './presentation/http/routes.js';
import { createServer } from './presentation/http/server.js';

export function createApp({ persistence, secret = config.secret, allowedOrigins = config.allowedOrigins, emailSender = createEmailSender(config), clock = Date.now }) {
  const { users, projects, images, access } = persistence;
  const imageGuard = createImageGuard({ images });
  const tokens = createTokenService(secret);
  const router = buildRoutes({
    auth: createAuthUseCases({ users, hasher: passwordHasher, tokens }),
    registration: createRegistrationUseCases({ users, access, hasher: passwordHasher, tokens, verifyTokens: createTokenService(`${secret}:email-verification`, 15 * 60), emailSender, secret, clock }),
    admin: createAdminUseCases({ access, users, clock }),
    projects: createProjectUseCases({ projects, users, imageGuard }),
    community: createCommunityUseCases({ users, projects, imageGuard }),
    images: createImageUseCases({ images }),
    ping: persistence.ping,
  });
  const authenticate = async (req) => {
    const header = req.headers.authorization ?? '';
    const id = header.startsWith('Bearer ') ? tokens.verify(header.slice(7)) : null;
    const user = id ? await users.findById(id) : null;
    return user && user.status !== 'SUSPENDED' ? user : null; // conta suspensa perde o acesso na hora
  };
  return createServer({ router, authenticate, allowedOrigins });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const persistence = createPersistence(config.databaseUrl);
  await persistence.init();
  if (config.seedDemo && (await seedDemo(persistence))) console.log('Dados de demonstração criados.');
  // Retenção (LGPD): descarta solicitações rejeitadas/revogadas antigas e verificações vencidas.
  const purge = () => persistence.access.purge({ requestsBefore: new Date(Date.now() - config.retentionDays * 86_400_000).toISOString(), verificationsBefore: new Date(Date.now() - 86_400_000).toISOString() }).catch((e) => console.error('[purge]', e.message));
  await purge(); setInterval(purge, 86_400_000).unref();
  const server = createApp({ persistence }).listen(config.port, '0.0.0.0', () =>
    console.log(`ConnectHub API em http://localhost:${config.port} (${config.databaseUrl ? 'PostgreSQL' : 'memória'})`));
  const stop = () => server.close(async () => { await persistence.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
