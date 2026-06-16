/**
 * Rate limiter em memória por usuário (sem pacote externo).
 * Janela deslizante simples: conta requisições dentro de `windowMs`.
 * Limpa automaticamente entradas expiradas para evitar vazamento de memória.
 */

const store = new Map(); // userId → { count, resetAt }

function createRateLimiter({ windowMs = 60_000, max = 20, message = 'Muitas requisições. Tente novamente em instantes.' } = {}) {
  return (req, res, next) => {
    const userId = req.user?.id || req.ip || 'anonymous';
    const now = Date.now();

    const entry = store.get(userId);

    if (!entry || now >= entry.resetAt) {
      store.set(userId, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= max) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: message, retryAfter });
    }

    entry.count += 1;
    return next();
  };
}

// Limpa entradas expiradas a cada 5 minutos para não vazar memória.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 5 * 60_000);

// ── Limites pré-configurados ──────────────────────────────────────────────────

/** Chat / stream: 30 req/min por usuário (suficiente para uso normal, bloqueia spam) */
export const chatRateLimit = createRateLimiter({ windowMs: 60_000, max: 30, message: 'Limite de mensagens atingido. Aguarde 1 minuto.' });

/** Gerador de ideias: 10 req/min (chamada mais cara) */
export const ideaRateLimit = createRateLimiter({ windowMs: 60_000, max: 10, message: 'Limite do Gerador de Ideias atingido. Aguarde 1 minuto.' });

/** Auth (registro/login): 10 tentativas/min por IP (protege contra brute-force) */
export const authRateLimit = createRateLimiter({ windowMs: 60_000, max: 10, message: 'Muitas tentativas de autenticação. Aguarde 1 minuto.' });
