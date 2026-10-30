// Composition root: único lugar que conhece todas as camadas.
import { config } from './infrastructure/config.js';
import { createPersistence } from './infrastructure/persistence/index.js';
import { seedDemo } from './infrastructure/seed.js';
import { passwordHasher } from './infrastructure/passwordHasher.js';
import { createTokenService } from './infrastructure/tokenService.js';
import { createAuthUseCases } from './application/authUseCases.js';
import { createProjectUseCases } from './application/projectUseCases.js';
import { createCommunityUseCases } from './application/communityUseCases.js';
import { buildRoutes } from './presentation/http/routes.js';
import { createServer } from './presentation/http/server.js';

export function createApp({ persistence, secret = config.secret, allowedOrigins = config.allowedOrigins }) {
  const { users, projects } = persistence;
  const tokens = createTokenService(secret);
  const router = buildRoutes({
    auth: createAuthUseCases({ users, hasher: passwordHasher, tokens }),
    projects: createProjectUseCases({ projects, users }),
    community: createCommunityUseCases({ users, projects }),
    ping: persistence.ping,
  });
  const authenticate = async (req) => {
    const header = req.headers.authorization ?? '';
    const id = header.startsWith('Bearer ') ? tokens.verify(header.slice(7)) : null;
    return id ? (await users.findById(id)) ?? null : null;
  };
  return createServer({ router, authenticate, allowedOrigins });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const persistence = createPersistence(config.databaseUrl);
  await persistence.init();
  if (config.seedDemo && (await seedDemo(persistence))) console.log('Dados de demonstração criados.');
  const server = createApp({ persistence }).listen(config.port, '0.0.0.0', () =>
    console.log(`ConnectHub API em http://localhost:${config.port} (${config.databaseUrl ? 'PostgreSQL' : 'memória'})`));
  const stop = () => server.close(async () => { await persistence.close(); process.exit(0); });
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
