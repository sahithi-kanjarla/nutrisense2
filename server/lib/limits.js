/**
 * Daily limits for the nutrients to keep an eye on: sodium, saturated fat and added sugar.
 *
 * These are CEILINGS to stay under, not targets to reach. They come from general public-health guidance
 * (WHO, American Heart Association) and are for healthy people and the conditions the app already lists.
 * They are not medical advice. The stricter limit wins when several apply.
 *
 *   Sodium         adults and teens 14+: under 2,000 mg (WHO)
 *                  age 13: under 1,800 mg (US Dietary Reference Intakes, 9 to 13 years)
 *                  high blood pressure: 1,500 mg (AHA ideal limit)
 *                  kidney disease, heart failure or another doctor-managed condition: 2,000 mg as a general
 *                  ceiling (KDIGO advises under 2 g a day for kidney disease). A limit the user's own care
 *                  team gave them replaces it, and is used as given.
 *   Saturated fat  under 10% of calories (WHO); high cholesterol: under 6% (AHA)
 *   Added sugar    under 10% of calories (WHO); under 18: also at most 25 g (AHA);
 *                  type 2 diabetes or PCOS: under 5% of calories (WHO "ideal", and common advice for these conditions)
 */
import { GENERAL_PROTEIN_PER_KG } from './plan.js';

export const WATCH = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg', bit: 1 },
  { key: 'sat_fat', label: 'Saturated fat', unit: 'g', bit: 2 },
  { key: 'added_sugar', label: 'Added sugar', unit: 'g', bit: 4 }
];
export const WATCH_KEYS = WATCH.map((w) => w.key);

/** Bit mask for a list of nutrient keys whose stored value is only a lower bound. */
export const gapMask = (keys) => WATCH.reduce((m, w) => (Array.isArray(keys) && keys.includes(w.key) ? m | w.bit : m), 0);

export function limitsOf(profile, targets) {
  const age = profile?.age || null;
  const conds = profile?.conditions || [];
  const kcal = targets?.calories || 2000;
  const minor = age != null && age < 18;

  let sodium = age != null && age <= 13 ? 1800 : 2000;
  let sodiumWhy = age != null && age <= 13 ? 'Under 1,800 mg a day for ages 9 to 13 (US Dietary Reference Intakes).' : 'Under 2,000 mg a day (World Health Organization).';
  if (conds.includes('bp')) {
    sodium = Math.min(sodium, 1500);
    sodiumWhy = 'Up to 1,500 mg a day is the ideal limit for high blood pressure (American Heart Association).';
  }

  if (conds.includes('clin')) {
    if (profile?.rx_sodium_mg > 0) {
      sodium = Math.round(profile.rx_sodium_mg);
      sodiumWhy = 'The sodium limit you entered from your care team.';
    } else {
      // A stricter limit that already applies (such as blood pressure) stays; otherwise this is the general ceiling.
      if (sodium >= 2000) sodiumWhy = 'A general ceiling of 2,000 mg a day. Your doctor may set a lower number, so please ask and enter it in your profile.';
      sodium = Math.min(sodium, 2000);
    }
  }

  const satPct = conds.includes('chol') ? 6 : 10;
  const satWhy = satPct === 6
    ? 'Under 6% of your calories for high cholesterol (American Heart Association).'
    : 'Under 10% of your calories (World Health Organization).';

  let sugarPct = conds.includes('t2') || conds.includes('pcos') ? 5 : 10;
  let sugar = Math.round((kcal * sugarPct) / 100 / 4);
  let sugarWhy = sugarPct === 5
    ? 'Under 5% of your calories, the stricter level often advised with type 2 diabetes or PCOS (World Health Organization).'
    : 'Under 10% of your calories (World Health Organization).';
  if (minor && sugar > 25) { sugar = 25; sugarWhy = 'At most 25 g a day for under 18s (American Heart Association).'; }

  return {
    sodium_mg: { limit: sodium, why: sodiumWhy },
    sat_fat: { limit: Math.round((kcal * satPct) / 100 / 9), why: satWhy },
    added_sugar: { limit: sugar, why: sugarWhy }
  };
}

/**
 * What the app may and may not say to someone whose doctor manages a kidney, heart or similar condition.
 * The protein figure is their care team's number if they entered it, otherwise the general adult figure.
 */
export function clinicalOf(profile) {
  if (!(profile?.conditions || []).includes('clin')) return null;
  const rxProtein = profile.rx_protein_g > 0 ? Math.round(profile.rx_protein_g) : null;
  return {
    sodium_limit: limitsOf(profile, null).sodium_mg.limit,
    sodium_prescribed: profile.rx_sodium_mg > 0,
    protein_cap: rxProtein ?? (profile.weight_kg ? Math.round(profile.weight_kg * GENERAL_PROTEIN_PER_KG) : null),
    protein_prescribed: Boolean(rxProtein),
    fluid_limit_ml: profile.rx_fluid_ml > 0 ? Math.round(profile.rx_fluid_ml) : null
  };
}

/** SQL fragments that total the watch nutrients and say how many meals have full data. */
export const NUTRIENT_SQL = WATCH.map((w) =>
  `SUM(${w.key}) AS ${w.key}, COUNT(${w.key}) AS ${w.key}_n, SUM(CASE WHEN ${w.key} IS NOT NULL AND (nutrient_gaps & ${w.bit}) != 0 THEN 1 ELSE 0 END) AS ${w.key}_gap`
).join(', ');

const round = (key, v) => (v == null ? null : key === 'sodium_mg' ? Math.round(v) : Math.round(v * 10) / 10);

/**
 * Reads the nutrient columns of a totals row, for `meals` meals.
 * value: the sum of what is known (null when no meal has any data).
 * complete: meals whose figure is complete. partial: some meal is missing data or is only a lower bound,
 * so the value is "at least" that much.
 */
export function readNutrients(row, meals) {
  const out = {};
  for (const w of WATCH) {
    const known = row[`${w.key}_n`] || 0;
    const complete = known - (row[`${w.key}_gap`] || 0);
    out[w.key] = { value: round(w.key, row[w.key]), complete, total: meals, partial: meals > 0 && complete < meals };
  }
  return out;
}

/**
 * One status per watched nutrient against its limit.
 *   none    nothing logged
 *   unknown meals are logged but none has data
 *   over    above the limit (true even when data is partial, because the real figure can only be higher)
 *   unsure  under the limit so far, but some meals have no data, so the real figure may be higher
 *   near    complete data, 85% or more of the limit
 *   ok      complete data, under 85% of the limit
 */
export function watchOf(nutrients, limits) {
  return WATCH.map((w) => {
    const n = nutrients[w.key];
    const lim = limits[w.key];
    let status;
    if (!n.total) status = 'none';
    else if (n.value == null) status = 'unknown';
    else if (n.value > lim.limit) status = 'over';
    else if (n.partial) status = 'unsure';
    else status = n.value >= lim.limit * 0.85 ? 'near' : 'ok';
    return { key: w.key, label: w.label, unit: w.unit, limit: lim.limit, why: lim.why, ...n, status };
  });
}
