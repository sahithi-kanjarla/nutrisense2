import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './env.js';
import { q } from './db.js';
import { HttpError } from './http.js';

const scryptAsync = promisify(scrypt);
const b64u = (buf) => Buffer.from(buf).toString('base64url');

/* ------------------------------ Passwords ------------------------------ */

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `s1:${b64u(salt)}:${b64u(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [version, saltB64, hashB64] = String(stored).split(':');
  if (version !== 's1' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

/* ------------------------------ Tokens (HS256 JWT) ------------------------------ */

const sign = (data) => createHmac('sha256', config.jwtSecret).update(data).digest('base64url');

export function signToken(userId, ttlSeconds = 60 * 60 * 24 * 30) {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function verifyToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = Buffer.from(sign(`${parts[0]}.${parts[1]}`));
  const given = Buffer.from(parts[2]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function authenticate(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) throw new HttpError(401, 'Please log in to continue.', 'unauthorized');
  const user = q.get('SELECT id, name, email FROM users WHERE id = ?', payload.sub);
  if (!user) throw new HttpError(401, 'Please log in to continue.', 'unauthorized');
  return user;
}
