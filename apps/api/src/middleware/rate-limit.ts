import type { NextFunction, Request, Response } from 'express';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const CLEANUP_INTERVAL_MS = 5 * 60_000; // 5 min

const hits = new Map<string, { count: number; windowStart: number }>();

// Cleanup de entradas expiradas (memória > evita leak em IPs únicos)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits.entries()) {
    if (now - entry.windowStart >= WINDOW_MS) {
      hits.delete(ip);
    }
  }
}, CLEANUP_INTERVAL_MS);

export function rateLimit(req: Request, res: Response, next: NextFunction): void {
  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const now = Date.now();
  let entry = hits.get(ip);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    entry = { count: 0, windowStart: now };
    hits.set(ip, entry);
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    res.status(429).json({
      error: 'Too many requests',
      retryAfterSeconds: Math.ceil(
        (WINDOW_MS - (now - entry.windowStart)) / 1000,
      ),
    });
    return;
  }

  next();
}
