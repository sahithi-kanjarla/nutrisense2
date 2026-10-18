import { get, put, post } from '../api.js';
import { html, icon, num, $, $$, toast, busy, modal, confirmBox } from '../ui.js';
import { state, refreshProfile, navigate } from '../app.js';
import { GOALS, ACTIVITY, DIETS, ALLERGIES, CONDITIONS, label, planSummary, chip, toggleChip } from '../shared.js';

export default async function profile(root) {
  await refreshProfile();
  const P = state.profile;
  let t = state.targets;

  const sel = (id, list, cur) => html`<select class="input" id="${id}">${list.map(([k, n]) => html`<option value="${k}" ${cur === k ? 'selected' : ''}>${n}</option>`)}</select>`;
  const unit = (id, v, u) => html`<div class="unit"><input class="input" id="${id}" inputmode="decimal" value="${v ?? ''}"><i>${u}</i></div>`;

  root.innerHTML = String(html`
  <div class="top"><div><h1>Health profile</h1><p>The numbers behind your targets. Changes recalculate your plan.</p></div></div>
  <div class="cols" style="margin-top:0"><div>
    <form class="card" id="pf"><div class="card-h"><h3>About you</h3></div>
      <div class="grid2"><div class="field"><label class="f" for="p-goal">Goal</label>${sel('p-goal', GOALS, P.goal)}</div><div class="field"><label class="f" for="p-act">Activity</label>${sel('p-act', ACTIVITY, P.activity)}</div>
      <div class="field"><label class="f" for="p-sex">Sex</label>${sel('p-sex', [['female', 'Female'], ['male', 'Male'], ['na', 'Prefer not to say']], P.sex)}</div><div class="field"><label class="f" for="p-age">Age</label>${unit('p-age', P.age, 'yrs')}</div>
      <div class="field"><label class="f" for="p-h">Height</label>${unit('p-h', P.height_cm, 'cm')}</div><div class="field"><label class="f" for="p-w">Weight</label>${unit('p-w', P.weight_kg, 'kg')}</div>
      <div class="field"><label class="f" for="p-t">Target weight</label>${unit('p-t', P.target_weight_kg, 'kg')}</div><div class="field"><label class="f" for="p-diet">Eating pattern</label>${sel('p-diet', DIETS, P.diet)}</div></div>
      <div class="field"><label class="f">Allergies</label><div class="chips" id="alg">${ALLERGIES.map(([k, n]) => chip(k, n, P.allergies.includes(k)))}</div></div>
      <div class="field"><label class="f" for="p-oa">Other things to avoid</label><input class="input" id="p-oa" maxlength="120" value="${P.allergies.filter((a) => !ALLERGIES.some((x) => x[0] === a)).join(', ')}" placeholder="comma separated"></div>
      <div class="field"><label class="f" for="p-dl">Dislikes</label><input class="input" id="p-dl" maxlength="200" value="${P.dislikes || ''}"></div>
      <div class="field"><label class="f">Health conditions</label><div class="chips" id="cond">${CONDITIONS.map(([k, n]) => chip(k, n, P.conditions.includes(k)))}</div></div>
      <div class="err" id="pe" role="alert"></div><button class="btn primary" id="save">Save and recalculate</button></form>
  </div><div>
    <div class="card"><div class="card-h"><h3>Daily targets</h3></div><div id="tg"></div>
      <div class="grid2" style="margin-top:14px">${[['calories', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fats', 'g'], ['fiber', 'Fiber', 'g'], ['water_glasses', 'Water', 'glasses']].map(([k, n, u]) => html`<div class="field"><label class="f" for="t-${k}">${n}</label>${unit(`t-${k}`, t[k], u)}</div>`)}</div>
      <div class="err" id="te" role="alert"></div><button class="btn" id="tsave">Save custom targets</button>
      <p class="hint">Custom targets stay until you change your profile and recalculate.</p></div>
    <div class="card"><div class="card-h"><h3>Redo the questionnaire</h3></div><p class="muted small">Start again from the first question. Your meals and pantry are kept.</p><button class="btn" id="redo" style="margin-top:12px">Restart questionnaire</button></div>
  </div></div>`);

  let plan = state.plan;
  const showPlan = () => { $('#tg').innerHTML = plan ? String(planSummary(plan)) : ''; };
  showPlan();
  $$('#alg .chip,#cond .chip').forEach((c) => c.onclick = () => toggleChip(c));

  $('#pf').onsubmit = async (e) => {
    e.preventDefault();
    const other = $('#p-oa').value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const body = { goal: $('#p-goal').value, activity: $('#p-act').value, sex: $('#p-sex').value, age: $('#p-age').value, height_cm: $('#p-h').value, weight_kg: $('#p-w').value,
      target_weight_kg: $('#p-t').value === '' ? null : $('#p-t').value, diet: $('#p-diet').value, dislikes: $('#p-dl').value,
      allergies: [...$$('#alg .chip.on').map((c) => c.dataset.key), ...other].slice(0, 15), conditions: $$('#cond .chip.on').map((c) => c.dataset.key) };
    await busy($('#save'), async () => {
      $('#pe').textContent = '';
      try { const r = await put('/api/profile', body); state.profile = r.profile; state.targets = r.targets; state.plan = r.plan; toast('Profile saved. Targets recalculated.'); navigate('/profile'); await profile(root); }
      catch (err) { $('#pe').textContent = err.message; }
    });
  };
  $('#tsave').onclick = (e) => busy(e.currentTarget, async () => {
    $('#te').textContent = '';
    const body = Object.fromEntries(['calories', 'protein', 'carbs', 'fat', 'fiber', 'water_glasses'].map((k) => [k, $(`#t-${k}`).value]));
    try { const r = await put('/api/targets', body); state.profile = r.profile; state.targets = r.targets; toast('Targets saved'); } catch (err) { $('#te').textContent = err.message; }
  });
  $('#redo').onclick = async () => {
    if (!(await confirmBox('Restart questionnaire?', 'Your current targets will be cleared until you finish the questionnaire again.', 'Restart'))) return;
    await post('/api/profile/reset'); state.profile = null; state.user.onboarded = false; navigate('/onboarding', true);
  };
}
