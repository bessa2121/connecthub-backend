import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppError, ForbiddenError, UnauthorizedError, ValidationError } from '../domain/errors.js';
import { STATUS, normalizeEmail, parseAccessRequest } from '../domain/access.js';
import { buildUser, parseRegistration, toSelf } from '../domain/user.js';
import { uniqueSlugAsync } from '../domain/shared.js';
import { rateLimiter } from '../infrastructure/rateLimiter.js';

export const CODE_TTL_MS = 10 * 60_000;     // validade do código
export const MAX_ATTEMPTS = 5;               // tentativas por código
const RESEND_INTERVAL_MS = 60_000;           // intervalo mínimo entre envios, por e-mail
const SENDS_PER_HOUR = 5;
const REQUESTS_PER_HOUR = 3;

const REQUEST_RECEIVED = 'Sua solicitação foi recebida! Nossa equipe analisará seus dados. Caso seu acesso seja aprovado, você poderá utilizar o e-mail informado para criar sua conta na plataforma.';
// Mesma resposta para e-mail autorizado ou não: o endpoint não serve para descobrir quem está autorizado.
const CODE_NOTICE = 'Se este e-mail estiver autorizado, enviamos um código de confirmação. Ele vale por 10 minutos.';
const INVALID_CODE = 'Código inválido ou expirado.';
const TOO_MANY = 'Muitas tentativas. Aguarde um pouco e tente novamente.';

export function createRegistrationUseCases({ users, access, hasher, tokens, verifyTokens, emailSender, secret, clock = Date.now }) {
  const iso = (ms = clock()) => new Date(ms).toISOString();
  const session = (user) => ({ token: tokens.sign(user.id), user: toSelf(user) });
  // Limites por e-mail aplicados a QUALQUER e-mail (autorizado ou não), para não virarem um oráculo.
  const sendCooldown = rateLimiter(1, RESEND_INTERVAL_MS, clock);
  const sendHourly = rateLimiter(SENDS_PER_HOUR, 3_600_000, clock);
  const requestHourly = rateLimiter(REQUESTS_PER_HOUR, 3_600_000, clock);
  const hashCode = (email, code) => createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
  const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

  async function sendCode(email) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const now = clock();
    await access.saveVerification({ id: randomUUID(), email, codeHash: hashCode(email, code), expiresAt: iso(now + CODE_TTL_MS), now: iso(now) });
    await emailSender.sendVerificationCode({ to: email, code, ttlMinutes: CODE_TTL_MS / 60_000 });
  }

  /** Envia o código só se houver autorização APPROVED e nenhuma conta; responde igual nos demais casos. */
  async function maybeSendCode(email) {
    if (!emailSender.configured) throw new AppError('O envio de e-mails está indisponível no momento.', 503);
    if (!sendCooldown(email) || !sendHourly(email)) throw new AppError(TOO_MANY, 429);
    const [authorization, existing] = [await access.findAuthorizationByEmail(email), await users.findByEmail(email)];
    if (authorization?.status === STATUS.APPROVED && !existing) await sendCode(email);
  }

  return {
    /** Formulário público de interesse. Não cria conta nem autorização. */
    async requestAccess(input) {
      const data = parseAccessRequest(input);
      if (input.website) return { status: 202, body: { message: REQUEST_RECEIVED } }; // honeypot: robôs preenchem o campo oculto
      if (!requestHourly(data.email)) throw new AppError(TOO_MANY, 429);
      const [existingUser, live] = [await users.findByEmail(data.email), await access.findLiveRequestByEmail(data.email)];
      if (!existingUser && !live) {
        try { await access.addRequest({ id: randomUUID(), ...data, status: STATUS.PENDING, createdAt: iso() }); }
        catch (e) { if (e.status !== 409) throw e; } // corrida entre duas solicitações iguais: a segunda é descartada
      }
      return { status: 202, body: { message: REQUEST_RECEIVED } };
    },

    /** Sem `verificationToken`: valida os dados e dispara o código. Com ele: conclui o cadastro. */
    async register(input) {
      const data = parseRegistration(input);
      if (!input.verificationToken) {
        await maybeSendCode(data.email);
        return { status: 202, body: { message: CODE_NOTICE } };
      }
      const verificationId = verifyTokens.verify(input.verificationToken);
      if (!verificationId) throw new UnauthorizedError('A confirmação do e-mail expirou. Confirme novamente.');
      const verification = await access.getVerificationById(verificationId);
      if (!verification || verification.email !== data.email || !verification.verifiedAt || verification.consumedAt) throw new ForbiddenError('Confirmação de e-mail inválida ou já utilizada.');
      const slug = await uniqueSlugAsync(data.name, (s) => users.slugExists(s));
      const user = buildUser({ input: data, passwordHash: hasher.hash(data.password), slug });
      await access.registerUser({ user, verificationId, now: iso() });
      return { status: 201, body: session(user) };
    },

    /** Confere o código. Devolve um token curto e de uso único para concluir o cadastro. */
    async verifyEmail(input = {}) {
      const email = normalizeEmail(input.email), code = String(input.code ?? '').trim();
      if (!/^\d{6}$/.test(code) || !email) throw new ValidationError(INVALID_CODE);
      const v = await access.getVerification(email);
      if (!v || v.verifiedAt || v.consumedAt || Date.parse(v.expiresAt) <= clock()) throw new ValidationError(INVALID_CODE);
      if (v.attempts >= MAX_ATTEMPTS) throw new AppError(TOO_MANY, 429);
      // Conta a tentativa ANTES de comparar: palpites simultâneos não escapam do limite.
      if ((await access.incrementAttempts(email)) > MAX_ATTEMPTS) throw new AppError(TOO_MANY, 429);
      if (!sameHash(v.codeHash, hashCode(email, code))) throw new ValidationError(INVALID_CODE);
      if (!(await access.markVerified(v.id, iso()))) throw new ValidationError(INVALID_CODE); // uso único
      return { verificationToken: verifyTokens.sign(v.id) };
    },

    /** Novo código, respeitando o intervalo mínimo. Resposta idêntica para e-mails não autorizados. */
    async resendVerification(input = {}) {
      const email = normalizeEmail(input.email);
      if (!email) throw new ValidationError('Informe o e-mail.');
      const current = await access.getVerification(email);
      if (current && current.attempts >= MAX_ATTEMPTS && Date.parse(current.expiresAt) > clock()) throw new AppError(TOO_MANY, 429); // bloqueado até o código vencer
      await maybeSendCode(email);
      return { status: 202, body: { message: CODE_NOTICE } };
    },
  };
}
