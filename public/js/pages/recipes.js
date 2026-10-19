import { get, post, del } from '../api.js';
import { state } from '../app.js';
import { html, icon, num, today, $, $$, toast, busy, aiDown, emptyState, cap, esc } from '../ui.js';

const FILTERS = [['pantry', 'From my pantry'], ['use_soon', 'Use up expiring'], ['high_protein', 'High protein'], ['quick', 'Quick (30 min or less)']];

export function recipeCard(r, { saved = false, onSave, onDelete, onLog } = {}) {
  const m = r.match;
  return html`<div class="rcard">
    <div class="row between wrap"><h4>${r.title}</h4>${r.tag ? html`<span class="tag">${r.tag}</span>` : ''}</div>
    <p class="small muted">${r.time_min} min · serves ${r.servings} · <b>${num(r.kcal)} kcal</b> · ${num(r.protein, 1)}g protein · ${num(r.fiber, 1)}g fiber (per serving)</p>
    ${r.sodium_note ? html`<p class="small muted" style="margin-top:6px">${r.sodium_mg != null ? `About ${num(r.sodium_mg)} mg sodium a serving. ` : ''}${r.sodium_note}</p>` : ''}
    ${m ? html`<p class="small" style="margin-top:6px"><span class="tag ${m.missing.length ? 'amber' : ''}">${m.have}/${m.total} ingredients in pantry</span></p>` : ''}
    <ul>${r.ingredients.map((i) => html`<li class="${i.status === 'missing' ? 'ing-miss' : i.status === 'use_soon' ? 'ing-soon' : i.status === 'in_pantry' ? 'ing-have' : ''}">${i.qty ? `${i.qty} ` : ''}${i.name}${i.status === 'use_soon' ? ' (use soon)' : i.status === 'missing' ? ' (need to buy)' : ''}</li>`)}</ul>
    ${r.steps?.length ? html`<details><summary class="small" style="cursor:pointer;font-weight:600">Method</summary><ol>${r.steps.map((s) => html`<li>${s}</li>`)}</ol></details>` : ''}
    <div class="row wrap" style="margin-top:12px">${onSave ? html`<button class="btn sm" data-save>${icon('bookmark', 16)}Save</button>` : ''}
      ${onLog ? html`<button class="btn sm" data-logr>${icon('plus', 16)}Log one serving</button>` : ''}
      ${onDelete ? html`<button class="btn sm ghost" data-delr>${icon('trash', 16)}Remove</button>` : ''}</div></div>`;
}

export default async function recipes(root) {
  const date = today();
  let tab = 'ideas', filter = 'pantry', list = null, notice = '', saved = (await get('/api/recipes/saved')).recipes;

  async function generate(refresh = false) {
    notice = ''; list = null; draw();
    try { const r = await post('/api/ai/recipes', { date, filter, refresh }); list = r.recipes; if (!list.length) notice = html`<div class="notice warn">${icon('alert')}<div>No safe recipes came back this time. Try again or change the filter.</div></div>`; }
    catch (err) { notice = aiDown(err); list = []; }
    draw();
  }

  const draw = () => {
    root.innerHTML = String(html`
    <div class="top"><div><h1>Recipes</h1><p>Ideas that fit your pantry, your diet and your allergies.</p></div>
      <div class="pill-tabs"><button class="${tab === 'ideas' ? 'on' : ''}" data-tab="ideas">Ideas</button><button class="${tab === 'saved' ? 'on' : ''}" data-tab="saved">Saved (${saved.length})</button></div></div>
    ${tab === 'ideas' ? html`
      <div class="row wrap" style="margin-bottom:18px"><div class="chips">${FILTERS.filter(([k]) => !(k === 'high_protein' && state.profile?.conditions?.includes('clin'))).map(([k, t]) => html`<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${t}</button>`)}</div>
        <button class="btn primary right" id="gen">${icon('sparkle')}${list ? 'New ideas' : 'Get recipe ideas'}</button></div>
      ${notice}
      ${list?.length ? html`<div class="recipes" id="rl">${list.map((r) => recipeCard(r, { onSave: true, onLog: true }))}</div>` : ''}
      ${list === null ? html`<div class="card">${emptyState('Hungry for ideas?', 'Choose a filter and tap "Get recipe ideas". Every recipe is checked against your allergies and diet.')}</div>` : ''}`
    : saved.length ? html`<div class="recipes" id="rl">${saved.map((r) => recipeCard(r, { onDelete: true, onLog: true }))}</div>` : html`<div class="card">${emptyState('No saved recipes', 'Save recipes you like and they will be here.')}</div>`}`);
    $$('[data-tab]').forEach((b) => b.onclick = () => { tab = b.dataset.tab; draw(); });
    $$('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; list = null; notice = ''; draw(); });
    $('#gen') && ($('#gen').onclick = (e) => busy(e.currentTarget, () => generate(Boolean(list))));
    const src = tab === 'ideas' ? list : saved;
    $$('#rl .rcard').forEach((card, i) => {
      const r = src[i];
      card.querySelector('[data-save]')?.addEventListener('click', async () => {
        try { const res = await post('/api/recipes/saved', { recipe: r, today: date }); saved = (await get('/api/recipes/saved')).recipes; toast(res.already ? 'Already saved' : 'Recipe saved'); draw(); } catch (e) { toast(e.message, 'bad'); }
      });
      card.querySelector('[data-delr]')?.addEventListener('click', async () => { await del(`/api/recipes/saved/${r.id}`); saved = saved.filter((x) => x.id !== r.id); draw(); });
      card.querySelector('[data-logr]')?.addEventListener('click', async () => {
        const h = new Date().getHours();
        try { await post('/api/meals', { date, meal_type: h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner', name: r.title, serving: '1 serving', kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber, source: 'recipe' }); toast('Logged one serving'); } catch (e) { toast(e.message, 'bad'); }
      });
    });
  };
  draw();
}
