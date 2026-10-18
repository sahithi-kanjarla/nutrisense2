/**
 * Nutrition engine helpers: turns cooking notes such as "made with oats flour and wheat flour, very little oil"
 * into numbers, and sanity-checks estimates that came from the AI.
 *
 * What is calculated exactly: the table value of the food (or the recipe built from ingredient quantities),
 * plus the calories of any oil, ghee or butter the note describes, plus a flour blend for flatbreads.
 * What is NOT calculated: any other detail in the note (spices, gravy base, sugar and so on). Those are kept
 * as text only, and the result says so.
 */
import { FOOD_TABLE, FAT_SOURCES, composeRecipe, findFood, estimateGrams, nutritionFor } from './foods.js';

const r1 = (v) => Math.round(v * 10) / 10;
const byName = (name) => FOOD_TABLE.find((f) => f.name === name);

/** Prepared foods whose table value already includes typical cooking fat. Plain ready foods are listed here. */
const PLAIN_READY = new Set(['egg', 'egg white', 'cooked rice', 'cooked brown rice', 'cooked pasta', 'cooked quinoa', 'oats porridge', 'salad', 'green tea', 'chai']);
export const embedsFat = (food) => Boolean(food.recipe) || (food.ready && !PLAIN_READY.has(food.name));

// Grams of fat per 100 g of the finished food for each description.
const LEVELS = { none: 0, light: 2, regular: 5, heavy: 9, deep: 12 };

const FLOUR_WORDS = [
  ['whole wheat', 'atta'], ['wheat', 'atta'], ['atta', 'atta'], ['gehu', 'atta'],
  ['oats', 'rolled oats'], ['oat', 'rolled oats'],
  ['jowar', 'jowar flour'], ['sorghum', 'jowar flour'], ['bajra', 'bajra flour'], ['pearl millet', 'bajra flour'],
  ['ragi', 'ragi flour'], ['nachni', 'ragi flour'], ['finger millet', 'ragi flour'],
  ['besan', 'besan'], ['gram flour', 'besan'], ['chickpea flour', 'besan'],
  ['maida', 'maida'], ['refined flour', 'maida'], ['all purpose', 'maida'], ['rice flour', 'rice flour']
];

function fatType(text) {
  if (/\b(ghee|clarified butter|vanaspati|dalda)\b/.test(text)) return 'ghee';
  if (/\bbutter\b/.test(text)) return 'butter';
  return 'oil';
}

/** Parses an explicit amount of fat, such as "1 tsp ghee" or "2 tablespoons of oil". Returns grams or null. */
function explicitFat(text) {
  const num = '(\\d+(?:\\.\\d+)?|a|one|half)';
  const unit = '(tsp|teaspoons?|tbsp|tablespoons?|ml|grams?|gm|g)';
  const fat = '((?:olive |coconut |mustard |sunflower |groundnut |refined )?oil|ghee|butter|vanaspati|dalda)';
  const adj = '(?:extra |more |additional |fresh |melted |pure |desi )?';
  const forward = new RegExp(`${num}\\s*${unit}\\b\\s*(?:of\\s+)?${adj}${fat}`);
  const backward = new RegExp(`${fat}\\s*[:\\-]?\\s*${num}\\s*${unit}\\b`);
  let m = forward.exec(text);
  let amount; let u; let f;
  if (m) { [, amount, u, f] = m; } else {
    m = backward.exec(text);
    if (!m) return null;
    [, f, amount, u] = m;
  }
  const n = amount === 'a' || amount === 'one' ? 1 : amount === 'half' ? 0.5 : parseFloat(amount);
  const type = fatType(f);
  const perTsp = FAT_SOURCES[type].perTsp;
  let g;
  if (u.startsWith('tsp') || u.startsWith('teaspoon')) g = n * perTsp;
  else if (u.startsWith('tbsp') || u.startsWith('tablespoon')) g = n * perTsp * 3;
  else if (u === 'ml') g = n * (type === 'oil' ? 0.92 : 0.91);
  else g = n;
  const extra = /\b(extra|additional|more|on top|drizzl\w*|topped)\b/.test(text);
  return { type, grams: g, extra, label: `${n} ${u} ${type}${extra ? ' (extra)' : ''}` };
}

/** Reads a cooking note. Returns what can be calculated and what is only recorded. */
export function parseCooking(rawText) {
  const text = String(rawText || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const out = { fat: null, flours: null, notes: [] };
  if (!text) return out;

  const explicit = explicitFat(text);
  if (explicit) {
    out.fat = { mode: 'amount', type: explicit.type, grams: explicit.grams, extra: explicit.extra, label: explicit.label };
  } else {
    const type = fatType(text);
    let level = null;
    if (/\b(no|without|zero|free of) (oil|ghee|butter|fat)\b|oil[- ]free|dry[- ]?roast|\bsteam|\bboil|\bpoach|\bgrill/.test(text)) level = 'none';
    else if (/deep[- ]?fr(y|ied)|fried in (plenty|lots)/.test(text)) level = 'deep';
    else if (/(lots? of|a lot of|plenty of|heavy|extra|more|too much) (oil|ghee|butter)|\boily\b|dripping|swimming in/.test(text)) level = 'heavy';
    else if (/(very |a |slightly |minimal |bit of )?(little|light|minimal|less|low|small amount of|bit of|touch of) (oil|ghee|butter)|barely any (oil|ghee)|minimal oil|air[- ]?fr/.test(text)) level = 'light';
    else if (/shallow[- ]?fr|pan[- ]?fr|saut|stir[- ]?fr|tadka|tempering|\bfried\b|(with|in|using|cooked in|roasted in) (oil|ghee|butter)|\b(oil|ghee|butter)\b/.test(text)) level = 'regular';
    else if (/\bbak(e|ed|ing)\b|\broast/.test(text)) level = 'none';
    if (level) out.fat = { mode: 'level', type, per100: LEVELS[level], level };
  }

  // Flour blend for flatbreads: look for flour names and optional percentages.
  const found = [];
  for (const [word, food] of FLOUR_WORDS) {
    const m = new RegExp(`\\b${word}\\b`).exec(text);
    if (m && !found.some((f) => f.food === food)) found.push({ food, at: m.index, word });
  }
  if (found.length) {
    found.sort((a, b) => a.at - b.at);
    // "70% wheat 30% oats" (number first) or "wheat 70% oats 30%" (name first): pair each percent with its flour.
    const percents = [];
    const pctRe = /(\d+(?:\.\d+)?)\s*%/g;
    for (let pm = pctRe.exec(text); pm; pm = pctRe.exec(text)) percents.push({ at: pm.index, value: parseFloat(pm[1]) });
    const numberFirst = percents.length > 0 && percents[0].at < found[0].at;
    const pct = found.map((f, i) => {
      const lo = numberFirst ? (i > 0 ? found[i - 1].at : -1) : f.at;
      const hi = numberFirst ? f.at : (i + 1 < found.length ? found[i + 1].at : Infinity);
      const hit = percents.find((p) => p.at > lo && p.at < hi);
      return hit ? hit.value : null;
    });
    let shares;
    let assumed = false;
    if (pct.every((p) => p != null) && pct.reduce((a, b) => a + b, 0) > 0) {
      const total = pct.reduce((a, b) => a + b, 0);
      shares = pct.map((p) => p / total);
    } else {
      shares = found.map(() => 1 / found.length);
      assumed = found.length > 1;
    }
    out.flours = found.map((f, i) => ({ foodName: f.food, share: shares[i] }));
    out.floursAssumedEqual = assumed;
  }
  return out;
}

const vecOf = (food, g) => nutritionFor(food, g);

/**
 * Nutrition for `grams` of `food` described by a cooking note.
 * Returns { nutrition, detail, understood } where `detail` explains what was added or changed.
 */
export function applyCooking(food, gramsEaten, cookingText) {
  const cook = parseCooking(cookingText);
  const details = [];
  let used = false;

  // 1. Recipe dishes are recomposed from their ingredients so the flour blend and the fat can change.
  if (food.recipe) {
    const overrides = {};
    const spec = food.recipe;
    if (cook.flours && spec.flour) {
      const flours = cook.flours.map((f) => ({ food: byName(f.foodName), share: f.share })).filter((f) => f.food);
      if (flours.length) {
        overrides.flours = flours;
        used = true;
        const label = cook.flours.map((f) => `${Math.round(f.share * 100)}% ${f.foodName.replace(' flour', '').replace('rolled ', '')}`).join(', ');
        details.push(`flour blend: ${label}${cook.floursAssumedEqual ? ' (equal parts assumed)' : ''}`);
      }
    }
    if (cook.fat) {
      used = true;
      if (cook.fat.mode === 'amount' && cook.fat.extra) {
        details.push(`${cook.fat.label} on top of the usual recipe`);
      } else if (cook.fat.mode === 'amount') {
        const perItem = cook.fat.grams / gramsEaten; // fat per gram eaten
        overrides.fat = [cook.fat.type, perItem * spec.yield];
        details.push(`${cook.fat.label} for the whole portion`);
      } else {
        overrides.fat = cook.fat.per100 > 0 ? [cook.fat.type, (cook.fat.per100 * spec.yield) / 100] : null;
        details.push(cook.fat.per100 > 0 ? `${cook.fat.level} ${cook.fat.type} (about ${cook.fat.per100} g per 100 g)` : 'no added oil');
      }
    }
    const v = composeRecipe(spec, overrides);
    const k = gramsEaten / 100;
    const nutrition = { kcal: Math.round(v.kcal * k), protein: r1(v.protein * k), carbs: r1(v.carbs * k), fat: r1(v.fat * k), fiber: r1(v.fiber * k) };
    if (cook.fat?.mode === 'amount' && cook.fat.extra) {
      const src = FAT_SOURCES[cook.fat.type];
      nutrition.kcal = Math.round(nutrition.kcal + src.kcal * cook.fat.grams);
      nutrition.fat = r1(nutrition.fat + src.fat * cook.fat.grams);
    }
    return { nutrition, detail: describe(details, used, cookingText), understood: used };
  }

  // 2. Any other food: table value, plus cooking fat when it is not already included.
  let nutrition = vecOf(food, gramsEaten);
  if (cook.fat) {
    const src = FAT_SOURCES[cook.fat.type];
    let fatG = 0;
    if (cook.fat.mode === 'amount') fatG = cook.fat.grams;
    else if (!embedsFat(food)) fatG = (cook.fat.per100 * gramsEaten) / 100;
    if (fatG > 0) {
      used = true;
      nutrition = {
        kcal: Math.round(nutrition.kcal + src.kcal * fatG),
        protein: r1(nutrition.protein + src.protein * fatG),
        carbs: r1(nutrition.carbs + src.carbs * fatG),
        fat: r1(nutrition.fat + src.fat * fatG),
        fiber: nutrition.fiber
      };
      details.push(`added ${r1(fatG)} g ${cook.fat.type} (${Math.round(src.kcal * fatG)} kcal)`);
    } else if (cook.fat.mode === 'level' && embedsFat(food)) {
      details.push('this dish already includes typical cooking oil in its table value');
    }
  }
  return { nutrition, detail: describe(details, used, cookingText), understood: used };
}

function describe(details, used, cookingText) {
  if (!String(cookingText || '').trim()) return '';
  if (!used && !details.length) return 'Cooking note saved, but only oil, ghee, butter and flours change the calculation.';
  return `Includes ${details.join('; ')}.`;
}

/* ------------------------------ Checking AI estimates ------------------------------ */

/** Grams or ml when the quantity text states them explicitly (for example "150 g"), otherwise null. */
function statedGrams(quantity) {
  const m = /(\d+(?:\.\d+)?)\s*(kg|gms?|grams?|g|ml|l|litres?|liters?)\b/i.exec(String(quantity || ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'kg' || unit === 'l' || unit.startsWith('lit') ? n * 1000 : n;
}

/**
 * Sanity checks for one AI item: physically impossible values are corrected, and values far from the
 * built-in table are flagged for the user. Never throws. Returns the item with `confidence` and `check`.
 */
export function checkEstimate(item) {
  const out = { ...item };
  const notes = [];
  const g = statedGrams(item.quantity);

  if (g) {
    // 1. More than 9 kcal per gram is impossible (pure fat is about 9).
    if (out.kcal > g * 9.2) {
      out.kcal = Math.round(g * 9);
      notes.push(`calories were higher than any food can have for ${Math.round(g)} g, so they were lowered`);
      out.confidence = 'low';
    }
    // 2. Protein, carbs and fat cannot weigh more than the food itself.
    const macroG = out.protein + out.carbs + out.fat;
    if (macroG > g * 1.05) {
      const k = (g * 1.0) / macroG;
      out.protein = r1(out.protein * k); out.carbs = r1(out.carbs * k); out.fat = r1(out.fat * k);
      notes.push('nutrient weights were higher than the food weight, so they were scaled down');
      out.confidence = 'low';
    }
  }

  // 3. Compare with the built-in table when we know the food and the amount (not for custom-cooked items).
  const food = findFood(out.name, 'meal');
  if (food && !out.cooking) {
    const grams = g ?? (out.quantity ? estimateGrams(out.quantity, food).grams : null);
    if (grams) {
      const ref = nutritionFor(food, grams).kcal;
      if (ref > 30 && Math.abs(out.kcal - ref) > Math.max(60, 0.45 * ref)) {
        out.reference_kcal = ref;
        notes.push(`the built-in food table suggests about ${ref} kcal for this amount, the AI said ${out.kcal}`);
        out.confidence = 'low';
      }
    }
  }
  if (notes.length) out.check = notes.join('; ');
  return out;
}
