// Provisiona (ou promove) o primeiro administrador. Roda só no servidor/terminal de quem tem acesso ao banco:
//   DATABASE_URL=... npm run admin:create -- --email=coordenacao@escola.com --name="Coordenação"
// A senha vem de ADMIN_PASSWORD ou de um prompt oculto. Nada de credencial no código ou no repositório.
import { createInterface } from 'node:readline';
import { config } from '../src/infrastructure/config.js';
import { createPersistence } from '../src/infrastructure/persistence/index.js';
import { passwordHasher } from '../src/infrastructure/passwordHasher.js';
import { buildUser } from '../src/domain/user.js';
import { isEmail, normalizeEmail } from '../src/domain/access.js';
import { uniqueSlugAsync } from '../src/domain/shared.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const fail = (msg) => { console.error(`Erro: ${msg}`); process.exit(1); };

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => { if (s.includes(question)) process.stdout.write(s); }; // não ecoa a senha
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

if (!config.databaseUrl) fail('defina DATABASE_URL (sem banco a conta de administrador não seria persistida).');
const email = normalizeEmail(arg('email') ?? process.env.ADMIN_EMAIL);
if (!isEmail(email)) fail('informe um e-mail válido com --email=... (ou ADMIN_EMAIL).');
const name = (arg('name') ?? process.env.ADMIN_NAME ?? 'Administração').trim();

const persistence = createPersistence(config.databaseUrl);
await persistence.init();
try {
  const existing = await persistence.users.findByEmail(email);
  if (existing) {
    await persistence.users.setRole(existing.id, 'ADMIN');
    await persistence.users.setStatus(existing.id, 'ACTIVE');
    await persistence.audit.add({ actorId: null, action: 'ADMIN_PROVISIONED', targetType: 'user', targetId: existing.id });
    console.log(`Conta existente promovida a ADMIN: ${email} (a senha atual foi mantida).`);
  } else {
    const password = process.env.ADMIN_PASSWORD ?? (process.stdin.isTTY ? await askHidden('Senha do administrador (mín. 12 caracteres): ') : '');
    if (password.length < 12) fail('a senha do administrador precisa ter ao menos 12 caracteres (use ADMIN_PASSWORD ou um terminal interativo).');
    const slug = await uniqueSlugAsync(name, (s) => persistence.users.slugExists(s));
    const user = { ...buildUser({ input: { name, email, course: 'Administração', year: '3º ano', skills: [] }, passwordHash: passwordHasher.hash(password), slug }), role: 'ADMIN' };
    await persistence.users.add(user);
    await persistence.audit.add({ actorId: null, action: 'ADMIN_PROVISIONED', targetType: 'user', targetId: user.id });
    console.log(`Administrador criado: ${email}`);
  }
} finally { await persistence.close(); }
