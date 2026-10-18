process.env.DATABASE_PATH = ':memory:';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConflicts, isAllowed } from '../lib/safety.js';
import { computePlan } from '../lib/plan.js';
import { findFood, estimateGrams, nutritionFor } from '../lib/foods.js';
import { analyzeLocal } from '../lib/ai/features.js';
import { addDays, weekStart, isDate } from '../lib/dates.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../lib/auth.js';

test('allergies are matched by whole words and known phrases', () => {
  const nut = { allergies: ['peanuts'], diet: 'non' };
  assert.equal(checkConflicts('Peanut butter toast', nut).length, 1);
  assert.equal(checkConflicts('Almond milk', nut).length, 0);
  assert.equal(checkConflicts('Eggplant curry', { allergies: ['eggs'], diet: 'non' }).length, 0);
  assert.equal(checkConflicts('Egg bhurji', { allergies: ['eggs'], diet: 'non' }).length, 1);
  assert.equal(checkConflicts('Paneer tikka', { allergies: ['dairy'] }).length, 1);
  assert.equal(checkConflicts('Coconut milk curry', { allergies: ['dairy'] }).length, 0);
  assert.equal(checkConflicts('Soy milk', { allergies: ['soy'] }).length, 1);
  assert.equal(checkConflicts('Prawn masala', { allergies: ['shellfish'] }).length, 1);
  assert.equal(checkConflicts('Mushroom soup', { allergies: ['mushroom'] }).length, 1, 'custom allergies are used as keywords');
});

test('diet rules', () => {
  assert.equal(isAllowed('Chicken curry', { diet: 'veg' }), false);
  assert.equal(isAllowed('Boiled eggs', { diet: 'veg' }), false);
  assert.equal(isAllowed('Boiled eggs', { diet: 'egg' }), true);
  assert.equal(isAllowed('Paneer', { diet: 'vegan' }), false);
  assert.equal(isAllowed('Almond milk smoothie', { diet: 'vegan' }), true);
  assert.equal(isAllowed('Aloo gobi', { diet: 'jain' }), false);
  assert.equal(isAllowed('Fish fry', { diet: 'pesc' }), true);
  assert.equal(isAllowed('Fish fry', { diet: 'veg' }), false);
  assert.equal(isAllowed('Mushroom fry', { diet: 'veg', dislikes: 'mushroom' }), false);
});

test('plan: Mifflin-St Jeor with a moderate deficit', () => {
  const p = computePlan({ goal: 'lose', sex: 'female', age: 30, height_cm: 168, weight_kg: 74, target_weight_kg: 68, activity: 'moderate' });
  assert.equal(p.bmr, 1479);
  assert.equal(p.tdee, 2292);
  assert.equal(p.calories, 1950);
  assert.ok(p.protein >= 85 && p.protein <= 92);
  assert.ok(p.weeks_to_goal > 10 && p.weeks_to_goal < 30);
});

test('plan: safety rules', () => {
  const base = { sex: 'female', age: 30, height_cm: 168, weight_kg: 74, activity: 'moderate', goal: 'lose' };
  const teen = computePlan({ ...base, age: 16 });
  assert.ok(Math.abs(teen.adjustment) <= 5, 'no deficit for under 18s (rounding only)');
  assert.ok(teen.notes.some((n) => n.includes('under 18')));
  const preg = computePlan({ ...base, conditions: ['preg'] });
  assert.ok(preg.adjustment >= 290 && preg.adjustment <= 310, 'no deficit and a pregnancy add-on');
  const low = computePlan({ ...base, weight_kg: 45, height_cm: 170 });
  assert.ok(Math.abs(low.adjustment) <= 5, 'no deficit for a low BMI');
  const small = computePlan({ sex: 'female', age: 70, height_cm: 150, weight_kg: 50, activity: 'sedentary', goal: 'maintain' });
  assert.ok(small.calories >= 1200);
  const cond = computePlan({ ...base, conditions: ['t2'] });
  assert.ok(cond.notes.some((n) => n.includes('doctor')));
});

test('food table matching', () => {
  assert.equal(findFood('Rice').name, 'rice');
  assert.equal(findFood('2 boiled eggs').name, 'egg');
  assert.equal(findFood('Toor Dal').name, 'toor dal');
  assert.equal(findFood('rice', 'meal').name, 'cooked rice', 'meal context uses the cooked twin');
  assert.equal(findFood('roasted chana').name, 'roasted chana');
  assert.equal(findFood('xyzzy'), null);
  assert.equal(estimateGrams('3 roti', findFood('roti')).grams, 120);
  assert.equal(estimateGrams('paneer 150g', findFood('paneer')).grams, 150);
  assert.equal(nutritionFor(findFood('paneer'), 100).protein, 18);
});

test('local meal analysis', () => {
  const r = analyzeLocal('2 roti, 1 bowl dal and 100 g paneer bhurji, unicorn steak');
  assert.equal(r.items.length, 3);
  assert.deepEqual(r.unknown, ['unicorn steak']);
});

test('dates', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(weekStart('2026-10-14'), '2026-10-12');
  assert.equal(isDate('2026-02-30'), false);
});

test('passwords and tokens', async () => {
  const h = await hashPassword('correct horse');
  assert.equal(await verifyPassword('correct horse', h), true);
  assert.equal(await verifyPassword('wrong', h), false);
  const t = signToken(42);
  assert.equal(verifyToken(t).sub, 42);
  assert.equal(verifyToken(t.slice(0, -2) + 'xx'), null);
  assert.equal(verifyToken(signToken(1, -10)), null, 'expired tokens are rejected');
});

test('safety: plurals, aliases and look-alike phrases', async () => {
  const { checkConflicts } = await import('../lib/safety.js');
  const hits = (name, prefs) => checkConflicts(name, prefs).length > 0;
  assert.ok(hits('2 rotis and dal', { allergies: ['gluten'] }));
  assert.ok(hits('goat milk', { allergies: ['dairy'] }));
  assert.ok(hits('mixed nuts', { allergies: ['tree'] }));
  assert.ok(hits('masala chai', { allergies: ['dairy'] }));
  assert.ok(hits('mushrooms', { allergies: ['mushroom'] }));
  assert.ok(hits('meatballs', { diet: 'veg' }));
  assert.ok(hits('pyaz paratha', { diet: 'jain' }));
  assert.ok(!hits('oat milk', { allergies: ['dairy'] }));
  assert.ok(!hits('eggplant curry', { allergies: ['eggs'] }));
});

test('food parsing: plant milks, fractions and comma numbers', async () => {
  const { findFood, estimateGrams } = await import('../lib/foods.js');
  const { num } = await import('../lib/http.js');
  assert.equal(findFood('1 glass almond milk', 'meal').name, 'almond milk');
  assert.equal(estimateGrams('1/2 cup rice', findFood('rice', 'meal')).grams, 90);
  assert.equal(estimateGrams('a cup of rice', findFood('rice', 'meal')).grams, 180);
  assert.equal(num('7,5'), 7.5);
  assert.equal(num('1,000'), 1000);
});

test('pantry matching uses whole words', async () => {
  const { matchPantry } = await import('../lib/data.js');
  const pantry = [{ name: 'Oil', status: 'ok' }, { name: 'Eggplant', status: 'ok' }];
  assert.equal(matchPantry('boiled potatoes', pantry), null);
  assert.equal(matchPantry('egg', pantry), null);
});

test('plan: underweight target and pregnancy', () => {
  const p = computePlan({ sex: 'female', age: 30, height_cm: 160, weight_kg: 50, activity: 'light', goal: 'lose', target_weight_kg: 45 });
  assert.ok(p.notes.some((n) => n.includes('underweight')));
});
