import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

export const bad = (message, code) => new HttpError(400, message, code);

/* ------------------------------ Router ------------------------------ */

export function createRouter() {
  const routes = [];
  return {
    add(method, pattern, handler, opts = {}) {
      const keys = [];
      const re = new RegExp('^' + pattern.replace(/:([A-Za-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
      routes.push({ method, re, keys, handler, auth: opts.auth !== false, maxBody: opts.maxBody });
    },
    match(method, pathname) {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== method) continue;
        const params = {};
        try { r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); } catch { throw bad('That web address is not valid.'); }
        return { route: r, params };
      }
      return { route: null, pathMatched };
    }
  };
}

/* ------------------------------ Body ------------------------------ */

export async function readJson(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

/* ------------------------------ Rate limit ------------------------------ */

const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return;
  }
  b.count += 1;
  if (b.count > max) {
    const wait = Math.ceil((b.reset - now) / 1000);
    throw new HttpError(429, `Too many requests. Please try again in ${wait} seconds.`, 'rate_limited');
  }
}
/**
 * The caller's address for rate limiting. Behind a reverse proxy (Render, Railway, Fly, nginx) every request
 * arrives from the proxy, so with TRUST_PROXY=true the first X-Forwarded-For entry is used instead.
 */
export function clientIp(req) {
  if (process.env.TRUST_PROXY === 'true') {
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (fwd) return fwd;
  }
  return req.socket.remoteAddress || 'unknown';
}
/** For tests: forgets every counted request. */
export const clearRateLimits = () => buckets.clear();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
}, 60_000).unref();

/* ------------------------------ Validation helpers ------------------------------ */

export function str(v, { max = 200, min = 0, field = 'Value' } = {}) {
  if (typeof v !== 'string') {
    if (min > 0) throw bad(`${field} is required.`);
    return '';
  }
  const s = v.trim();
  if (s.length < min) throw bad(`${field} is required.`);
  if (s.length > max) throw bad(`${field} is too long.`);
  return s;
}

/**
 * Reads a number from JSON input. Accepted text formats (anything else is rejected, never guessed):
 *   plain          "12", "-3", "+4", "12.5", ".5"
 *   thousands      "1,234", "1,234,567.5"   (commas must separate groups of exactly three digits)
 *   decimal comma  "1,5", "70,25"           (one comma followed by one or two digits)
 * Not accepted: "1,2,3", "1.234,5", "1e3", "0x10", "12kg". "1,234" always means one thousand two hundred thirty-four.
 */
const PLAIN_NUMBER = /^[+-]?(\d+(\.\d+)?|\.\d+)$/;
const THOUSANDS_NUMBER = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const DECIMAL_COMMA_NUMBER = /^[+-]?\d+,\d{1,2}$/;

export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  const s = v.trim();
  if (PLAIN_NUMBER.test(s)) return Number(s);
  if (THOUSANDS_NUMBER.test(s)) return Number(s.replace(/,/g, ''));
  if (DECIMAL_COMMA_NUMBER.test(s)) return Number(s.replace(',', '.'));
  return NaN;
}

export function num(v, { min = -Infinity, max = Infinity, field = 'Value', optional = false } = {}) {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (optional) return null;
    throw bad(`${field} is required.`);
  }
  const n = parseNumber(v);
  if (!Number.isFinite(n)) throw bad(`${field} must be a number.`);
  if (n < min || n > max) throw bad(`${field} must be between ${min} and ${max}.`);
  return n;
}

export function oneOf(v, options, field = 'Value') {
  if (!options.includes(v)) throw bad(`${field} must be one of: ${options.join(', ')}.`);
  return v;
}

/* ------------------------------ Static files ------------------------------ */

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8'
};

export async function serveStatic(res, publicDir, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { res.writeHead(400).end('Bad request'); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  const full = path.normalize(path.join(publicDir, rel));
  if (!full.startsWith(publicDir + path.sep) && full !== publicDir) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let target = full;
  try {
    const s = await stat(target);
    if (s.isDirectory()) target = path.join(target, 'index.html');
  } catch {
    // Unknown path without a file extension: single page app fallback.
    if (path.extname(rel)) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    target = path.join(publicDir, 'index.html');
  }
  try {
    const body = await readFile(target);
    const type = TYPES[path.extname(target)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}

export function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(body);
}
