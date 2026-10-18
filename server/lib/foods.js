/**
 * A small built-in food table (per 100 g or 100 ml, approximate values based on
 * common IFCT/USDA figures). It is used when an AI key is missing or the AI call
 * fails, and to give pantry items nutrition data without spending AI quota.
 */

const FOODS = [];
function add(name, aliases, kcal, protein, carbs, fat, fiber, opts = {}) {
  FOODS.push({
    name,
    aliases: [name, ...aliases],
    kcal, protein, carbs, fat, fiber,
    gpp: opts.gpp || null,        // grams per piece
    twin: opts.twin || null,      // cooked / ready version used when logging meals
    unit: opts.unit || 'g',
    ready: Boolean(opts.ready)    // already cooked or ready to eat
  });
}

// Grains and flours
add('rice', ['white rice', 'basmati rice', 'basmati', 'chawal', 'raw rice'], 360, 6.8, 79, 0.6, 1.3, { twin: 'cooked rice' });
add('brown rice', ['brown basmati'], 362, 7.5, 76, 2.7, 3.5, { twin: 'cooked brown rice' });
add('cooked rice', ['steamed rice', 'boiled rice', 'plain rice', 'jeera rice', 'rice cooked'], 130, 2.7, 28, 0.3, 0.4, { ready: true });
add('cooked brown rice', ['brown rice cooked'], 123, 2.7, 26, 1, 1.8, { ready: true });
add('atta', ['wheat flour', 'whole wheat flour', 'gehu atta'], 340, 12, 72, 1.7, 11, { twin: 'roti' });
add('maida', ['refined flour', 'all purpose flour'], 364, 10, 76, 1, 2.7);
add('roti', ['chapati', 'phulka', 'fulka', 'chapatti'], 297, 9.8, 46, 7.5, 4.9, { gpp: 40, ready: true });
add('paratha', ['aloo paratha', 'plain paratha'], 326, 7.5, 45, 13, 3, { gpp: 70, ready: true });
add('bread', ['whole wheat bread', 'brown bread', 'white bread', 'toast', 'bread slice', 'bread slices'], 250, 10, 45, 3.5, 5, { gpp: 30, ready: true });
add('rolled oats', ['oats', 'oatmeal', 'quick oats', 'steel cut oats'], 389, 13, 66, 7, 10, { twin: 'oats porridge' });
add('oats porridge', ['porridge', 'cooked oats', 'oats with milk', 'overnight oats'], 71, 3.4, 12, 1.5, 1.4, { ready: true });
add('suji', ['semolina', 'rava', 'sooji'], 360, 10, 73, 1, 3, { twin: 'upma' });
add('upma', ['rava upma', 'suji upma'], 135, 3, 21, 4.5, 2, { ready: true });
add('poha', ['flattened rice', 'beaten rice', 'poha raw'], 350, 6.6, 77, 1.2, 2, { twin: 'cooked poha' });
add('cooked poha', ['vegetable poha', 'kanda poha', 'poha cooked'], 130, 2.6, 25, 2.5, 1.5, { ready: true });
add('quinoa', [], 368, 14, 64, 6, 7, { twin: 'cooked quinoa' });
add('cooked quinoa', ['quinoa cooked'], 120, 4.4, 21, 1.9, 2.8, { ready: true });
add('pasta', ['spaghetti', 'macaroni', 'penne', 'noodles'], 371, 13, 75, 1.5, 3.2, { twin: 'cooked pasta' });
add('cooked pasta', ['pasta cooked', 'boiled pasta', 'boiled noodles'], 158, 5.8, 31, 0.9, 1.8, { ready: true });
add('besan', ['gram flour', 'chickpea flour'], 387, 22, 58, 6.7, 11, { twin: 'besan chilla' });
add('besan chilla', ['chilla', 'cheela', 'besan cheela', 'moong chilla', 'moong dal chilla'], 190, 10, 22, 6.5, 4.5, { gpp: 80, ready: true });

// Lentils and legumes
add('toor dal', ['arhar dal', 'tur dal', 'pigeon pea', 'toor', 'arhar'], 335, 22, 58, 1.5, 15, { twin: 'dal cooked' });
add('moong dal', ['mung dal', 'green gram', 'moong', 'yellow moong dal', 'split moong'], 347, 24, 59, 1.2, 16, { twin: 'dal cooked' });
add('masoor dal', ['red lentil', 'red lentils', 'masoor'], 343, 25, 59, 1, 11, { twin: 'dal cooked' });
add('chana dal', ['split chickpea', 'bengal gram dal'], 360, 21, 60, 5.6, 12, { twin: 'dal cooked' });
add('urad dal', ['black gram', 'urad'], 341, 25, 59, 1.6, 18, { twin: 'dal cooked' });
add('dal cooked', ['dal', 'daal', 'dal tadka', 'tadka dal', 'cooked dal', 'lentil soup', 'dal fry', 'sambar dal'], 116, 6.8, 19, 1.6, 4, { ready: true });
add('chickpeas', ['kabuli chana', 'chana', 'garbanzo', 'white chickpeas', 'kala chana', 'black chickpeas'], 364, 19, 61, 6, 17, { twin: 'chole cooked' });
add('roasted chana', ['roasted chickpeas', 'bhuna chana'], 364, 19, 61, 6, 17, { ready: true });
add('chole cooked', ['chole', 'chana masala', 'chickpea curry', 'cooked chickpeas', 'boiled chickpeas', 'chole masala'], 164, 8.9, 27, 2.6, 7.6, { ready: true });
add('rajma', ['kidney beans', 'red kidney beans'], 333, 24, 60, 0.8, 25, { twin: 'rajma cooked' });
add('rajma cooked', ['rajma masala', 'cooked rajma', 'rajma curry'], 127, 8.7, 22.8, 0.5, 6.4, { ready: true });
add('soya chunks', ['soy chunks', 'nutrela', 'soya nuggets', 'meal maker'], 345, 52, 33, 0.5, 13);
add('tofu', [], 76, 8, 1.9, 4.8, 0.3);

// Prepared dishes
add('idli', ['idly'], 156, 4.5, 32, 0.4, 1.5, { gpp: 40, ready: true });
add('dosa', ['plain dosa', 'masala dosa'], 168, 3.9, 29, 3.7, 1, { gpp: 80, ready: true });
add('sambar', [], 55, 2.8, 8, 1.4, 2, { ready: true });
add('curd rice', ['thayir sadam', 'dahi rice'], 118, 3.2, 19, 3, 0.3, { ready: true });
add('khichdi', ['dal khichdi', 'moong khichdi', 'khichri'], 120, 4.5, 20, 2.5, 2.5, { ready: true });
add('pulao', ['veg pulao', 'vegetable pulao', 'pulav'], 140, 3, 24, 3.5, 1.5, { ready: true });
add('biryani', ['veg biryani', 'vegetable biryani'], 170, 4, 26, 5.5, 1.5, { ready: true });
add('chicken biryani', [], 180, 9, 22, 6, 1, { ready: true });
add('samosa', [], 262, 4, 24, 17, 2, { gpp: 60, ready: true });
add('mixed vegetables', ['mixed veg', 'sabzi', 'vegetable curry', 'veg curry', 'sabji'], 70, 2.2, 9, 3, 2.5, { ready: true });
add('salad', ['green salad', 'kachumber', 'vegetable salad'], 20, 1, 4, 0.2, 1.5, { ready: true });
add('chai', ['tea', 'masala chai', 'milk tea'], 50, 1.5, 7, 1.8, 0, { unit: 'ml', ready: true });

// Dairy and eggs
add('paneer', ['cottage cheese', 'indian cottage cheese'], 296, 18, 3.4, 23, 0);
add('paneer bhurji', ['bhurji paneer'], 250, 14, 6, 19, 1.5, { ready: true });
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
add('ghee', ['clarified butter'], 900, 0, 0, 100, 0);
add('butter', [], 717, 0.9, 0.1, 81, 0);
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
add('cooking oil', ['oil', 'sunflower oil', 'mustard oil', 'olive oil', 'coconut oil', 'groundnut oil', 'refined oil'], 884, 0, 0, 100, 0, { unit: 'ml' });
add('sugar', ['cheeni', 'white sugar'], 387, 0, 100, 0, 0);
add('jaggery', ['gur'], 383, 0.4, 98, 0.1, 0);
add('honey', [], 304, 0.3, 82, 0, 0.2);
add('coconut', ['fresh coconut', 'dry coconut'], 354, 3.3, 15, 33, 9);
add('biscuits', ['biscuit', 'cookies', 'cookie', 'marie biscuit'], 450, 6, 70, 16, 2, { gpp: 10, ready: true });
add('protein powder', ['whey', 'whey protein', 'protein shake'], 400, 80, 8, 6, 0);

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

const UNIT_G = { g: 1, gm: 1, gms: 1, gram: 1, grams: 1, kg: 1000, ml: 1, l: 1000, litre: 1000, litres: 1000, liter: 1000, liters: 1000, tbsp: 15, tsp: 5, glass: 250, glasses: 250 };

function simplifyFractions(text) {
  const half = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
  return String(text || '')
    .replace(/(\d+)\s*([½¼¾])/g, (_, w, f) => String(Number(w) + half[f]))
    .replace(/[½¼¾]/g, (f) => String(half[f]))
    .replace(/(\d+)\s+(\d+)\s*\/\s*(\d+)/g, (m, w, n, d) => (Number(d) ? String(Number(w) + n / d) : m))
    .replace(/(\d+)\s*\/\s*(\d+)/g, (m, n, d) => (Number(d) ? String(Math.round((n / d) * 100) / 100) : m))
    .replace(/\bhalf\s+(?:a\s+)?(?=(?:cups?|bowls?|glass(?:es)?|tbsp|tsp)\b)/gi, '0.5 ')
    .replace(/\b(?:a|an|one)\s+(?=(?:cups?|bowls?|glass(?:es)?|tbsp|tsp)\b)/gi, '1 ');
}

export function estimateGrams(rawText, food) {
  const text = simplifyFractions(rawText);
  const m = /(\d+(?:\.\d+)?)\s*(kg|gms?|grams?|g|ml|litres?|liters?|l|cups?|tbsp|tsp|bowls?|glass(?:es)?|pieces?|pcs?|slices?|nos?)?\b/i.exec(String(text || ''));
  const cooked = !food || food.ready || food.unit === 'ml';
  const piece = food?.gpp || 100;
  if (!m) {
    const word = /\b(a|an|one|two|three|half)\b/i.exec(text || '');
    const n = word ? { a: 1, an: 1, one: 1, two: 2, three: 3, half: 0.5 }[word[1].toLowerCase()] : 1;
    return { grams: Math.round((food?.gpp ? piece : cooked ? 150 : 100) * n), assumed: true };
  }
  const n = Math.min(parseFloat(m[1]), 5000); // ignore absurd quantities
  const unit = (m[2] || '').toLowerCase();
  if (!unit) return food?.gpp ? { grams: Math.round(n * piece), assumed: false } : { grams: Math.round(n * (cooked ? 150 : 100)), assumed: true };
  if (UNIT_G[unit]) return { grams: Math.round(n * UNIT_G[unit]), assumed: false };
  if (unit.startsWith('cup')) return { grams: Math.round(n * (food?.unit === 'ml' ? 240 : cooked ? 180 : 150)), assumed: true };
  if (unit.startsWith('bowl')) return { grams: Math.round(n * 250), assumed: true };
  return { grams: Math.round(n * piece), assumed: !food?.gpp }; // pieces, slices
}

export function nutritionFor(food, grams) {
  const k = grams / 100;
  const r = (v) => Math.round(v * k * 10) / 10;
  return { kcal: Math.round(food.kcal * k), protein: r(food.protein), carbs: r(food.carbs), fat: r(food.fat), fiber: r(food.fiber) };
}

export function per100(food) {
  return { kcal100: food.kcal, protein100: food.protein, carbs100: food.carbs, fat100: food.fat, fiber100: food.fiber };
}

export function defaultUnitFor(food) {
  return food?.unit === 'ml' ? 'ml' : 'g';
}
