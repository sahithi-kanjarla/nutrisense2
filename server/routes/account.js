import { q } from '../lib/db.js';
import { HttpError, bad, oneOf, rateLimit, str } from '../lib/http.js';
import { hashPassword, verifyPassword } from '../lib/auth.js';
import { getProfile, publicProfile } from '../lib/data.js';

const NOTIFY_KEYS = ['expiry', 'meals', 'hydration', 'weekly'];

export function register(router) {
  router.add('PUT', '/api/settings', async (ctx) => {
    const b = ctx.body;
    const profile = getProfile(ctx.user.id);
    if (b.name !== undefined) q.run('UPDATE users SET name = ? WHERE id = ?', str(b.name, { min: 1, max: 60, field: 'Name' }), ctx.user.id);
    if (b.units !== undefined) q.run('UPDATE profiles SET units = ? WHERE user_id = ?', oneOf(b.units, ['metric', 'imperial'], 'Units'), ctx.user.id);
    if (b.energy_unit !== undefined) q.run('UPDATE profiles SET energy_unit = ? WHERE user_id = ?', oneOf(b.energy_unit, ['kcal', 'kj'], 'Energy unit'), ctx.user.id);
    if (b.notifications && typeof b.notifications === 'object') {
      const next = { ...profile.notifications };
      for (const k of NOTIFY_KEYS) if (typeof b.notifications[k] === 'boolean') next[k] = b.notifications[k];
      q.run('UPDATE profiles SET notifications = ? WHERE user_id = ?', JSON.stringify(next), ctx.user.id);
    }
    const user = q.get('SELECT id, name, email FROM users WHERE id = ?', ctx.user.id);
    return { user, profile: publicProfile(getProfile(ctx.user.id)) };
  });

  router.add('POST', '/api/account/password', async (ctx) => {
    rateLimit(`pw:${ctx.user.id}`, 8, 15 * 60 * 1000);
    const current = typeof ctx.body.current === 'string' ? ctx.body.current : '';
    const next = typeof ctx.body.next === 'string' ? ctx.body.next : '';
    if (next.length < 8 || next.length > 128) throw bad('New password must be 8 to 128 characters.');
    const row = q.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!(await verifyPassword(current, row.password_hash))) throw new HttpError(403, 'Your current password is incorrect.', 'bad_credentials');
    q.run('UPDATE users SET password_hash = ? WHERE id = ?', await hashPassword(next), ctx.user.id);
    return { ok: true };
  });

  router.add('GET', '/api/account/export', async (ctx) => {
    const id = ctx.user.id;
    const all = (sql) => q.all(sql, id);
    ctx.download = 'nutrisense-export.json';
    return {
      exported_at: new Date().toISOString(),
      user: q.get('SELECT id, name, email, created_at FROM users WHERE id = ?', id),
      profile: publicProfile(getProfile(id)),
      pantry: all('SELECT * FROM pantry_items WHERE user_id = ?'),
      meals: all('SELECT * FROM meals WHERE user_id = ?'),
      water: all('SELECT * FROM water_logs WHERE user_id = ?'),
      weight: all('SELECT * FROM weight_logs WHERE user_id = ?'),
      planner: all('SELECT * FROM planner_meals WHERE user_id = ?'),
      grocery: all('SELECT * FROM grocery_items WHERE user_id = ?'),
      saved_recipes: all('SELECT * FROM saved_recipes WHERE user_id = ?'),
      chat: all('SELECT role, content, created_at FROM chat_messages WHERE user_id = ?')
    };
  });

  router.add('DELETE', '/api/account', async (ctx) => {
    rateLimit(`pw:${ctx.user.id}`, 8, 15 * 60 * 1000);
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    const row = q.get('SELECT password_hash FROM users WHERE id = ?', ctx.user.id);
    if (!(await verifyPassword(password, row.password_hash))) throw new HttpError(403, 'Your password is incorrect.', 'bad_credentials');
    q.run('DELETE FROM users WHERE id = ?', ctx.user.id);
    return { ok: true };
  });
}
