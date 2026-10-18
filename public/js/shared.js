import { html, icon, num } from './ui.js';

export const GOALS = [
  ['lose', 'Lose weight', 'A gentle deficit of about 15%'], ['maintain', 'Maintain weight', 'Stay where you are'],
  ['gain', 'Build muscle or gain', 'A small surplus of about 10%'], ['healthy', 'Eat healthier', 'Better balance, no weight change']
];
export const ACTIVITY = [
  ['sedentary', 'Mostly sitting', 'Desk work, little exercise'], ['light', 'Lightly active', 'Walks or exercise 1 to 3 days a week'],
  ['moderate', 'Moderately active', 'Exercise 3 to 5 days a week'], ['very', 'Very active', 'Hard exercise most days or a physical job']
];
export const DIETS = [
  ['veg', 'Vegetarian', 'No meat, fish or eggs'], ['egg', 'Eggetarian', 'Vegetarian plus eggs'], ['vegan', 'Vegan', 'No animal products'],
  ['non', 'Non-vegetarian', 'Eats everything'], ['pesc', 'Pescatarian', 'Fish but no meat'], ['jain', 'Jain', 'No meat, eggs or root vegetables']
];
export const ALLERGIES = [
  ['peanuts', 'Peanuts'], ['tree', 'Tree nuts'], ['dairy', 'Dairy'], ['gluten', 'Gluten'], ['eggs', 'Eggs'],
  ['soy', 'Soy'], ['shellfish', 'Shellfish'], ['fish', 'Fish'], ['sesame', 'Sesame']
];
export const CONDITIONS = [
  ['t2', 'Diabetes or pre-diabetes'], ['bp', 'High blood pressure'], ['chol', 'High cholesterol'], ['thy', 'Thyroid condition'],
  ['pcos', 'PCOS'], ['gut', 'Digestive condition'], ['preg', 'Pregnant or breastfeeding']
];
export const QUICK = [
  ['rice', 'Rice'], ['atta', 'Atta'], ['toor', 'Toor dal'], ['moong', 'Moong dal'], ['chana', 'Kabuli chana'], ['rajma', 'Rajma'],
  ['oats', 'Oats'], ['eggs', 'Eggs'], ['paneer', 'Paneer'], ['curd', 'Curd'], ['milk', 'Milk'], ['tofu', 'Tofu'],
  ['spinach', 'Spinach'], ['tomato', 'Tomatoes'], ['onion', 'Onions'], ['almond', 'Almonds'], ['ghee', 'Ghee'], ['oil', 'Cooking oil']
];
export const label = (list, key) => (list.find((x) => x[0] === key) || [0, key])[1];

export const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];

export const planSummary = (p) => html`<div class="plan-box">
  <div class="row between wrap"><div><span class="muted small">Your daily target</span><div><b class="big">${num(p.calories)}</b> <span class="muted">kcal</span></div></div>
    <div class="row wrap" style="gap:18px">${[['Protein', p.protein, 'g'], ['Carbs', p.carbs, 'g'], ['Fats', p.fat, 'g'], ['Fiber', p.fiber, 'g'], ['Water', p.water_glasses, 'glasses']]
      .map(([l, v, u]) => html`<div><b style="font:700 20px 'Bricolage Grotesque'">${num(v)}</b> <span class="small muted">${u}</span><div class="small muted">${l}</div></div>`)}</div></div>
  <p class="small muted" style="margin-top:12px">BMR ${num(p.bmr)} kcal · maintenance ${num(p.tdee)} kcal · BMI ${p.bmi}${p.weeks_to_goal ? ` · about ${p.weeks_to_goal} weeks to your goal at ${p.kg_per_week} kg a week` : ''}</p>
  ${(p.notes || []).map((n) => html`<div class="notice warn" style="margin-top:10px">${icon('alert')}<div>${n}</div></div>`)}</div>`;

/* Reads the questionnaire fields (ids a-*) of a container into an API body. */
export const toggleChip = (btn) => { btn.classList.toggle('on'); btn.setAttribute('aria-pressed', btn.classList.contains('on')); };
export const chip = (key, text, on) => html`<button type="button" class="chip ${on ? 'on' : ''}" data-key="${key}" aria-pressed="${on ? 'true' : 'false'}">${text}</button>`;
export const choice = (key, title, sub, on) => html`<button type="button" class="choice ${on ? 'on' : ''}" data-key="${key}" aria-pressed="${on ? 'true' : 'false'}"><b>${title}</b><span>${sub}</span></button>`;
