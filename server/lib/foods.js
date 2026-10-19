/**
 * Built-in food table, per 100 g (or per 100 ml for liquids). Values follow common IFCT (Indian) and
 * USDA figures. Each entry has a `source`:
 *   - 'usda-checked': compared with USDA FoodData Central (SR Legacy) and found within a few percent.
 *   - 'reference':    typical published values entered by hand; reasonable, but not individually verified.
 *   - 'calculated':   cooked dishes computed from ingredient quantities (see addRecipe below).
 * Sodium, saturated fat and added sugar (per 100 g, null = no data) are in food-nutrients.js.
 * It is used when an AI key is missing or the AI call fails, to price cooking fat and ingredient
 * changes exactly, and to give pantry items nutrition data without spending AI quota.
 */

import { NUTRIENTS, SODIUM_MG_PER_G_SALT } from './food-nutrients.js';

const FOODS = [];
function add(name, aliases, kcal, protein, carbs, fat, fiber, opts = {}) {
  FOODS.push({
    name,
    aliases: [name, ...aliases],
    kcal, protein, carbs, fat, fiber,
    gpp: opts.gpp || null,        // grams per piece
    spoon: opts.spoon || null,    // [grams per tsp, grams per tbsp] when it differs from 5 / 15
    katori: opts.katori || null,  // grams per katori (small serving bowl)
    source: opts.source || 'reference',
    twin: opts.twin || null,      // cooked / ready version used when logging meals
    unit: opts.unit || 'g',
    ready: Boolean(opts.ready),   // already cooked or ready to eat
    sodium_mg: null, sat_fat: null, added_sugar: null // filled from food-nutrients.js; null = no data (not zero)
  });
}

// Grains and flours
add('rice', ['white rice', 'basmati rice', 'basmati', 'chawal', 'raw rice'], 360, 6.8, 79, 0.6, 1.3, { twin: 'cooked rice', source: 'usda-checked' });
add('brown rice', ['brown basmati'], 362, 7.5, 76, 2.7, 3.5, { twin: 'cooked brown rice' });
add('cooked rice', ['steamed rice', 'boiled rice', 'plain rice', 'rice cooked'], 130, 2.7, 28, 0.3, 0.4, { ready: true, source: 'usda-checked' });
add('cooked brown rice', ['brown rice cooked'], 123, 2.7, 26, 1, 1.8, { ready: true });
add('atta', ['wheat flour', 'whole wheat flour', 'gehu atta'], 340, 12, 72, 1.7, 11, { twin: 'roti', source: 'usda-checked' });
add('maida', ['refined flour', 'all purpose flour'], 364, 10, 76, 1, 2.7, { source: 'usda-checked' });
add('bread', ['whole wheat bread', 'brown bread', 'white bread', 'toast', 'bread slice', 'bread slices'], 250, 10, 45, 3.5, 5, { gpp: 30, ready: true });
add('rolled oats', ['oats', 'oatmeal', 'quick oats', 'steel cut oats'], 389, 13, 66, 7, 10, { twin: 'oats porridge', source: 'usda-checked' });
add('oats porridge', ['porridge', 'cooked oats', 'oats with milk', 'overnight oats'], 71, 3.4, 12, 1.5, 1.4, { ready: true });
add('suji', ['semolina', 'rava', 'sooji'], 360, 10, 73, 1, 3, { twin: 'upma' });
add('poha', ['flattened rice', 'beaten rice', 'poha raw'], 350, 6.6, 77, 1.2, 2, { twin: 'cooked poha' });
add('quinoa', [], 368, 14, 64, 6, 7, { twin: 'cooked quinoa' });
add('cooked quinoa', ['quinoa cooked'], 120, 4.4, 21, 1.9, 2.8, { ready: true });
add('pasta', ['spaghetti', 'macaroni', 'penne', 'noodles'], 371, 13, 75, 1.5, 3.2, { twin: 'cooked pasta' });
add('cooked pasta', ['pasta cooked', 'boiled pasta', 'boiled noodles'], 158, 5.8, 31, 0.9, 1.8, { ready: true });
add('besan', ['gram flour', 'chickpea flour'], 387, 22, 58, 6.7, 11, { twin: 'besan chilla', source: 'usda-checked' });
add('besan chilla', ['chilla', 'cheela', 'besan cheela', 'moong chilla', 'moong dal chilla'], 190, 10, 22, 6.5, 4.5, { gpp: 80, ready: true });

// Lentils and legumes
add('toor dal', ['arhar dal', 'tur dal', 'pigeon pea', 'toor', 'arhar'], 335, 22, 58, 1.5, 15, { twin: 'dal cooked', source: 'usda-checked' });
add('moong dal', ['mung dal', 'green gram', 'moong', 'yellow moong dal', 'split moong'], 347, 24, 59, 1.2, 16, { twin: 'dal cooked', source: 'usda-checked' });
add('masoor dal', ['red lentil', 'red lentils', 'masoor'], 343, 25, 59, 1, 11, { twin: 'dal cooked', source: 'usda-checked' });
add('chana dal', ['split chickpea', 'bengal gram dal'], 360, 21, 60, 5.6, 12, { twin: 'dal cooked' });
add('urad dal', ['black gram', 'urad'], 341, 25, 59, 1.6, 18, { twin: 'dal cooked' });
add('chickpeas', ['kabuli chana', 'chana', 'garbanzo', 'white chickpeas', 'kala chana', 'black chickpeas'], 364, 19, 61, 6, 17, { twin: 'chole cooked' });
add('roasted chana', ['roasted chickpeas', 'bhuna chana'], 364, 19, 61, 6, 17, { ready: true });
add('chole cooked', ['chole', 'chana masala', 'chickpea curry', 'cooked chickpeas', 'boiled chickpeas', 'chole masala'], 164, 8.9, 27, 2.6, 7.6, { ready: true });
add('rajma', ['kidney beans', 'red kidney beans'], 333, 24, 60, 0.8, 25, { twin: 'rajma cooked' });
add('rajma cooked', ['rajma masala', 'cooked rajma', 'rajma curry'], 127, 8.7, 22.8, 0.5, 6.4, { ready: true });
add('soya chunks', ['soy chunks', 'nutrela', 'soya nuggets', 'meal maker'], 345, 52, 33, 0.5, 13);
add('tofu', [], 76, 8, 1.9, 4.8, 0.3);

// Prepared dishes
add('sambar', [], 55, 2.8, 8, 1.4, 2, { ready: true });
add('curd rice', ['thayir sadam', 'dahi rice'], 118, 3.2, 19, 3, 0.3, { ready: true });
add('biryani', ['veg biryani', 'vegetable biryani'], 170, 4, 26, 5.5, 1.5, { ready: true });
add('chicken biryani', [], 180, 9, 22, 6, 1, { ready: true });
add('samosa', [], 262, 4, 24, 17, 2, { gpp: 60, ready: true });
add('salad', ['green salad', 'kachumber', 'vegetable salad'], 20, 1, 4, 0.2, 1.5, { ready: true });
add('chai', ['tea', 'masala chai', 'milk tea'], 50, 1.5, 7, 1.8, 0, { unit: 'ml', ready: true });

// Dairy and eggs
add('paneer', ['cottage cheese', 'indian cottage cheese'], 296, 18, 3.4, 23, 0);
add('palak paneer', [], 160, 8, 6, 12, 2, { ready: true });
add('paneer tikka', [], 220, 14, 5, 16, 1, { ready: true });
add('milk', ['whole milk', 'toned milk', 'full cream milk', 'cow milk', 'doodh'], 62, 3.3, 4.8, 3.3, 0, { unit: 'ml' });
add('almond milk', ['almond milk', 'badam milk unsweetened'], 15, 0.6, 0.3, 1.1, 0.2, { unit: 'ml' });
add('oat milk', ['oat milk'], 45, 1, 7, 1.5, 0.8, { unit: 'ml' });
add('coconut milk', ['coconut milk', 'coconut cream'], 197, 2, 3, 21, 0, { unit: 'ml' });
add('soy milk', ['soy milk', 'soya milk'], 40, 3.3, 1.5, 1.8, 0.4, { unit: 'ml' });
add('green tea', ['green tea', 'black tea', 'black coffee'], 1, 0, 0.2, 0, 0, { unit: 'ml', ready: true });
add('curd', ['yogurt', 'yoghurt', 'dahi', 'plain yogurt'], 61, 3.5, 4.7, 3.3, 0);
add('greek yogurt', ['hung curd', 'greek yoghurt'], 59, 10, 3.6, 0.4, 0);
add('buttermilk', ['chaas', 'chhaas'], 40, 3.3, 4.8, 0.9, 0, { unit: 'ml' });
add('ghee', ['clarified butter'], 900, 0, 0, 100, 0, { spoon: [4.5, 13.5] });
add('butter', [], 717, 0.9, 0.1, 81, 0, { spoon: [4.7, 14.2] });
add('cheese', ['cheddar', 'cheese slice', 'mozzarella', 'processed cheese'], 350, 25, 1.3, 27, 0);
add('egg', ['eggs', 'boiled egg', 'boiled eggs', 'omelette', 'omelet', 'scrambled eggs', 'fried egg', 'egg bhurji', 'anda'], 143, 12.6, 0.7, 9.5, 0, { gpp: 50, ready: true });
add('egg white', ['egg whites'], 52, 11, 0.7, 0.2, 0, { gpp: 33, ready: true });

// Vegetables
add('spinach', ['palak', 'baby spinach'], 23, 2.9, 3.6, 0.4, 2.2);
add('tomato', ['tomatoes', 'tamatar'], 18, 0.9, 3.9, 0.2, 1.2, { gpp: 100 });
add('onion', ['onions', 'pyaz'], 40, 1.1, 9.3, 0.1, 1.7, { gpp: 110 });
add('potato', ['potatoes', 'aloo'], 77, 2, 17, 0.1, 2.2, { gpp: 150 });
add('cauliflower', ['gobi'], 25, 1.9, 5, 0.3, 2);
add('capsicum', ['bell pepper', 'bell peppers', 'shimla mirch'], 20, 0.9, 4.6, 0.2, 1.7, { gpp: 120 });
add('carrot', ['carrots', 'gajar'], 41, 0.9, 10, 0.2, 2.8, { gpp: 70 });
add('cucumber', ['kheera'], 15, 0.7, 3.6, 0.1, 0.5);
add('green peas', ['peas', 'matar'], 81, 5.4, 14, 0.4, 5.7);
add('cabbage', ['patta gobi'], 25, 1.3, 5.8, 0.1, 2.5);
add('okra', ['bhindi', 'lady finger', 'ladyfinger'], 33, 1.9, 7.5, 0.2, 3.2);
add('brinjal', ['eggplant', 'baingan', 'aubergine'], 25, 1, 6, 0.2, 3);
add('garlic', ['lehsun'], 149, 6.4, 33, 0.5, 2.1);
add('ginger', ['adrak'], 80, 1.8, 18, 0.8, 2);
add('coriander', ['cilantro', 'dhania', 'coriander leaves'], 23, 2.1, 3.7, 0.5, 2.8);
add('mushroom', ['mushrooms'], 22, 3.1, 3.3, 0.3, 1);

// Fruit
add('banana', ['bananas', 'kela'], 89, 1.1, 23, 0.3, 2.6, { gpp: 120 });
add('apple', ['apples'], 52, 0.3, 14, 0.2, 2.4, { gpp: 180 });
add('orange', ['oranges', 'mosambi', 'sweet lime'], 47, 0.9, 12, 0.1, 2.4, { gpp: 130 });
add('mango', ['mangoes'], 60, 0.8, 15, 0.4, 1.6, { gpp: 200 });
add('papaya', [], 43, 0.5, 11, 0.3, 1.7);
add('grapes', [], 69, 0.7, 18, 0.2, 0.9);
add('watermelon', [], 30, 0.6, 7.6, 0.2, 0.4);

// Nuts, seeds and dried fruit
add('almonds', ['almond', 'badam'], 579, 21, 22, 50, 12.5, { gpp: 1.2 });
add('cashews', ['cashew', 'kaju'], 553, 18, 30, 44, 3.3, { gpp: 1.5 });
add('walnuts', ['walnut', 'akhrot'], 654, 15, 14, 65, 6.7, { gpp: 4 });
add('peanuts', ['peanut', 'groundnut', 'moongphali'], 567, 26, 16, 49, 8.5);
add('peanut butter', [], 588, 25, 20, 50, 6);
add('chia seeds', ['chia'], 486, 17, 42, 31, 34);
add('flax seeds', ['flaxseed', 'alsi', 'linseed'], 534, 18, 29, 42, 27);
add('sesame seeds', ['sesame', 'til'], 573, 18, 23, 50, 12);
add('dates', ['khajur', 'date'], 282, 2.5, 75, 0.4, 8, { gpp: 8 });
add('raisins', ['kishmish'], 299, 3.1, 79, 0.5, 3.7);

// Animal protein
add('chicken breast', ['chicken', 'grilled chicken'], 165, 31, 0, 3.6, 0);
add('chicken curry', [], 150, 15, 4, 8, 1, { ready: true });
add('fish', ['rohu', 'salmon', 'tuna', 'basa', 'pomfret', 'fish fry', 'fish curry'], 120, 20, 0, 4, 0);
add('prawns', ['shrimp', 'prawn'], 99, 24, 0.2, 0.3, 0);

// Fats, sugars and other
add('cooking oil', ['oil', 'sunflower oil', 'mustard oil', 'olive oil', 'groundnut oil', 'refined oil'], 813, 0, 0, 92, 0, { unit: 'ml' });
add('coconut oil', [], 813, 0, 0, 92, 0, { unit: 'ml' }); // per 100 ml: oil weighs 0.92 g/ml (884 kcal per 100 g)
add('sugar', ['cheeni', 'white sugar'], 387, 0, 100, 0, 0, { spoon: [4.2, 12.5] });
add('jaggery', ['gur'], 383, 0.4, 98, 0.1, 0);
add('honey', [], 304, 0.3, 82, 0, 0.2, { spoon: [7, 21] });
add('coconut', ['fresh coconut', 'dry coconut'], 354, 3.3, 15, 33, 9);
add('biscuits', ['biscuit', 'cookies', 'cookie', 'marie biscuit'], 450, 6, 70, 16, 2, { gpp: 10, ready: true });
add('protein powder', ['whey', 'whey protein', 'protein shake'], 400, 80, 8, 6, 0);


// More Indian staples, street food and packaged foods (typical published values, source: reference)
add('rice flour', ['chawal ka atta'], 366, 6, 80, 1.4, 2.4);
add('jowar flour', ['jowar', 'sorghum flour', 'jwari atta'], 349, 10.4, 72.6, 1.9, 9.7, { twin: 'jowar roti' });
add('bajra flour', ['bajra', 'pearl millet flour', 'bajre ka atta'], 361, 11.6, 67.5, 5, 11.3, { twin: 'bajra roti' });
add('ragi flour', ['ragi', 'finger millet flour', 'nachni'], 328, 7.3, 72, 1.3, 11.5, { twin: 'ragi roti' });
add('makhana', ['fox nuts', 'phool makhana', 'lotus seeds'], 347, 9.7, 77, 0.1, 14.5);
add('murmura', ['puffed rice', 'muri', 'mamra'], 402, 7.5, 89, 0.5, 2);
add('sweet potato', ['shakarkandi'], 86, 1.6, 20, 0.1, 3, { gpp: 130 });
add('beetroot', ['beet', 'chukandar'], 43, 1.6, 10, 0.2, 2.8, { gpp: 100 });
add('pumpkin', ['kaddu'], 26, 1, 6.5, 0.1, 0.5);
add('bottle gourd', ['lauki', 'doodhi', 'dudhi'], 14, 0.6, 3.4, 0, 0.5);
add('coconut water', ['nariyal pani', 'tender coconut water'], 19, 0.7, 3.7, 0.2, 1.1, { unit: 'ml', ready: true });
add('hummus', [], 166, 7.9, 14.3, 9.6, 6, { ready: true });
add('cornflakes', ['corn flakes'], 357, 7.5, 84, 0.4, 3.3, { ready: true });
add('muesli', [], 340, 10, 66, 5, 8, { ready: true });
add('dhokla', ['khaman dhokla'], 160, 6.5, 24, 4.5, 2, { gpp: 40, ready: true });
add('vada pav', ['wada pav'], 200, 5, 28, 8.5, 2, { gpp: 150, ready: true });
add('french fries', ['fries', 'chips fries'], 312, 3.4, 41, 15, 3.8, { ready: true });
add('pizza', ['pizza slice', 'cheese pizza'], 266, 11, 33, 10, 2.3, { gpp: 100, ready: true });
add('rasgulla', ['rosogolla'], 186, 4, 40, 1, 0, { gpp: 50, ready: true });
add('gulab jamun', ['gulabjamun'], 350, 4.5, 52, 14, 0.5, { gpp: 40, ready: true });
add('kheer', ['rice kheer', 'payasam'], 130, 3.2, 19, 4.2, 0.2, { ready: true });
add('sweet lassi', ['lassi'], 85, 2.6, 13, 2.2, 0, { unit: 'ml', ready: true });
add('egg curry', ['anda curry'], 140, 8, 5, 10, 1, { ready: true });
add('mutton curry', ['mutton masala', 'lamb curry', 'gosht'], 175, 14, 4, 11, 1, { ready: true });
add('fish curry', [], 110, 12, 3, 5, 0.8, { ready: true });
add('chicken tikka', ['tandoori chicken'], 150, 25, 3, 4, 0.5, { ready: true });
add('peanut chikki', ['chikki', 'groundnut chikki'], 480, 14, 60, 22, 4, { gpp: 30, ready: true });
add('namkeen', ['bhujia', 'sev', 'mixture'], 520, 14, 45, 32, 6, { ready: true });
add('potato chips', ['chips', 'wafers', 'crisps'], 536, 7, 53, 34, 4.8, { ready: true });
add('cola', ['soft drink', 'soda', 'coke', 'pepsi'], 42, 0, 10.6, 0, 0, { unit: 'ml', ready: true });
add('fruit juice', ['orange juice', 'packaged juice', 'mango juice'], 48, 0.6, 11.5, 0.2, 0.2, { unit: 'ml', ready: true });
add('sugarcane juice', ['ganne ka ras'], 55, 0, 14, 0, 0, { unit: 'ml', ready: true });

// Sodium, saturated fat and added sugar (see food-nutrients.js). Recipes below are built from these.
for (const [name, [sodium, satFat, addedSugar]] of Object.entries(NUTRIENTS)) {
  const food = FOODS.find((f) => f.name === name);
  if (!food) throw new Error(`food-nutrients.js lists an unknown food: ${name}`);
  food.sodium_mg = sodium; food.sat_fat = satFat; food.added_sugar = addedSugar;
}

/* ------------------------------ Recipes: dishes calculated from ingredients ------------------------------ */

// Nutrition of cooking fat per gram of fat or oil.
export const FAT_SOURCES = {
  oil: { kcal: 8.84, protein: 0, carbs: 0, fat: 1, sat: 0.14, sodium: 0, perTsp: 4.6, label: 'oil' },
  coconut: { kcal: 8.84, protein: 0, carbs: 0, fat: 1, sat: 0.85, sodium: 0, perTsp: 4.6, label: 'coconut oil' },
  ghee: { kcal: 9.0, protein: 0, carbs: 0, fat: 1, sat: 0.62, sodium: 0.02, perTsp: 4.5, label: 'ghee' },
  butter: { kcal: 7.17, protein: 0.009, carbs: 0.001, fat: 0.81, sat: 0.51, sodium: 6, perTsp: 4.7, label: 'butter' }
};

const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium_mg', 'sat_fat', 'added_sugar'];
const ZERO = () => Object.fromEntries(KEYS.map((k) => [k, 0]));
// A nutrient with no data stays null all the way through a sum: unknown plus a number is unknown, never a number.
const plus = (a, b) => (a == null || b == null ? null : a + b);
const times = (v, k) => (v == null ? null : v * k);
const addVec = (a, b, k = 1) => Object.fromEntries(KEYS.map((key) => [key, plus(a[key], times(b[key] ?? (key === 'fiber' ? 0 : null), k))]));
const foodByName = (name) => FOODS.find((f) => f.name === name);
const grams = (food, g) => Object.fromEntries(KEYS.map((key) => [key, times(food[key], g / 100)]));
const fatVec = (type, g) => {
  const f = FAT_SOURCES[type];
  return { kcal: f.kcal * g, protein: f.protein * g, carbs: f.carbs * g, fat: f.fat * g, fiber: 0, sodium_mg: f.sodium * g, sat_fat: f.sat * g, added_sugar: 0 };
};
/** Sodium in `g` grams of table salt. */
export const saltSodium = (g) => g * SODIUM_MG_PER_G_SALT;

/**
 * Computes the nutrition of a recipe per 100 g of the finished dish.
 * spec: { ingredients: [[foodName, rawGrams], ...], fat: [type, grams] | null, salt: grams of salt, yield: grams of finished dish, flour?: name of the flour ingredient }
 * overrides: { fat: [type, gramsForWholeYield] | null, salt: gramsForWholeYield, flours: [{ food, share }] }
 */
export function composeRecipe(spec, overrides = {}) {
  let total = ZERO();
  for (const [name, g] of spec.ingredients) {
    if (overrides.flours && name === spec.flour) {
      for (const { food, share } of overrides.flours) total = addVec(total, grams(food, g * share));
    } else {
      const food = foodByName(name);
      if (!food) throw new Error(`Recipe ingredient missing from the food table: ${name}`);
      total = addVec(total, grams(food, g));
    }
  }
  const fat = overrides.fat !== undefined ? overrides.fat : spec.fat;
  if (fat) total = addVec(total, fatVec(fat[0], fat[1]));
  const salt = overrides.salt !== undefined ? overrides.salt : (spec.salt || 0);
  if (total.sodium_mg != null) total.sodium_mg += saltSodium(salt);
  const k = 100 / spec.yield;
  return Object.fromEntries(KEYS.map((key) => [key, times(total[key], k)]));
}

function addRecipe(name, aliases, spec, opts = {}) {
  const v = composeRecipe(spec);
  const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
  add(name, aliases, Math.round(v.kcal), r1(v.protein), r1(v.carbs), r1(v.fat), r1(v.fiber), { ...opts, ready: true, source: 'calculated' });
  const food = FOODS[FOODS.length - 1];
  food.recipe = spec;
  food.sodium_mg = v.sodium_mg == null ? null : Math.round(v.sodium_mg);
  food.sat_fat = r1(v.sat_fat);
  food.added_sugar = r1(v.added_sugar);
}

// Quantities are for one typical serving or piece; "yield" is the weight of the finished dish.
addRecipe('roti', ['chapati', 'phulka', 'fulka', 'chapatti'], { ingredients: [['atta', 30]], fat: ['ghee', 1.5], salt: 0.3, yield: 40, flour: 'atta' }, { gpp: 40 });
addRecipe('jowar roti', ['jowar bhakri', 'jwari roti'], { ingredients: [['jowar flour', 30]], fat: null, yield: 40, flour: 'jowar flour' }, { gpp: 40 });
addRecipe('bajra roti', ['bajra bhakri'], { ingredients: [['bajra flour', 35]], fat: null, yield: 50, flour: 'bajra flour' }, { gpp: 50 });
addRecipe('ragi roti', ['ragi mudde', 'nachni roti'], { ingredients: [['ragi flour', 30]], fat: null, yield: 45, flour: 'ragi flour' }, { gpp: 45 });
addRecipe('paratha', ['plain paratha'], { ingredients: [['atta', 45]], fat: ['oil', 5], salt: 0.6, yield: 65, flour: 'atta' }, { gpp: 65 });
addRecipe('aloo paratha', ['stuffed paratha'], { ingredients: [['atta', 40], ['potato', 40]], fat: ['oil', 6], salt: 1, yield: 90, flour: 'atta' }, { gpp: 90 });
addRecipe('puri', ['poori'], { ingredients: [['atta', 25]], fat: ['oil', 4.5], salt: 0.3, yield: 35, flour: 'atta' }, { gpp: 35 });
addRecipe('dosa', ['plain dosa', 'masala dosa'], { ingredients: [['rice', 22], ['urad dal', 7]], fat: ['oil', 3], salt: 0.5, yield: 80 }, { gpp: 80 });
addRecipe('idli', ['idly'], { ingredients: [['rice', 13], ['urad dal', 4.5]], fat: null, salt: 0.3, yield: 40 }, { gpp: 40 });
addRecipe('cooked poha', ['vegetable poha', 'kanda poha', 'poha cooked'], { ingredients: [['poha', 40], ['onion', 25], ['potato', 20], ['peanuts', 5]], fat: ['oil', 5], salt: 1.3, yield: 170 });
addRecipe('upma', ['rava upma', 'suji upma'], { ingredients: [['suji', 50], ['onion', 20], ['carrot', 20]], fat: ['oil', 6], salt: 1.6, yield: 200 });
addRecipe('dal cooked', ['dal', 'daal', 'dal tadka', 'tadka dal', 'cooked dal', 'lentil soup', 'dal fry', 'sambar dal'], { ingredients: [['toor dal', 35], ['onion', 15], ['tomato', 25]], fat: ['ghee', 5], salt: 1.5, yield: 180 }, { katori: 150 });
addRecipe('mixed vegetables', ['mixed veg', 'sabzi', 'vegetable curry', 'veg curry', 'sabji'], { ingredients: [['potato', 40], ['cauliflower', 60], ['green peas', 30], ['onion', 20], ['tomato', 30]], fat: ['oil', 6], salt: 1.3, yield: 170 }, { katori: 120 });
addRecipe('paneer bhurji', ['bhurji paneer'], { ingredients: [['paneer', 80], ['onion', 25], ['tomato', 30]], fat: ['oil', 5], salt: 1.1, yield: 140 });
addRecipe('egg bhurji', ['anda bhurji'], { ingredients: [['egg', 100], ['onion', 20]], fat: ['oil', 5], salt: 0.9, yield: 115 });
addRecipe('khichdi', ['dal khichdi', 'moong khichdi', 'khichri'], { ingredients: [['rice', 25], ['moong dal', 25], ['carrot', 20]], fat: ['ghee', 4.5], salt: 2, yield: 250 });
addRecipe('pulao', ['veg pulao', 'vegetable pulao', 'pulav'], { ingredients: [['rice', 55], ['green peas', 25], ['carrot', 15], ['onion', 15]], fat: ['oil', 5], salt: 1.8, yield: 220 });
addRecipe('jeera rice', [], { ingredients: [['rice', 36]], fat: ['ghee', 3], salt: 0.8, yield: 100 });
addRecipe('pakora', ['pakoda', 'bhajiya', 'onion pakora', 'bhaji'], { ingredients: [['besan', 10], ['onion', 10]], fat: ['oil', 3.5], salt: 0.25, yield: 25 }, { gpp: 25 });

export const FOOD_TABLE = FOODS;

/* ------------------------------ Matching ------------------------------ */

export const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

const singular = (s) => s.split(' ').map((w) => (w.length > 3 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).join(' ');

const byName = new Map(FOODS.map((f) => [f.name, f]));
const aliasIndex = [];
for (const f of FOODS) for (const a of f.aliases) aliasIndex.push({ food: f, alias: ` ${normalize(a)} ` });

export function findFood(text, context = 'pantry') {
  const base = normalize(text);
  if (!base) return null;
  const variants = new Set([` ${base} `, ` ${singular(base)} `]);
  let best = null;
  let bestLen = 0;
  for (const { food, alias } of aliasIndex) {
    for (const v of variants) {
      if (v.includes(alias) && alias.length > bestLen) { best = food; bestLen = alias.length; break; }
    }
  }
  if (best && context === 'meal' && best.twin && byName.has(best.twin)) return byName.get(best.twin);
  return best;
}

/* ------------------------------ Quantities ------------------------------ */

export function simplifyFractions(text) {
  const half = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
  return String(text || '')
    .replace(/(\d+)\s*([½¼¾])/g, (_, w, f) => String(Number(w) + half[f]))
    .replace(/[½¼¾]/g, (f) => String(half[f]))
    .replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (m, w, n, d) => (Number(d) ? String(Number(w) + n / d) : m))
    .replace(/(\d+)\s*\/\s*(\d+)/g, (m, n, d) => (Number(d) ? String(Math.round((n / d) * 100) / 100) : m))
    .replace(/\bhalf\s+(?:a\s+)?(?=(?:cups?|bowls?|glass(?:es)?|tbsp|tsp)\b)/gi, '0.5 ')
    .replace(/\b(?:a|an|one)\s+(?=(?:cups?|bowls?|glass(?:es)?|tbsp|tsp)\b)/gi, '1 ');
}

const UNIT_G = { g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000, glass: 250, glasses: 250 };
const UNITS = 'kg|gms?|grams?|g|ml|litres?|liters?|l|cups?|tbsp|tablespoons?|tsp|teaspoons?|katoris?|bowls?|glass(?:es)?|pieces?|pcs?|slices?|nos?';
const QTY_RE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNITS})?\\b`, 'i');

/**
 * Grams (or ml) of `food` described by free text such as "2 rotis", "1 katori dal", "2 tsp ghee" or "150 g paneer".
 * `assumed` is true when the amount is a typical-portion guess rather than something the text states.
 * `basis` explains the conversion in plain words.
 */
export function estimateGrams(rawText, food) {
  const text = simplifyFractions(rawText);
  const m = QTY_RE.exec(String(text || ''));
  const cooked = !food || food.ready || food.unit === 'ml';
  const piece = food?.gpp || 100;
  if (!m) {
    const word = /\b(a|an|one|two|three|half)\b/i.exec(text || '');
    const n = word ? { a: 1, an: 1, one: 1, two: 2, three: 3, half: 0.5 }[word[1].toLowerCase()] : 1;
    const g = Math.round((food?.gpp ? piece : cooked ? 150 : 100) * n);
    return { grams: g, assumed: true, basis: `typical portion assumed (${g} ${food?.unit === 'ml' ? 'ml' : 'g'})` };
  }
  const n = Math.min(parseFloat(m[1]), 5000); // ignore absurd quantities
  let unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('teaspoon')) unit = 'tsp';
  if (unit.startsWith('tablespoon')) unit = 'tbsp';
  if (unit.startsWith('katori')) unit = 'katori';
  if (!unit) {
    return food?.gpp
      ? { grams: Math.round(n * piece), assumed: false, basis: `${n} piece${n === 1 ? '' : 's'} x ${piece} g` }
      : { grams: Math.round(n * (cooked ? 150 : 100)), assumed: true, basis: `typical portion assumed (${cooked ? 150 : 100} g each)` };
  }
  if (unit === 'tsp' || unit === 'tbsp') {
    const per = (food?.spoon || [5, 15])[unit === 'tsp' ? 0 : 1];
    return { grams: Math.round(n * per * 10) / 10, assumed: false, basis: `1 ${unit} = ${per} g` };
  }
  if (unit === 'katori') {
    const per = food?.katori || (cooked ? 150 : 120);
    return { grams: Math.round(n * per), assumed: true, basis: `1 katori = about ${per} g` };
  }
  if (UNIT_G[unit]) return { grams: Math.round(n * UNIT_G[unit]), assumed: false, basis: `${n} ${unit} = ${Math.round(n * UNIT_G[unit])} g` };
  if (unit.startsWith('cup')) {
    const per = food?.unit === 'ml' ? 240 : cooked ? 180 : 150;
    return { grams: Math.round(n * per), assumed: true, basis: `1 cup = about ${per} g` };
  }
  if (unit.startsWith('bowl')) return { grams: Math.round(n * 250), assumed: true, basis: '1 bowl = about 250 g' };
  return { grams: Math.round(n * piece), assumed: !food?.gpp, basis: `${n} piece${n === 1 ? '' : 's'} x ${piece} g` }; // pieces, slices
}

export function nutritionFor(food, grams) {
  const k = grams / 100;
  const r = (v) => Math.round(v * k * 10) / 10;
  const opt = (v, digits) => (v == null ? null : digits === 0 ? Math.round(v * k) : r(v));
  return {
    kcal: Math.round(food.kcal * k), protein: r(food.protein), carbs: r(food.carbs), fat: r(food.fat), fiber: r(food.fiber),
    sodium_mg: opt(food.sodium_mg, 0), sat_fat: opt(food.sat_fat, 1), added_sugar: opt(food.added_sugar, 1)
  };
}

export function per100(food) {
  return { kcal100: food.kcal, protein100: food.protein, carbs100: food.carbs, fat100: food.fat, fiber100: food.fiber };
}

export function defaultUnitFor(food) {
  return food?.unit === 'ml' ? 'ml' : 'g';
}
