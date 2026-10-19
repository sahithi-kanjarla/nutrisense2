/**
 * Allergy and diet safety checks. Allergies are hard rules: anything that matches
 * is excluded from every suggestion, even when it is in the pantry.
 */
import { clinicalOf } from './limits.js';

export const ALLERGENS = {
  peanuts: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'moongphali', 'mungfali', 'mungphali', 'moongfali', 'singdana'],
  tree: ['almond', 'almonds', 'cashew', 'cashews', 'walnut', 'walnuts', 'pistachio', 'pistachios', 'hazelnut', 'pecan', 'badam', 'kaju', 'akhrot', 'macadamia', 'nut butter', 'mixed nuts', 'nuts', 'pesto', 'nutella', 'marzipan', 'praline', 'pine nut', 'pinenut', 'chestnut', 'brazil nut', 'pista', 'chironji', 'charoli', 'badaam', 'cashew nut'],
  dairy: ['milk', 'paneer', 'curd', 'yogurt', 'yoghurt', 'dahi', 'ghee', 'butter', 'cheese', 'cream', 'khoa', 'khoya', 'lassi', 'buttermilk', 'chaas', 'whey', 'kheer', 'raita', 'custard', 'ice cream', 'chai', 'latte', 'malai', 'rabri', 'chhena', 'chenna', 'mawa', 'casein', 'cappuccino', 'milkshake', 'doodh', 'makkhan', 'makhan', 'tuppa', 'lactose', 'bournvita', 'horlicks', 'white sauce', 'bechamel', 'basundi', 'shrikhand', 'peda', 'barfi', 'burfi', 'rasmalai', 'mishti doi', 'condensed milk', 'naan'],
  gluten: ['wheat', 'atta', 'maida', 'bread', 'roti', 'chapati', 'chapatti', 'phulka', 'naan', 'paratha', 'pasta', 'spaghetti', 'macaroni', 'noodles', 'suji', 'sooji', 'semolina', 'rava', 'upma', 'oats', 'oatmeal', 'barley', 'seitan', 'couscous', 'bulgur', 'biscuit', 'biscuits', 'cookies', 'dalia', 'puri', 'poori', 'bhatura', 'samosa', 'toast', 'pav', 'pizza', 'cake', 'bun', 'vermicelli', 'seviyan', 'rye', 'flour', 'maggi', 'kulcha', 'thepla', 'cracker', 'crackers', 'gehun', 'daliya', 'soy sauce', 'malt', 'worcestershire'],
  eggs: ['egg', 'eggs', 'omelette', 'omelet', 'mayonnaise', 'mayo', 'anda', 'aioli'],
  soy: ['soy', 'soya', 'tofu', 'tempeh', 'edamame', 'miso', 'nutrela', 'soybean', 'shoyu', 'tamari'],
  shellfish: ['prawn', 'prawns', 'shrimp', 'crab', 'lobster', 'shellfish', 'squid', 'mussel', 'mussels', 'clam', 'oyster', 'oysters', 'jhinga', 'kekda', 'kolambi'],
  fish: ['fish', 'rohu', 'salmon', 'tuna', 'hilsa', 'sardine', 'mackerel', 'pomfret', 'anchovy', 'basa', 'surmai', 'bombil', 'machli', 'machhi', 'machhli', 'maach', 'worcestershire', 'bombay duck'],
  sesame: ['sesame', 'til', 'tahini', 'gingelly', 'tilkut', 'hummus', 'gajak', 'revdi']
};

export const ALLERGY_LABELS = {
  peanuts: 'Peanuts', tree: 'Tree nuts', dairy: 'Dairy', gluten: 'Gluten', eggs: 'Eggs',
  soy: 'Soy', shellfish: 'Shellfish', fish: 'Fish', sesame: 'Sesame'
};

const MEAT = ['chicken', 'mutton', 'lamb', 'beef', 'pork', 'bacon', 'ham', 'sausage', 'turkey', 'duck', 'goat', 'keema', 'meat', 'meatball', 'gelatin', 'gelatine', 'steak', 'burger', 'salami', 'mince', 'liver', 'lard', 'pepperoni', 'gosht', 'ghosht', 'murgh', 'murg', 'kheema', 'bakra', 'rogan josh'];
const FISH = ALLERGENS.fish;
const SHELLFISH = ALLERGENS.shellfish;
const EGG = ALLERGENS.eggs;
const DAIRY = ALLERGENS.dairy;
const JAIN_AVOID = ['onion', 'onions', 'garlic', 'potato', 'potatoes', 'aloo', 'carrot', 'carrots', 'radish', 'beetroot', 'ginger', 'mushroom', 'mushrooms', 'sweet potato', 'turnip', 'pyaz', 'pyaaz', 'lehsun', 'lasun', 'adrak', 'gajar', 'mooli', 'shalgam', 'arbi', 'shakarkandi', 'shakarkand'];

export const DIET_RULES = {
  veg: { label: 'Vegetarian', avoid: [...MEAT, ...FISH, ...SHELLFISH, 'egg', 'eggs', 'omelette', 'omelet', 'anda'] },
  egg: { label: 'Eggetarian', avoid: [...MEAT, ...FISH, ...SHELLFISH] },
  vegan: { label: 'Vegan', avoid: [...MEAT, ...FISH, ...SHELLFISH, ...EGG, ...DAIRY, 'honey', 'shahad', 'mayonnaise', 'lard'] },
  non: { label: 'Non-vegetarian', avoid: [] },
  pesc: { label: 'Pescatarian', avoid: MEAT },
  jain: { label: 'Jain', avoid: [...MEAT, ...FISH, ...SHELLFISH, ...EGG, ...JAIN_AVOID] }
};

// Phrases that contain an allergen or diet word but are not that thing. The value lists the keys the phrase
// genuinely belongs to, so it stays visible for those checks. Keys are allergen groups ("dairy"), or
// "diet:<rule>" for an eating pattern. A phrase with no owners is harmless everywhere.
const SAFE_PHRASES = {
  'coconut milk': [], 'oat milk': [], 'rice milk': [], 'cocoa butter': [], 'shea butter': [],
  'coconut cream': [], 'butternut': [], 'eggplant': [], 'butter beans': [], 'butterfly': [],
  'almond milk': ['tree'], 'cashew milk': ['tree'], 'almond butter': ['tree'],
  'peanut butter': ['peanuts'], 'nut butter': ['tree', 'peanuts'], 'soy milk': ['soy'],
  // Goat milk products are dairy, but they are not meat.
  'goat milk': ['dairy', 'diet:vegan'], 'goat cheese': ['dairy', 'diet:vegan'], 'goat curd': ['dairy', 'diet:vegan'],
  'goat yogurt': ['dairy', 'diet:vegan'], 'goat yoghurt': ['dairy', 'diet:vegan'], 'goat butter': ['dairy', 'diet:vegan'],
  // Plant-based substitutes named after meat.
  'veggie burger': [], 'veg burger': [], 'vegetable burger': [], 'bean burger': [], 'plant-based burger': [],
  'soya mince': ['soy'], 'soy mince': ['soy'], 'soya keema': ['soy'], 'cauliflower steak': [],
  'plant-based meat': [], 'plant based meat': [], 'mock meat': [], 'mock chicken': [],
  'vegetarian sausage': [], 'veg sausage': [], 'vegan sausage': [], 'vegan bacon': [], 'vegetarian ham': []
};

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Allow a plural suffix (roti -> rotis, mushroom -> mushrooms) but keep whole-word matching.
const wordRe = (w) => new RegExp(`(^|[^a-z])${esc(w)}(s|es)?($|[^a-z])`, 'i');

function textFor(name, key) {
  let t = String(name || '').toLowerCase();
  for (const [phrase, owners] of Object.entries(SAFE_PHRASES)) {
    if (owners.includes(key)) continue;
    t = t.replace(new RegExp(`(^|[^a-z])${esc(phrase)}(?![a-z])`, 'g'), ' ');
  }
  return t;
}

/**
 * Removes "X-free", "no X", "without X", "free of X" and "meatless" so that a sentence such as "this has no
 * dairy" is not read as containing the thing it rules out. It is used on text written by the AI and on diet
 * rules. A food name never gets this for an allergy, so "gluten-free bread" is still flagged for a gluten
 * allergy (a label cannot be trusted with an allergy).
 */
const NEGATION = /(?:\b(?:no|without|free of|free from|zero)\s+(?:added\s+|any\s+)?[a-z]+(?:(?:,\s*|\s+(?:or|and|nor)\s+)(?:added\s+|any\s+)?[a-z]+){0,2})|(?:[a-z]+[- ]free\b)|(?:\b(?:meat|egg)less\b)/g;
const stripNegated = (t) => t.replace(NEGATION, ' ');

export function hit(name, words, key, { prose = false } = {}) {
  let t = textFor(name, key);
  if (prose || key.startsWith('diet:')) t = stripNegated(t);
  for (const w of words) if (wordRe(w).test(t)) return w;
  return null;
}

/* ------------------------------ Free-text allergies ------------------------------ */

// What people actually type, mapped to the groups above. Unknown words still match as themselves.
const ALLERGY_ALIASES = {
  milk: ['dairy'], lactose: ['dairy'], 'milk protein': ['dairy'], casein: ['dairy'], dairy: ['dairy'],
  wheat: ['gluten'], gluten: ['gluten'], celiac: ['gluten'], coeliac: ['gluten'],
  nut: ['tree', 'peanuts'], nuts: ['tree', 'peanuts'], 'tree nut': ['tree'], 'tree nuts': ['tree'], peanut: ['peanuts'], groundnut: ['peanuts'],
  egg: ['eggs'], eggs: ['eggs'], soya: ['soy'], soybean: ['soy'], seafood: ['fish', 'shellfish'], prawn: ['shellfish'], shrimp: ['shellfish'],
  crustacean: ['shellfish'], crustaceans: ['shellfish'], til: ['sesame']
};

/** The words to look for when the user lists `allergy`. `known` is false when it can only be matched as typed. */
export function allergyWords(allergy) {
  const raw = String(allergy || '').toLowerCase().trim();
  if (ALLERGENS[raw]) return { words: ALLERGENS[raw], known: true };
  const term = raw.replace(/\b(allergy|allergies|allergic|intolerance|intolerant|sensitivity|to|free|avoid)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const groups = ALLERGY_ALIASES[term] || ALLERGY_ALIASES[term.replace(/s$/, '')];
  if (groups) return { words: [...new Set([...groups.flatMap((g) => ALLERGENS[g]), term])], known: true };
  return { words: term ? [term] : [], known: false };
}

/** Allergies the app can only match by the exact word. Shown to the user so they know the limit. */
export const unmappedAllergies = (list) => (list || []).filter((a) => !allergyWords(a).known);

/* ------------------------------ Unsafe advice ------------------------------ */

const PROTEIN_PUSH = /\b(high[- ]protein|extra protein|more protein|boost (?:your )?protein|protein[- ]rich|protein (?:powder|shake|supplement|bar)s?|whey|creatine)\b/i;
const FLUID_PUSH = /\b(drink (?:more|plenty of|lots of|at least \d+)[a-z ]{0,12}(?:water|fluids?)|flush(?:ing)? (?:out|your)|stay (?:well )?hydrated|\d+(?:\.\d+)? ?(?:glasses|litres|liters|l) of water)\b/i;
const SALT_SUB = /\b(salt substitute|lite salt|low[- ]sodium salt|potassium chloride|lo[- ]?salt|sendha namak|rock salt|himalayan)\b/i;
const POTASSIUM_PUSH = /\b(potassium[- ]rich|high[- ]potassium|potassium supplement|electrolyte (?:drink|powder|tablet)s?|coconut water)\b/i;
const CRASH = /\b(crash diet|detox|(?:juice|colon|body|liver|kidney) ?cleanse|juice fast|water fast|(?:prolonged|extended|dry) fast(?:ing)?|starv(?:e|ing)|skip(?:ping)? (?:a |your )?(?:meal|meals|breakfast|lunch|dinner)|very low[- ]calorie)\b/i;
const PREG_UNSAFE = /\b(alcohol|wine|beer|whisky|whiskey|rum|vodka|raw egg|undercooked|unpasteuri[sz]ed|raw papaya|unripe papaya|raw fish|sushi|swordfish|king mackerel|shark|raw sprouts)\b/i;

// Advice that tells the reader NOT to do the unsafe thing ("avoid alcohol", "never skip meals") is good advice.
const WARNED_AGAINST = /(?:don'?t|do not|never|avoid(?:ing)?|not|no need to|without|instead of|rather than|stop|skip the|steer clear of|limit)\s+(?:\w+\s+){0,2}$/;

/** Unsafe advice for this person, by condition. */
function adviceFor(text, { conditions = [] } = {}) {
  const t = stripNegated(String(text || '').toLowerCase());
  const out = [];
  const add = (key, re, why) => {
    for (const m of t.matchAll(new RegExp(re.source, 'gi'))) {
      if (WARNED_AGAINST.test(t.slice(Math.max(0, m.index - 32), m.index))) continue;
      out.push({ type: 'advice', key, word: m[0], reason: why });
      return;
    }
  };
  add('crash', CRASH, 'crash diets, detoxes, fasting and skipping meals are not advised');
  if (conditions.includes('clin')) {
    add('clin', PROTEIN_PUSH, 'extra protein and protein supplements need your care team\'s approval');
    add('clin', FLUID_PUSH, 'fluid advice has to come from your care team');
    add('clin', SALT_SUB, 'salt substitutes and rock salt are not a safe swap without your care team');
    add('clin', POTASSIUM_PUSH, 'potassium needs your care team\'s guidance');
  }
  if (conditions.includes('preg')) add('preg', PREG_UNSAFE, 'not advised in pregnancy or while breastfeeding');
  return out;
}

/**
 * @returns {Array<{type:'allergy'|'diet'|'dislike'|'advice', key:string, word:string, reason?:string}>}
 * `prose: true` is for sentences written by the AI. `conditions` turns on the condition-specific advice checks.
 */
export function checkConflicts(name, { allergies = [], diet = 'non', dislikes = '', conditions = [] } = {}, { prose = false } = {}) {
  const out = [];
  for (const a of allergies) {
    const { words } = allergyWords(a);
    const w = hit(name, words, ALLERGENS[a] ? a : String(a).toLowerCase(), { prose });
    if (w) out.push({ type: 'allergy', key: a, word: w });
  }
  const rule = DIET_RULES[diet];
  if (rule && rule.avoid.length) {
    const w = hit(name, rule.avoid, `diet:${diet}`, { prose });
    if (w) out.push({ type: 'diet', key: diet, word: w });
  }
  const dislikeList = String(dislikes || '').split(/[,;\n]/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 2);
  for (const d of dislikeList) {
    if (wordRe(d).test(String(name).toLowerCase())) out.push({ type: 'dislike', key: d, word: d });
  }
  out.push(...adviceFor(name, { conditions }));
  return out;
}

export const isSafe = (name, prefs) => checkConflicts(name, prefs).every((c) => c.type === 'dislike');
export const isAllowed = (name, prefs) => checkConflicts(name, prefs).length === 0;

/** Text written by the AI (replies, steps, review bullets): negations are understood and dislikes are ignored. */
export const unsafeIn = (text, prefs) => checkConflicts(text, prefs, { prose: true }).filter((c) => c.type !== 'dislike');

export function describeConflict(c) {
  if (c.type === 'allergy') return `contains ${c.word} (${ALLERGY_LABELS[c.key] || c.key} allergy)`;
  if (c.type === 'diet') return `${c.word} is not part of a ${DIET_RULES[c.key]?.label.toLowerCase() || c.key} diet`;
  if (c.type === 'advice') return c.reason;
  return `you dislike ${c.word}`;
}

export function prefsFromProfile(profile) {
  return { allergies: profile?.allergies || [], diet: profile?.diet || 'non', dislikes: profile?.dislikes || '', conditions: profile?.conditions || [], clinical: clinicalOf(profile) };
}

/* ------------------------------ What the user types in chat ------------------------------ */

// Messages that suggest disordered eating or a dangerous plan get a fixed, caring reply that points to a
// professional, instead of an AI answer. This is a safety net, not a diagnosis.
const RISK = [
  /\b(starv(?:e|ing) myself|stop eating|not eat(?:ing)? (?:at all|for (?:days|a week))|eat nothing|barely eat)\b/i,
  /\b(purg(?:e|ing)|make myself (?:throw up|vomit|sick)|throw(?:ing)? up (?:after|my food)|laxatives? (?:to|for) (?:lose|burn)|binge and)\b/i,
  /\b(anorexi[ac]|bulimi[ac]|eating disorder)\b/i,
  /\b(?:only|just|under|below|less than|max(?:imum)?)(?: (?:eat|have|eating|consume|get))? ?([1-9][0-9]{0,3}|[1-9],[0-9]{3}) ?(?:kcal|cal|calories)\b/i,
  /\b(?:hate|disgusted by) my (?:body|self)\b/i,
  /\b(?:lose|drop) \d{2,} ?(?:kg|kgs|kilos|pounds|lbs) in (?:a|one|1|two|2) (?:week|weeks)\b/i
];
const CAL_LIMIT = 1000; // a stated daily total under this is a worrying plan; "only 3000 calories" is not

export function screenMessage(text) {
  const t = String(text || '');
  for (const re of RISK) {
    const m = t.match(re);
    if (!m) continue;
    if (/kcal|cal/i.test(m[0])) {
      const n = Number(String(m[1] || '').replace(/,/g, ''));
      if (n >= CAL_LIMIT) continue;
    }
    return true;
  }
  return false;
}

export const SUPPORT_REPLY = 'I am not able to help with eating very little or losing weight very quickly, because it can harm your health. If food or your body is feeling hard right now, please talk to a doctor, a registered dietitian or a counsellor. In India, the Tele-MANAS helpline (14416) is free and open 24 hours. If you are in danger, call your local emergency number. I am glad to help with balanced, filling meals whenever you are ready.';
