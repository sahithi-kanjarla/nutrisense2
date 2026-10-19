import { q } from '../lib/db.js';
import { HttpError, bad, num, oneOf, str } from '../lib/http.js';
import { dateOr, daysBetween, isDate } from '../lib/dates.js';
import { decodeLabel, getPantry } from '../lib/data.js';
import { aiStatus } from '../lib/ai/index.js';
import { estimatePantryNutrition } from '../lib/ai/features.js';
import { defaultUnitFor, findFood } from '../lib/foods.js';

export const LOCATIONS = ['fridge', 'dry', 'freezer', 'other'];
const NUTRITION_KEYS = ['kcal100', 'protein100', 'carbs100', 'fat100', 'fiber100'];
const NOT_PROTEIN_SOURCE = /\b(oil|sugar|jaggery|honey|ghee|butter|flour|atta|maida|masala|spice|powder)\b/i;

export function normalizeQty(quantity, unit) {
  if (unit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (unit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  return { quantity, unit };
}

export function withStatus(row, today) {
  const days_left = row.expires_on ? daysBetween(today, row.expires_on) : null;
  return { ...decodeLabel(row), days_left, status: days_left === null ? 'ok' : days_left < 0 ? 'expired' : days_left <= 3 ? 'soon' : 'ok' };
}

const isLow = (it) => (it.unit === 'pcs' ? it.quantity <= 2 : it.quantity <= 100);

export function ownedItem(userId, id) {
  const row = q.get('SELECT * FROM pantry_items WHERE id = ? AND user_id = ?', Number(id), userId);
  if (!row) throw new HttpError(404, 'Pantry item not found.');
  return row;
}

export function register(router) {
  router.add('GET', '/api/pantry', async (ctx) => {
    const today = dateOr(ctx.query.today);
    const items = getPantry(ctx.user.id, today);
    const best = items
      .filter((i) => i.protein100 != null && i.status !== 'expired' && !NOT_PROTEIN_SOURCE.test(i.name))
      .sort((a, b) => b.protein100 - a.protein100).slice(0, 3).map((i) => i.name);
    return {
      items,
      scan: { available: aiStatus().gemini },
      stats: {
        total: items.length,
        expiring: items.filter((i) => i.status === 'soon').length,
        expired: items.filter((i) => i.status === 'expired').length,
        low: items.filter(isLow).length,
        best_protein: best
      }
    };
  });

  router.add('POST', '/api/pantry', async (ctx) => {
    const b = ctx.body;
    const today = dateOr(b.today);
    const name = str(b.name, { min: 1, max: 80, field: 'Name' });
    const food = findFood(name);
    const rawUnit = b.unit === undefined ? defaultUnitFor(food) : oneOf(b.unit, ['g', 'kg', 'ml', 'l', 'pcs'], 'Unit');
    const { quantity, unit } = normalizeQty(num(b.quantity, { min: 0, max: 1_000_000, field: 'Quantity' }), rawUnit);
    const location = b.location === undefined ? 'dry' : oneOf(b.location, LOCATIONS, 'Location');
    if (b.expires_on != null && b.expires_on !== '' && !isDate(b.expires_on)) throw bad('Expiry date must look like 2026-10-31.');
    const expires_on = b.expires_on || null;

    // Nutrition per 100 g: use what was supplied, else the food table, else a quick AI estimate.
    let nutrition = {};
    if (NUTRITION_KEYS.every((k) => b[k] !== undefined && b[k] !== null && b[k] !== '')) {
      NUTRITION_KEYS.forEach((k) => { nutrition[k] = num(b[k], { min: 0, max: 1000, field: k }); });
    } else {
      const est = await estimatePantryNutrition(name);
      if (est) NUTRITION_KEYS.forEach((k) => { nutrition[k] = est[k]; });
    }

    const existing = q.get('SELECT * FROM pantry_items WHERE user_id = ? AND lower(name) = lower(?) AND unit = ?', ctx.user.id, name, unit);
    if (existing) {
      q.run("UPDATE pantry_items SET quantity = quantity + ?, expires_on = CASE WHEN ? IS NULL THEN expires_on WHEN expires_on IS NULL THEN ? WHEN ? < expires_on THEN ? ELSE expires_on END, location = COALESCE(?, location), updated_at = datetime('now') WHERE id = ?",
        quantity, expires_on, expires_on, expires_on, expires_on, b.location === undefined ? null : location, existing.id);
      ctx.status = 200;
      return { item: withStatus(ownedItem(ctx.user.id, existing.id), today), merged: true };
    }
    const r = q.run(
      'INSERT INTO pantry_items (user_id, name, quantity, unit, location, expires_on, kcal100, protein100, carbs100, fat100, fiber100) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      ctx.user.id, name, quantity, unit, location, expires_on, nutrition.kcal100, nutrition.protein100, nutrition.carbs100, nutrition.fat100, nutrition.fiber100
    );
    ctx.status = 201;
    return { item: withStatus(ownedItem(ctx.user.id, r.lastInsertRowid), today), merged: false };
  });

  router.add('PATCH', '/api/pantry/:id', async (ctx) => {
    const row = ownedItem(ctx.user.id, ctx.params.id);
    const b = ctx.body;
    const today = dateOr(b.today);
    const sets = [];
    const vals = [];
    if (b.name !== undefined) { sets.push('name = ?'); vals.push(str(b.name, { min: 1, max: 80, field: 'Name' })); }
    if (b.quantity !== undefined) {
      const { quantity, unit } = normalizeQty(num(b.quantity, { min: 0, max: 1_000_000, field: 'Quantity' }), b.unit === undefined ? row.unit : oneOf(b.unit, ['g', 'kg', 'ml', 'l', 'pcs'], 'Unit'));
      sets.push('quantity = ?', 'unit = ?'); vals.push(quantity, unit);
    }
    if (b.location !== undefined) { sets.push('location = ?'); vals.push(oneOf(b.location, LOCATIONS, 'Location')); }
    if (b.expires_on !== undefined) {
      if (b.expires_on && !isDate(b.expires_on)) throw bad('Expiry date must look like 2026-10-31.');
      // A date typed by hand replaces the printed one, so the stored printed text no longer describes it.
      sets.push('expires_on = ?', 'expiry_text = NULL'); vals.push(b.expires_on || null);
    }
    if (sets.length) q.run(`UPDATE pantry_items SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`, ...vals, row.id);
    return { item: withStatus(ownedItem(ctx.user.id, row.id), today) };
  });

  router.add('DELETE', '/api/pantry/:id', async (ctx) => {
    const row = ownedItem(ctx.user.id, ctx.params.id);
    q.run('DELETE FROM pantry_items WHERE id = ?', row.id);
    return { ok: true };
  });
}
