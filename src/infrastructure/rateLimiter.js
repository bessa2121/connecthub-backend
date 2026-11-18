/** Limitador em memória (janela fixa). `now` é injetável para os testes. */
export function rateLimiter(limit, windowMs, now = Date.now) {
  const hits = new Map();
  return (key) => {
    const t = now(), entry = hits.get(key);
    if (hits.size > 5000) hits.clear();
    if (!entry || entry.reset < t) { hits.set(key, { count: 1, reset: t + windowMs }); return true; }
    return ++entry.count <= limit;
  };
}
