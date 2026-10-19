import { post } from '../api.js';
import { html, icon, logo, $, $$, toast, busy, today, esc } from '../ui.js';
import { navigate, state, refreshProfile, logout } from '../app.js';
import { GOALS, ACTIVITY, DIETS, ALLERGIES, CONDITIONS, QUICK, planSummary, chip, choice, toggleChip, mountCondExtras, condExtrasBody } from '../shared.js';

const STEPS = ['Goal', 'About you', 'Activity', 'Eating', 'Health', 'Pantry', 'Your plan'];

export default function onboarding(root) {
  const a = { goal: null, sex: null, age: '', height_cm: '', weight_kg: '', target_weight_kg: '', activity: null, meals_per_day: 3, diet: null, allergies: [], other_allergy: '', dislikes: '', conditions: [], pantry: [] };
  const extras = { preg_stage: '', rx_sodium_mg: '', rx_protein_g: '', rx_fluid_ml: '' };
  let redrawExtras = null;
  let step = 0;
  let plan = null;
  let error = '';

  const body = () => {
    const b = { goal: a.goal, sex: a.sex, age: Number(a.age), height_cm: Number(a.height_cm), weight_kg: Number(a.weight_kg), activity: a.activity, diet: a.diet,
      meals_per_day: a.meals_per_day, allergies: [...a.allergies, ...a.other_allergy.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)].slice(0, 15),
      dislikes: a.dislikes, conditions: a.conditions, ...condExtrasBody(a.conditions, extras) };
    if (a.target_weight_kg !== '') b.target_weight_kg = Number(a.target_weight_kg);
    return b;
  };

  const valid = () => {
    if (step === 0) return a.goal ? '' : 'Please choose a goal to continue.';
    if (step === 1) {
      if (!a.sex) return 'Please choose an option for sex. We use it for the energy equation only.';
      const age = Number(a.age), h = Number(a.height_cm), w = Number(a.weight_kg);
      if (!(age >= 13 && age <= 100)) return 'Age must be between 13 and 100.';
      if (!(h >= 100 && h <= 250)) return 'Height must be between 100 and 250 cm.';
      if (!(w >= 25 && w <= 300)) return 'Weight must be between 25 and 300 kg.';
      if (a.target_weight_kg !== '' && !(Number(a.target_weight_kg) >= 25 && Number(a.target_weight_kg) <= 300)) return 'Target weight must be between 25 and 300 kg.';
      return '';
    }
    if (step === 2) return a.activity ? '' : 'Please choose your activity level.';
    if (step === 3) return a.diet ? '' : 'Please choose your eating pattern.';
    return '';
  };

  const content = () => {
    switch (step) {
      case 0: return html`<h2>What is your main goal?</h2><p class="lead">This sets your calorie and protein targets. You can change it any time.</p>
        <div class="grid2">${GOALS.map(([k, t, s]) => choice(k, t, s, a.goal === k))}</div>`;
      case 1: return html`<h2>Tell us about you</h2><p class="lead">We use these numbers to estimate your energy needs. They are never shown to anyone else.</p>
        <div class="field"><label class="f">Sex</label><div class="chips" id="sex">${[['female', 'Female'], ['male', 'Male'], ['na', 'Prefer not to say']].map(([k, t]) => chip(k, t, a.sex === k))}</div></div>
        <div class="grid3"><div class="field"><label class="f" for="a-age">Age</label><div class="unit"><input class="input" id="a-age" inputmode="numeric" value="${a.age}"><i>yrs</i></div></div>
        <div class="field"><label class="f" for="a-h">Height</label><div class="unit"><input class="input" id="a-h" inputmode="decimal" value="${a.height_cm}"><i>cm</i></div></div>
        <div class="field"><label class="f" for="a-w">Weight</label><div class="unit"><input class="input" id="a-w" inputmode="decimal" value="${a.weight_kg}"><i>kg</i></div></div></div>
        <div class="field" style="max-width:240px"><label class="f" for="a-t">Target weight (optional)</label><div class="unit"><input class="input" id="a-t" inputmode="decimal" value="${a.target_weight_kg}"><i>kg</i></div></div>`;
      case 2: return html`<h2>How active are you?</h2><p class="lead">Think about a typical week, including work and exercise.</p>
        <div class="stack">${ACTIVITY.map(([k, t, s]) => choice(k, t, s, a.activity === k))}</div>`;
      case 3: return html`<h2>How do you eat?</h2><p class="lead">Recipes and suggestions will always follow this.</p>
        <div class="grid2">${DIETS.map(([k, t, s]) => choice(k, t, s, a.diet === k))}</div>
        <div class="field" style="margin-top:20px"><label class="f">Meals per day</label><div class="chips" id="mpd">${[2, 3, 4, 5].map((n) => chip(String(n), n === 5 ? '5 or more' : String(n), a.meals_per_day === n))}</div></div>`;
      case 4: return html`<h2>Allergies and health</h2><p class="lead">We will never suggest anything that conflicts with these. Skip anything that does not apply.</p>
        <div class="field"><label class="f">Allergies and intolerances</label><div class="chips" id="alg">${ALLERGIES.map(([k, t]) => chip(k, t, a.allergies.includes(k)))}</div></div>
        <div class="field"><label class="f" for="a-oa">Anything else you must avoid?</label><input class="input" id="a-oa" placeholder="e.g. mushroom, kiwi (comma separated)" value="${a.other_allergy}" maxlength="120"></div>
        <div class="field"><label class="f" for="a-dl">Foods you simply dislike</label><input class="input" id="a-dl" placeholder="e.g. bitter gourd, olives" value="${a.dislikes}" maxlength="200"></div>
        <div class="field"><label class="f">Health conditions we should be careful about</label><div class="chips" id="cond">${CONDITIONS.map(([k, t]) => chip(k, t, a.conditions.includes(k)))}</div>
        <div class="hint">Pregnancy and doctor-managed conditions change your targets. Every condition adds a reminder to check them with a doctor or dietitian.</div></div>
        <div id="cond-extra"></div>`;
      case 5: return html`<h2>Stock your pantry</h2><p class="lead">Tick what is usually at home to get started. You can edit quantities and add expiry dates later. Items that clash with your allergies are skipped.</p>
        <div class="chips" id="qk">${QUICK.map(([k, t]) => chip(k, t, a.pantry.includes(k)))}</div>`;
      default: return html`<h2>Your plan is ready</h2><p class="lead">Here is what we worked out. You can fine tune every number later in your profile.</p>
        ${plan ? planSummary(plan) : html`<div class="skel"></div>`}`;
    }
  };

  const draw = () => {
    root.innerHTML = String(html`<div class="ob">
      <div class="ob-top">${logo()}<button class="btn ghost sm" id="out">Log out</button></div>
      <div class="ob-prog"><div class="row between small muted" style="margin-bottom:6px"><span>Step ${step + 1} of ${STEPS.length} · ${STEPS[step]}</span></div>
        <div class="bar"><i style="width:${((step + 1) / STEPS.length) * 100}%"></i></div></div>
      <div class="card" id="stepbox">${content()}<div class="err" id="err" role="alert">${error}</div>
        <div class="ob-nav"><button class="btn" id="back" ${step === 0 ? 'disabled' : ''}>Back</button>
          <button class="btn primary" id="next">${step === STEPS.length - 1 ? 'Start using NutriSense' : step === 5 ? (a.pantry.length ? 'Continue' : 'Skip for now') : 'Continue'}</button></div></div></div>`);
    bind();
  };

  const bind = () => {
    $('#out').onclick = logout;
    $('#back').onclick = () => { error = ''; step -= 1; draw(); };
    $$('.choice').forEach((c) => c.onclick = () => {
      const k = c.dataset.key;
      if (step === 0) a.goal = k; else if (step === 2) a.activity = k; else if (step === 3) a.diet = k;
      error = ''; sync(); draw();
    });
    $$('#sex .chip').forEach((c) => c.onclick = () => { sync(); a.sex = c.dataset.key; draw(); });
    $$('#mpd .chip').forEach((c) => c.onclick = () => { a.meals_per_day = Number(c.dataset.key); draw(); });
    $$('#alg .chip').forEach((c) => c.onclick = () => { toggleChip(c); a.allergies = $$('#alg .chip.on').map((x) => x.dataset.key); });
    $$('#cond .chip').forEach((c) => c.onclick = () => { toggleChip(c); a.conditions = $$('#cond .chip.on').map((x) => x.dataset.key); redrawExtras?.(); });
    redrawExtras = $('#cond-extra') ? mountCondExtras($('#cond-extra'), () => a.conditions, extras) : null;
    $$('#qk .chip').forEach((c) => c.onclick = () => { toggleChip(c); a.pantry = $$('#qk .chip.on').map((x) => x.dataset.key); $('#next').textContent = a.pantry.length ? 'Continue' : 'Skip for now'; });
    $('#next').onclick = next;
    $('#stepbox').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); next(); } });
    if (step === 6 && !plan && !error) loadPlan();
  };

  const sync = () => {
    const v = (id) => $(id)?.value;
    if ($('#a-age')) { a.age = v('#a-age').trim(); a.height_cm = v('#a-h').trim(); a.weight_kg = v('#a-w').trim(); a.target_weight_kg = v('#a-t').trim(); }
    if ($('#a-oa')) { a.other_allergy = v('#a-oa'); a.dislikes = v('#a-dl'); }
  };

  async function loadPlan() {
    try { plan = (await post('/api/plan/preview', body())).plan; error = ''; }
    catch (e) { error = e.message; }
    draw();
  }

  async function next() {
    sync();
    error = valid();
    if (error) { $('#err').textContent = error; return; }
    if (step < STEPS.length - 1) {
      step += 1;
      if (step === 6) plan = null;
      draw();
      return;
    }
    await busy($('#next'), async () => {
      try {
        await post('/api/onboarding', { ...body(), pantry: a.pantry, today: today() });
        await refreshProfile();
        state.user.onboarded = true;
        toast('Welcome to NutriSense!');
        navigate('/dashboard', true);
      } catch (e) { $('#err').textContent = e.message; }
    });
  }
  draw();
}
