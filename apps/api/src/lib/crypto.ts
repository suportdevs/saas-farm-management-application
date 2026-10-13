import crypto from 'node:crypto';
import { env } from '../config/env';

/** URL-safe random token (default 32 bytes ≈ 256 bits of entropy). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Derive a dedicated key per purpose from APP_SECRET so one secret can safely serve many uses.
function deriveKey(purpose: string): Buffer {
  return Buffer.from(crypto.hkdfSync('sha256', env.APP_SECRET, 'kit', purpose, 32));
}

/** AES-256-GCM encryption for secrets at rest (e.g. TOTP secrets, OAuth tokens). */
export function encrypt(plain: string, purpose = 'default'): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(purpose), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string, purpose = 'default'): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Malformed encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** HMAC signature, handy for signed cookies / state params. */
export function sign(value: string, purpose = 'default'): string {
  return crypto.createHmac('sha256', deriveKey(purpose)).update(value).digest('base64url');
}
