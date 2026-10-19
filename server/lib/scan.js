/**
 * Pantry scanner: turns what an AI read off package photos into a product the user can review, and checks the
 * product the user finally confirms.
 *
 * Rules that hold everywhere in this file:
 *  - Nothing the AI says is trusted. `readProduct(raw, { strict: false })` cleans it and flags what looks wrong;
 *    `readProduct(raw, { strict: true })` runs the same checks on the user's confirmation and refuses bad values.
 *  - A value that is missing stays null. Zero is kept only when a number was actually given.
 *  - Label values are kept exactly as printed (`label`), with their unit and basis. Per 100 g / 100 ml values are
 *    calculated only when the basis and serving size make that exact; otherwise they stay null.
 *  - Allergens are what the label declares. Not seeing an allergen never means a product is safe.
 */
import { bad } from './http.js';
import { isDate } from './dates.js';
import { normalize } from './foods.js';
import { SODIUM_MG_PER_G_SALT } from './food-nutrients.js';
import { checkConflicts } from './safety.js';

export const MAX_IMAGES = 4;
export const MAX_IMAGE_CHARS = 3_500_000; // base64 characters per image (the browser resizes photos first)
export const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
export const EXPIRY_KINDS = ['use_by', 'best_before', 'expiry', 'unknown'];
export const BASES = ['serving', '100g', '100ml'];
export const PACK_UNITS = ['g', 'kg', 'ml', 'l', 'pcs'];

const clean = (v, max) => String(v ?? '').replace(/[<>\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/* ------------------------------ Images ------------------------------ */

/** Checks the list of photos in a scan request. Returns [{ mime, data }]. */
export function readImages(list) {
  if (!Array.isArray(list) || !list.length) throw bad('Add at least one photo of the package.');
  if (list.length > MAX_IMAGES) throw bad(`Use at most ${MAX_IMAGES} photos of one product.`);
  return list.map((img, i) => {
    const mime = String(img?.mime || '');
    const data = String(img?.image ?? img?.data ?? '').replace(/^data:[^,]+,/, '');
    if (!IMAGE_MIME.includes(mime)) throw bad(`Photo ${i + 1}: please use a JPEG, PNG or WebP photo.`);
    if (!data) throw bad(`Photo ${i + 1} is empty.`);
    if (data.length > MAX_IMAGE_CHARS) throw bad(`Photo ${i + 1} is too large. Please try a smaller one.`);
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw bad(`Photo ${i + 1} could not be read.`);
    return { mime, data };
  });
}

/* ------------------------------ Dates printed on packages ------------------------------ */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const monthNo = (s) => MONTHS[String(s).toLowerCase().slice(0, s.toLowerCase().startsWith('sept') ? 4 : 3)] || 0;
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fullYear = (y) => (y < 100 ? 2000 + y : y);
const ymd = (y, m, d) => { const s = `${y}-${pad(m)}-${pad(d)}`; return isDate(s) ? s : null; };

/** What kind of date a printed label text is, from words such as "use by" or "best before". */
export function kindFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/use\s*-?\s*by|\bubd?\b|consume\s+by|safe\s+until/.test(t)) return 'use_by';
  if (/best\s*(before|by|if used by)|\bbbe?\b|\bbb\s*date|better\s+before/.test(t)) return 'best_before';
  if (/\bexp(iry|ires|\.)?\b|expiration/.test(t)) return 'expiry';
  return 'unknown';
}

/**
 * Reads a date exactly as printed. Returns { date, ambiguous, note }.
 * `ambiguous` is true whenever the text allows more than one reading (03/04/2026 could be 3 April or 4 March) or
 * only part of a date is printed; the person must then confirm the date. Never guesses a date that is not printed.
 */
export function parseLabelDate(text) {
  const original = String(text || '').trim();
  if (!original) return { date: null, ambiguous: false, note: '' };
  const t = original.toLowerCase()
    .replace(/\b(use\s*-?\s*by|best\s*(before|by)|better\s+before|expiry|expires|expiration|exp|bbe?|bb|mfd?|mfg|pkd|packed|manufactured|date|on|end|of)\b\.?/g, ' ')
    .replace(/[:,]/g, ' ').replace(/\s+/g, ' ').trim();
  let m;
  if ((m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) {
    const date = ymd(+m[1], +m[2], +m[3]);
    return date ? { date, ambiguous: false, note: '' } : { date: null, ambiguous: true, note: `"${original}" is not a real date.` };
  }
  if ((m = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4}|\d{2})$/.exec(t))) {
    const a = +m[1]; const b = +m[2]; const y = fullYear(+m[3]);
    if (a > 12 && b <= 12) { const date = ymd(y, b, a); return date ? { date, ambiguous: false, note: '' } : { date: null, ambiguous: true, note: `"${original}" is not a real date.` }; }
    if (b > 12 && a <= 12) { const date = ymd(y, a, b); return date ? { date, ambiguous: false, note: '' } : { date: null, ambiguous: true, note: `"${original}" is not a real date.` }; }
    if (a === b) { const date = ymd(y, a, b); return date ? { date, ambiguous: false, note: '' } : { date: null, ambiguous: true, note: `"${original}" is not a real date.` }; }
    if (a <= 12 && b <= 12) {
      const asDayFirst = ymd(y, b, a);
      return { date: asDayFirst, ambiguous: true, note: `"${original}" could be ${a}/${b} as day/month or month/day. Please check the date.` };
    }
    return { date: null, ambiguous: true, note: `"${original}" is not a real date.` };
  }
  if ((m = /^(\d{1,2})[-/. ]?([a-z]{3,9})[-/. ,]*(\d{4}|\d{2})$/.exec(t)) && monthNo(m[2])) {
    const date = ymd(fullYear(+m[3]), monthNo(m[2]), +m[1]);
    return date ? { date, ambiguous: false, note: '' } : { date: null, ambiguous: true, note: `"${original}" is not a real date.` };
  }
  if ((m = /^([a-z]{3,9})[-/. ]?(\d{1,2})[-/. ,]+(\d{4})$/.exec(t)) && monthNo(m[1])) {
    const date = ymd(+m[3], monthNo(m[1]), +m[2]);
    return date ? { date, ambiguous: false, note: '' } : { date: null, ambiguous: true, note: `"${original}" is not a real date.` };
  }
  // Month and year only: the day is not printed, so the last day of the month is offered and must be confirmed.
  let month = 0; let year = 0;
  if ((m = /^([a-z]{3,9})[-/. ]?(\d{4}|\d{2})$/.exec(t)) && monthNo(m[1])) { month = monthNo(m[1]); year = fullYear(+m[2]); }
  else if ((m = /^(\d{1,2})[-/. ](\d{4})$/.exec(t))) { month = +m[1]; year = +m[2]; }
  else if ((m = /^(\d{1,2})[-/. ](\d{2})$/.exec(t))) { month = +m[1]; year = fullYear(+m[2]); }
  if (month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
    return { date: ymd(year, month, lastDay(year, month)), ambiguous: true, note: `Only the month and year are printed ("${original}"). The last day of the month is shown; please confirm.` };
  }
  if (/\d+\s*(months?|days?|years?|weeks?)/.test(t)) {
    return { date: null, ambiguous: true, note: `"${original}" is a shelf life, not a date. Enter the date once you know when it was packed.` };
  }
  return { date: null, ambiguous: true, note: `The date "${original}" could not be read. Please enter it yourself or leave it blank.` };
}

/* ------------------------------ Numbers ------------------------------ */

// Largest believable label value for each nutrient, per 100 g/ml and per serving.
const CAPS = {
  energy_kcal: [900, 3000], energy_kj: [3800, 12500], protein_g: [100, 200], carbs_g: [100, 300], fat_g: [100, 200],
  fiber_g: [100, 100], sugar_g: [100, 300], sat_fat_g: [100, 200], sodium_mg: [40000, 40000], salt_g: [100, 100]
};
const NUTRIENT_KEYS = Object.keys(CAPS);

/** A number from the AI or the user, or null if it is missing. Zero is kept as zero. */
function numberOrNull(v, { max, field, strict, notes }) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : (/^\s*-?\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    if (strict) throw bad(`${field} is not a believable number.`);
    notes.push(`${field}: "${clean(v, 20)}" was not accepted, so it is left blank.`);
    return null;
  }
  return Math.round(n * 100) / 100;
}

/* ------------------------------ The product ------------------------------ */

/**
 * Cleans a product from the AI (strict = false) or from the person's confirmation (strict = true).
 * Returns { product, notes } where `notes` explains anything dropped or flagged.
 *   product = {
 *     name, brand, category, package: { size, unit } | null,
 *     expiry: { text, kind, date, ambiguous, note }, mfg: { text, date, ambiguous, note },
 *     ingredients, allergens: [string], may_contain: [string],
 *     nutrition: { basis, serving_size, serving_unit, values: { energy_kcal, ..., salt_g } } | null
 *   }
 */
export function readProduct(raw, { strict = false } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const notes = [];
  const text = (v, max, field) => {
    const s = clean(v, max + 1);
    if (s.length > max) { if (strict) throw bad(`${field} is too long.`); notes.push(`${field} was too long and was cut short.`); return s.slice(0, max); }
    return s || null;
  };

  const product = {
    name: text(r.name, 80, 'Product name'),
    brand: text(r.brand, 60, 'Brand'),
    category: text(r.category, 40, 'Category'),
    package: null, expiry: null, mfg: null, ingredients: text(r.ingredients, 1500, 'Ingredients'),
    allergens: [], may_contain: [], nutrition: null
  };

  // Package size
  const pk = r.package && typeof r.package === 'object' ? r.package : {};
  const size = numberOrNull(pk.size, { max: 1_000_000, field: 'Package size', strict, notes });
  if (size !== null || pk.unit) {
    const unit = String(pk.unit || '').toLowerCase().replace(/^(gm|gms|gram|grams)$/, 'g').replace(/^(litre|litres|liter|liters)$/, 'l').replace(/^(pc|pcs|piece|pieces)$/, 'pcs');
    if (size !== null && size > 0 && PACK_UNITS.includes(unit)) product.package = { size, unit };
    else if (size !== null || pk.unit) {
      if (strict) throw bad('Package size needs a number above zero and a unit of g, kg, ml, l or pcs.');
      notes.push('The package size could not be read as a number with a unit, so it is left blank.');
    }
  }

  // Dates. The printed text is kept; the date is worked out here, never taken on trust from the AI.
  const ex = r.expiry && typeof r.expiry === 'object' ? r.expiry : {};
  const exText = text(ex.text, 60, 'Printed expiry text');
  let exKind = EXPIRY_KINDS.includes(ex.kind) ? ex.kind : null;
  if (ex.kind && !exKind) { if (strict) throw bad('Expiry type must be use by, best before or expiry.'); notes.push('The type of expiry date was not recognised.'); }
  if (!exKind || exKind === 'unknown') exKind = kindFromText(exText) !== 'unknown' ? kindFromText(exText) : exKind || 'unknown';
  if (exText || ex.date) {
    let date = null; let ambiguous = false; let note = '';
    if (strict) {
      // The person's confirmation carries a date they typed or accepted; it must be a real date.
      if (ex.date !== undefined && ex.date !== null && ex.date !== '') { if (!isDate(ex.date)) throw bad('Expiry date must look like 2026-10-31.'); date = ex.date; }
      const printed = exText ? parseLabelDate(exText) : null;
      // Printed text that allows more than one reading, or that disagrees with the date, needs an explicit confirmation.
      ambiguous = Boolean(printed && (printed.ambiguous || (date && printed.date && printed.date !== date)));
      note = printed?.note || '';
    } else {
      const parsed = parseLabelDate(exText || '');
      ({ date, ambiguous, note } = parsed);
    }
    product.expiry = { text: exText, kind: exKind, date, ambiguous, note };
  }
  const mf = r.mfg && typeof r.mfg === 'object' ? r.mfg : {};
  const mfText = text(mf.text, 60, 'Printed manufacturing text');
  if (mfText || mf.date) {
    let date = null; let ambiguous = false; let note = '';
    if (strict) {
      if (mf.date !== undefined && mf.date !== null && mf.date !== '') { if (!isDate(mf.date)) throw bad('Manufacturing date must look like 2026-04-30.'); date = mf.date; }
    } else {
      ({ date, ambiguous, note } = parseLabelDate(mfText || ''));
      if (ambiguous) date = null; // only a date that is clearly printed is offered for the manufacturing date
    }
    product.mfg = { text: mfText, date, ambiguous, note };
  }
  if (product.expiry?.date && product.mfg?.date && product.expiry.date < product.mfg.date) {
    if (strict) throw bad('The expiry date is earlier than the manufacturing date.');
    notes.push('The expiry date is earlier than the manufacturing date. Please check both.');
    product.expiry.ambiguous = true;
  }

  // Ingredients and declared allergens (kept as printed; never used to claim a product is safe)
  const list = (v, field) => {
    const arr = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,;]/) : [];
    if (arr.length > 30) { if (strict) throw bad(`${field} has too many entries.`); notes.push(`${field} had too many entries; the first 30 are kept.`); }
    return [...new Set(arr.slice(0, 30).map((a) => clean(a, 40).toLowerCase()).filter(Boolean))];
  };
  product.allergens = list(r.allergens, 'Allergens');
  product.may_contain = list(r.may_contain, 'May-contain list');

  // Nutrition, exactly as printed
  const nu = r.nutrition && typeof r.nutrition === 'object' ? r.nutrition : null;
  if (nu) {
    const basis = BASES.includes(nu.basis) ? nu.basis : null;
    if (nu.basis && !basis) { if (strict) throw bad('Nutrition basis must be per serving, per 100 g or per 100 ml.'); notes.push('The nutrition basis was not recognised.'); }
    let servingSize = numberOrNull(nu.serving_size, { max: 5000, field: 'Serving size', strict, notes });
    let servingUnit = nu.serving_unit === 'g' || nu.serving_unit === 'ml' ? nu.serving_unit : null;
    if (servingSize !== null && servingSize <= 0) { servingSize = null; if (strict) throw bad('Serving size must be above zero.'); notes.push('Serving size must be above zero.'); }
    if (nu.serving_unit && !servingUnit) { if (strict) throw bad('Serving unit must be g or ml.'); notes.push('The serving unit was not g or ml, so the serving size is left blank.'); servingSize = null; }
    if (servingSize !== null && !servingUnit) { servingSize = null; if (strict) throw bad('Serving size needs a unit of g or ml.'); notes.push('The serving size had no unit, so it is left blank.'); }
    const rawValues = nu.values && typeof nu.values === 'object' ? nu.values : {};
    const values = {};
    for (const k of NUTRIENT_KEYS) {
      values[k] = numberOrNull(rawValues[k], { max: CAPS[k][basis === 'serving' ? 1 : 0], field: k.replace(/_/g, ' '), strict, notes });
    }
    // Numbers printed in other units: derive only what is exact, and say so.
    if (values.energy_kcal === null && values.energy_kj !== null) { values.energy_kcal = Math.round(values.energy_kj / 4.184); notes.push('Calories were worked out from kilojoules.'); }
    if (values.sodium_mg === null && values.salt_g !== null) { values.sodium_mg = Math.round(values.salt_g * SODIUM_MG_PER_G_SALT); notes.push('Sodium was worked out from the salt on the label.'); }
    const given = NUTRIENT_KEYS.filter((k) => values[k] !== null);
    // A panel of nothing but zeros is far more likely an unreadable label than a real one.
    if (!strict && given.length >= 3 && given.every((k) => values[k] === 0)) {
      NUTRIENT_KEYS.forEach((k) => { values[k] = null; });
      notes.push('Every nutrition value came back as 0, which usually means the label could not be read. Please enter the values yourself.');
    }
    if (given.length || basis) {
      const nutrition = { basis, serving_size: servingSize, serving_unit: servingUnit, values };
      const prob = nutritionProblems(nutrition);
      if (strict && prob.hard.length) throw bad(prob.hard[0]);
      notes.push(...prob.hard, ...prob.soft);
      product.nutrition = nutrition;
    }
  }
  return { product, notes };
}

/** Internal consistency checks on label values. `hard` ones are impossible; `soft` ones are only suspicious. */
function nutritionProblems(n) {
  const v = n.values;
  const hard = []; const soft = [];
  const per100 = n.basis !== 'serving';
  if (per100 && v.protein_g !== null && v.carbs_g !== null && v.fat_g !== null && v.protein_g + v.carbs_g + v.fat_g > 100.5) hard.push('Protein, carbs and fat add up to more than 100 g per 100 g.');
  if (v.sat_fat_g !== null && v.fat_g !== null && v.sat_fat_g > v.fat_g + 0.2) hard.push('Saturated fat cannot be more than total fat.');
  if (v.sugar_g !== null && v.carbs_g !== null && v.sugar_g > v.carbs_g + 0.2) hard.push('Sugar cannot be more than total carbs.');
  if (v.fiber_g !== null && v.carbs_g !== null && v.fiber_g > v.carbs_g + 0.2) soft.push('Fibre is more than total carbs. Please check the label.');
  if (v.energy_kcal !== null && v.protein_g !== null && v.carbs_g !== null && v.fat_g !== null) {
    const fromMacros = v.protein_g * 4 + v.carbs_g * 4 + v.fat_g * 9 + (v.fiber_g || 0) * 2;
    if (Math.abs(v.energy_kcal - fromMacros) > Math.max(60, fromMacros * 0.4)) soft.push('The calories do not match the protein, carbs and fat. Please check them against the label.');
  }
  return { hard, soft };
}

/**
 * Per 100 g / 100 ml values for the pantry columns, or nulls when they cannot be worked out exactly.
 * `packUnit` is the unit the pantry stores the item in (g, ml or pcs). A basis in grams cannot be applied to a
 * product stored in ml (and the reverse) because the density is unknown.
 */
export function toPer100(nutrition, packUnit) {
  const empty = { kcal100: null, protein100: null, carbs100: null, fat100: null, fiber100: null, sodium100: null, sugar100: null, sat_fat100: null, note: '' };
  if (!nutrition || !nutrition.basis) return { ...empty, note: nutrition ? 'The nutrition basis is not known, so the values are kept as printed only.' : '' };
  const v = nutrition.values;
  let factor; let unit;
  if (nutrition.basis === '100g') { factor = 1; unit = 'g'; }
  else if (nutrition.basis === '100ml') { factor = 1; unit = 'ml'; }
  else if (nutrition.serving_size && nutrition.serving_unit) { factor = 100 / nutrition.serving_size; unit = nutrition.serving_unit; }
  else return { ...empty, note: 'Values are per serving but the serving size is not known, so they are kept as printed only.' };
  const family = packUnit === 'ml' ? 'ml' : 'g';
  if (unit !== family) return { ...empty, note: `The label is per ${unit} but the package is measured in ${family === 'ml' ? 'ml' : 'g'}, so the values are kept as printed only.` };
  const scale = (x, digits = 1) => (x === null ? null : Math.round(x * factor * 10 ** digits) / 10 ** digits);
  return {
    kcal100: scale(v.energy_kcal, 0), protein100: scale(v.protein_g), carbs100: scale(v.carbs_g), fat100: scale(v.fat_g), fiber100: scale(v.fiber_g),
    sodium100: scale(v.sodium_mg, 0), sugar100: scale(v.sugar_g), sat_fat100: scale(v.sat_fat_g), note: ''
  };
}

/* ------------------------------ Duplicates ------------------------------ */

const STOP = new Set(['the', 'and', 'with', 'of', 'a', 'pack', 'packet', 'pouch', 'bottle', 'jar', 'tin', 'box', 'fresh', 'pure', 'classic', 'original']);
const tokens = (s) => normalize(s).split(' ').filter((w) => w.length > 1 && !STOP.has(w)).map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));

/**
 * Pantry items that are probably the same product: same measuring family (grams vs millilitres) and either the
 * same name, or the same brand with a shared word in the name. Different products from one brand do not match.
 */
export function findDuplicates(items, product) {
  const mine = new Set(tokens(product.name));
  if (!mine.size) return [];
  const family = (u) => (u === 'ml' ? 'ml' : 'g');
  const unit = product.package?.unit === 'kg' ? 'g' : product.package?.unit === 'l' ? 'ml' : product.package?.unit;
  const brand = normalize(product.brand);
  return items.filter((it) => {
    if (unit && family(it.unit) !== family(unit)) return false;
    const theirs = new Set(tokens(it.name));
    if (!theirs.size) return false;
    const shared = [...mine].filter((w) => theirs.has(w)).length;
    const sameName = shared === mine.size && shared === theirs.size;
    const sameBrand = brand && normalize(it.brand) === brand;
    return sameName || (sameBrand && shared > 0 && (shared === mine.size || shared === theirs.size));
  }).slice(0, 3).map((it) => ({ id: it.id, name: it.name, brand: it.brand || null, quantity: it.quantity, unit: it.unit, expires_on: it.expires_on }));
}

/** Label allergens, ingredients and name checked against this person's allergies and diet. Never says "safe". */
export function labelConflicts(product, prefs) {
  const text = [product.name, product.ingredients, ...(product.allergens || []), ...(product.may_contain || [])].filter(Boolean).join(', ');
  return text ? checkConflicts(text, prefs, { prose: false }) : [];
}
