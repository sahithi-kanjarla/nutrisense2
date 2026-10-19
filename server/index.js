import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ROOT } from './lib/env.js';
import { db } from './lib/db.js';
import { HttpError, createRouter, readJson, sendJson, serveStatic } from './lib/http.js';
import { authenticate } from './lib/auth.js';
import { aiStatus } from './lib/ai/index.js';
import * as auth from './routes/auth.js';
import * as profile from './routes/profile.js';
import * as pantry from './routes/pantry.js';
import * as scan from './routes/scan.js';
import * as meals from './routes/meals.js';
import * as dashboard from './routes/dashboard.js';
import * as ai from './routes/ai.js';
import * as planner from './routes/planner.js';
import * as account from './routes/account.js';

const PUBLIC_DIR = path.join(ROOT, 'public');

export function buildServer() {
  const router = createRouter();
  for (const mod of [auth, profile, pantry, scan, meals, dashboard, ai, planner, account]) mod.register(router);
  router.add('GET', '/api/health', async () => { db.prepare('SELECT 1').get(); return { ok: true, ai: aiStatus() }; }, { auth: false });

  const CSP = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ');

  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');

    const url = new URL(req.url, 'http://localhost');
    try {
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
        res.setHeader('Content-Security-Policy', CSP);
        await serveStatic(res, PUBLIC_DIR, url.pathname);
        return;
      }

      if (config.clientOrigin) {
        res.setHeader('Access-Control-Allow-Origin', config.clientOrigin);
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Vary', 'Origin');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

      const { route, params, pathMatched } = router.match(req.method, url.pathname);
      if (!route) throw new HttpError(pathMatched ? 405 : 404, pathMatched ? 'Method not allowed.' : 'Not found.');

      const ctx = {
        req, res, params, status: 200, download: null,
        query: Object.fromEntries(url.searchParams),
        user: null,
        body: {}
      };
      if (route.auth) ctx.user = authenticate(req);
      if (req.method !== 'GET' && req.method !== 'HEAD') ctx.body = await readJson(req, route.maxBody || 1_000_000);

      const data = await route.handler(ctx);
      sendJson(res, ctx.status, data ?? { ok: true }, ctx.download ? { 'Content-Disposition': `attachment; filename="${ctx.download}"` } : {});
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message, code: err.code });
      } else {
        console.error('[server] unexpected error:', err);
        sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.', code: 'server_error' });
      }
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = buildServer();
  server.listen(config.port, process.env.HOST || '127.0.0.1', () => {
    const s = aiStatus();
    console.log(`\n  NutriSense is running at http://localhost:${config.port}\n`);
    console.log(`  Gemini key: ${s.gemini ? 'found' : 'missing'}   Groq key: ${s.groq ? 'found' : 'missing'}`);
    if (!s.any) console.log('  Add GEMINI_API_KEY and/or GROQ_API_KEY to .env to turn on the AI features.\n');
  });

  process.on('unhandledRejection', (err) => console.error('[server] unhandled rejection:', err));
  const shutdown = (signal) => {
    console.log(`\n  ${signal} received, shutting down.`);
    server.close(() => { try { db.close(); } catch { /* already closed */ } process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
