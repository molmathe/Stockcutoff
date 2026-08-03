import { Request } from 'express';

// Requests arrive as Cloudflare → cloudflared → nginx → backend. Both the tunnel
// and nginx are internal hops, so an address in these ranges means we are looking
// at our own infrastructure rather than the caller.
const isPrivateAddress = (ip: string): boolean => {
  const addr = ip.replace(/^::ffff:/i, ''); // unwrap IPv4-mapped IPv6
  if (addr === '::1') return true;
  if (/^(?:10|127)\./.test(addr)) return true;
  if (/^192\.168\./.test(addr)) return true;
  if (/^169\.254\./.test(addr)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(addr)) return true;
  if (/^(?:f[cd]|fe80)/i.test(addr)) return true; // IPv6 unique-local / link-local
  return false;
};

let warned = false;

/**
 * The caller's real address, or null when only an internal hop is visible.
 *
 * Observed in production, the chain reaching this service is:
 *   req.ip = 49.49.235.63
 *   x-forwarded-for = 49.49.235.63, 172.18.0.8   (caller, then the tunnel container)
 *   cf-connecting-ip = 49.49.235.63
 *   socket = ::ffff:172.18.0.6                   (nginx)
 *
 * CF-Connecting-IP is preferred: Cloudflare overwrites whatever the caller supplied,
 * so unlike X-Forwarded-For its value cannot be chosen by the caller. req.ip backs it
 * up and agrees, because `trust proxy` counts the two hops in front of us (cloudflared
 * and nginx) and Cloudflare appends the true address at a fixed distance from the
 * right, which is what keeps that position unspoofable.
 *
 * Returning null rather than a placeholder keeps callers honest: a shared fallback
 * value would collapse every client into one rate-limit bucket.
 */
export const clientIp = (req: Request): string | null => {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();

  const ip = req.ip;
  if (ip && !isPrivateAddress(ip)) return ip;

  if (!warned) {
    warned = true;
    console.warn(
      `[client-ip] cannot resolve a caller address (req.ip=${ip ?? 'undefined'}); ` +
        'per-client rate limiting is disabled — check `trust proxy` against the real hop count',
    );
  }
  return null;
};
