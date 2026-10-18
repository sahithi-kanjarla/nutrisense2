import { q, tx } from '../lib/db.js';
import { HttpError, bad, num, oneOf, str } from '../lib/http.js';
import { addDays, dateOr, dateRange, isDate, weekStart } from '../lib/dates.js';
import { getPantry, getProfile, matchPantry } from '../lib/data.js';
import { cleanRecipe } from '../lib/ai/features.js';
import { normalize } from '../lib/foods.js';
import { prefsFromProfile } from '../lib/safety.js';

const TYPE_ORDER = { breakfast: 0, lunch: 1, snack: 2, dinner: 3 };
const PRODUCE = /spinach|palak|tomato|onion|potato|carrot|capsicum|cauliflower|cabbage|okra|bhindi|brinjal|coriander|mushroom|peas|cucumber|banana|apple|orange|mango|papaya|grapes|lemon|lime|garlic|ginger|chilli|chili|mint|salad|fruit|vegetable|beans|gourd|beetroot|radish/i;
const PROTEIN_DAIRY = /paneer|milk|curd|yogurt|yoghurt|cheese|butter|ghee|egg|tofu|chicken|fish|prawn|soya|whey|dahi|cream/i;

const categoryFor = (name) => (PRODUCE.test(name) ? 'produce' : PROTEIN_DAIRY.test(name) ? 'dairy' : 'staples');
const parseIngredients = (s) => { try { return JSON.parse(s) || []; } catch { return []; } };

function ownedGrocery(userId, id) {
  const row = q.get('SELECT * FROM grocery_items WHERE id = ? AND user_id = ?', Number(id), userId);
  if (!row) throw new HttpError(404, 'Grocery item not found.');
  return row;
}

export function register(router) {
  /* ------------------------------ Planner ------------------------------ */
  router.add('GET', '/api/planner', async (ctx) => {
    const today = dateOr(ctx.query.today);
    const start = weekStart(dateOr(ctx.query.start, today));
    const end = addDays(start, 6);
    const pantry = getPantry(ctx.user.id, today);
    const rows = q.all('SELECT * FROM planner_meals WHERE user_id = ? AND date >= ? AND date <= ?', ctx.user.id, start, end);
    let covered = 0;
    let total = 0;
    const days = dateRange(start, end).map((date) => {
      const meals = rows.filter((r) => r.date === date)
        .sort((a, b) => (TYPE_ORDER[a.meal_type] ?? 9) - (TYPE_ORDER[b.meal_type] ?? 9))
        .map((r) => {
          const ingredients = parseIngredients(r.ingredients);
          const missing = ingredients.filter((i) => { const m = matchPantry(i.name, pantry); return !m || m.status === 'expired'; }).map((i) => i.name);
          const status = !ingredients.length ? 'unknown' : missing.length ? 'needs' : 'in_pantry';
          if (status !== 'unknown') { total += 1; if (status === 'in_pantry') covered += 1; }
          return { id: r.id, meal_type: r.meal_type, dish: r.dish, kcal: r.kcal, protein: r.protein, ingredients, missing, status };
        });
      return {
        date, meals,
        totals: { kcal: Math.round(meals.reduce((s, m) => s + (m.kcal || 0), 0)), protein: Math.round(meals.reduce((s, m) => s + (m.protein || 0), 0)) },
        needs: meals.filter((m) => m.status === 'needs').length
      };
    });
    return { start, end, days, coverage: { covered, total }, planned: rows.length };
  });

  router.add('PUT', '/api/planner/meal', async (ctx) => {
    const b = ctx.body;
    if (!isDate(b.date)) throw bad('Please choose a date.');
    const type = oneOf(b.meal_type, Object.keys(TYPE_ORDER), 'Meal type');
    const dish = str(b.dish, { min: 1, max: 80, field: 'Dish' });
    const kcal = b.kcal === undefined || b.kcal === '' ? null : num(b.kcal, { min: 0, max: 3000, field: 'Calories' });
    const protein = b.protein === undefined || b.protein === '' ? null : num(b.protein, { min: 0, max: 300, field: 'Protein' });
    const ingredients = Array.isArray(b.ingredients)
      ? b.ingredients.slice(0, 15).map((i) => ({ name: str(i?.name ?? i, { max: 60 }), qty: str(i?.qty ?? '', { max: 30 }) })).filter((i) => i.name)
      : [];
    q.run(
      `INSERT INTO planner_meals (user_id, date, meal_type, dish, kcal, protein, ingredients) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id, date, meal_type) DO UPDATE SET dish = excluded.dish, kcal = excluded.kcal, protein = excluded.protein, ingredients = excluded.ingredients`,
      ctx.user.id, b.date, type, dish, kcal, protein, JSON.stringify(ingredients)
    );
    return { ok: true };
  });

  router.add('DELETE', '/api/planner/meal/:id', async (ctx) => {
    const r = q.run('DELETE FROM planner_meals WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
    if (!r.changes) throw new HttpError(404, 'Planned meal not found.');
    return { ok: true };
  });

  /* ------------------------------ Grocery list ------------------------------ */
  router.add('GET', '/api/grocery', async (ctx) => ({
    items: q.all('SELECT * FROM grocery_items WHERE user_id = ? ORDER BY checked, category, name COLLATE NOCASE', ctx.user.id).map((r) => ({ ...r, checked: Boolean(r.checked) }))
  }));

  router.add('POST', '/api/grocery', async (ctx) => {
    const list = Array.isArray(ctx.body.items) ? ctx.body.items.slice(0, 40) : [{ name: ctx.body.name, qty: ctx.body.qty, category: ctx.body.category }];
    const existing = new Set(q.all('SELECT name FROM grocery_items WHERE user_id = ? AND checked = 0', ctx.user.id).map((r) => normalize(r.name)));
    let added = 0;
    tx(() => {
      for (const it of list) {
        const name = str(it?.name, { min: 1, max: 80, field: 'Item name' });
        if (existing.has(normalize(name))) continue;
        existing.add(normalize(name));
        const cat = ['produce', 'dairy', 'staples'].includes(it.category) ? it.category : categoryFor(name);
        q.run('INSERT INTO grocery_items (user_id, name, qty, category) VALUES (?,?,?,?)', ctx.user.id, name, str(it.qty, { max: 40 }) || null, cat);
        added += 1;
      }
    });
    ctx.status = 201;
    return { added };
  });

  router.add('PATCH', '/api/grocery/:id', async (ctx) => {
    const row = ownedGrocery(ctx.user.id, ctx.params.id);
    const b = ctx.body;
    if (b.checked !== undefined) q.run('UPDATE grocery_items SET checked = ? WHERE id = ?', b.checked ? 1 : 0, row.id);
    if (b.name !== undefined) q.run('UPDATE grocery_items SET name = ? WHERE id = ?', str(b.name, { min: 1, max: 80, field: 'Item name' }), row.id);
    if (b.qty !== undefined) q.run('UPDATE grocery_items SET qty = ? WHERE id = ?', str(b.qty, { max: 40 }) || null, row.id);
    return { ok: true };
  });

  router.add('DELETE', '/api/grocery/:id', async (ctx) => {
    ownedGrocery(ctx.user.id, ctx.params.id);
    q.run('DELETE FROM grocery_items WHERE id = ?', Number(ctx.params.id));
    return { ok: true };
  });

  router.add('POST', '/api/grocery/clear-checked', async (ctx) => {
    const r = q.run('DELETE FROM grocery_items WHERE user_id = ? AND checked = 1', ctx.user.id);
    return { removed: r.changes };
  });

  router.add('POST', '/api/grocery/from-plan', async (ctx) => {
    const today = dateOr(ctx.body.today);
    const start = weekStart(dateOr(ctx.body.start, today));
    const pantry = getPantry(ctx.user.id, today);
    const rows = q.all('SELECT * FROM planner_meals WHERE user_id = ? AND date >= ? AND date <= ? AND date >= ?', ctx.user.id, start, addDays(start, 6), today);
    const existing = new Set(q.all('SELECT name FROM grocery_items WHERE user_id = ? AND checked = 0', ctx.user.id).map((r) => normalize(r.name)));
    const missing = new Map();
    for (const r of rows) {
      for (const ing of parseIngredients(r.ingredients)) {
        const m = matchPantry(ing.name, pantry);
        const key = normalize(ing.name);
        if ((m && m.status !== 'expired') || !key || existing.has(key) || missing.has(key)) continue;
        missing.set(key, { name: ing.name, qty: ing.qty || null });
      }
    }
    tx(() => {
      for (const it of missing.values()) q.run('INSERT INTO grocery_items (user_id, name, qty, category) VALUES (?,?,?,?)', ctx.user.id, it.name, it.qty, categoryFor(it.name));
    });
    return { added: missing.size };
  });

  /* ------------------------------ Saved recipes ------------------------------ */
  router.add('GET', '/api/recipes/saved', async (ctx) => ({
    recipes: q.all('SELECT id, title, data, created_at FROM saved_recipes WHERE user_id = ? ORDER BY id DESC', ctx.user.id).map((r) => ({ id: r.id, ...JSON.parse(r.data) }))
  }));

  router.add('POST', '/api/recipes/saved', async (ctx) => {
    const profile = getProfile(ctx.user.id);
    const cleaned = cleanRecipe(ctx.body.recipe, getPantry(ctx.user.id, dateOr(ctx.body.today)), prefsFromProfile(profile));
    if (!cleaned) throw bad('That recipe could not be saved.');
    if (cleaned.violations.length) throw bad('That recipe conflicts with your allergies or diet, so it was not saved.');
    const dup = q.get('SELECT id FROM saved_recipes WHERE user_id = ? AND lower(title) = lower(?)', ctx.user.id, cleaned.recipe.title);
    if (dup) return { id: dup.id, already: true };
    const r = q.run('INSERT INTO saved_recipes (user_id, title, data) VALUES (?,?,?)', ctx.user.id, cleaned.recipe.title, JSON.stringify(cleaned.recipe));
    ctx.status = 201;
    return { id: Number(r.lastInsertRowid), already: false };
  });

  router.add('DELETE', '/api/recipes/saved/:id', async (ctx) => {
    q.run('DELETE FROM saved_recipes WHERE id = ? AND user_id = ?', Number(ctx.params.id), ctx.user.id);
    return { ok: true };
  });
}
