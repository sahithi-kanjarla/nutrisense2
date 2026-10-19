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
  const preg = computePlan({ ...base, conditions: ['preg'], preg_stage: 't2' });
  assert.ok(preg.adjustment >= 330 && preg.adjustment <= 350, 'no deficit and the second-trimester add-on');
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
  assert.ok(applyCooking(rice, 150, 'made at home with love').detail.includes('only oil, ghee, butter, salt and flours'));
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

test('flours named in the food name are used, not only those in the cooking note', () => {
  const roti = FOOD_TABLE.find((f) => f.name === 'roti');
  const r = applyCooking(roti, 80, 'very little oil', 'chapati, oats and wheat flour');
  assert.equal(r.nutrition.kcal, 233);
  assert.ok(r.detail.includes('flour blend'));
  const plain = applyCooking(roti, 80, 'very little oil', 'chapati');
  assert.ok(!plain.detail.includes('flour blend'));
});

/* ------------------------------ Sodium, saturated fat and added sugar ------------------------------ */

import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { migrate, versionOf, SCHEMA_VERSION } from '../lib/migrations.js';
import { limitsOf, watchOf, readNutrients, gapMask } from '../lib/limits.js';
import { checkNutrients } from '../lib/nutrition.js';
import { sumItems } from '../lib/ai/features.js';
import { NUTRIENTS } from '../lib/food-nutrients.js';

const OLD_PROFILES = 'CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, calories INTEGER)';
const OLD_MEALS = `CREATE TABLE meals (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL, meal_type TEXT NOT NULL,
  name TEXT NOT NULL, serving TEXT, kcal REAL NOT NULL DEFAULT 0, protein REAL NOT NULL DEFAULT 0, carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0, fiber REAL NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'manual', logged_at TEXT NOT NULL DEFAULT (datetime('now')))`;

test('migration: an old database gains the new columns, keeps every row, and old rows are "no data", not zero', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ns-mig-'));
  const file = path.join(dir, 'old.db');
  try {
    const old = new DatabaseSync(file);
    old.exec(OLD_MEALS);
    old.exec(OLD_PROFILES);
    old.exec("INSERT INTO profiles (user_id, calories) VALUES (1, 1800)");
    old.exec("INSERT INTO meals (user_id, date, meal_type, name, kcal) VALUES (1, '2026-10-01', 'lunch', 'Old dal', 300), (1, '2026-10-02', 'dinner', 'Old rice', 200)");
    assert.equal(versionOf(old), 0);

    const result = migrate(old, { file });
    assert.deepEqual(result.added, ['sodium_mg', 'added_sugar', 'sat_fat', 'nutrient_gaps', 'preg_stage', 'rx_sodium_mg', 'rx_protein_g', 'rx_fluid_ml']);
    assert.equal(versionOf(old), SCHEMA_VERSION);
    assert.ok(existsSync(`${file}.before-v1`), 'a backup of the old file is written before it changes');
    assert.ok(existsSync(`${file}.before-v2`));
    const prof = old.prepare('SELECT * FROM profiles').get();
    assert.equal(prof.calories, 1800, 'existing profiles keep their targets');
    assert.ok(prof.preg_stage === null && prof.rx_sodium_mg === null && prof.rx_protein_g === null && prof.rx_fluid_ml === null, 'new profile fields are "not set", never zero');

    const rows = old.prepare('SELECT * FROM meals ORDER BY id').all();
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((r) => r.kcal), [300, 200], 'existing data is untouched');
    assert.ok(rows.every((r) => r.sodium_mg === null && r.sat_fat === null && r.added_sugar === null && r.nutrient_gaps === 0), 'old meals are "no data", never zero');

    // Running it again changes nothing.
    assert.deepEqual(migrate(old, { file }).added, []);
    assert.equal(old.prepare('SELECT COUNT(*) AS n FROM meals').get().n, 2);

    // The backup is the untouched old schema.
    const backup = new DatabaseSync(`${file}.before-v1`);
    assert.ok(!backup.prepare('PRAGMA table_info(meals)').all().some((c) => c.name === 'sodium_mg'));
    assert.equal(versionOf(backup), 0);
    backup.close();
    old.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('migration: a database that already has the columns is only stamped, and a failure rolls back', () => {
  const fresh = new DatabaseSync(':memory:');
  fresh.exec(OLD_MEALS.replace('source TEXT', 'sodium_mg REAL, added_sugar REAL, sat_fat REAL, nutrient_gaps INTEGER NOT NULL DEFAULT 0, source TEXT'));
  fresh.exec('CREATE TABLE profiles (user_id INTEGER PRIMARY KEY, preg_stage TEXT, rx_sodium_mg REAL, rx_protein_g REAL, rx_fluid_ml REAL)');
  assert.deepEqual(migrate(fresh).added, []);
  assert.equal(versionOf(fresh), SCHEMA_VERSION);

  const broken = new DatabaseSync(':memory:'); // no meals table, so ALTER TABLE fails
  assert.throws(() => migrate(broken));
  assert.equal(versionOf(broken), 0, 'the version is not advanced when the upgrade fails');
});

test('food table: sodium, saturated fat and added sugar are plausible, and "no data" is null, never 0', () => {
  for (const f of FOOD_TABLE) {
    for (const key of ['sodium_mg', 'sat_fat', 'added_sugar']) assert.ok(f[key] === null || (typeof f[key] === 'number' && f[key] >= 0), `${f.name} ${key}`);
    if (f.sat_fat != null) assert.ok(f.sat_fat <= f.fat + 0.05, `${f.name}: saturated fat ${f.sat_fat} cannot exceed total fat ${f.fat}`);
    if (f.added_sugar != null) assert.ok(f.added_sugar <= f.carbs + 0.05, `${f.name}: added sugar ${f.added_sugar} cannot exceed carbs ${f.carbs}`);
    if (f.sodium_mg != null) assert.ok(f.sodium_mg <= 39300, `${f.name}: more sodium than pure salt`);
  }
  for (const name of Object.keys(NUTRIENTS)) assert.ok(FOOD_TABLE.some((f) => f.name === name), `${name} is in the table`);
  assert.equal(food('protein powder').sodium_mg, null, 'unknown stays unknown');
  assert.equal(food('sugar').added_sugar, 100);
  assert.equal(food('rice').added_sugar, 0, 'a real zero is kept as zero');
  assert.ok(food('coconut oil').sat_fat > 5 * food('cooking oil').sat_fat, 'coconut oil is far more saturated than other oils');
});

test('recipes: sodium, saturated fat and added sugar are calculated from ingredients, fat and salt', () => {
  // dal: 35 g toor dal + 15 g onion + 25 g tomato + 5 g ghee + 1.5 g salt, finished weight 180 g.
  const byHand = (35 * 17 / 100 + 15 * 4 / 100 + 25 * 5 / 100 + 5 * 0.02 + 1.5 * 393) * (100 / 180);
  const dal = composeRecipe(food('dal cooked').recipe);
  assert.ok(Math.abs(dal.sodium_mg - byHand) < 0.5, `${dal.sodium_mg} vs ${byHand}`);
  const satByHand = (35 * 0.4 / 100 + 15 * 0.04 / 100 + 25 * 0.03 / 100 + 5 * 0.62) * (100 / 180);
  assert.ok(Math.abs(dal.sat_fat - satByHand) < 0.15, `${dal.sat_fat} vs ${satByHand}`);
  assert.equal(food('dal cooked').sodium_mg, Math.round(dal.sodium_mg));
  assert.equal(food('jowar roti').sodium_mg, 5, 'bhakri is made without salt');

  // An ingredient with no data makes the recipe value unknown, not a smaller number.
  const spec = { ingredients: [['rice', 50], ['protein powder', 30]], fat: null, salt: 1, yield: 100 };
  const v = composeRecipe(spec);
  assert.equal(v.sodium_mg, null);
  assert.equal(v.sat_fat, null);
  assert.equal(v.added_sugar, null);
  assert.ok(v.kcal > 100, 'calories are still calculated');
  assert.equal(nutritionFor(food('protein powder'), 30).sodium_mg, null);
  assert.equal(nutritionFor(food('rice'), 100).sodium_mg, 1);
  assert.equal(nutritionFor(food('sugar'), 10).added_sugar, 10);
});

test('cooking notes: salt amounts, levels, and fractions are read correctly', () => {
  const dal = food('dal cooked');
  const usual = applyCooking(dal, 150, '').nutrition.sodium_mg;
  const perG = (150 / 180) * 393; // sodium from 1 g of the recipe's salt in a 150 g portion
  const diff = (note) => applyCooking(dal, 150, note).nutrition.sodium_mg - usual;
  assert.ok(Math.abs(diff('no salt') + 1.5 * perG) < 2, 'no salt removes the recipe salt');
  assert.ok(Math.abs(diff('low salt') + 0.75 * perG) < 2, 'low salt halves it');
  assert.ok(Math.abs(diff('extra salt') - 0.75 * perG) < 2, 'extra salt is one and a half times');
  assert.ok(Math.abs(diff('1 tsp extra salt') - 6 * 393) < 2, 'a stated extra amount is added on top');
  assert.equal(applyCooking(dal, 150, 'no salt').nutrition.kcal, applyCooking(dal, 150, '').nutrition.kcal, 'salt has no calories');
  // A stated amount on a plain food adds sodium exactly.
  assert.equal(applyCooking(food('cooked rice'), 100, 'cooked with 1 tsp salt').nutrition.sodium_mg, 1 + 2358);
  // Unknown base stays unknown even with salt added.
  assert.equal(applyCooking(food('protein powder'), 30, '1 tsp salt').nutrition.sodium_mg, null);
  // Fractions: "1/2 tsp ghee" is half a teaspoon, not 2 teaspoons.
  assert.ok(Math.abs(parseCooking('cooked with 1/2 tsp ghee').fat.grams - 2.25) < 0.01);
  assert.ok(Math.abs(parseCooking('1 1/2 tsp ghee').fat.grams - 6.75) < 0.01);
  // "extra salt" must not turn an exact ghee amount into extra ghee.
  const mixed = parseCooking('1 tsp ghee, extra salt');
  assert.equal(mixed.fat.extra, false);
  assert.equal(mixed.salt.mode, 'factor');
  assert.equal(parseCooking('1 tsp extra ghee').fat.extra, true);
  assert.equal(parseCooking('extra 1 tsp salt').salt.extra, true);
  assert.equal(parseCooking('made with love').salt, null);
  assert.equal(parseCooking('a pinch of salt').salt.grams, 0.4);
  assert.equal(parseCooking('salt free').salt.mode, 'none');
  assert.equal(parseCooking('banana tsp salt').salt, null, 'words ending in "a" are not read as the number one');
  // Coconut oil is priced as coconut oil.
  assert.equal(parseCooking('1 tsp coconut oil').fat.type, 'coconut');
  const coco = applyCooking(food('cooked rice'), 100, '1 tsp coconut oil').nutrition;
  const plain = applyCooking(food('cooked rice'), 100, '1 tsp oil').nutrition;
  assert.ok(coco.sat_fat > plain.sat_fat + 2);
});

test('AI nutrient values: missing is null, impossible values are fixed or dropped, real zeros stay', () => {
  const base = { name: 'Mystery curry', quantity: '200 g', kcal: 300, protein: 10, carbs: 20, fat: 15, fiber: 2, confidence: 'high' };
  const missing = checkEstimate({ ...base });
  assert.equal(missing.sodium_mg, null);
  assert.equal(missing.sat_fat, null);
  assert.equal(missing.added_sugar, null);
  const zero = checkEstimate({ ...base, sodium_mg: 0, sat_fat: 0, added_sugar: 0 });
  assert.deepEqual([zero.sodium_mg, zero.sat_fat, zero.added_sugar], [0, 0, 0], 'a real zero is kept');
  const junk = checkEstimate({ ...base, sodium_mg: 'lots', sat_fat: -3, added_sugar: NaN });
  assert.deepEqual([junk.sodium_mg, junk.sat_fat, junk.added_sugar], [null, null, null]);
  const tooMuch = checkEstimate({ ...base, sodium_mg: 400, sat_fat: 30, added_sugar: 60 });
  assert.equal(tooMuch.sat_fat, 15, 'saturated fat is capped at total fat');
  assert.equal(tooMuch.added_sugar, 20, 'added sugar is capped at total carbs');
  assert.equal(tooMuch.sodium_mg, 400);
  assert.ok(tooMuch.check.includes('saturated fat') && tooMuch.check.includes('added sugar'));
  const salty = checkEstimate({ ...base, quantity: '100 g', sodium_mg: 50000 });
  assert.equal(salty.sodium_mg, null, 'more sodium than pure salt is thrown away');
  assert.ok(salty.check.includes('sodium'));
  assert.equal(checkEstimate({ ...base, quantity: '100 g', sodium_mg: 39000 }).sodium_mg, 39000, 'close to pure salt is still possible');
  assert.equal(checkNutrients({ fat: 10, carbs: 10, sodium_mg: 1234.6, sat_fat: 2.26, added_sugar: 1.04 }, 500).length, 0);
});

test('totals: unknown foods are not counted as zero, and the gaps are reported', () => {
  const t = sumItems([
    { kcal: 100, protein: 1, carbs: 10, fat: 1, fiber: 1, sodium_mg: 300, sat_fat: 0.5, added_sugar: 0 },
    { kcal: 50, protein: 1, carbs: 5, fat: 1, fiber: 1, sodium_mg: null, sat_fat: 0, added_sugar: null }
  ]);
  assert.equal(t.sodium_mg, 300);
  assert.deepEqual(t.gaps, { sodium_mg: 1, sat_fat: 0, added_sugar: 1 });
  assert.equal(t.sat_fat, 0.5);
  assert.equal(t.added_sugar, 0, 'a known zero is a zero');
  const none = sumItems([{ kcal: 10, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium_mg: null, sat_fat: null, added_sugar: null }]);
  assert.equal(none.sodium_mg, null, 'no data at all is null, not 0');
  assert.equal(sumItems([]).sodium_mg, null);
});

test('limits depend on age and conditions, and the stricter limit wins', () => {
  const t = (calories) => ({ calories });
  const adult = limitsOf({ age: 30, conditions: [] }, t(2000));
  assert.deepEqual([adult.sodium_mg.limit, adult.sat_fat.limit, adult.added_sugar.limit], [2000, 22, 50]);
  assert.equal(limitsOf({ age: 45, conditions: ['bp'] }, t(2000)).sodium_mg.limit, 1500);
  assert.equal(limitsOf({ age: 45, conditions: ['chol'] }, t(2000)).sat_fat.limit, 13);
  assert.equal(limitsOf({ age: 45, conditions: ['t2'] }, t(2000)).added_sugar.limit, 25);
  assert.equal(limitsOf({ age: 45, conditions: ['pcos'] }, t(1800)).added_sugar.limit, 23);
  assert.equal(limitsOf({ age: 16, conditions: [] }, t(2400)).added_sugar.limit, 25, 'teens: at most 25 g');
  assert.equal(limitsOf({ age: 13, conditions: [] }, t(2000)).sodium_mg.limit, 1800);
  assert.equal(limitsOf({ age: 13, conditions: ['bp'] }, t(2000)).sodium_mg.limit, 1500, 'stricter wins');
  const all = limitsOf({ age: 50, conditions: ['bp', 'chol', 't2'] }, t(1800));
  assert.deepEqual([all.sodium_mg.limit, all.sat_fat.limit, all.added_sugar.limit], [1500, 12, 23]);
  const noProfile = limitsOf(null, undefined);
  assert.equal(noProfile.sodium_mg.limit, 2000);
  assert.ok(all.sodium_mg.why.includes('blood pressure'));
});

test('watch status: none, unknown, ok, near, unsure ("at least") and over', () => {
  const limits = limitsOf({ age: 30, conditions: [] }, { calories: 2000 });
  const status = (n) => watchOf({ sodium_mg: n, sat_fat: { value: 5, complete: 1, total: 1, partial: false }, added_sugar: { value: 5, complete: 1, total: 1, partial: false } }, limits)[0].status;
  assert.equal(status({ value: null, complete: 0, total: 0, partial: false }), 'none');
  assert.equal(status({ value: null, complete: 0, total: 2, partial: true }), 'unknown');
  assert.equal(status({ value: 900, complete: 2, total: 2, partial: false }), 'ok');
  assert.equal(status({ value: 1800, complete: 2, total: 2, partial: false }), 'near');
  assert.equal(status({ value: 1450, complete: 2, total: 3, partial: true }), 'unsure', 'under the limit but data is missing: never a green tick');
  assert.equal(status({ value: 2600, complete: 2, total: 3, partial: true }), 'over', 'over is certain even when data is missing');
  assert.equal(status({ value: 2100, complete: 3, total: 3, partial: false }), 'over');
  const row = { sodium_mg: 1450, sodium_mg_n: 2, sodium_mg_gap: 0, sat_fat: null, sat_fat_n: 0, sat_fat_gap: 0, added_sugar: 4, added_sugar_n: 3, added_sugar_gap: 1 };
  const n = readNutrients(row, 3);
  assert.deepEqual(n.sodium_mg, { value: 1450, complete: 2, total: 3, partial: true });
  assert.equal(n.sat_fat.value, null);
  assert.equal(n.added_sugar.partial, true, 'a lower-bound meal counts as incomplete');
  assert.equal(gapMask(['sodium_mg', 'added_sugar', 'nonsense']), 5);
  assert.equal(gapMask('sodium_mg'), 0);
});

/* ------------------------------ PR 4: nutrition safety ------------------------------ */

import { unsafeIn, allergyWords, unmappedAllergies, screenMessage, SUPPORT_REPLY, prefsFromProfile } from '../lib/safety.js';
import { bmiBands, calorieFloor, minTargetWeight, validateTargets, PREG_STAGES } from '../lib/plan.js';
import { clinicalOf } from '../lib/limits.js';
import { cleanRecipe } from '../lib/ai/features.js';

const flagged = (name, prefs, opts) => checkConflicts(name, prefs, opts).length > 0;

test('safety: harmless phrases stay allowed (no false positives)', () => {
  // Goat milk is dairy, not meat.
  assert.ok(!flagged('goat milk', { diet: 'veg' }));
  assert.ok(!flagged('goat cheese sandwich', { diet: 'veg' }));
  assert.ok(flagged('goat milk', { allergies: ['dairy'] }), 'but it is still dairy');
  assert.ok(flagged('goat milk', { diet: 'vegan' }), 'and not vegan');
  assert.ok(flagged('goat curry', { diet: 'veg' }), 'goat meat is still caught');
  // Plant-based foods named after meat.
  for (const f of ['veggie burger', 'soya mince', 'plant-based meat', 'cauliflower steak', 'mock chicken', 'meatless balls', 'eggless cake', 'egg-free mayo', 'chicken-free noodles']) {
    assert.ok(!flagged(f, { diet: 'veg' }), `${f} is vegetarian`);
  }
  assert.ok(flagged('soya mince', { allergies: ['soy'] }), 'a substitute is still soy');
  assert.ok(!flagged('coconut milk curry', { allergies: ['dairy'] }));
});

test('safety: unsafe foods are caught, including Hindi names, hidden ingredients and plurals', () => {
  const caught = [
    ['gosht curry', { diet: 'veg' }], ['murgh makhani', { diet: 'veg' }], ['machli fry', { diet: 'veg' }], ['jhinga masala', { diet: 'veg' }],
    ['doodh patti', { allergies: ['dairy'] }], ['makkhan toast', { allergies: ['dairy'] }], ['tuppa rice', { allergies: ['dairy'] }], ['Bournvita', { allergies: ['dairy'] }],
    ['naan', { allergies: ['dairy'] }], ['white sauce pasta', { allergies: ['dairy'] }],
    ['pista kulfi', { allergies: ['tree'] }], ['chironji', { allergies: ['tree'] }], ['mungfali chikki', { allergies: ['peanuts'] }],
    ['mayo sandwich', { allergies: ['eggs'] }], ['hummus', { allergies: ['sesame'] }], ['tilkut', { allergies: ['sesame'] }],
    ['soy sauce', { allergies: ['gluten'] }], ['Worcestershire sauce', { allergies: ['fish'] }], ['machhi curry', { allergies: ['fish'] }], ['jhinga', { allergies: ['shellfish'] }],
    ['2 rotis', { allergies: ['gluten'] }], ['shakarkandi chaat', { diet: 'jain' }], ['shahad', { diet: 'vegan' }], ['gluten-free bread', { allergies: ['gluten'] }]
  ];
  for (const [food, prefs] of caught) assert.ok(flagged(food, prefs), `${food} should be caught`);
});

test('safety: free-text allergies map to the right foods and unknown ones are reported', () => {
  assert.ok(flagged('paneer', { allergies: ['milk allergy'] }));
  assert.ok(flagged('curd rice', { allergies: ['lactose'] }));
  assert.ok(flagged('wheat flour', { allergies: ['Gluten intolerance'] }));
  assert.ok(flagged('prawn curry', { allergies: ['seafood'] }));
  assert.ok(flagged('kiwi smoothie', { allergies: ['kiwi'] }), 'an unknown allergy is still matched as typed');
  assert.deepEqual(unmappedAllergies(['dairy', 'milk allergy', 'kiwi', 'mushroom']), ['kiwi', 'mushroom']);
  assert.equal(allergyWords('kiwi').known, false);
  assert.equal(allergyWords('peanuts').known, true);
});

test('safety: AI text understands "no X" and "X-free", but a food name does not get that pass for allergies', () => {
  const dairy = { allergies: ['dairy', 'gluten'] };
  assert.equal(unsafeIn('This recipe has no milk and is gluten-free.', dairy).length, 0);
  assert.equal(unsafeIn('Made without ghee or butter.', dairy).filter((c) => c.word === 'ghee').length, 0);
  assert.ok(unsafeIn('Stir in a spoon of ghee.', dairy).length > 0);
  assert.ok(unsafeIn('Use dairy-free yoghurt instead of curd', dairy).some((c) => c.word === 'curd'), 'only the negated word is ignored');
  assert.ok(flagged('gluten-free bread', dairy), 'a label on a food is not trusted for an allergy');
  assert.equal(unsafeIn('You may dislike okra', { dislikes: 'okra' }).length, 0, 'dislikes are not safety problems in prose');
});

test('safety: advice that is unsafe for a condition, in every text path', () => {
  const clin = { conditions: ['clin'] };
  for (const t of ['Have a protein shake after lunch', 'Try a high-protein breakfast', 'Drink more water through the day', 'Use lite salt instead', 'Swap to sendha namak', 'Coconut water is great', 'Try an electrolyte drink']) {
    assert.ok(unsafeIn(t, clin).some((c) => c.type === 'advice'), `${t} is unsafe with a doctor-managed condition`);
  }
  assert.ok(!unsafeIn('Have dal, rice and a small salad', clin).length);
  assert.ok(!unsafeIn('Try a high-protein breakfast', { conditions: ['t2'] }).length, 'other users are not affected');
  assert.ok(unsafeIn('Have a glass of wine with dinner', { conditions: ['preg'] }).some((c) => c.key === 'preg'));
  assert.ok(unsafeIn('Try a juice cleanse', { conditions: [] }).some((c) => c.key === 'crash'));
  assert.ok(unsafeIn('Skip breakfast to save calories', {}).some((c) => c.key === 'crash'));
  assert.ok(!unsafeIn('This plan is detox-free', {}).length, 'a negated crash diet is fine');
  // Warning against the unsafe thing is good advice and must not be blocked.
  assert.ok(!unsafeIn('Never skip meals, and avoid crash diets.', {}).length);
  assert.ok(!unsafeIn('Please avoid alcohol and raw fish.', { conditions: ['preg'] }).length);
  assert.ok(!unsafeIn('Avoid high-protein supplements unless your care team says so.', clin).length);
  assert.ok(!unsafeIn('Your fasting blood sugar is worth checking with your doctor.', {}).length, 'a medical test is not a fast');
  assert.ok(unsafeIn('You could try a prolonged fast.', {}).length);
});

test('safety: worrying chat messages get a fixed supportive reply', () => {
  for (const m of ['I want to starve myself', 'how do I purge after eating', 'I only eat 600 calories a day', 'can I live on under 800 kcal', 'I think I have anorexia', 'how to lose 10 kg in a week']) {
    assert.ok(screenMessage(m), `${m} should be screened`);
  }
  for (const m of ['What can I make with dal and rice?', 'I eat about 2000 calories a day', 'only 3000 calories planned for my bulk', 'I lost 2 kg in a month']) {
    assert.ok(!screenMessage(m), `${m} is a normal question`);
  }
  assert.ok(SUPPORT_REPLY.includes('doctor') && SUPPORT_REPLY.includes('14416'));
});

test('plan: pregnancy stage sets the add-on, and an unknown stage adds nothing', () => {
  const base = { sex: 'female', age: 30, height_cm: 160, weight_kg: 60, activity: 'light', goal: 'maintain', conditions: ['preg'] };
  const none = computePlan(base);
  const add = (stage) => computePlan({ ...base, preg_stage: stage });
  assert.equal(none.calories, computePlan({ ...base, conditions: [] }).calories, 'no stage, no extra calories');
  assert.ok(none.notes.some((n) => n.includes('trimester')), 'asks for the stage');
  assert.equal(add('t1').calories, none.calories, 'first trimester adds nothing');
  assert.equal(add('t2').calories - none.calories, 340);
  assert.equal(add('t3').calories - none.calories, 450);
  assert.equal(add('bf').calories - none.calories, 330);
  assert.ok(add('t2').protein >= Math.round(60 * 1.1));
  assert.ok(add('bf').protein >= Math.round(60 * 1.3));
  assert.equal(add('nonsense').calories, none.calories, 'an invalid stage is ignored');
  const lose = computePlan({ ...base, goal: 'lose', target_weight_kg: 52, preg_stage: 't2' });
  assert.ok(lose.calories >= computePlan({ ...base, goal: 'lose', preg_stage: 't2' }).tdee, 'never a deficit in pregnancy');
  assert.deepEqual(PREG_STAGES, ['t1', 't2', 't3', 'bf']);
});

test('plan: the goal and the target weight must point the same way', () => {
  const base = { sex: 'female', age: 30, height_cm: 150, weight_kg: 50, activity: 'light' };
  const maintain = computePlan({ ...base, goal: 'maintain' }).calories;
  const same = computePlan({ ...base, goal: 'lose', target_weight_kg: 50 });
  assert.equal(same.calories, maintain, 'losing to your current weight is just maintenance');
  assert.ok(same.notes.some((n) => n.includes('not below')));
  assert.equal(computePlan({ ...base, goal: 'lose' }).calories, maintain, 'no target set');
  assert.ok(computePlan({ ...base, goal: 'lose', target_weight_kg: 46 }).calories < maintain, 'a real target gives a deficit');
  assert.equal(computePlan({ ...base, goal: 'gain', target_weight_kg: 45 }).calories, maintain, 'gaining toward a lower weight is maintenance');
  assert.ok(computePlan({ ...base, goal: 'gain', target_weight_kg: 55 }).calories > maintain);
});

test('plan: a target below BMI 18.5 is raised, for every goal, and BMI is not treated as a diagnosis', () => {
  const p = computePlan({ sex: 'male', age: 30, height_cm: 170, weight_kg: 75, activity: 'light', goal: 'maintain', target_weight_kg: 40 });
  assert.ok(p.goal_weight >= minTargetWeight(170) - 0.1);
  assert.ok(p.notes.some((n) => n.includes('underweight range')));
  const lose = computePlan({ sex: 'male', age: 30, height_cm: 170, weight_kg: 75, activity: 'light', goal: 'lose', target_weight_kg: 40 });
  assert.ok(lose.weeks_to_goal > 0 && lose.timeline_note.includes('not a promise'));
  assert.ok(lose.goal_weight >= 53, 'the timeline counts to the lowest healthy weight, not to 40 kg');
});

test('plan: BMI shows both the WHO and the South Asian ranges, only for adults', () => {
  assert.deepEqual([bmiBands(17, 30).who, bmiBands(17, 30).south_asian], ['Underweight', 'Underweight']);
  assert.deepEqual([bmiBands(22, 30).who, bmiBands(22, 30).south_asian], ['Healthy range', 'Healthy range']);
  assert.deepEqual([bmiBands(23.5, 30).who, bmiBands(23.5, 30).south_asian], ['Healthy range', 'Overweight']);
  assert.deepEqual([bmiBands(25.5, 30).who, bmiBands(25.5, 30).south_asian], ['Overweight', 'Obese']);
  assert.deepEqual([bmiBands(31, 30).who, bmiBands(31, 30).south_asian], ['Obese', 'Obese']);
  assert.equal(bmiBands(22, 16).applies, false, 'adult ranges do not apply under 19');
  assert.equal(bmiBands(22, 16).who, undefined);
  assert.ok(bmiBands(24, 30).note.includes('not a diagnosis'));
  assert.equal(bmiBands(0, 30), null);
});

test('plan: calorie floors are shared and water is capped with a stated basis', () => {
  assert.equal(calorieFloor('female', 30), 1200);
  assert.equal(calorieFloor('male', 30), 1500);
  assert.equal(calorieFloor('na', 30), 1350);
  assert.equal(calorieFloor('male', 16), 1400, 'under 18s share one floor');
  const light = computePlan({ sex: 'female', age: 30, height_cm: 155, weight_kg: 40, activity: 'light', goal: 'maintain' });
  const heavy = computePlan({ sex: 'male', age: 30, height_cm: 180, weight_kg: 200, activity: 'light', goal: 'maintain' });
  assert.equal(light.water_glasses, 6, 'at least 1.5 litres');
  assert.equal(heavy.water_glasses, 12, 'at most 3 litres');
});

test('plan: a doctor-managed condition gets no deficit, a general protein figure and no fluid target', () => {
  const base = { sex: 'male', age: 55, height_cm: 170, weight_kg: 80, activity: 'light', goal: 'gain', target_weight_kg: 90, conditions: ['clin'] };
  const p = computePlan(base);
  assert.equal(p.clinician_managed, true);
  assert.equal(p.protein, 64, '0.8 g per kg, not the 1.6 g per kg of a muscle-gain goal');
  assert.equal(p.protein_basis, 'general');
  assert.equal(p.adjustment, p.calories - p.tdee);
  assert.ok(Math.abs(p.adjustment) <= 5, 'no surplus or deficit');
  assert.equal(p.fluid_managed, true);
  assert.equal(p.fluid_limit_ml, null);
  assert.ok(p.notes.some((n) => n.includes('ask your care team') || n.includes('Please ask them')));
  const rx = computePlan({ ...base, rx_protein_g: 40, rx_fluid_ml: 1500 });
  assert.equal(rx.protein, 40, 'the number from the care team wins');
  assert.equal(rx.protein_basis, 'prescribed');
  assert.equal(rx.fluid_limit_ml, 1500);
  assert.equal(computePlan({ ...base, conditions: [] }).protein_basis, 'goal');
  assert.ok(computePlan({ ...base, conditions: [] }).protein > 100, 'other users keep their goal-based protein');
});

test('limits: a doctor-managed condition has a general sodium ceiling unless the care team gave a number', () => {
  const profile = { age: 55, conditions: ['clin'] };
  assert.equal(limitsOf(profile, { calories: 2000 }).sodium_mg.limit, 2000);
  assert.ok(limitsOf(profile, { calories: 2000 }).sodium_mg.why.includes('may set a lower number'));
  const rx = limitsOf({ ...profile, rx_sodium_mg: 1200 }, { calories: 2000 }).sodium_mg;
  assert.equal(rx.limit, 1200);
  assert.ok(rx.why.includes('care team'));
  const both = limitsOf({ age: 55, conditions: ['bp', 'clin'] }, { calories: 2000 }).sodium_mg;
  assert.equal(both.limit, 1500, 'a general ceiling does not loosen the blood pressure one');
  assert.ok(both.why.includes('blood pressure'));
  assert.equal(clinicalOf({ conditions: ['t2'] }), null);
  assert.deepEqual(clinicalOf({ conditions: ['clin'], weight_kg: 70 }), { sodium_limit: 2000, sodium_prescribed: false, protein_cap: 56, protein_prescribed: false, fluid_limit_ml: null });
  assert.equal(clinicalOf({ conditions: ['clin'], weight_kg: 70, rx_protein_g: 35, rx_fluid_ml: 1000 }).protein_cap, 35);
});

test('targets: hand-set targets are sense-checked against the profile', () => {
  const profile = { sex: 'female', age: 30, height_cm: 165, weight_kg: 60, activity: 'light', conditions: [] };
  const ok = { calories: 1800, protein: 90, carbs: 220, fat: 60, fiber: 28, water_glasses: 8 };
  validateTargets(ok, profile);
  const rejects = (t, p = profile, text) => assert.throws(() => validateTargets({ ...ok, ...t }, p), (e) => e.status === 400 && (!text || e.message.includes(text)));
  rejects({ calories: 1100 }, profile, 'below 1,200');
  rejects({ calories: 2000 }, profile, 'match within 10%');
  rejects({ protein: 90, carbs: 300, fat: 20, calories: 1800 }, profile, 'Fat should be at least 15%');
  rejects({ protein: 30, carbs: 270, fat: 60, calories: 1800 }, profile, 'below 0.6 g per kg');
  rejects({ protein: 190, carbs: 100, fat: 70, calories: 1800 }, profile, '3 g per kg');
  // Teenagers and pregnancy cannot go below about maintenance.
  const teen = { ...profile, age: 16 };
  rejects({ calories: 1500, protein: 80, carbs: 180, fat: 55 }, teen, 'about your maintenance level');
  rejects({ calories: 1500, protein: 80, carbs: 180, fat: 55 }, { ...profile, conditions: ['preg'] }, 'maintenance');
  // A doctor-managed condition: protein stays under the ceiling, fluids under the limit.
  const clin = { ...profile, conditions: ['clin'] };
  const clinOk = { calories: 1900, protein: 48, carbs: 270, fat: 60, fiber: 28, water_glasses: 6 };
  validateTargets(clinOk, clin);
  rejects({ ...clinOk, protein: 90 }, clin, '48 g');
  rejects({ ...clinOk, protein: 70, carbs: 250 }, { ...clin, rx_protein_g: 50 }, '50 g');
  rejects({ ...clinOk, water_glasses: 8 }, { ...clin, rx_fluid_ml: 1000 }, 'fluid limit');
  validateTargets({ ...clinOk, protein: 25, carbs: 290 }, clin); // a low protein target is the user's and their doctor's choice
});

test('targets: our own plan always passes its own checks', () => {
  for (const sex of ['female', 'male', 'na']) for (const age of [13, 16, 25, 45, 70]) for (const goal of ['lose', 'maintain', 'gain', 'healthy']) for (const conditions of [[], ['preg'], ['clin'], ['t2']]) {
    const p = { sex, age, goal, conditions, height_cm: 165, weight_kg: 62, target_weight_kg: goal === 'gain' ? 70 : 56, activity: 'light', preg_stage: 't3' };
    const plan = computePlan(p);
    assert.doesNotThrow(() => validateTargets({ calories: plan.calories, protein: plan.protein, carbs: plan.carbs, fat: plan.fat, fiber: plan.fiber, water_glasses: plan.water_glasses }, p), JSON.stringify({ sex, age, goal, conditions }));
  }
});

test('recipes: a doctor-managed user only gets recipes within their sodium and protein ceilings', () => {
  const profile = { diet: 'veg', allergies: [], dislikes: '', conditions: ['clin'], weight_kg: 70, rx_sodium_mg: 1500 };
  const prefs = prefsFromProfile(profile);
  const recipe = (extra) => ({ title: 'Dal and rice', ingredients: [{ name: 'toor dal', qty: '60 g' }, { name: 'rice', qty: '100 g' }], steps: ['Cook the dal.', 'Serve with rice.'], kcal: 450, protein: 18, carbs: 80, fat: 6, fiber: 8, servings: 1, ...extra });
  const fine = cleanRecipe(recipe({ sodium_mg: 400 }), [], prefs);
  assert.equal(fine.violations.length, 0);
  assert.equal(fine.recipe.sodium_mg, 400);
  assert.ok(fine.recipe.sodium_note.includes('AI estimate'));
  const unknown = cleanRecipe(recipe({}), [], prefs);
  assert.equal(unknown.recipe.sodium_mg, null);
  assert.ok(unknown.recipe.sodium_note.includes('not verified'), 'an unknown sodium figure is never passed off as low');
  assert.ok(cleanRecipe(recipe({ sodium_mg: 900 }), [], prefs).violations.some((v) => v.reason.includes('sodium')), 'over 40% of the daily ceiling');
  assert.ok(cleanRecipe(recipe({ sodium_mg: 300, protein: 40 }), [], prefs).violations.some((v) => v.reason.includes('protein')), 'over half of the protein ceiling');
  assert.ok(cleanRecipe(recipe({ steps: ['Add a scoop of protein powder.'] }), [], prefs).violations.some((v) => v.reason.includes('protein')), 'unsafe advice in the method is caught');
  assert.equal(cleanRecipe(recipe({ sodium_mg: 900 }), [], prefsFromProfile({ ...profile, conditions: [] })).violations.length, 0, 'other users are not limited');
  assert.equal(cleanRecipe(recipe({ sodium_mg: 400 }), [], prefsFromProfile({ ...profile, conditions: [] })).recipe.sodium_note, null);
});

/* ------------------------------ PR 5: number and quantity parsing ------------------------------ */

test('num: supported formats are read exactly, ambiguous or malformed text is rejected', async () => {
  const { num, parseNumber } = await import('../lib/http.js');
  const ok = { 12: 12, '-3': -3, '+4': 4, '12.5': 12.5, '.5': 0.5, ' 7 ': 7, '1,234': 1234, '1,234,567.5': 1234567.5, '1,5': 1.5, '70,25': 70.25, '-1,234': -1234 };
  for (const [text, want] of Object.entries(ok)) assert.equal(parseNumber(text), want, text);
  assert.equal(parseNumber(42), 42);
  for (const bad of ['1,2,3', '1.234,5', '1e3', '0x10', '12kg', '1,23,456', ',5', '5,', '1,', 'abc', '--1', '1..2', '1,2345', Infinity, NaN, true, [], {}]) {
    assert.ok(Number.isNaN(parseNumber(bad)), String(bad));
    assert.throws(() => num(bad, { field: 'Weight' }), /Weight must be a number/, String(bad));
  }
  assert.throws(() => num('', { field: 'Weight' }), /Weight is required/);
  assert.throws(() => num(undefined), /required/);
  assert.equal(num('', { optional: true }), null);
  assert.equal(num(null, { optional: true }), null);
  assert.equal(num('0'), 0, 'a real zero is kept');
  assert.equal(num('-5', { min: -10 }), -5);
  assert.throws(() => num('-5', { min: 0, field: 'Weight' }), /between 0 and/);
  assert.throws(() => num('1,500', { max: 300 }), /between/);
});

test('fractions: decimals are never rewritten, valid fractions work, invalid ones are flagged', async () => {
  const { simplifyFractions, hasMalformedFraction, estimateGrams, findFood } = await import('../lib/foods.js');
  assert.equal(simplifyFractions('1/2 cup'), '0.5 cup');
  assert.equal(simplifyFractions('1 1/2 cups'), '1.5 cups');
  assert.equal(simplifyFractions('3 / 4 cup'), '0.75 cup');
  assert.equal(simplifyFractions('1/3 cup'), '0.33 cup');
  assert.equal(simplifyFractions('1/4 cup'), '0.25 cup');
  assert.equal(simplifyFractions('2½ cups'), '2.5 cups');
  assert.equal(simplifyFractions('0.5 cup'), '0.5 cup');
  assert.equal(simplifyFractions('1.5 cup'), '1.5 cup');
  for (const bad of ['1/0 cup', '1/2/3 cup', '1.5/2 cup', '1/0.5 cup', '3/00 cup']) {
    assert.ok(hasMalformedFraction(bad), bad);
    assert.equal(simplifyFractions(bad), bad, `${bad} is left exactly as written`);
  }
  for (const good of ['1/2 cup', '1 1/2 cup', '2 rotis', '150 g', '3/4']) assert.ok(!hasMalformedFraction(good), good);
  const milk = findFood('milk');
  const half = estimateGrams('1/2 cup', milk);
  assert.equal(half.grams, 120);
  assert.ok(!half.malformed);
  for (const bad of ['1/0 cup', '1/2/3 cup', '1.5/2 cup']) {
    const e = estimateGrams(bad, milk);
    assert.equal(e.malformed, true, bad);
    assert.equal(e.assumed, true, bad);
    assert.equal(e.grams, 150, `${bad}: one typical portion, not a guessed multiple`);
    assert.match(e.basis, /could not read the amount/, bad);
  }
});

test('AI pantry context: stable order, unknown expiry labelled', async () => {
  const { byExpiryThenName, pantryLine } = await import('../lib/ai/features.js');
  const items = [
    { id: 4, name: 'Zeera', days_left: null }, { id: 1, name: 'beans', days_left: 5 }, { id: 3, name: 'Apple', days_left: 5 },
    { id: 2, name: 'Rice', days_left: null }, { id: 5, name: 'Milk', days_left: 0 }
  ];
  const want = ['Milk', 'Apple', 'beans', 'Rice', 'Zeera'];
  assert.deepEqual([...items].sort(byExpiryThenName).map((i) => i.name), want);
  assert.deepEqual([...items].reverse().sort(byExpiryThenName).map((i) => i.name), want, 'input order does not matter');
  assert.match(pantryLine({ name: 'Rice', quantity: 2, unit: 'kg', days_left: null }), /expiry date not recorded/);
  assert.match(pantryLine({ name: 'Milk', quantity: 1, unit: 'l', days_left: -1 }), /EXPIRED \(do not use\)/);
});

test('pantry matching: expired and unknown-expiry items', async () => {
  const { matchPantry } = await import('../lib/data.js');
  const pantry = [{ name: 'Milk', status: 'expired', id: 1 }, { name: 'Milk', status: 'ok', days_left: null, id: 2 }];
  assert.equal(matchPantry('milk', pantry).id, 2, 'an item with no expiry date is preferred to an expired one');
  assert.equal(matchPantry('milk', [pantry[0]]).status, 'expired', 'only an expired match is still reported as expired, never as fresh');
  assert.equal(matchPantry('boiled egg', [{ name: 'Oil', status: 'ok' }]), null);
});
