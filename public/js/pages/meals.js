import { get, post, del } from '../api.js';
import { html, icon, num, today, addDays, niceDate, $, $$, toast, busy, modal, aiDown, emptyState, cap, ring } from '../ui.js';
import { state } from '../app.js';
import { MEAL_TYPES } from '../shared.js';

const guessType = () => { const h = new Date().getHours(); return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 19 ? 'snack' : 'dinner'; };

function resizePhoto(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', image: c.toDataURL('image/jpeg', 0.82) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read. Please try a JPEG or PNG.')); };
    img.src = url;
  });
}

export default async function meals(root) {
  let date = today();
  let day = null;
  let draft = null; // analysis result waiting to be logged
  let type = guessType();
  let text = '';

  const load = async () => { day = await get(`/api/meals?date=${date}`); };
  await load();

  const draw = () => {
    const t = state.targets;
    const tot = day.totals;
    root.innerHTML = String(html`
    <div class="top"><div><h1>Meal log</h1><p>Describe what you ate and we will do the maths.</p></div>
      <div class="row"><button class="icon-btn" id="prev" aria-label="Previous day">‹</button><b>${date === today() ? 'Today' : niceDate(date)}</b>
      <button class="icon-btn" id="nextd" aria-label="Next day" ${date >= today() ? 'disabled' : ''}>›</button></div></div>
    <div class="cols" style="margin-top:0">
      <div>
        <div class="card"><div class="card-h"><h3>What did you eat?</h3></div>
          <div class="chips" id="types" style="margin-bottom:12px">${MEAL_TYPES.map((m) => html`<button class="chip ${type === m ? 'on' : ''}" data-t="${m}">${cap(m)}</button>`)}</div>
          <textarea class="input" id="txt" placeholder="e.g. 2 rotis, 1 bowl dal and a plate of salad" maxlength="400">${text}</textarea>
          <div class="row wrap" style="margin-top:12px"><button class="btn primary" id="an">${icon('sparkle')}Calculate</button>
            <label class="btn" for="photo">${icon('camera')}Photo</label><input type="file" id="photo" accept="image/jpeg,image/png,image/webp" hidden>
            <button class="btn ghost" id="manual">Enter manually</button></div>
          <div id="res">${draft ? result() : ''}</div></div>
      </div>
      <div>
        <div class="card"><div class="row" style="gap:18px">${ring({ value: tot.kcal, max: t.calories, size: 110, label: num(tot.kcal), sub: `of ${num(t.calories)}` })}
          <div class="grow small"><div class="row between"><span>Protein</span><b>${num(tot.protein)} g</b></div><div class="row between"><span>Carbs</span><b>${num(tot.carbs)} g</b></div>
          <div class="row between"><span>Fats</span><b>${num(tot.fat)} g</b></div><div class="row between"><span>Fiber</span><b>${num(tot.fiber)} g</b></div></div></div></div>
        <div class="card"><div class="card-h"><h3>Logged meals</h3></div>
          ${day.meals.length ? html`<div class="list">${MEAL_TYPES.flatMap((mt) => day.meals.filter((m) => m.meal_type === mt)).map((m) => html`<div class="item"><div class="grow"><b>${m.name}</b><span class="small muted">${cap(m.meal_type)} · ${num(m.protein)}g P · ${num(m.carbs)}g C · ${num(m.fat)}g F</span></div>
            <b>${num(m.kcal)}</b><button class="icon-btn" data-del="${m.id}" aria-label="Delete ${m.name}">${icon('trash')}</button></div>`)}</div>`
            : emptyState('Nothing logged', 'Meals you add will show up here.')}</div>
      </div>
    </div>`);
    bind();
  };

  const result = () => html`<div class="rcard" style="margin-top:16px"><div class="row between"><h4>Estimated nutrition</h4><span class="tag ${draft.source === 'ai' || draft.source === 'photo' ? '' : 'gray'}">${draft.source === 'ai' ? 'AI estimate' : draft.source === 'photo' ? 'Photo estimate' : 'Built-in food table'}</span></div>
    ${(draft.warnings || []).map((w) => html`<div class="notice bad" style="margin-top:10px">${icon('alert')}<div>${w}</div></div>`)}
    <div class="list" style="margin-top:6px">${draft.items.map((i) => html`<div class="item"><div class="grow"><b>${i.name}</b><span class="small muted">${i.quantity || ''}</span></div><div class="small" style="text-align:right"><b>${num(i.kcal)} kcal</b><div class="muted">${num(i.protein, 1)}P · ${num(i.carbs, 1)}C · ${num(i.fat, 1)}F</div></div></div>`)}</div>
    ${draft.unknown?.length ? html`<div class="notice warn" style="margin-top:8px">${icon('alert')}<div>We did not recognise: <b>${draft.unknown.join(', ')}</b>. They are not counted. Add the AI key for broader coverage, or enter them manually.</div></div>` : ''}
    <div class="row between" style="margin-top:10px"><b>Total</b><b>${num(draft.totals.kcal)} kcal · ${num(draft.totals.protein, 1)}g protein</b></div>
    ${draft.notes ? html`<p class="small muted" style="margin-top:6px">${draft.notes}</p>` : ''}
    ${draft.pantry_matches?.length ? html`<div style="margin-top:12px"><b class="small">Use up from your pantry</b>${draft.pantry_matches.map((p, i) => html`<label class="gro"><input type="checkbox" class="dd" data-i="${i}" checked><span>${p.name}: ${num(p.amount)} ${p.unit}</span></label>`)}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn primary" id="log">Log this ${type}</button><button class="btn ghost" id="discard">Discard</button></div></div>`;

  const bind = () => {
    $('#prev').onclick = async () => { date = addDays(date, -1); draft = null; await load(); draw(); };
    $('#nextd').onclick = async () => { if (date >= today()) return; date = addDays(date, 1); draft = null; await load(); draw(); };
    $$('#types .chip').forEach((c) => c.onclick = () => { text = $('#txt').value; type = c.dataset.t; draw(); });
    $('#an').onclick = (e) => busy(e.currentTarget, async () => {
      text = $('#txt').value.trim();
      if (text.length < 2) return toast('Describe what you ate first.', 'bad');
      try { draft = { ...(await post('/api/meals/analyze', { text, today: date })), logSource: null }; draft.logSource = draft.source === 'ai' ? 'ai' : 'local'; draw(); }
      catch (err) { $('#res').innerHTML = String(aiDown(err)); if (err.code !== 'ai_unavailable') toast(err.message, 'bad'); }
    });
    $('#photo').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const btn = $('#an'); btn.disabled = true; $('#res').innerHTML = '<p class="muted" style="margin-top:14px">Looking at your photo…</p>';
      try {
        const img = await resizePhoto(f);
        draft = { ...(await post('/api/meals/analyze-photo', img)), source: 'photo' }; draft.logSource = 'photo'; text = ''; draw();
      } catch (err) { $('#res').innerHTML = String(aiDown(err)); btn.disabled = false; }
    };
    $('#manual').onclick = () => manualForm();
    if (draft) {
      $('#discard').onclick = () => { draft = null; draw(); };
      $('#log').onclick = (e) => busy(e.currentTarget, async () => {
        const deductions = $$('.dd').filter((c) => c.checked).map((c) => draft.pantry_matches[Number(c.dataset.i)]);
        const name = draft.items.map((i) => i.name).join(', ').slice(0, 120);
        try {
          await post('/api/meals', { date, meal_type: type, name, serving: draft.items.map((i) => i.quantity).filter(Boolean).join(', ').slice(0, 80), ...draft.totals, source: draft.logSource, deductions });
          toast(deductions.length ? 'Meal logged and pantry updated' : 'Meal logged');
          draft = null; text = ''; await load(); draw();
        } catch (err) { toast(err.message, 'bad'); }
      });
    }
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      try { await del(`/api/meals/${b.dataset.del}`); toast('Removed'); await load(); draw(); } catch (err) { toast(err.message, 'bad'); }
    });
  };

  function manualForm() {
    const f = (id, label, ph = '') => html`<div class="field"><label class="f" for="${id}">${label}</label><input class="input" id="${id}" inputmode="decimal" placeholder="${ph}"></div>`;
    modal({
      title: 'Enter a meal manually',
      body: html`<div class="field"><label class="f" for="m-name">Meal</label><input class="input" id="m-name" maxlength="120"></div>
        <div class="grid2">${f('m-kcal', 'Calories (kcal)')}${f('m-p', 'Protein (g)', '0')}${f('m-c', 'Carbs (g)', '0')}${f('m-f', 'Fats (g)', '0')}</div>${f('m-fi', 'Fiber (g)', '0')}<div class="err" id="m-err" role="alert"></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Log meal', kind: 'primary', onClick: async () => {
        try {
          await post('/api/meals', { date, meal_type: type, name: $('#m-name').value.trim(), kcal: $('#m-kcal').value, protein: $('#m-p').value || 0, carbs: $('#m-c').value || 0, fat: $('#m-f').value || 0, fiber: $('#m-fi').value || 0, source: 'manual' });
          await load(); draw(); toast('Meal logged'); return false;
        } catch (err) { $('#m-err').textContent = err.message; return true; }
      } }]
    });
  }
  draw();
}
