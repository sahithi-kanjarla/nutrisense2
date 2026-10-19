import { q, tx } from '../lib/db.js';
import { bad, num, oneOf, str } from '../lib/http.js';
import { ACTIVITY, DIETS, GOALS, PREG_STAGES, SEXES, computePlan, minTargetWeight, validateBody, validateTargets } from '../lib/plan.js';
import { ALLERGENS, checkConflicts, unmappedAllergies } from '../lib/safety.js';
import { findFood, per100 } from '../lib/foods.js';
import { dateOr, todayStr } from '../lib/dates.js';
import { getProfile, publicProfile, targetsOf } from '../lib/data.js';

export const CONDITIONS = ['t2', 'bp', 'chol', 'thy', 'pcos', 'gut', 'preg', 'clin'];

export const QUICKSTART = {
  rice: ['Rice', 2000, 'g', 'dry'], atta: ['Atta', 2000, 'g', 'dry'], toor: ['Toor dal', 900, 'g', 'dry'],
  moong: ['Moong dal', 500, 'g', 'dry'], chana: ['Kabuli chana', 500, 'g', 'dry'], rajma: ['Rajma', 500, 'g', 'dry'],
  oats: ['Rolled oats', 750, 'g', 'dry'], eggs: ['Eggs', 6, 'pcs', 'fridge'], paneer: ['Paneer', 200, 'g', 'fridge'],
  curd: ['Curd', 500, 'g', 'fridge'], milk: ['Milk', 1000, 'ml', 'fridge'], tofu: ['Tofu', 200, 'g', 'fridge'],
  spinach: ['Spinach', 250, 'g', 'fridge'], tomato: ['Tomatoes', 500, 'g', 'fridge'], onion: ['Onions', 1000, 'g', 'dry'],
  almond: ['Almonds', 200, 'g', 'dry'], ghee: ['Ghee', 500, 'g', 'dry'], oil: ['Cooking oil', 1000, 'ml', 'dry']
};

/** Validates (a subset of) the questionnaire answers and merges them onto `base`. */
export function readAnswers(b, base = {}) {
  const m = { ...base };
  if (b.goal !== undefined) m.goal = oneOf(b.goal, GOALS, 'Goal');
  if (b.sex !== undefined) m.sex = oneOf(b.sex, SEXES, 'Sex');
  if (b.age !== undefined) m.age = Math.round(num(b.age, { min: 13, max: 100, field: 'Age' }));
  if (b.height_cm !== undefined) m.height_cm = num(b.height_cm, { min: 100, max: 250, field: 'Height' });
  if (b.weight_kg !== undefined) m.weight_kg = num(b.weight_kg, { min: 25, max: 300, field: 'Weight' });
  if (b.target_weight_kg !== undefined) m.target_weight_kg = num(b.target_weight_kg, { min: 25, max: 300, field: 'Target weight', optional: true });
  if (b.activity !== undefined) m.activity = oneOf(b.activity, Object.keys(ACTIVITY), 'Activity level');
  if (b.meals_per_day !== undefined) m.meals_per_day = Math.round(num(b.meals_per_day, { min: 2, max: 8, field: 'Meals per day' }));
  if (b.diet !== undefined) m.diet = oneOf(b.diet, DIETS, 'Eating pattern');
  if (b.allergies !== undefined) {
    if (!Array.isArray(b.allergies) || b.allergies.length > 15) throw bad('Allergies must be a short list.');
    m.allergies = [...new Set(b.allergies.map((a) => str(a, { min: 1, max: 40, field: 'Allergy' }).toLowerCase()))];
  }
  if (b.dislikes !== undefined) m.dislikes = str(b.dislikes, { max: 200, field: 'Dislikes' });
  if (b.conditions !== undefined) {
    if (!Array.isArray(b.conditions)) throw bad('Conditions must be a list.');
    m.conditions = [...new Set(b.conditions.filter((c) => CONDITIONS.includes(c)))];
  }
  if (b.water_habit !== undefined) m.water_habit = num(b.water_habit, { min: 0, max: 30, optional: true, field: 'Water' });
  if (b.sleep_hours !== undefined) m.sleep_hours = num(b.sleep_hours, { min: 3, max: 14, optional: true, field: 'Sleep' });
  if (b.preg_stage !== undefined) m.preg_stage = b.preg_stage === '' || b.preg_stage === null ? null : oneOf(b.preg_stage, PREG_STAGES, 'Pregnancy stage');
  // Limits a clinician gave the user. Blank means "not given", which is different from zero.
  if (b.rx_sodium_mg !== undefined) m.rx_sodium_mg = num(b.rx_sodium_mg, { min: 300, max: 5000, optional: true, field: 'Sodium limit' });
  if (b.rx_protein_g !== undefined) m.rx_protein_g = num(b.rx_protein_g, { min: 10, max: 300, optional: true, field: 'Protein limit' });
  if (b.rx_fluid_ml !== undefined) m.rx_fluid_ml = num(b.rx_fluid_ml, { min: 300, max: 5000, optional: true, field: 'Fluid limit' });
  // Each extra only means something with its condition, so it is cleared when the condition is removed.
  const conds = m.conditions || [];
  if (!conds.includes('preg')) m.preg_stage = null;
  if (!conds.includes('clin')) { m.rx_sodium_mg = null; m.rx_protein_g = null; m.rx_fluid_ml = null; }
  return m;
}

function requireComplete(m) {
  for (const [key, label] of [['goal', 'goal'], ['sex', 'sex'], ['age', 'age'], ['height_cm', 'height'], ['weight_kg', 'weight'], ['activity', 'activity level'], ['diet', 'eating pattern']]) {
    if (m[key] == null || m[key] === '') throw bad(`Please tell us your ${label}.`);
  }
  validateBody(m);
}

/** A weight-loss target below BMI 18.5 is never saved: it is raised to the lowest healthy weight. */
function targetToSave(m) {
  const target = m.target_weight_kg ?? m.weight_kg;
  const min = Math.ceil(minTargetWeight(m.height_cm) * 10) / 10;
  return target < min && target < m.weight_kg && m.goal !== 'gain' ? min : target;
}

export function save(userId, m, plan, onboarded) {
  q.run(
    `UPDATE profiles SET goal=?, sex=?, age=?, height_cm=?, weight_kg=?, target_weight_kg=?, activity=?, meals_per_day=?, diet=?,
       allergies=?, dislikes=?, conditions=?, water_habit=?, sleep_hours=?, preg_stage=?, rx_sodium_mg=?, rx_protein_g=?, rx_fluid_ml=?,
       calories=?, protein=?, carbs=?, fat=?, fiber=?, water_glasses=?, onboarded=?, updated_at=datetime('now')
     WHERE user_id=?`,
    m.goal, m.sex, m.age, m.height_cm, m.weight_kg, targetToSave(m), m.activity, m.meals_per_day ?? 3, m.diet,
    JSON.stringify(m.allergies || []), m.dislikes || '', JSON.stringify(m.conditions || []), m.water_habit, m.sleep_hours,
    m.preg_stage ?? null, m.rx_sodium_mg ?? null, m.rx_protein_g ?? null, m.rx_fluid_ml ?? null,
    plan.calories, plan.protein, plan.carbs, plan.fat, plan.fiber, plan.water_glasses, onboarded ? 1 : 0, userId
  );
}

// Show the targets that are actually saved, with the adjustment measured against the formula's maintenance (TDEE).
const alignPlan = (plan, saved) => ({
  ...plan, calories: saved.calories ?? plan.calories, protein: saved.protein ?? plan.protein, carbs: saved.carbs ?? plan.carbs,
  fat: saved.fat ?? plan.fat, fiber: saved.fiber ?? plan.fiber, water_glasses: saved.water_glasses ?? plan.water_glasses,
  adjustment: (saved.calories ?? plan.calories) - plan.tdee
});

const response = (userId, plan) => {
  const profile = getProfile(userId);
  const warnings = [];
  const loose = unmappedAllergies(profile.allergies);
  if (loose.length) {
    warnings.push(`We can only look for the exact ${loose.length > 1 ? 'words' : 'word'} "${loose.join('", "')}" in food names. If a food is made with it under another name, we may not catch it, so please check labels.`);
  }
  return { profile: publicProfile(profile), targets: targetsOf(profile), plan, warnings };
};

export function register(router) {
  router.add('GET', '/api/profile', async (ctx) => {
    const profile = getProfile(ctx.user.id);
    let plan = null;
    if (profile.age && profile.height_cm && profile.weight_kg) plan = alignPlan(computePlan(profile), profile);
    return { profile: publicProfile(profile), targets: targetsOf(profile), plan };
  });

  // Live plan preview for the questionnaire. Nothing is saved.
  router.add('POST', '/api/plan/preview', async (ctx) => {
    const m = readAnswers(ctx.body, {});
    requireComplete(m);
    return { plan: computePlan(m) };
  });

  router.add('POST', '/api/onboarding', async (ctx) => {
    const today = dateOr(ctx.body.today);
    const m = readAnswers(ctx.body, { meals_per_day: 3, allergies: [], dislikes: '', conditions: [] });
    requireComplete(m);
    const plan = computePlan(m);
    const quick = Array.isArray(ctx.body.pantry) ? ctx.body.pantry.filter((k) => QUICKSTART[k]).slice(0, 30) : [];
    let added = 0;
    tx(() => {
      save(ctx.user.id, m, plan, true);
      q.run('INSERT OR REPLACE INTO weight_logs (user_id, date, kg) VALUES (?,?,?)', ctx.user.id, today, m.weight_kg);
      const prefs = { allergies: m.allergies, diet: m.diet, dislikes: '' };
      for (const key of quick) {
        const [name, qty, unit, location] = QUICKSTART[key];
        if (checkConflicts(name, prefs).length) continue; // never stock something that conflicts with the profile
        if (q.get('SELECT id FROM pantry_items WHERE user_id = ? AND lower(name) = lower(?)', ctx.user.id, name)) continue;
        const n = findFood(name) ? per100(findFood(name)) : {};
        q.run(
          'INSERT INTO pantry_items (user_id, name, quantity, unit, location, kcal100, protein100, carbs100, fat100, fiber100) VALUES (?,?,?,?,?,?,?,?,?,?)',
          ctx.user.id, name, qty, unit, location, n.kcal100, n.protein100, n.carbs100, n.fat100, n.fiber100
        );
        added += 1;
      }
    });
    return { ...response(ctx.user.id, plan), pantry_added: added };
  });

  router.add('PUT', '/api/profile', async (ctx) => {
    const current = getProfile(ctx.user.id);
    const m = readAnswers(ctx.body, current);
    requireComplete(m);
    const plan = computePlan(m);
    // Keeping custom targets is not allowed when a new condition makes the old ones unsuitable.
    const has = (x, c) => (x.conditions || []).includes(c);
    const rxChanged = ['rx_protein_g', 'rx_fluid_ml'].some((k) => (m[k] ?? null) !== (current[k] ?? null));
    const newlyManaged = ['clin', 'preg'].some((c) => has(m, c) && !has(current, c)) || (has(m, 'clin') && rxChanged) || (has(m, 'preg') && m.preg_stage !== current.preg_stage);
    const keep = ctx.body.recalculate === false && !newlyManaged;
    const targets = keep ? { calories: current.calories, protein: current.protein, carbs: current.carbs, fat: current.fat, fiber: current.fiber, water_glasses: current.water_glasses } : plan;
    save(ctx.user.id, m, targets, current.onboarded);
    if (m.weight_kg !== current.weight_kg) {
      // Record weight edits in the weight log so Progress and Profile agree.
      q.run('INSERT INTO weight_logs (user_id, date, kg) VALUES (?,?,?) ON CONFLICT(user_id, date) DO UPDATE SET kg = excluded.kg', ctx.user.id, todayStr(), m.weight_kg);
    }
    return response(ctx.user.id, keep ? alignPlan(plan, targets) : plan);
  });

  router.add('PUT', '/api/targets', async (ctx) => {
    const b = ctx.body;
    const t = {
      calories: Math.round(num(b.calories, { min: 800, max: 6000, field: 'Calories' })),
      protein: Math.round(num(b.protein, { min: 20, max: 400, field: 'Protein' })),
      carbs: Math.round(num(b.carbs, { min: 0, max: 800, field: 'Carbs' })),
      fat: Math.round(num(b.fat, { min: 10, max: 300, field: 'Fats' })),
      fiber: Math.round(num(b.fiber, { min: 5, max: 100, field: 'Fiber' })),
      // No official upper limit exists. 16 glasses (4 litres) is a sanity limit, well above any usual need.
      water_glasses: Math.round(num(b.water_glasses, { min: 1, max: 16, field: 'Water' }))
    };
    validateTargets(t, getProfile(ctx.user.id));
    q.run("UPDATE profiles SET calories=?, protein=?, carbs=?, fat=?, fiber=?, water_glasses=?, updated_at=datetime('now') WHERE user_id=?",
      t.calories, t.protein, t.carbs, t.fat, t.fiber, t.water_glasses, ctx.user.id);
    return response(ctx.user.id, null);
  });

  router.add('POST', '/api/profile/reset', async (ctx) => {
    q.run(
      `UPDATE profiles SET goal=NULL, sex=NULL, age=NULL, height_cm=NULL, weight_kg=NULL, target_weight_kg=NULL, activity=NULL,
         diet='veg', allergies='[]', dislikes='', conditions='[]', water_habit=NULL, sleep_hours=NULL, preg_stage=NULL, rx_sodium_mg=NULL, rx_protein_g=NULL, rx_fluid_ml=NULL,
         calories=NULL, protein=NULL, carbs=NULL, fat=NULL, fiber=NULL, onboarded=0 WHERE user_id=?`, ctx.user.id);
    return response(ctx.user.id, null);
  });

  router.add('GET', '/api/meta', async () => ({ allergens: Object.keys(ALLERGENS), diets: DIETS, goals: GOALS, activity: Object.keys(ACTIVITY) }), { auth: false });
}
