import { q, tx } from '../lib/db.js';
import { HttpError, bad, num, oneOf, rateLimit, str } from '../lib/http.js';
import { dateOr } from '../lib/dates.js';
import { dayTotals, getPantry, getProfile, matchPantry } from '../lib/data.js';
import { analyzeMeal, analyzePhoto, estimateItems } from '../lib/ai/features.js';
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

const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Validates an optional photo from the request body. Returns { mime, data } or null. */
function readImage(body) {
  if (!body.image) return null;
  const mime = String(body.mime || '');
  const data = String(body.image).replace(/^data:[^,]+,/, '');
  if (!MIME.includes(mime)) throw bad('Please use a JPEG, PNG or WebP photo.');
  if (!data || data.length > 5_000_000) throw bad('That photo is too large. Please try a smaller one.');
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw bad('That photo could not be read.');
  return { mime, data };
}

/** Foods the user typed or edited: name, quantity and cooking note only. */
function readFoods(list, field = 'Foods') {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 12) throw bad(`${field} must be a list of at most 12 foods.`);
  return list.map((f) => ({ name: clip(f?.name, 80), quantity: clip(f?.quantity, 60), cooking: clip(f?.cooking, 120) })).filter((f) => f.name);
}

/** Answers to the AI's follow-up questions (at most 3). */
function readAnswers(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 3).map((a) => ({ question: clip(a?.question, 140), answer: clip(a?.answer, 120) })).filter((a) => a.answer);
}

/** Pantry stock the logged foods probably used up. `food` says which row each suggestion belongs to. */
function pantryMatchesFor(items, userId, today) {
  const pantry = getPantry(userId, today).filter((i) => i.status !== 'expired');
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const d = deductionFor(it, pantry);
    if (d && !seen.has(d.item_id)) { seen.add(d.item_id); out.push({ ...d, food: it.name }); }
  }
  return out;
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

  // Analyses text, a photo, or both. Nothing is saved: the user reviews and edits, then logs with POST /api/meals.
  router.add('POST', '/api/meals/analyze', async (ctx) => {
    rateLimit(`ai:${ctx.user.id}`, 30, 60_000);
    const text = str(ctx.body.text, { max: 400, field: 'Meal description' });
    const image = readImage(ctx.body);
    if (text.length < 2 && !image) throw bad('Describe your meal or add a photo.');
    const today = dateOr(ctx.body.today);
    const result = await analyzeMeal(text, getProfile(ctx.user.id), {
      image, answers: readAnswers(ctx.body.answers), confirmed: readFoods(ctx.body.confirmed, 'Confirmed foods')
    });
    return { ...result, pantry_matches: pantryMatchesFor(result.items, ctx.user.id, today) };
  }, { maxBody: 7_000_000 });

  // Recalculates only the foods the user edited or added (the review screen's Recalculate button).
  router.add('POST', '/api/meals/estimate-items', async (ctx) => {
    rateLimit(`ai:${ctx.user.id}`, 30, 60_000);
    const foods = readFoods(ctx.body.items, 'Items');
    if (!foods.length) throw bad('Add at least one food to recalculate.');
    const today = dateOr(ctx.body.today);
    const result = await estimateItems(foods, getProfile(ctx.user.id));
    return { ...result, pantry_matches: pantryMatchesFor(result.items.filter((i) => !i.unknown), ctx.user.id, today) };
  }, { maxBody: 30_000 });

  // The original photo-only route, kept so older clients keep working.
  router.add('POST', '/api/meals/analyze-photo', async (ctx) => {
    rateLimit(`ai:${ctx.user.id}`, 30, 60_000);
    const image = readImage(ctx.body);
    if (!image) throw bad('Please use a JPEG, PNG or WebP photo.');
    const result = await analyzePhoto(image, getProfile(ctx.user.id));
    return { ...result, pantry_matches: [] };
  }, { maxBody: 7_000_000 });
}
