import { HttpError } from './http.js';

export const GOALS = ['lose', 'maintain', 'gain', 'healthy'];
export const SEXES = ['female', 'male', 'na'];
export const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 };
export const DIETS = ['veg', 'egg', 'vegan', 'non', 'pesc', 'jain'];
export const PREG_STAGES = ['t1', 't2', 't3', 'bf'];
export const PREG_STAGE_LABEL = { t1: 'First trimester', t2: 'Second trimester', t3: 'Third trimester', bf: 'Breastfeeding' };

// Conventional floors for a self-guided plan, not clinical limits. Under 18s have one floor, and a deficit is never set for them.
const ADULT_FLOOR = { male: 1500, female: 1200, na: 1350 };
const TEEN_FLOOR = 1400;
const PROTEIN_PER_KG = { lose: 1.2, gain: 1.6, maintain: 1.0, healthy: 1.0 };
const GOAL_PCT = { lose: -0.15, gain: 0.10, maintain: 0, healthy: 0 };

// Extra energy and protein, from the US Institute of Medicine Dietary Reference Intakes (2005, 2002/2005):
// pregnancy adds about 0 kcal in the first trimester, 340 in the second and 450 in the third; breastfeeding
// adds about 330 in the first six months. Protein is 1.1 g/kg in pregnancy (second and third trimester here)
// and 1.3 g/kg while breastfeeding. These are population averages, not a prescription.
const PREG_KCAL = { t1: 0, t2: 340, t3: 450, bf: 330 };
const PREG_PROTEIN_PER_KG = { t2: 1.1, t3: 1.1, bf: 1.3 };

// People whose doctor manages kidney disease, heart failure or similar: the general adult protein figure is the
// default, because the right number is a clinician's to set (it can be lower or higher depending on the condition).
export const GENERAL_PROTEIN_PER_KG = 0.8;

const round10 = (n) => Math.round(n / 10) * 10;
const round1 = (n) => Math.round(n * 10) / 10;

export const calorieFloor = (sex, age) => (age != null && age < 18 ? TEEN_FLOOR : ADULT_FLOOR[SEXES.includes(sex) ? sex : 'na']);

/** Lowest weight that keeps BMI at 18.5 (the WHO underweight line, which also applies to South Asians). */
export const minTargetWeight = (heightCm) => 18.5 * Math.pow(heightCm / 100, 2);

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
 * BMI is a screening number, not a diagnosis. Two scales are shown: the WHO one, and the lower South Asian
 * cut-offs (overweight from 23, obese from 25) that Indian and WHO Asia-Pacific guidance use because the same
 * BMI carries more health risk at a lower weight in South Asians. Adult cut-offs do not apply under 19.
 */
export function bmiBands(bmi, age) {
  if (!(bmi > 0)) return null;
  if (age != null && age < 19) {
    return { applies: false, note: 'Adult BMI ranges do not apply under 19. A doctor uses growth charts for your age.' };
  }
  const who = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Healthy range' : bmi < 30 ? 'Overweight' : 'Obese';
  const south_asian = bmi < 18.5 ? 'Underweight' : bmi < 23 ? 'Healthy range' : bmi < 25 ? 'Overweight' : 'Obese';
  return {
    applies: true, who, south_asian,
    note: 'BMI is a screening number, not a diagnosis. It does not see muscle, body fat or where fat is carried. The South Asian ranges start overweight at 23 and obese at 25. A doctor can tell you what it means for you.'
  };
}

/** True when the saved targets are exactly what the formula gives (no custom targets). */
export function isAutoPlan(profile) {
  if (!profile?.age || !profile?.height_cm || !profile?.weight_kg || profile.calories == null) return false;
  try {
    const p = computePlan(profile);
    return p.calories === profile.calories && p.protein === profile.protein && p.carbs === profile.carbs && p.fat === profile.fat;
  } catch { return false; }
}

/**
 * Daily targets from the Mifflin-St Jeor equation plus safety rules:
 * - a moderate deficit or surplus only (15% and 10%), and only when the target weight points the same way
 * - no deficit for under 18s, a low BMI, pregnancy and breastfeeding, or a doctor-managed condition
 * - calorie floors, a lowest target weight (BMI 18.5), and a capped water suggestion
 * - for a doctor-managed condition, protein is the general adult figure (or the user's own prescribed number)
 *   and the app gives no fluid target
 */
export function computePlan(p) {
  const goal = GOALS.includes(p.goal) ? p.goal : 'healthy';
  const sex = SEXES.includes(p.sex) ? p.sex : 'na';
  const activity = ACTIVITY[p.activity] ? p.activity : 'light';
  const { age, height_cm: h, weight_kg: w } = p;
  const target = p.target_weight_kg ?? w;
  const conditions = Array.isArray(p.conditions) ? p.conditions : [];
  const preg = conditions.includes('preg');
  const clin = conditions.includes('clin');
  const stage = preg && PREG_STAGES.includes(p.preg_stage) ? p.preg_stage : null;
  const notes = [];

  const sexConst = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  const bmr = Math.round(10 * w + 6.25 * h - 5 * age + sexConst);
  const tdee = Math.round(bmr * ACTIVITY[activity]);
  const bmi = w / Math.pow(h / 100, 2);
  const minWeight = minTargetWeight(h);

  let pct = GOAL_PCT[goal];
  if (age < 18 && pct !== 0) {
    pct = 0;
    notes.push('Because you are under 18, we keep calories at maintenance. Growing bodies need full energy, so please talk to a doctor before trying to change your weight.');
  }
  if (goal === 'lose' && pct < 0 && bmi < 18.5) {
    pct = 0;
    notes.push('Your weight is already in a lower range, so we hold calories at maintenance. Please speak to a clinician before trying to lose weight.');
  }
  if (preg && pct < 0) {
    pct = 0;
    notes.push('Pregnancy and breastfeeding raise your needs, so we do not set a calorie deficit. Follow your doctor or dietitian for targets.');
  }
  if (clin && pct !== 0) {
    pct = 0;
    notes.push('With a doctor-managed condition we do not set a calorie deficit or surplus. Ask your care team before changing your weight.');
  }
  if (pct < 0 && !(target < w - 0.05)) {
    pct = 0;
    notes.push('Your target weight is not below your current weight, so we keep calories at maintenance. Set a lower target weight if you want a gentle calorie deficit.');
  }
  if (pct > 0 && !(target > w + 0.05)) {
    pct = 0;
    notes.push('Your target weight is not above your current weight, so we keep calories at maintenance. Set a higher target weight if you want to gain.');
  }
  if (conditions.length) {
    notes.push('You told us about a health condition. Please review these targets with your doctor or dietitian.');
  }

  // Do not aim for a weight that is underweight (BMI under 18.5).
  let goalWeight = target;
  if (target < minWeight && target < w && goal !== 'gain') {
    goalWeight = minWeight;
    notes.push(`Your target weight is in the underweight range. We use about ${Math.ceil(minWeight)} kg (BMI 18.5) as the lowest healthy goal. Please talk to a doctor about your target.`);
  }

  let calories = round10(tdee * (1 + pct));
  if (preg) {
    if (stage) {
      calories += PREG_KCAL[stage];
      const extra = PREG_KCAL[stage] ? `about ${PREG_KCAL[stage]} kcal and extra protein` : 'no extra calories (they are not usually needed in the first trimester)';
      notes.push(`For ${PREG_STAGE_LABEL[stage].toLowerCase()} we added ${extra}. These are average estimates (US Institute of Medicine), not a prescription, so please confirm them with your doctor or dietitian.`);
    } else {
      notes.push('Tell us whether you are in your first, second or third trimester or breastfeeding, and we will adjust your calories and protein. Until then we add nothing extra.');
    }
  }
  const floor = calorieFloor(sex, age);
  if (calories < floor) {
    calories = floor;
    notes.push(`We raised your target to a safe minimum of ${floor.toLocaleString('en-US')} kcal.`);
  }

  let protein;
  let proteinBasis = 'goal';
  if (clin) {
    const rx = p.rx_protein_g > 0 ? Math.round(p.rx_protein_g) : null;
    protein = rx ?? Math.round(w * GENERAL_PROTEIN_PER_KG);
    proteinBasis = rx ? 'prescribed' : 'general';
    notes.push(rx
      ? `Your protein target is the ${rx} g limit you entered from your care team.`
      : `Your protein target is the general adult figure (0.8 g per kg). It is not a kidney or heart prescription. Please ask your care team for your own number and enter it in your profile.`);
  } else {
    protein = Math.round(w * PROTEIN_PER_KG[goal]);
    protein = Math.min(protein, Math.round((calories * 0.35) / 4));
    protein = Math.max(protein, 45);
    if (stage && PREG_PROTEIN_PER_KG[stage]) protein = Math.max(protein, Math.round(w * PREG_PROTEIN_PER_KG[stage]));
  }
  const fat = Math.round((calories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  const fiber = Math.round((calories / 1000) * 14);

  // About 30 ml per kg, kept between 1.5 and 3 litres. The EU adequate intake for total water is 2.0 L (women) and
  // 2.5 L (men), about 80% of it from drinks. It does not allow for heat, exercise or illness. With a
  // doctor-managed condition the app gives no fluid target, because fluid may need to be limited.
  const waterMl = Math.min(3000, Math.max(1500, w * 30));
  let water_glasses = Math.round(waterMl / 250);
  const rxFluid = clin && p.rx_fluid_ml > 0 ? Math.round(p.rx_fluid_ml) : null;
  if (rxFluid) water_glasses = Math.max(1, Math.round(rxFluid / 250));
  if (clin) notes.push(rxFluid
    ? `Your fluid limit is the ${rxFluid} ml you entered from your care team.`
    : 'We do not suggest a water target for you, because your care team may want to limit fluids. Please ask them how much to drink.');

  // The usual 7,700 kcal per kg rule overestimates how quickly weight changes, so this is the quickest it could be.
  const diff = calories - tdee - (preg && stage ? PREG_KCAL[stage] : 0);
  const kgPerWeek = Math.abs(diff) * 7 / 7700;
  let weeksToGoal = null;
  if (goal === 'lose' && diff < 0 && w > goalWeight) weeksToGoal = Math.round((w - goalWeight) / kgPerWeek);
  if (goal === 'gain' && diff > 0 && target > w) weeksToGoal = Math.round((target - w) / kgPerWeek);
  const timelineNote = weeksToGoal
    ? 'This is the quickest it could take if you follow the plan closely. Real progress is usually slower and uneven, and it depends on your body, sleep, activity and medicines. It is an estimate, not a promise.'
    : null;

  return {
    bmr, tdee, adjustment: calories - tdee, bmi: round1(bmi), bmi_bands: bmiBands(bmi, age),
    calories, protein, carbs, fat, fiber, water_glasses,
    kg_per_week: Math.round(kgPerWeek * 100) / 100,
    weeks_to_goal: weeksToGoal, timeline_note: timelineNote,
    goal_weight: round1(goalWeight),
    preg_stage: stage,
    clinician_managed: clin,
    protein_basis: proteinBasis,
    fluid_managed: clin,
    fluid_limit_ml: rxFluid,
    notes
  };
}

/**
 * Checks hand-set targets against the profile. `t` holds whole numbers already range-checked by the route.
 * Throws a 400 with a plain explanation. This is a sense check, not a prescription.
 */
export function validateTargets(t, profile) {
  const conditions = profile?.conditions || [];
  const age = profile?.age || null;
  const clin = conditions.includes('clin');
  const w = profile?.weight_kg || null;
  const bad = (msg) => { throw new HttpError(400, msg); };

  let floor = calorieFloor(profile?.sex, age);
  const growingOrExpecting = (age != null && age < 18) || conditions.includes('preg') || clin;
  if (growingOrExpecting && profile?.age && profile?.height_cm && profile?.weight_kg) {
    floor = Math.max(floor, round10(computePlan(profile).tdee * 0.95));
  }
  if (t.calories < floor) {
    bad(`For safety, calories cannot be set below ${floor.toLocaleString('en-US')} kcal${growingOrExpecting ? ' for you (about your maintenance level)' : ''}. Please talk to a doctor or dietitian about a lower target.`);
  }

  // The protein and fluid checks come first: they matter more than the arithmetic.
  if (clin) {
    const cap = profile.rx_protein_g > 0 ? Math.round(profile.rx_protein_g) : (w ? Math.round(w * GENERAL_PROTEIN_PER_KG) : null);
    if (cap && t.protein > cap) {
      bad(`With a doctor-managed condition, protein is kept at or below ${cap} g${profile.rx_protein_g > 0 ? ', the limit you entered' : ' (0.8 g per kg, the general adult figure)'}. Please ask your care team before raising it.`);
    }
    const fluidCap = profile.rx_fluid_ml > 0 ? Math.round(profile.rx_fluid_ml / 250) : null;
    if (fluidCap && t.water_glasses > fluidCap) bad(`Your fluid limit from your care team is about ${fluidCap} glasses (${Math.round(profile.rx_fluid_ml)} ml).`);
  } else {
    if (w && t.protein < w * 0.6) bad(`Protein of ${t.protein} g is below 0.6 g per kg of body weight (the usual recommendation is 0.8 g). Please talk to a doctor or dietitian about a lower target.`);
    if (w && t.protein > w * 3) bad(`Protein of ${t.protein} g is above 3 g per kg of body weight, which is unusually high. Please talk to a doctor or dietitian.`);
  }

  const fromMacros = t.protein * 4 + t.carbs * 4 + t.fat * 9;
  if (Math.abs(fromMacros - t.calories) > t.calories * 0.1) {
    bad(`Your protein, carbs and fat add up to about ${fromMacros} kcal, which is not close to ${t.calories} kcal. Please make them match within 10%. (Fibre counts toward carbs, so a small gap is normal.)`);
  }
  if (t.fat * 9 < t.calories * 0.15) bad('Fat should be at least 15% of your calories, to supply essential fatty acids and fat-soluble vitamins.');
}
