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
let probed = 0;

/**
 * The caller's real address, or null when only an internal hop is visible.
 *
 * CF-Connecting-IP is preferred because Cloudflare overwrites whatever the caller
 * supplied, but it was found not to reach this service in production, so req.ip is
 * the working path: `trust proxy` is set to the number of hops in front of us, and
 * Cloudflare always appends the true address to X-Forwarded-For at a fixed distance
 * from the right, which is what makes that position unspoofable.
 *
 * Returning null rather than a placeholder keeps callers honest: a shared fallback
 * value would collapse every client into one rate-limit bucket.
 */
export const clientIp = (req: Request): string | null => {
  // TEMPORARY: two attempts at configuring this were deployed on reasoning alone
  // and both were wrong, so record what the forwarding chain actually looks like.
  // Remove once `trust proxy` is set from the value observed here.
  if (probed < 25) {
    probed++;
    console.warn(
      '[client-ip probe] #%d %s %s | req.ip=%s | xff=%s | cf=%s',
      probed,
      req.method,
      req.originalUrl,
      req.ip,
      req.headers['x-forwarded-for'] ?? '(none)',
      req.headers['cf-connecting-ip'] ?? '(none)',
    );
  }

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
