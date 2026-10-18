import { createHash } from 'node:crypto';
import { q } from '../lib/db.js';
import { HttpError, bad, rateLimit, str } from '../lib/http.js';
import { addDays, dateOr, weekStart } from '../lib/dates.js';
import { dayTotals, getPantry, getProfile, remainingOf, targetsOf } from '../lib/data.js';
import { aiStatus } from '../lib/ai/index.js';
import { prefsFromProfile } from '../lib/safety.js';
import { rangeStats } from '../lib/stats.js';
import { balanceDay, chat, generateRecipes, planWeek, weeklyReview } from '../lib/ai/features.js';

const CACHE_MS = 6 * 60 * 60 * 1000;
const FILTERS = ['pantry', 'use_soon', 'high_protein', 'quick'];

const cacheGet = (userId, key) => {
  const row = q.get('SELECT value, created_at FROM ai_cache WHERE user_id = ? AND key = ?', userId, key);
  if (!row || Date.now() - row.created_at > CACHE_MS) return null;
  try { return JSON.parse(row.value); } catch { return null; }
};
const cachePut = (userId, key, value) =>
  q.run('INSERT INTO ai_cache (user_id, key, value, created_at) VALUES (?,?,?,?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at',
    userId, key, JSON.stringify(value), Date.now());

const limit = (ctx) => rateLimit(`ai:${ctx.user.id}`, 30, 60_000);

function snapshot(ctx, date) {
  const profile = getProfile(ctx.user.id);
  return { profile, pantry: getPantry(ctx.user.id, date), totals: dayTotals(ctx.user.id, date), today: date };
}

export function register(router) {
  router.add('GET', '/api/ai/status', async () => aiStatus(), { auth: false });

  router.add('POST', '/api/ai/balance', async (ctx) => {
    limit(ctx);
    const date = dateOr(ctx.body.date);
    return balanceDay(snapshot(ctx, date));
  });

  router.add('GET', '/api/ai/chat', async (ctx) => {
    const rows = q.all('SELECT id, role, content, recipe, created_at FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 60', ctx.user.id).reverse();
    return { messages: rows.map((r) => ({ ...r, recipe: r.recipe ? JSON.parse(r.recipe) : null })) };
  });

  router.add('POST', '/api/ai/chat', async (ctx) => {
    limit(ctx);
    const message = str(ctx.body.message, { min: 1, max: 600, field: 'Message' });
    const date = dateOr(ctx.body.date);
    const history = q.all('SELECT role, content FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 12', ctx.user.id).reverse();
    const result = await chat({ ...snapshot(ctx, date), history, message });
    q.run('INSERT INTO chat_messages (user_id, role, content) VALUES (?,?,?)', ctx.user.id, 'user', message);
    const r = q.run('INSERT INTO chat_messages (user_id, role, content, recipe) VALUES (?,?,?,?)', ctx.user.id, 'assistant', result.reply, result.recipe ? JSON.stringify(result.recipe) : null);
    return { id: Number(r.lastInsertRowid), reply: result.reply, recipe: result.recipe, provider: result.provider };
  });

  router.add('DELETE', '/api/ai/chat', async (ctx) => {
    q.run('DELETE FROM chat_messages WHERE user_id = ?', ctx.user.id);
    return { ok: true };
  });

  router.add('POST', '/api/ai/recipes', async (ctx) => {
    limit(ctx);
    const date = dateOr(ctx.body.date);
    const filter = FILTERS.includes(ctx.body.filter) ? ctx.body.filter : 'pantry';
    const snap = snapshot(ctx, date);
    const sig = createHash('sha1').update(JSON.stringify([
      filter, date, snap.pantry.map((i) => [i.name, Math.round(i.quantity), i.status]),
      snap.profile.diet, snap.profile.allergies, snap.profile.dislikes, snap.profile.calories
    ])).digest('hex').slice(0, 16);
    const key = `recipes:${sig}`;
    if (!ctx.body.refresh) {
      const hit = cacheGet(ctx.user.id, key);
      if (hit) return { ...hit, cached: true };
    }
    const result = await generateRecipes({ ...snap, filter });
    cachePut(ctx.user.id, key, result);
    return { ...result, cached: false };
  });

  router.add('POST', '/api/ai/plan-week', async (ctx) => {
    limit(ctx);
    const date = dateOr(ctx.body.date);
    const start = weekStart(dateOr(ctx.body.start, date));
    const snap = snapshot(ctx, date);
    const result = await planWeek({ userId: ctx.user.id, profile: snap.profile, pantry: snap.pantry, today: date, start });
    return { start, ...result };
  });

  router.add('POST', '/api/ai/review', async (ctx) => {
    limit(ctx);
    const date = dateOr(ctx.body.date);
    const profile = getProfile(ctx.user.id);
    const stats = rangeStats(ctx.user.id, date, 7, targetsOf(profile));
    const compact = { days: stats.days, logged_days: stats.logged_days, protein_hits: stats.protein_hits, kcal_on_target: stats.kcal_on_target, avg: stats.avg, targets: stats.targets, weight_change_kg: stats.weight_change };
    const key = `review:${date}:${createHash('sha1').update(JSON.stringify([compact, profile.diet, profile.allergies])).digest('hex')}`;
    if (!ctx.body.refresh) {
      const hit = cacheGet(ctx.user.id, key);
      if (hit) return hit;
    }
    const out = await weeklyReview({ profile, stats: { ...compact, avg: stats.avg } });
    cachePut(ctx.user.id, key, out);
    return out;
  });
}
