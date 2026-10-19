import { html, icon, num, bar } from './ui.js';

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

/* ------------------------------ Watch list: sodium, saturated fat, added sugar ------------------------------ */

const WATCH_COLOR = { ok: 'var(--green)', near: 'var(--amber)', over: 'var(--rust)', unsure: '#b9c9bd', unknown: 'var(--track)', none: 'var(--track)' };
const WATCH_TAG = { ok: ['', 'Within limit'], near: ['amber', 'Close to limit'], over: ['red', 'Over limit'], unsure: ['gray', 'May be higher'], unknown: ['gray', 'No data'], none: ['gray', 'Nothing logged'] };

/**
 * One nutrient value as text. null means no data (never "0"); `atLeast` adds the "at least" wording
 * for totals where some foods or meals have no data.
 */
export const watchAmount = (value, unit, atLeast = false) => (value == null ? 'no data' : `${atLeast ? 'at least ' : ''}${num(value, unit === 'g' ? 1 : 0)} ${unit}`);

function watchNote(w) {
  if (w.status === 'none') return 'Nothing logged yet.';
  if (w.status === 'unknown') return 'None of your logged meals have data for this yet.';
  if (w.status === 'over') return w.partial ? 'Over your limit. The real amount may be even higher because some meals have no data.' : 'Over your limit.';
  if (w.status === 'unsure') return `This is a minimum. ${w.complete} of ${w.total} meals have full data, so the real amount may be higher.`;
  if (w.status === 'near') return 'Close to your limit for the day.';
  return 'Within your limit for the day.';
}

/** The daily watch list card body: one row per nutrient with a bar, the limit and a plain-words status. */
export function watchRows(list) {
  return html`<div class="stack">${list.map((w) => {
    const [kind, text] = WATCH_TAG[w.status];
    return html`<div class="macro" data-watch="${w.key}" data-status="${w.status}">
      <div class="row between small"><span title="${w.why}">${w.label}</span>
        <span><b>${w.value == null ? 'No data' : `${w.partial ? 'At least ' : ''}${num(w.value, w.unit === 'g' ? 1 : 0)}`}</b> / ${num(w.limit)} ${w.unit} <span class="tag ${kind}">${text}</span></span></div>
      ${bar(w.value ?? 0, w.limit, WATCH_COLOR[w.status])}
      <div class="small muted" style="margin-top:4px">${watchNote(w)}</div></div>`;
  })}</div>
  <p class="small muted" style="margin-top:12px">Limits are ceilings to stay under, from general WHO and American Heart Association guidance, set for your age and conditions. They are not medical advice. Salt added at the table and dishes we cannot look up are not counted, so the real sodium can be higher.</p>`;
}

/** The same rows for a period average (Progress page). */
export function watchAverageRows(list, days) {
  return html`<div class="stack">${list.map((w) => {
    const [kind, text] = WATCH_TAG[w.status];
    const basis = w.days_with_data ? `Average of ${w.days_with_data} of ${w.logged_days} logged days that have data${w.partial_days ? ' (some of those days are missing meals, so it may be higher)' : ''}.` : `None of your ${days} logged days have data for this yet.`;
    return html`<div class="macro" data-watch="${w.key}" data-status="${w.status}">
      <div class="row between small"><span title="${w.why}">${w.label}</span>
        <span><b>${w.avg == null ? 'No data' : `${w.partial_days ? 'At least ' : ''}${num(w.avg, w.unit === 'g' ? 1 : 0)}`}</b> / ${num(w.limit)} ${w.unit} <span class="tag ${kind}">${text}</span></span></div>
      ${bar(w.avg ?? 0, w.limit, WATCH_COLOR[w.status])}
      <div class="small muted" style="margin-top:4px">${basis}</div></div>`;
  })}</div>`;
}
