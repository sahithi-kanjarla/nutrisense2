import { get, post, put, del, patch } from '../api.js';
import { html, icon, num, today, addDays, niceDate, parseDate, $, $$, toast, busy, modal, aiDown, emptyState, cap, confirmBox } from '../ui.js';
import { MEAL_TYPES } from '../shared.js';

const mondayOf = (s) => { const d = parseDate(s); const k = (d.getDay() + 6) % 7; return addDays(s, -k); };
const CATS = [['produce', 'Fresh produce'], ['dairy', 'Dairy and protein'], ['staples', 'Pantry staples']];

export default async function planner(root) {
  const date = today();
  let start = mondayOf(date);
  let plan, grocery;
  let err = '';

  const load = async () => { [plan, grocery] = await Promise.all([get(`/api/planner?start=${start}&today=${date}`), get('/api/grocery')]); };
  await load();

  const draw = () => {
    const c = plan.coverage;
    root.innerHTML = String(html`
    <div class="top"><div><h1>Meal planner</h1><p>Plan the week around what you already have.</p></div>
      <div class="row wrap"><button class="icon-btn" id="pw" aria-label="Previous week">‹</button><b>${niceDate(start, { day: 'numeric', month: 'short' })} – ${niceDate(plan.end, { day: 'numeric', month: 'short' })}</b><button class="icon-btn" id="nw" aria-label="Next week">›</button>
      <button class="btn primary" id="ai">${icon('sparkle')}${plan.planned ? 'Re-plan with AI' : 'Plan my week with AI'}</button></div></div>
    ${err}
    ${c.total ? html`<div class="notice" style="margin-bottom:16px">${icon('pantry')}<div><b>${c.covered} of ${c.total}</b> planned meals can be cooked from your pantry right now.</div></div>` : ''}
    <div class="week">${plan.days.map((d) => html`<div class="day ${d.date === date ? 'today' : ''}"><h5>${niceDate(d.date, { weekday: 'short', day: 'numeric' })}</h5>
      ${d.meals.map((m) => html`<button class="pm ${m.status === 'needs' ? 'needs' : ''}" data-m="${m.id}" data-d="${d.date}"><small>${cap(m.meal_type)}</small><b>${m.dish}</b><small>${m.kcal ? `${num(m.kcal)} kcal` : ''}${m.status === 'needs' ? ` · need ${m.missing.length}` : ''}</small></button>`)}
      <button class="addpm" data-add="${d.date}">+ Add</button>
      ${d.totals.kcal ? html`<div class="small muted" style="margin-top:6px">${num(d.totals.kcal)} kcal · ${num(d.totals.protein)}g P</div>` : ''}</div>`)}</div>
    <div class="card" style="margin-top:22px"><div class="card-h"><span style="color:var(--green)">${icon('cart', 22)}</span><h3>Grocery list</h3>
      <div class="row right wrap"><button class="btn sm" id="fromplan">Add what the plan needs</button><button class="btn sm" id="copy">${icon('copy', 15)}Copy</button><button class="btn sm ghost" id="clr">Clear ticked</button></div></div>
      <form class="row" id="gform" style="margin-bottom:10px"><input class="input" id="gname" placeholder="Add an item" maxlength="80" aria-label="Add grocery item"><button class="btn">${icon('plus', 16)}Add</button></form>
      ${grocery.items.length ? CATS.map(([k, t]) => { const its = grocery.items.filter((i) => i.category === k); return its.length ? html`<h4 class="small muted" style="margin:14px 0 2px;text-transform:uppercase;letter-spacing:.06em">${t}</h4>${its.map((i) => html`<div class="gro ${i.checked ? 'done' : ''}"><input type="checkbox" data-g="${i.id}" ${i.checked ? 'checked' : ''} aria-label="Bought ${i.name}"><span class="grow">${i.name}${i.qty ? ` · ${i.qty}` : ''}</span><button class="icon-btn" data-gd="${i.id}" aria-label="Remove ${i.name}">${icon('x', 16)}</button></div>`)}` : ''; })
        : emptyState('Your list is empty', 'Plan some meals, then add what is missing in one tap.')}</div>`);
    bind();
  };

  const bind = () => {
    $('#pw').onclick = async () => { start = addDays(start, -7); await load(); draw(); };
    $('#nw').onclick = async () => { start = addDays(start, 7); await load(); draw(); };
    $('#ai').onclick = async (e) => {
      if (plan.planned && !(await confirmBox('Replace this week?', 'The AI will replace every planned meal in this week.', 'Re-plan'))) return;
      await busy(e.currentTarget, async () => {
        err = '';
        try { const r = await post('/api/ai/plan-week', { date, start }); toast(`Planned ${r.saved} meals${r.skipped ? ` (${r.skipped} unsafe dishes skipped)` : ''}`); }
        catch (e2) { err = aiDown(e2); }
        await load(); draw();
      });
    };
    $$('[data-add]').forEach((b) => b.onclick = () => mealForm(b.dataset.add));
    $$('[data-m]').forEach((b) => b.onclick = () => { const d = plan.days.find((x) => x.date === b.dataset.d); mealForm(b.dataset.d, d.meals.find((m) => m.id === Number(b.dataset.m))); });
    $('#gform').onsubmit = async (e) => { e.preventDefault(); const n = $('#gname').value.trim(); if (!n) return; try { await post('/api/grocery', { name: n }); await load(); draw(); } catch (e2) { toast(e2.message, 'bad'); } };
    $$('[data-g]').forEach((c) => c.onchange = async () => { await patch(`/api/grocery/${c.dataset.g}`, { checked: c.checked }); await load(); draw(); });
    $$('[data-gd]').forEach((b) => b.onclick = async () => { await del(`/api/grocery/${b.dataset.gd}`); await load(); draw(); });
    $('#clr').onclick = async () => { const r = await post('/api/grocery/clear-checked'); toast(`Cleared ${r.removed}`); await load(); draw(); };
    $('#fromplan').onclick = async () => { const r = await post('/api/grocery/from-plan', { today: date, start }); toast(r.added ? `Added ${r.added} items` : 'Nothing missing. You have it all.'); await load(); draw(); };
    $('#copy').onclick = async () => {
      const txt = grocery.items.filter((i) => !i.checked).map((i) => `- ${i.name}${i.qty ? ` (${i.qty})` : ''}`).join('\n');
      if (!txt) return toast('Nothing to copy', 'bad');
      try { await navigator.clipboard.writeText(`Grocery list\n${txt}`); toast('Copied to clipboard'); } catch { toast('Could not copy. Select the text manually.', 'bad'); }
    };
  };

  function mealForm(d, m) {
    modal({
      title: `${m ? 'Edit' : 'Add'} meal · ${niceDate(d)}`,
      body: html`<div class="field"><label class="f" for="pm-type">Meal</label><select class="input" id="pm-type">${MEAL_TYPES.map((t) => html`<option value="${t}" ${m?.meal_type === t ? 'selected' : ''}>${cap(t)}</option>`)}</select></div>
        <div class="field"><label class="f" for="pm-dish">Dish</label><input class="input" id="pm-dish" maxlength="80" value="${m?.dish || ''}"></div>
        <div class="field"><label class="f" for="pm-ing">Ingredients (comma separated)</label><input class="input" id="pm-ing" value="${(m?.ingredients || []).map((i) => i.name).join(', ')}"><div class="hint">Used to check your pantry and build the grocery list.</div></div>
        <div class="grid2"><div class="field"><label class="f" for="pm-k">Calories</label><input class="input" id="pm-k" inputmode="numeric" value="${m?.kcal ?? ''}"></div><div class="field"><label class="f" for="pm-p">Protein (g)</label><input class="input" id="pm-p" inputmode="numeric" value="${m?.protein ?? ''}"></div></div><div class="err" id="pm-err" role="alert"></div>`,
      actions: [m ? { label: 'Delete', kind: 'danger', onClick: async () => { await del(`/api/planner/meal/${m.id}`); await load(); draw(); } } : { label: 'Cancel' },
        { label: 'Save', kind: 'primary', onClick: async () => {
          try {
            await put('/api/planner/meal', { date: d, meal_type: $('#pm-type').value, dish: $('#pm-dish').value.trim(), kcal: $('#pm-k').value, protein: $('#pm-p').value,
              ingredients: $('#pm-ing').value.split(',').map((s) => s.trim()).filter(Boolean).map((name) => ({ name })) });
            await load(); draw(); return false;
          } catch (e) { $('#pm-err').textContent = e.message; return true; }
        } }]
    });
  }
  draw();
}
