import { q } from './db.js';
import { daysBetween } from './dates.js';
import { findFood, normalize } from './foods.js';
import { NUTRIENT_SQL, limitsOf, readNutrients, watchOf } from './limits.js';

const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

export function parseProfile(row) {
  if (!row) return null;
  return {
    ...row,
    allergies: parse(row.allergies, []),
    conditions: parse(row.conditions, []),
    notifications: parse(row.notifications, {}),
    onboarded: Boolean(row.onboarded)
  };
}

export const getProfile = (userId) => parseProfile(q.get('SELECT * FROM profiles WHERE user_id = ?', userId));

export function targetsOf(p) {
  return {
    calories: p?.calories || 2000,
    protein: p?.protein || 80,
    carbs: p?.carbs || 250,
    fat: p?.fat || 65,
    fiber: p?.fiber || 30,
    water_glasses: p?.water_glasses || 8
  };
}

export function publicProfile(p) {
  if (!p) return null;
  const { user_id, updated_at, ...rest } = p;
  return rest;
}

/** Turns the JSON text columns of a scanned pantry row into objects. Plain rows come back with nulls. */
export function decodeLabel(r) {
  const json = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
  return { ...r, allergens: json(r.allergens), label_nutrition: json(r.label_nutrition) };
}

/** Pantry rows with days left and a freshness status relative to `today`. */
export function getPantry(userId, today) {
  return q.all('SELECT * FROM pantry_items WHERE user_id = ? ORDER BY name COLLATE NOCASE', userId).map((r) => {
    const days_left = r.expires_on ? daysBetween(today, r.expires_on) : null;
    const status = days_left === null ? 'ok' : days_left < 0 ? 'expired' : days_left <= 3 ? 'soon' : 'ok';
    return { ...decodeLabel(r), days_left, status };
  });
}

export function hasNutrition(item) {
  return item.kcal100 != null && item.protein100 != null;
}

/** Grams (or ml) in stock, converting pieces with a typical piece weight. */
export function stockGrams(item) {
  if (item.unit !== 'pcs') return item.quantity;
  const gpp = findFood(item.name)?.gpp || 100;
  return item.quantity * gpp;
}

export function dayTotals(userId, date) {
  const r = q.get(
    `SELECT COALESCE(SUM(kcal),0) AS kcal, COALESCE(SUM(protein),0) AS protein, COALESCE(SUM(carbs),0) AS carbs,
            COALESCE(SUM(fat),0) AS fat, COALESCE(SUM(fiber),0) AS fiber, COUNT(*) AS count, ${NUTRIENT_SQL}
     FROM meals WHERE user_id = ? AND date = ?`, userId, date
  );
  const nutrients = readNutrients(r, r.count);
  const round1 = (n) => Math.round(n * 10) / 10;
  return { kcal: Math.round(r.kcal), protein: round1(r.protein), carbs: round1(r.carbs), fat: round1(r.fat), fiber: round1(r.fiber), count: r.count,
    // Sodium, saturated fat and added sugar: null = no meal has data (never 0). See limits.js for what partial means.
    sodium_mg: nutrients.sodium_mg.value, sat_fat: nutrients.sat_fat.value, added_sugar: nutrients.added_sugar.value, nutrients };
}

/** The watch list (sodium, saturated fat, added sugar) for a day's totals, against this person's limits. */
export const watchFor = (profile, totals) => watchOf(totals.nutrients, limitsOf(profile, targetsOf(profile)));

export function remainingOf(targets, totals) {
  return {
    calories: Math.round(targets.calories - totals.kcal),
    protein: Math.round(targets.protein - totals.protein),
    carbs: Math.round(targets.carbs - totals.carbs),
    fat: Math.round(targets.fat - totals.fat),
    fiber: Math.round(targets.fiber - totals.fiber)
  };
}

/** Finds the pantry item an ingredient name refers to, if any. */
export function matchPantry(name, pantry) {
  const a = normalize(name);
  if (!a) return null;
  const fa = findFood(a);
  // Whole-word matching (so "egg" does not match "eggplant"); prefer fresh items over expired ones.
  const words = (t) => ` ${t} `;
  const hasPhrase = (t, p) => words(t).includes(words(p)) || words(t).includes(` ${p}s `) || words(t).includes(` ${p}es `);
  let expired = null;
  for (const it of pantry) {
    const b = normalize(it.name);
    if (!b) continue;
    if (a === b || hasPhrase(a, b) || hasPhrase(b, a)) {
      if (it.status !== 'expired') return it;
      expired = expired || it;
    }
  }
  if (expired) return expired;
  if (fa) {
    for (const it of pantry) {
      const fb = findFood(it.name);
      if (fb && fb.name === fa.name) return it;
    }
  }
  return null;
}
