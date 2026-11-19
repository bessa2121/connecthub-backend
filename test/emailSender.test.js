import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailSender, parseSender, resolveSender } from '../src/infrastructure/emailSender.js';

test('parseSender aceita "Nome <email>" e e-mail puro; rejeita inválidos', () => {
  assert.deepEqual(parseSender('ConnectHub <nao-responda@exemplo.com.br>'), { name: 'ConnectHub', email: 'nao-responda@exemplo.com.br' });
  assert.deepEqual(parseSender('"ConnectHub" <a@b.co>'), { name: 'ConnectHub', email: 'a@b.co' });
  assert.deepEqual(parseSender('a@b.co'), { email: 'a@b.co' });
  assert.equal(parseSender('sem-arroba'), null);
  assert.equal(parseSender(''), null);
});

test('sem BREVO_API_KEY/EMAIL_FROM: configured=false e envio falha com 503', async () => {
  for (const cfg of [{}, { brevoApiKey: 'k' }, { emailFrom: 'a@b.co' }]) {
    const s = createEmailSender(cfg);
    assert.equal(s.configured, false);
    await assert.rejects(() => s.sendVerificationCode({ to: 'x@y.z', code: '123456', ttlMinutes: 10 }), (e) => e.status === 503 || e.statusCode === 503);
  }
});

test('envia para a API v3 do Brevo com o formato esperado', async () => {
  const real = globalThis.fetch; let call;
  globalThis.fetch = async (url, init) => { call = { url, init }; return new Response('{"messageId":"<x>"}', { status: 201 }); };
  try {
    const s = createEmailSender({ brevoApiKey: 'chave-teste', emailFrom: 'ConnectHub <nao-responda@exemplo.com.br>' });
    assert.equal(s.configured, true);
    await s.sendVerificationCode({ to: 'aluno@exemplo.com', code: '654321', ttlMinutes: 10 });
    assert.equal(call.url, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(call.init.method, 'POST');
    assert.equal(call.init.headers['api-key'], 'chave-teste');
    const body = JSON.parse(call.init.body);
    assert.deepEqual(body.sender, { name: 'ConnectHub', email: 'nao-responda@exemplo.com.br' });
    assert.deepEqual(body.to, [{ email: 'aluno@exemplo.com' }]);
    assert.match(body.subject, /ConnectHub/);
    assert.match(body.textContent, /654321/);
    assert.match(body.htmlContent, /654321/);
  } finally { globalThis.fetch = real; }
});

test('erro do provedor (4xx/5xx) e falha de rede viram 502 sem vazar o código nos logs', async () => {
  const real = globalThis.fetch, realErr = console.error; const logs = [];
  console.error = (...a) => logs.push(a.join(' '));
  try {
    const s = createEmailSender({ brevoApiKey: 'k', emailFrom: 'a@b.co' });
    globalThis.fetch = async () => new Response('{"code":"unauthorized"}', { status: 401 });
    await assert.rejects(() => s.sendVerificationCode({ to: 'x@y.z', code: '999888', ttlMinutes: 10 }), (e) => (e.status ?? e.statusCode) === 502);
    globalThis.fetch = async () => { throw new Error('rede'); };
    await assert.rejects(() => s.sendVerificationCode({ to: 'x@y.z', code: '999888', ttlMinutes: 10 }), (e) => (e.status ?? e.statusCode) === 502);
    assert.ok(logs.every((l) => !l.includes('999888') && !l.includes('x@y.z')));
  } finally { globalThis.fetch = real; console.error = realErr; }
});

test('BREVO_SENDER_EMAIL/NAME têm prioridade sobre EMAIL_FROM', async () => {
  assert.deepEqual(resolveSender({ brevoSenderEmail: 'a@b.co', brevoSenderName: 'ConnectHub', emailFrom: 'Outro <x@y.zz>' }), { name: 'ConnectHub', email: 'a@b.co' });
  assert.deepEqual(resolveSender({ brevoSenderEmail: 'a@b.co' }), { email: 'a@b.co' });
  assert.deepEqual(resolveSender({ emailFrom: 'Outro <x@y.zz>' }), { name: 'Outro', email: 'x@y.zz' });
  assert.equal(resolveSender({ brevoSenderEmail: 'invalido' }), null);
  const s = createEmailSender({ brevoApiKey: 'k', brevoSenderEmail: 'a@b.co', brevoSenderName: 'ConnectHub' });
  assert.equal(s.configured, true);
});
