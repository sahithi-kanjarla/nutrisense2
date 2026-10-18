import { q, tx } from '../lib/db.js';
import { HttpError, bad, num, oneOf, rateLimit, str } from '../lib/http.js';
import { dateOr } from '../lib/dates.js';
import { dayTotals, getPantry, getProfile, matchPantry } from '../lib/data.js';
import { analyzeMeal, analyzePhoto } from '../lib/ai/features.js';
import { findFood, estimateGrams } from '../lib/foods.js';

export const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];
const MIME = ['image/jpeg', 'image/png', 'image/webp'];

/** How much of a matching pantry item a logged food probably used, in the item's own unit. */
function deductionFor(entry, pantry) {
  const item = matchPantry(entry.name, pantry);
  if (!item || item.quantity <= 0) return null;
  const eaten = findFood(entry.name, 'meal');
  const stocked = findFood(item.name);
  let grams = estimateGrams(entry.quantity || '', eaten || stocked).grams;
  // A cooked portion weighs roughly 2.5x the raw ingredient it came from.
  if (stocked?.twin && eaten && eaten.name === stocked.twin) grams = Math.round(grams * 0.4);
  const gpp = stocked?.gpp || 100;
  let amount = item.unit === 'pcs' ? Math.max(1, Math.round(grams / gpp)) : Math.round(grams / 5) * 5;
  if (amount <= 0) return null;
  amount = Math.min(amount, item.quantity);
  return { item_id: item.id, name: item.name, amount, unit: item.unit };
}

export function register(router) {
  router.add('GET', '/api/meals', async (ctx) => {
    const date = dateOr(ctx.query.date);
    const meals = q.all('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY id', ctx.user.id, date);
    return { date, meals, totals: dayTotals(ctx.user.id, date) };
  });

  router.add('POST', '/api/meals', async (ctx) => {
    const b = ctx.body;
    const date = dateOr(b.date);
    const meal = {
      name: str(b.name, { min: 1, max: 120, field: 'Meal name' }),
      meal_type: oneOf(b.meal_type, MEAL_TYPES, 'Meal type'),
      serving: str(b.serving, { max: 80 }),
      kcal: num(b.kcal, { min: 0, max: 10000, field: 'Calories' }),
      protein: num(b.protein ?? 0, { min: 0, max: 600, field: 'Protein' }),
      carbs: num(b.carbs ?? 0, { min: 0, max: 1500, field: 'Carbs' }),
      fat: num(b.fat ?? 0, { min: 0, max: 400, field: 'Fats' }),
      fiber: num(b.fiber ?? 0, { min: 0, max: 150, field: 'Fiber' }),
      source: ['manual', 'ai', 'local', 'photo', 'recipe'].includes(b.source) ? b.source : 'manual'
    };
    const deductions = Array.isArray(b.deductions) ? b.deductions.slice(0, 30) : [];
    let id;
    const used = [];
    tx(() => {
      const r = q.run(
        'INSERT INTO meals (user_id, date, meal_type, name, serving, kcal, protein, carbs, fat, fiber, source) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        ctx.user.id, date, meal.meal_type, meal.name, meal.serving, meal.kcal, meal.protein, meal.carbs, meal.fat, meal.fiber, meal.source
      );
      id = Number(r.lastInsertRowid);
      for (const d of deductions) {
        const item = q.get('SELECT * FROM pantry_items WHERE id = ? AND user_id = ?', Number(d?.item_id), ctx.user.id);
        if (!item) continue;
        const amount = num(d.amount, { min: 0, max: 1_000_000, field: 'Deduction' });
        q.run("UPDATE pantry_items SET quantity = MAX(0, quantity - ?), updated_at = datetime('now') WHERE id = ?", amount, item.id);
        used.push({ item_id: item.id, name: item.name, amount, unit: item.unit });
      }
    });
    ctx.status = 201;
    return { meal: q.get('SELECT * FROM meals WHERE id = ?', id), totals: dayTotals(ctx.user.id, date), deducted: used };
  });

  router.add('DELETE', '/api/meals/:id', async (ctx) => {
    const row = q.get('SELECT * FROM meals WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
    if (!row) throw new HttpError(404, 'Meal not found.');
    q.run('DELETE FROM meals WHERE id = ?', row.id);
    return { ok: true, totals: dayTotals(ctx.user.id, row.date) };
  });

  router.add('POST', '/api/meals/analyze', async (ctx) => {
    rateLimit(`ai:${ctx.user.id}`, 30, 60_000);
    const text = str(ctx.body.text, { min: 2, max: 400, field: 'Meal description' });
    const today = dateOr(ctx.body.today);
    const profile = getProfile(ctx.user.id);
    const result = await analyzeMeal(text, profile);
    const pantry = getPantry(ctx.user.id, today).filter((i) => i.status !== 'expired');
    const seen = new Set();
    const pantry_matches = [];
    for (const it of result.items) {
      const d = deductionFor(it, pantry);
      if (d && !seen.has(d.item_id)) { seen.add(d.item_id); pantry_matches.push(d); }
    }
    return { ...result, pantry_matches };
  }, { maxBody: 20_000 });

  router.add('POST', '/api/meals/analyze-photo', async (ctx) => {
    rateLimit(`ai:${ctx.user.id}`, 30, 60_000);
    const mime = String(ctx.body.mime || '');
    const data = String(ctx.body.image || '').replace(/^data:[^,]+,/, '');
    if (!MIME.includes(mime)) throw bad('Please use a JPEG, PNG or WebP photo.');
    if (!data || data.length > 5_000_000) throw bad('That photo is too large. Please try a smaller one.');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw bad('That photo could not be read.');
    const result = await analyzePhoto({ mime, data }, getProfile(ctx.user.id));
    return { ...result, pantry_matches: [] };
  }, { maxBody: 7_000_000 });
}
