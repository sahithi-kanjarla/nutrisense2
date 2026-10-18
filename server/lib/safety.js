/**
 * Allergy and diet safety checks. Allergies are hard rules: anything that matches
 * is excluded from every suggestion, even when it is in the pantry.
 */

export const ALLERGENS = {
  peanuts: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'moongphali'],
  tree: ['almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pistachio', 'pistachios', 'hazelnut', 'pecan', 'badam', 'kaju', 'akhrot', 'macadamia', 'nut butter', 'mixed nuts', 'nuts', 'pesto', 'nutella', 'marzipan', 'praline', 'pine nut', 'pinenut', 'chestnut', 'brazil nut'],
  dairy: ['milk', 'paneer', 'curd', 'yogurt', 'yoghurt', 'dahi', 'ghee', 'butter', 'cheese', 'cream', 'khoa', 'khoya', 'lassi', 'buttermilk', 'chaas', 'whey', 'kheer', 'raita', 'custard', 'ice cream', 'chai', 'latte', 'malai', 'rabri', 'chhena', 'chenna', 'mawa', 'casein', 'cappuccino', 'milkshake', 'paneer'],
  gluten: ['wheat', 'atta', 'maida', 'bread', 'roti', 'chapati', 'chapatti', 'phulka', 'naan', 'paratha', 'pasta', 'spaghetti', 'macaroni', 'noodles', 'suji', 'sooji', 'semolina', 'rava', 'upma', 'oats', 'oatmeal', 'barley', 'seitan', 'couscous', 'bulgur', 'biscuit', 'biscuits', 'cookies', 'dalia', 'puri', 'poori', 'bhatura', 'samosa', 'toast', 'pav', 'pizza', 'cake', 'bun', 'vermicelli', 'seviyan', 'rye', 'flour', 'maggi', 'kulcha', 'thepla', 'cracker', 'crackers'],
  eggs: ['egg', 'eggs', 'omelette', 'omelet', 'mayonnaise', 'anda'],
  soy: ['soy', 'soya', 'tofu', 'tempeh', 'edamame', 'miso', 'nutrela', 'soybean'],
  shellfish: ['prawn', 'prawns', 'shrimp', 'crab', 'lobster', 'shellfish', 'squid', 'mussel', 'mussels', 'clam', 'oyster', 'oysters'],
  fish: ['fish', 'rohu', 'salmon', 'tuna', 'hilsa', 'sardine', 'mackerel', 'pomfret', 'anchovy', 'basa', 'surmai', 'bombil'],
  sesame: ['sesame', 'til', 'tahini', 'gingelly']
};

export const ALLERGY_LABELS = {
  peanuts: 'Peanuts', tree: 'Tree nuts', dairy: 'Dairy', gluten: 'Gluten', eggs: 'Eggs',
  soy: 'Soy', shellfish: 'Shellfish', fish: 'Fish', sesame: 'Sesame'
};

const MEAT = ['chicken', 'mutton', 'lamb', 'beef', 'pork', 'bacon', 'ham', 'sausage', 'turkey', 'duck', 'goat', 'keema', 'meat', 'meatball', 'gelatin', 'gelatine', 'steak', 'burger', 'salami', 'mince', 'liver', 'lard', 'pepperoni'];
const FISH = ALLERGENS.fish;
const SHELLFISH = ALLERGENS.shellfish;
const EGG = ALLERGENS.eggs;
const DAIRY = ALLERGENS.dairy;
const JAIN_AVOID = ['onion', 'onions', 'garlic', 'potato', 'potatoes', 'aloo', 'carrot', 'carrots', 'radish', 'beetroot', 'ginger', 'mushroom', 'mushrooms', 'sweet potato', 'turnip', 'pyaz', 'pyaaz', 'lehsun', 'lasun', 'adrak', 'gajar', 'mooli', 'shalgam', 'arbi'];

export const DIET_RULES = {
  veg: { label: 'Vegetarian', avoid: [...MEAT, ...FISH, ...SHELLFISH, 'egg', 'eggs', 'omelette', 'omelet', 'anda'] },
  egg: { label: 'Eggetarian', avoid: [...MEAT, ...FISH, ...SHELLFISH] },
  vegan: { label: 'Vegan', avoid: [...MEAT, ...FISH, ...SHELLFISH, ...EGG, ...DAIRY, 'honey', 'mayonnaise', 'lard'] },
  non: { label: 'Non-vegetarian', avoid: [] },
  pesc: { label: 'Pescatarian', avoid: MEAT },
  jain: { label: 'Jain', avoid: [...MEAT, ...FISH, ...SHELLFISH, ...EGG, ...JAIN_AVOID] }
};

// Phrases that contain an allergen word but are not that allergen. The value lists the
// allergen keys the phrase genuinely belongs to, so it stays visible for those checks.
const SAFE_PHRASES = {
  'coconut milk': [], 'oat milk': [], 'rice milk': [], 'cocoa butter': [], 'shea butter': [],
  'coconut cream': [], 'butternut': [], 'eggplant': [], 'butter beans': [], 'butterfly': [],
  'almond milk': ['tree'], 'cashew milk': ['tree'], 'almond butter': ['tree'],
  'peanut butter': ['peanuts'], 'nut butter': ['tree', 'peanuts'], 'soy milk': ['soy']
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Allow a plural suffix (roti -> rotis, mushroom -> mushrooms) but keep whole-word matching.
const wordRe = (w) => new RegExp(`(^|[^a-z])${esc(w)}(s|es)?($|[^a-z])`, 'i');

function textFor(name, allergen) {
  let t = String(name || '').toLowerCase();
  for (const [phrase, owners] of Object.entries(SAFE_PHRASES)) {
    if (owners.includes(allergen)) continue;
    t = t.replace(new RegExp(`(^|[^a-z])${esc(phrase)}(?![a-z])`, 'g'), ' ');
  }
  return t;
}

export function hit(name, words, allergen) {
  const t = textFor(name, allergen);
  for (const w of words) if (wordRe(w).test(t)) return w;
  return null;
}

/**
 * @returns {Array<{type:'allergy'|'diet'|'dislike', key:string, word:string}>}
 */
export function checkConflicts(name, { allergies = [], diet = 'non', dislikes = '' } = {}) {
  const out = [];
  for (const a of allergies) {
    const words = ALLERGENS[a] || [String(a).toLowerCase()];
    const w = hit(name, words, a);
    if (w) out.push({ type: 'allergy', key: a, word: w });
  }
  const rule = DIET_RULES[diet];
  if (rule && rule.avoid.length) {
    const w = hit(name, rule.avoid, 'diet');
    if (w) out.push({ type: 'diet', key: diet, word: w });
  }
  const dislikeList = String(dislikes || '').split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 2);
  for (const d of dislikeList) {
    if (wordRe(d).test(String(name).toLowerCase())) out.push({ type: 'dislike', key: d, word: d });
  }
  return out;
}

export const isSafe = (name, prefs) => checkConflicts(name, prefs).every((c) => c.type === 'dislike');
export const isAllowed = (name, prefs) => checkConflicts(name, prefs).length === 0;

export function describeConflict(c) {
  if (c.type === 'allergy') return `contains ${c.word} (${ALLERGY_LABELS[c.key] || c.key} allergy)`;
  if (c.type === 'diet') return `${c.word} is not part of a ${DIET_RULES[c.key]?.label.toLowerCase() || c.key} diet`;
  return `you dislike ${c.word}`;
}

export function prefsFromProfile(profile) {
  return { allergies: profile?.allergies || [], diet: profile?.diet || 'non', dislikes: profile?.dislikes || '' };
}
