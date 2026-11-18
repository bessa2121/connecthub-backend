import { AppError } from '../domain/errors.js';

/**
 * Porta de e-mail transacional. Adaptador de produção: Resend (HTTP, sem dependências).
 * Sem RESEND_API_KEY/EMAIL_FROM o envio FALHA (503): nunca finge que enviou.
 * Trocar de provedor (Brevo, SES) = escrever outro adaptador com a mesma interface.
 */
const message = ({ code, ttlMinutes }) => ({
  subject: 'Seu código de confirmação do ConnectHub',
  text: `Seu código de confirmação é ${code}.\nEle vale por ${ttlMinutes} minutos e só pode ser usado uma vez.\nSe você não pediu este código, ignore esta mensagem.`,
  html: `<p>Seu código de confirmação do ConnectHub é:</p><p style="font-size:28px;letter-spacing:6px"><strong>${code}</strong></p><p>Ele vale por ${ttlMinutes} minutos e só pode ser usado uma vez.</p><p>Se você não pediu este código, ignore esta mensagem.</p>`,
});

export function createEmailSender({ resendApiKey, emailFrom }) {
  if (!resendApiKey || !emailFrom) {
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
        res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: emailFrom, to: [to], ...message({ code, ttlMinutes }) }),
          signal: AbortSignal.timeout(10_000),
        });
      } catch { throw new AppError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.', 502); }
      // Nunca registrar o corpo da requisição (contém o código) nem o endereço.
      if (!res.ok) { console.error(`[email] provedor respondeu ${res.status}`); throw new AppError('Não foi possível enviar o e-mail agora. Tente novamente em instantes.', 502); }
    },
  };
}
