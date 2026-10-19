import { randomBytes } from 'node:crypto';
import { q, tx } from '../lib/db.js';
import { computePlan } from '../lib/plan.js';
import { addDays, dateOr } from '../lib/dates.js';
import { findFood, per100 } from '../lib/foods.js';
import { QUICKSTART, save } from './profile.js';
import { HttpError, bad, rateLimit, str } from '../lib/http.js';
import { hashPassword, signToken, verifyPassword } from '../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ip = (req) => req.socket.remoteAddress || 'unknown';
const DUMMY_HASH = 's1:AAAAAAAAAAAAAAAAAAAAAA:' + Buffer.alloc(64).toString('base64url');

function sessionFor(user) {
  const profile = q.get('SELECT onboarded FROM profiles WHERE user_id = ?', user.id);
  return { token: signToken(user.id), user: { id: user.id, name: user.name, email: user.email, onboarded: Boolean(profile?.onboarded) } };
}

const GUEST_DOMAIN = 'guest.nutrisense.demo';

/** Creates a throwaway guest account filled with sample data, so visitors can try every page. */
async function createDemoUser(today) {
  q.run("DELETE FROM users WHERE email LIKE ? AND created_at < datetime('now', '-3 days')", `%@${GUEST_DOMAIN}`);
  const suffix = randomBytes(5).toString('hex');
  const hash = await hashPassword(randomBytes(18).toString('base64url'));
  const profile = {
    goal: 'lose', sex: 'female', age: 28, height_cm: 165, weight_kg: 68, target_weight_kg: 62, activity: 'moderate',
    meals_per_day: 3, diet: 'veg', allergies: ['peanuts'], dislikes: 'bitter gourd', conditions: [], water_habit: 6, sleep_hours: 7
  };
  const plan = computePlan(profile);
  const stock = [['rice', null], ['toor', null], ['moong', null], ['oats', null], ['paneer', 2], ['curd', 3], ['milk', 4], ['spinach', 2], ['tomato', 6], ['onion', null], ['ghee', null], ['oil', null]];
  return tx(() => {
    const r = q.run('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)', 'Demo Guest', `guest-${suffix}@${GUEST_DOMAIN}`, hash);
    const id = Number(r.lastInsertRowid);
    q.run('INSERT INTO profiles (user_id) VALUES (?)', id);
    save(id, profile, plan, true);
    for (const [key, days] of stock) {
      const [name, qty, unit, location] = QUICKSTART[key];
      const n = findFood(name) ? per100(findFood(name)) : {};
      q.run('INSERT INTO pantry_items (user_id, name, quantity, unit, location, expires_on, kcal100, protein100, carbs100, fat100, fiber100) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        id, name, qty, unit, location, days == null ? null : addDays(today, days), n.kcal100, n.protein100, n.carbs100, n.fat100, n.fiber100);
    }
    const weights = [[-21, 69.4], [-14, 68.9], [-7, 68.4], [-3, 68.2], [0, 68]];
    for (const [d, kg] of weights) q.run('INSERT OR REPLACE INTO weight_logs (user_id, date, kg) VALUES (?,?,?)', id, addDays(today, d), kg);
    // [day offset, type, name, kcal, protein, carbs, fat, fiber, sodium mg, saturated fat g, added sugar g]
    // The protein shake has null (no data) on purpose, so the demo shows how missing data differs from zero.
    const meals = [
      [-1, 'breakfast', 'Oats with milk', 310, 12, 46, 8, 6, 70, 2.4, 0], [-1, 'lunch', 'Dal, rice and salad', 520, 20, 85, 9, 9, 760, 3.2, 0],
      [-1, 'dinner', 'Paneer bhurji with 2 rotis', 540, 26, 52, 24, 7, 950, 11, 0],
      [0, 'breakfast', 'Vegetable poha', 330, 8, 58, 8, 4, 520, 1.8, 2], [0, 'lunch', 'Rajma and rice', 560, 21, 92, 10, 12, 780, 2.4, 0],
      [0, 'snack', 'Packaged protein shake', 160, 24, 8, 3, 0, null, null, null]
    ];
    for (const [d, type, name, kcal, p, c, f, fib, na, sat, sug] of meals) {
      q.run('INSERT INTO meals (user_id, date, meal_type, name, kcal, protein, carbs, fat, fiber, sodium_mg, sat_fat, added_sugar, source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', id, addDays(today, d), type, name, kcal, p, c, f, fib, na, sat, sug, 'manual');
    }
    q.run('INSERT OR REPLACE INTO water_logs (user_id, date, glasses) VALUES (?,?,?)', id, today, 3);
    return { id, name: 'Demo Guest', email: `guest-${suffix}@${GUEST_DOMAIN}` };
  });
}

export function register(router) {
  router.add('POST', '/api/auth/demo', async (ctx) => {
    const user = await createDemoUser(dateOr(ctx.body?.today));
    ctx.status = 201;
    return sessionFor(user);
  }, { auth: false });

  router.add('POST', '/api/auth/signup', async (ctx) => {
    rateLimit(`signup:${ip(ctx.req)}`, 20, 60 * 60 * 1000);
    const name = str(ctx.body.name, { min: 1, max: 60, field: 'Name' });
    const email = str(ctx.body.email, { min: 1, max: 120, field: 'Email' }).toLowerCase();
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!EMAIL_RE.test(email)) throw bad('Please enter a valid email address.');
    if (password.length < 8) throw bad('Password must be at least 8 characters.');
    if (password.length > 128) throw bad('Password is too long.');
    if (q.get('SELECT id FROM users WHERE email = ?', email)) throw new HttpError(409, 'An account with this email already exists. Try logging in.', 'email_taken');

    const hash = await hashPassword(password);
    const user = tx(() => {
      const r = q.run('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', name, email, hash);
      q.run('INSERT INTO profiles (user_id) VALUES (?)', r.lastInsertRowid);
      return { id: Number(r.lastInsertRowid), name, email };
    });
    ctx.status = 201;
    return sessionFor(user);
  }, { auth: false });

  router.add('POST', '/api/auth/login', async (ctx) => {
    const email = str(ctx.body.email, { min: 1, max: 120, field: 'Email' }).toLowerCase();
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    rateLimit(`login:${ip(ctx.req)}:${email}`, 10, 15 * 60 * 1000);
    const row = q.get('SELECT id, name, email, password_hash FROM users WHERE email = ?', email);
    const ok = await verifyPassword(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'Incorrect email or password.', 'bad_credentials');
    return sessionFor(row);
  }, { auth: false });

  router.add('GET', '/api/auth/me', async (ctx) => sessionFor(ctx.user));
}
