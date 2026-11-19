import { AppError } from '../domain/errors.js';

/**
 * Porta de e-mail transacional. Adaptador de produção: Brevo (API HTTP v3, sem dependências).
 * Sem BREVO_API_KEY e remetente o envio FALHA (503): nunca finge que enviou.
 * Trocar de provedor (SES, etc.) = escrever outro adaptador com a mesma interface.
 */
const message = ({ code, ttlMinutes }) => ({
  subject: 'Seu código de confirmação do ConnectHub',
  text: `Seu código de confirmação é ${code}.\nEle vale por ${ttlMinutes} minutos e só pode ser usado uma vez.\nSe você não pediu este código, ignore esta mensagem.`,
  html: `<p>Seu código de confirmação do ConnectHub é:</p><p style="font-size:28px;letter-spacing:6px"><strong>${code}</strong></p><p>Ele vale por ${ttlMinutes} minutos e só pode ser usado uma vez.</p><p>Se você não pediu este código, ignore esta mensagem.</p>`,
});

/** Aceita `Nome <email@dominio>` ou apenas `email@dominio`. Devolve { name?, email } ou null. */
export function parseSender(value = '') {
  const m = /^\s*"?([^"<]*?)"?\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  const email = (m ? m[2] : value).trim();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null;
  const name = m?.[1]?.trim();
  return name ? { name, email } : { email };
}

/** BREVO_SENDER_EMAIL/BREVO_SENDER_NAME têm prioridade; EMAIL_FROM ("Nome <email>") é a alternativa. */
export function resolveSender({ brevoSenderEmail, brevoSenderName, emailFrom }) {
  if (brevoSenderEmail) {
    const parsed = parseSender(brevoSenderEmail.trim());
    if (!parsed) return null;
    const name = (brevoSenderName || '').trim();
    return name ? { name, email: parsed.email } : { email: parsed.email };
  }
  return parseSender(emailFrom);
}

export function createEmailSender({ brevoApiKey, emailFrom, brevoSenderEmail, brevoSenderName }) {
  const sender = resolveSender({ brevoSenderEmail, brevoSenderName, emailFrom });
  if ((brevoSenderEmail || emailFrom) && !sender) console.warn('[aviso] Remetente inválido: use BREVO_SENDER_EMAIL=email@dominio (e BREVO_SENDER_NAME) ou EMAIL_FROM="Nome <email@dominio>".');
  if (!brevoApiKey || !sender) {
    return {
      configured: false,
      async sendVerificationCode() { throw new AppError('O envio de e-mails não está configurado neste servidor.', 503); },
    };
  }
  return {
    configured: true,
    async sendVerificationCode({ to, code, ttlMinutes }) {
      let res;
      try {
        const { subject, text, html } = message({ code, ttlMinutes });
        res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html, textContent: text }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch { throw new AppError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.', 502); }
      // Nunca registrar o corpo da requisição (contém o código) nem o endereço.
      if (!res.ok) {
        // Só o status e o "code" de erro do Brevo (ex.: unauthorized, invalid_parameter); nunca o corpo da requisição.
        const code = await res.json().then((j) => (typeof j?.code === 'string' ? j.code.replace(/[^\w.-]/g, '').slice(0, 60) : ''), () => '');
        console.error(`[email] Brevo respondeu ${res.status}${code ? ` (${code})` : ''}`);
        throw new AppError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.', 502); }
    },
  };
}
