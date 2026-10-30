import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (s) => Buffer.from(s).toString('base64url');

export function createTokenService(secret, ttlSeconds = 60 * 60 * 24 * 7) {
  const mac = (payload) => createHmac('sha256', secret).update(payload).digest('base64url');
  return {
    sign(userId) {
      const payload = b64(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
      return `${payload}.${mac(payload)}`;
    },
    verify(token) {
      const [payload, signature] = String(token ?? '').split('.');
      if (!payload || !signature) return null;
      const expected = Buffer.from(mac(payload)), given = Buffer.from(signature);
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      try {
        const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        return exp > Date.now() / 1000 ? sub : null;
      } catch { return null; }
    },
  };
}
