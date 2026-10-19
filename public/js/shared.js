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
  ['pcos', 'PCOS'], ['gut', 'Digestive condition'], ['preg', 'Pregnant or breastfeeding'],
  ['clin', 'Kidney disease, heart failure or another condition my doctor manages']
];
export const PREG_STAGES = [['', 'Not sure yet'], ['t1', 'First trimester'], ['t2', 'Second trimester'], ['t3', 'Third trimester'], ['bf', 'Breastfeeding']];

/** When to see a professional. Shown with every plan, and kept short on purpose. */
export const CARE_NOTE = 'These numbers are estimates from a standard equation. They are general guidance, not medical advice. Please see a doctor or registered dietitian if you are pregnant or breastfeeding, under 18, take medicines, live with kidney, heart, diabetes or another condition, have had an eating disorder, or are gaining or losing weight quickly without trying.';
export const QUICK = [
  ['rice', 'Rice'], ['atta', 'Atta'], ['toor', 'Toor dal'], ['moong', 'Moong dal'], ['chana', 'Kabuli chana'], ['rajma', 'Rajma'],
  ['oats', 'Oats'], ['eggs', 'Eggs'], ['paneer', 'Paneer'], ['curd', 'Curd'], ['milk', 'Milk'], ['tofu', 'Tofu'],
  ['spinach', 'Spinach'], ['tomato', 'Tomatoes'], ['onion', 'Onions'], ['almond', 'Almonds'], ['ghee', 'Ghee'], ['oil', 'Cooking oil']
];
export const label = (list, key) => (list.find((x) => x[0] === key) || [0, key])[1];

export const MEAL_TYPES = ['breakfast', 'lunch', 'snack', 'dinner'];

const bmiText = (p) => {
  const b = p.bmi_bands;
  if (!b) return `BMI ${p.bmi}`;
  return b.applies ? `BMI ${p.bmi} (${b.who} on the WHO scale, ${b.south_asian} on the South Asian scale)` : `BMI ${p.bmi}`;
};

export const planSummary = (p) => {
  const water = p.fluid_managed ? ['Fluids', p.fluid_limit_ml ? num(p.fluid_limit_ml) : 'ask care team', p.fluid_limit_ml ? 'ml limit' : ''] : ['Water', p.water_glasses, 'glasses'];
  const protein = p.clinician_managed ? ['Protein (ceiling)', p.protein, 'g'] : ['Protein', p.protein, 'g'];
  return html`<div class="plan-box">
  <div class="row between wrap"><div><span class="muted small">Your daily target</span><div><b class="big">${num(p.calories)}</b> <span class="muted">kcal</span></div></div>
    <div class="row wrap" style="gap:18px">${[protein, ['Carbs', p.carbs, 'g'], ['Fats', p.fat, 'g'], ['Fiber', p.fiber, 'g'], water]
      .map(([l, v, u]) => html`<div><b style="font:700 20px 'Bricolage Grotesque'">${typeof v === 'number' ? num(v) : v}</b> <span class="small muted">${u}</span><div class="small muted">${l}</div></div>`)}</div></div>
  <p class="small muted" style="margin-top:12px">BMR ${num(p.bmr)} kcal · maintenance ${num(p.tdee)} kcal · ${bmiText(p)}${p.weeks_to_goal ? ` · about ${p.weeks_to_goal} weeks or more to your goal` : ''}</p>
  ${p.bmi_bands?.note ? html`<p class="small muted" style="margin-top:6px">${p.bmi_bands.note}</p>` : ''}
  ${p.timeline_note ? html`<p class="small muted" style="margin-top:6px">${p.timeline_note}</p>` : ''}
  ${(p.notes || []).map((n) => html`<div class="notice warn" style="margin-top:10px">${icon('alert')}<div>${n}</div></div>`)}
  <p class="small muted" style="margin-top:12px">${CARE_NOTE}</p></div>`;
};

/* ------------------------------ Pregnancy stage and limits from a care team ------------------------------ */

/** Draws the extra fields a condition needs into `host`, and keeps `ex` up to date as the user types. */
export function mountCondExtras(host, getConds, ex) {
  const draw = () => {
    const c = getConds();
    const parts = [];
    if (c.includes('preg')) {
      parts.push(html`<div class="field"><label class="f" for="x-stage">Where are you?</label>
        <select class="input" id="x-stage">${PREG_STAGES.map(([k, n]) => html`<option value="${k}" ${(ex.preg_stage || '') === k ? 'selected' : ''}>${n}</option>`)}</select>
        <div class="hint">We add extra calories and protein from the second trimester and while breastfeeding, using average estimates. They are not a prescription.</div></div>`);
    }
    if (c.includes('clin')) {
      parts.push(html`<div class="field"><div class="notice">${icon('alert')}<div>We do not set a calorie deficit, a high protein target or a water target for you, and we only suggest meals within the limits below. If your doctor or dietitian gave you daily limits, enter them. Leave a box empty if you were not given a number. We cannot track potassium or phosphorus, so please follow your care team's advice on those.</div></div>
        <div class="grid2" style="margin-top:10px">
          <div><label class="f" for="x-na">Sodium limit (mg a day)</label><input class="input" id="x-na" inputmode="numeric" placeholder="e.g. 1500" value="${ex.rx_sodium_mg ?? ''}"></div>
          <div><label class="f" for="x-pr">Protein limit (g a day)</label><input class="input" id="x-pr" inputmode="numeric" placeholder="e.g. 45" value="${ex.rx_protein_g ?? ''}"></div>
          <div><label class="f" for="x-fl">Fluid limit (ml a day)</label><input class="input" id="x-fl" inputmode="numeric" placeholder="e.g. 1500" value="${ex.rx_fluid_ml ?? ''}"></div></div>
        <div class="hint">Without a sodium number we use a general ceiling of 2,000 mg. Your doctor may set a lower one.</div></div>`);
    }
    host.innerHTML = parts.map(String).join('');
    const bind = (id, key) => { const el = host.querySelector(id); if (el) el.oninput = el.onchange = () => { ex[key] = el.value.trim(); }; };
    bind('#x-stage', 'preg_stage'); bind('#x-na', 'rx_sodium_mg'); bind('#x-pr', 'rx_protein_g'); bind('#x-fl', 'rx_fluid_ml');
  };
  draw();
  return draw;
}

/** The API fields for the extras that apply to these conditions. Blank means "not given". */
export function condExtrasBody(conds, ex) {
  const out = {};
  if (conds.includes('preg')) out.preg_stage = ex.preg_stage || null;
  if (conds.includes('clin')) for (const k of ['rx_sodium_mg', 'rx_protein_g', 'rx_fluid_ml']) out[k] = ex[k] === '' || ex[k] == null ? null : ex[k];
  return out;
}

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
