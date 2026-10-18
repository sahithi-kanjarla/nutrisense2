import { HttpError } from './http.js';

export const GOALS = ['lose', 'maintain', 'gain', 'healthy'];
export const SEXES = ['female', 'male', 'na'];
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 };
export const DIETS = ['veg', 'egg', 'vegan', 'non', 'pesc', 'jain'];

const CALORIE_FLOOR = { male: 1500, female: 1200, na: 1350 };
const PROTEIN_PER_KG = { lose: 1.2, gain: 1.6, maintain: 1.0, healthy: 1.0 };
const GOAL_PCT = { lose: -0.15, gain: 0.10, maintain: 0, healthy: 0 };

const round10 = (n) => Math.round(n / 10) * 10;

/** Validates the body numbers used by the energy equation. */
export function validateBody({ age, height_cm, weight_kg, target_weight_kg }) {
  if (!(age >= 13 && age <= 100)) throw new HttpError(400, 'NutriSense is designed for ages 13 to 100.');
  if (!(height_cm >= 100 && height_cm <= 250)) throw new HttpError(400, 'Height must be between 100 and 250 cm.');
  if (!(weight_kg >= 25 && weight_kg <= 300)) throw new HttpError(400, 'Weight must be between 25 and 300 kg.');
  if (target_weight_kg != null && !(target_weight_kg >= 25 && target_weight_kg <= 300)) {
    throw new HttpError(400, 'Target weight must be between 25 and 300 kg.');
  }
}

/**
 * Daily targets from the Mifflin-St Jeor equation plus safety rules:
 * - a moderate deficit or surplus only (15% and 10%)
 * - calorie floors
 * - no deficit for under 18s, low BMI, or pregnancy and breastfeeding
 */
/** True when the saved targets are exactly what the formula gives (no custom targets). */
export function isAutoPlan(profile) {
  if (!profile?.age || !profile?.height_cm || !profile?.weight_kg || profile.calories == null) return false;
  try {
    const p = computePlan(profile);
    return p.calories === profile.calories && p.protein === profile.protein && p.carbs === profile.carbs && p.fat === profile.fat;
  } catch { return false; }
}

export function computePlan(p) {
  const goal = GOALS.includes(p.goal) ? p.goal : 'healthy';
  const sex = SEXES.includes(p.sex) ? p.sex : 'na';
  const activity = ACTIVITY[p.activity] ? p.activity : 'light';
  const { age, height_cm: h, weight_kg: w } = p;
  const target = p.target_weight_kg ?? w;
  const conditions = Array.isArray(p.conditions) ? p.conditions : [];
  const notes = [];

  const sexConst = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * age + sexConst);
  const tdee = Math.round(bmr * ACTIVITY[activity]);
  const bmi = w / Math.pow(h / 100, 2);

  let pct = GOAL_PCT[goal];
  if (age < 18 && pct !== 0) {
    pct = 0;
    notes.push('Because you are under 18, we keep calories at maintenance. Growing bodies need full energy, so please talk to a doctor before trying to change your weight.');
  }
  if (goal === 'lose' && pct < 0 && bmi < 18.5) {
    pct = 0;
    notes.push('Your weight is already in a lower range, so we hold calories at maintenance. Please speak to a clinician before trying to lose weight.');
  }
  if (conditions.includes('preg') && pct < 0) {
    pct = 0;
    notes.push('Pregnancy and breastfeeding raise your needs, so we do not set a calorie deficit. Follow your doctor or dietitian for targets.');
  }
  if (conditions.length) {
    notes.push('You told us about a health condition. Please review these targets with your doctor or dietitian.');
  }

  // Do not aim for a weight that is underweight (BMI under 18.5).
  const minHealthyWeight = 18.5 * Math.pow(h / 100, 2);
  let goalWeight = target;
  if (goal === 'lose' && target < minHealthyWeight) {
    goalWeight = Math.max(minHealthyWeight, 0);
    notes.push(`Your target weight is in the underweight range. We use about ${Math.ceil(minHealthyWeight)} kg (BMI 18.5) as the lowest healthy goal. Please talk to a doctor about your target.`);
  }

  let calories = round10(tdee * (1 + pct));
  if (conditions.includes('preg')) {
    calories += 300;
    notes.push('We added about 300 kcal and 25 g protein for pregnancy or breastfeeding. This is an estimate, so please confirm it with your doctor or dietitian.');
  }
  const floor = CALORIE_FLOOR[sex];
  if (calories < floor) {
    calories = floor;
    notes.push(`We raised your target to a safe minimum of ${floor.toLocaleString('en-US')} kcal.`);
  }

  let protein = Math.round(w * PROTEIN_PER_KG[goal]);
  protein = Math.min(protein, Math.round((calories * 0.35) / 4));
  protein = Math.max(protein, 45);
  if (conditions.includes('preg')) protein += 25;
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((calories / 1000) * 14);
  const water_glasses = Math.min(20, Math.max(6, Math.round((w * 30) / 250)));

  const diff = calories - tdee;
  const kgPerWeek = Math.abs(diff) * 7 / 7700;
  let weeksToGoal = null;
  if (goal === 'lose' && diff < 0 && w > goalWeight) weeksToGoal = Math.round((w - goalWeight) / kgPerWeek);
  if (goal === 'gain' && diff > 0 && target > w) weeksToGoal = Math.round((target - w) / kgPerWeek);

  return {
    bmr, tdee, adjustment: diff, bmi: Math.round(bmi * 10) / 10,
    calories, protein, carbs, fat, fiber, water_glasses,
    kg_per_week: Math.round(kgPerWeek * 100) / 100,
    weeks_to_goal: weeksToGoal,
    notes
  };
}
