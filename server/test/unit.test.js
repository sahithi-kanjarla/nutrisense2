process.env.DATABASE_PATH = ':memory:';
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkConflicts, isAllowed } from '../lib/safety.js';
import { computePlan } from '../lib/plan.js';
import { findFood, estimateGrams, nutritionFor, FOOD_TABLE, composeRecipe } from '../lib/foods.js';
import { parseCooking, applyCooking, checkEstimate } from '../lib/nutrition.js';
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

/* ------------------------------ Nutrition engine ------------------------------ */

const food = (name) => FOOD_TABLE.find((f) => f.name === name);

test('portions: spoons, katori, cups and pieces use food-specific weights', () => {
  assert.deepEqual(estimateGrams('2 tsp ghee', findFood('ghee')), { grams: 9, assumed: false, basis: '1 tsp = 4.5 g' });
  assert.equal(estimateGrams('1 tbsp sugar', findFood('sugar')).grams, 12.5);
  assert.equal(estimateGrams('1 tbsp oil', findFood('oil')).grams, 15, 'oil is measured in ml');
  assert.equal(estimateGrams('2 teaspoons ghee', findFood('ghee')).grams, 9);
  assert.equal(estimateGrams('a katori of dal', findFood('dal', 'meal')).grams, 150);
  assert.equal(estimateGrams('1 katori sabzi', findFood('sabzi', 'meal')).grams, 120);
  assert.equal(estimateGrams('3 idli', findFood('idli')).grams, 120);
  assert.equal(estimateGrams('1/2 cup rice', findFood('rice', 'meal')).grams, 90);
  assert.equal(estimateGrams('99999 kg rice', findFood('rice', 'meal')).grams, 5000000, 'absurd amounts are capped before the unit is applied');
});

test('oil is priced per 100 ml (0.92 g/ml) and a teaspoon of oil is about 41 kcal', () => {
  const oil = food('cooking oil');
  assert.equal(oil.kcal, 813);
  assert.equal(nutritionFor(oil, 5).kcal, 41);
  assert.equal(nutritionFor(food('ghee'), 4.5).kcal, 41);
});

test('recipes are calculated from ingredient quantities and match typical dishes', () => {
  const kcalPerServing = (name, g) => nutritionFor(food(name), g).kcal;
  assert.ok(Math.abs(kcalPerServing('roti', 40) - 115) <= 6, 'one roti is about 115 kcal');
  assert.ok(Math.abs(kcalPerServing('idli', 40) - 62) <= 6, 'one idli is about 60 kcal');
  assert.ok(kcalPerServing('dal cooked', 150) > 120 && kcalPerServing('dal cooked', 150) < 170, 'a katori of dal tadka');
  assert.equal(food('roti').source, 'calculated');
  assert.equal(food('rice').source, 'usda-checked');
  // The same maths done by hand: 30 g atta + 1.5 g ghee in a 40 g roti.
  const byHand = ((30 * 340) / 100 + 1.5 * 9.0) * (100 / 40);
  assert.ok(Math.abs(composeRecipe(food('roti').recipe).kcal - byHand) < 0.5);
  assert.equal(findFood('jeera rice').name, 'jeera rice');
  assert.ok(nutritionFor(food('jeera rice'), 100).kcal > nutritionFor(food('cooked rice'), 100).kcal, 'jeera rice has ghee');
});

test('cooking notes: explicit amounts, levels and flour blends are parsed', () => {
  const near = (a, b) => Math.abs(a - b) < 0.05;
  assert.ok(near(parseCooking('cooked with 1 tsp ghee').fat.grams, 4.5));
  assert.ok(near(parseCooking('2 tablespoons of mustard oil').fat.grams, 27.6));
  assert.ok(near(parseCooking('1 tsp extra ghee').fat.grams, 4.5));
  assert.equal(parseCooking('very little oil').fat.level, 'light');
  assert.equal(parseCooking('deep fried').fat.level, 'deep');
  assert.equal(parseCooking('steamed, no oil').fat.per100, 0);
  assert.equal(parseCooking('lots of ghee').fat.level, 'heavy');
  assert.equal(parseCooking('').fat, null);
  const blend = parseCooking('oats flour and wheat flour, very little oil').flours;
  assert.deepEqual(blend.map((f) => f.foodName).sort(), ['atta', 'rolled oats']);
  assert.ok(blend.every((f) => f.share === 0.5));
  const pct = (t) => parseCooking(t).flours.map((f) => [f.foodName, f.share]);
  assert.deepEqual(pct('70% wheat flour and 30% oats'), [['atta', 0.7], ['rolled oats', 0.3]]);
  assert.deepEqual(pct('wheat 70% oats 30%'), [['atta', 0.7], ['rolled oats', 0.3]]);
});

test('cooking notes change calories by exactly the oil, ghee or flour described', () => {
  const rice = food('cooked rice');
  const plain = applyCooking(rice, 150, '').nutrition.kcal;
  const withGhee = applyCooking(rice, 150, 'cooked with 2 tsp ghee');
  assert.equal(withGhee.nutrition.kcal - plain, 81, '2 tsp ghee = 9 g x 9 kcal');
  const roti = food('roti');
  const none = applyCooking(roti, 80, 'dry roasted, no oil').nutrition.kcal;
  const little = applyCooking(roti, 80, 'wheat flour, very little oil').nutrition.kcal;
  const fried = applyCooking(roti, 80, 'deep fried').nutrition.kcal;
  assert.ok(none < little && little < fried);
  const oats = applyCooking(roti, 80, 'oats flour and wheat flour, very little oil');
  assert.ok(oats.detail.includes('equal parts assumed'));
  const jowar = applyCooking(roti, 80, '100% jowar flour, no oil').nutrition.kcal;
  assert.ok(jowar !== none && Math.abs(jowar - none) < 15, 'a different flour changes the result, but only slightly');
  // Plain foods gain the fat; prepared dishes only change when an amount is given.
  assert.equal(applyCooking(food('potato'), 200, 'deep fried').nutrition.fat > 20, true);
  const dal = food('dal cooked');
  const chole = food('chole cooked');
  assert.equal(applyCooking(chole, 150, 'shallow fried').nutrition.kcal, nutritionFor(chole, 150).kcal, 'a prepared dish already includes its cooking oil');
  assert.ok(applyCooking(dal, 150, '1 tsp extra ghee').nutrition.kcal > nutritionFor(dal, 150).kcal + 35);
  assert.ok(applyCooking(rice, 150, 'made at home with love').detail.includes('only oil, ghee, butter and flours'));
});

test('AI estimates: impossible numbers are corrected and big gaps from the table are flagged', () => {
  const impossible = checkEstimate({ name: 'Mystery food', quantity: '50 g', kcal: 900, protein: 30, carbs: 40, fat: 40, fiber: 1, confidence: 'high' });
  assert.equal(impossible.kcal, 450, 'no food has more than 9 kcal per gram');
  assert.ok(impossible.protein + impossible.carbs + impossible.fat <= 50.5, 'nutrients cannot outweigh the food');
  assert.equal(impossible.confidence, 'low');
  const gap = checkEstimate({ name: 'Rice', quantity: '150 g', kcal: 900, protein: 3, carbs: 30, fat: 1, fiber: 0.5, confidence: 'high' });
  assert.equal(gap.reference_kcal, 195);
  assert.equal(gap.confidence, 'low');
  assert.ok(gap.check.includes('built-in food table'));
  const fine = checkEstimate({ name: 'Rice', quantity: '150 g', kcal: 200, protein: 4, carbs: 43, fat: 0.5, fiber: 0.6, confidence: 'high' });
  assert.equal(fine.check, undefined);
  assert.equal(fine.confidence, 'high');
  const custom = checkEstimate({ name: 'Rice', quantity: '150 g', cooking: 'fried in ghee', kcal: 320, protein: 4, carbs: 43, fat: 12, fiber: 0.6, confidence: 'high' });
  assert.equal(custom.check, undefined, 'custom-cooked items are not compared with the plain table value');
});

test('table integrity: every entry has sane values and every recipe ingredient exists', () => {
  for (const f of FOOD_TABLE) {
    assert.ok(f.kcal >= 0 && f.kcal <= 900, `${f.name} kcal`);
    assert.ok(f.protein + f.carbs + f.fat <= 105, `${f.name} macros exceed 100 g per 100 g`);
    const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9 + f.fiber * 2;
    assert.ok(Math.abs(f.kcal - fromMacros) <= Math.max(60, fromMacros * 0.3), `${f.name}: ${f.kcal} kcal vs ${Math.round(fromMacros)} from macros`);
    assert.ok(['usda-checked', 'reference', 'calculated'].includes(f.source), `${f.name} source`);
    if (f.recipe) for (const [name] of f.recipe.ingredients) assert.ok(food(name), `${f.name} needs ${name}`);
  }
  assert.equal(new Set(FOOD_TABLE.map((f) => f.name)).size, FOOD_TABLE.length, 'food names are unique');
});
