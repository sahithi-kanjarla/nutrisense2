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
  let photo = null; // { mime, image } attached to the next analysis

  const load = async () => { day = await get(`/api/meals?date=${date}`); };
  await load();

  const draw = () => {
    const t = state.targets;
    const tot = day.totals;
    root.innerHTML = String(html`
    <div class="top"><div><h1>Meal log</h1><p>Describe your meal, add a photo, or both. You can review and edit everything before it is logged.</p></div>
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
          <div id="pv">${photo ? preview() : ''}</div><div id="res">${draft ? result() : ''}</div></div>
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

  const preview = () => html`<div class="photo-prev"><img src="${photo.image}" alt="Your meal photo"><div class="grow small muted">Photo attached. It is only used for this analysis and is not stored.</div><button class="btn ghost" id="rmphoto" type="button">Remove photo</button></div>`;

  /* ---------- review screen helpers ---------- */
  const named = (i) => String(i.name || '').trim();
  const counted = () => draft.items.filter((i) => named(i) && !i._dirty && !i.unknown);
  const sum = () => {
    const t = counted().reduce((a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat, fiber: a.fiber + i.fiber }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
    const r1 = (v) => Math.round(v * 10) / 10;
    return { kcal: Math.round(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), fiber: r1(t.fiber) };
  };
  const pending = () => draft.items.filter((i) => named(i) && i._dirty).length;
  const unknownCount = () => draft.items.filter((i) => i.unknown).length;
  const canLog = () => counted().length > 0 && pending() === 0 && unknownCount() === 0;
  const visibleMatches = () => {
    const names = draft.items.filter((i) => named(i) && !i.unknown).map((i) => named(i).toLowerCase());
    return (draft.pantry_matches || []).filter((m) => names.includes(String(m.food || '').toLowerCase()));
  };
  const badge = (i) => (i.origin === 'photo' ? html`<span class="tag gray">Seen in photo</span>` : i.origin === 'assumed' ? html`<span class="tag amber">Assumed</span>` : html`<span class="tag">You said</span>`);
  const nutLine = (i) => (i.unknown ? 'Not recognised. Rename it, add an amount or cooking note, or remove it.'
    : i._dirty ? 'Edited. Press Recalculate to update the numbers.'
      : `${num(i.kcal)} kcal · ${num(i.protein, 1)}P · ${num(i.carbs, 1)}C · ${num(i.fat, 1)}F`);
  const statusText = () => {
    const p = pending(); const u = unknownCount();
    if (p) return `${p} edited food${p > 1 ? 's need' : ' needs'} recalculating before you can log.`;
    if (u) return 'Remove or rename the food we did not recognise before logging.';
    if (!counted().length) return 'Add at least one food to log.';
    return '';
  };

  const row = (i, idx) => html`<div class="frow" data-idx="${idx}">
    <div class="frow-top"><div class="frow-badges" id="bd-${idx}">${badge(i)}${i.confidence === 'low' ? html`<span class="tag red">Please check</span>` : ''}</div>
      <button class="icon-btn" type="button" data-rm="${idx}" aria-label="Remove ${i.name || 'food'}">${icon('trash')}</button></div>
    <div class="grid2"><div class="field"><label class="f" for="fn-${idx}">Food</label><input class="input" id="fn-${idx}" data-f="name" data-idx="${idx}" value="${i.name}" maxlength="80"></div>
      <div class="field"><label class="f" for="fq-${idx}">Amount</label><input class="input" id="fq-${idx}" data-f="quantity" data-idx="${idx}" value="${i.quantity || ''}" maxlength="60" placeholder="e.g. 2 pieces or 150 g"></div></div>
    <div class="field"><label class="f" for="fc-${idx}">Ingredients and cooking (optional)</label><input class="input" id="fc-${idx}" data-f="cooking" data-idx="${idx}" value="${i.cooking || ''}" maxlength="120" placeholder="e.g. oats flour and wheat flour, very little oil"></div>
    <div class="small ${i.unknown ? '' : 'muted'}" id="nut-${idx}">${nutLine(i)}</div></div>`;

  const questionsBox = () => (draft.questions?.length ? html`<div class="qbox"><b>A few quick questions</b><p class="small muted">Answers make the estimate more accurate. You can skip any of them.</p>
    ${draft.questions.map((qn) => html`<div class="qrow"><div>${qn.text}</div>
      <div class="chips" style="margin-top:6px">${qn.options.map((o) => html`<button type="button" class="chip" data-q="${qn.id}" data-opt="${o}">${o}</button>`)}</div>
      <input class="input" style="margin-top:6px" data-qa="${qn.id}" maxlength="120" placeholder="Or type your own answer"></div>`)}
    <button class="btn" type="button" id="upd" disabled>${icon('sparkle')}Update estimate with my answers</button></div>` : '');

  const result = () => {
    draft.shownMatches = visibleMatches();
    const t = sum();
    return html`<div class="rcard" style="margin-top:16px"><div class="row between"><h4>Review your meal</h4><span class="tag ${draft.source === 'ai' || draft.source === 'photo' ? '' : 'gray'}">${draft.source === 'ai' ? 'AI estimate' : draft.source === 'photo' ? 'Photo estimate' : 'Built-in food table'}</span></div>
    <p class="small muted">Check each food. Edit names, amounts or cooking details, remove mistakes, or add anything missing. <b>You said</b> = confirmed by you · <b>Seen in photo</b> = visible, amount estimated · <b>Assumed</b> = an AI guess.</p>
    ${(draft.warnings || []).map((w) => html`<div class="notice bad" style="margin-top:10px">${icon('alert')}<div>${w}</div></div>`)}
    <div id="rows">${draft.items.map((i, idx) => row(i, idx))}</div>
    <div class="row wrap" style="margin-top:10px"><button class="btn" type="button" id="add">+ Add a food</button><button class="btn" type="button" id="recalc" ${pending() ? '' : 'disabled'}>Recalculate edited foods</button></div>
    ${questionsBox()}
    <div class="row between" style="margin-top:14px"><b>Total</b><b id="tot">${num(t.kcal)} kcal · ${num(t.protein, 1)}g protein · ${num(t.carbs, 1)}g carbs · ${num(t.fat, 1)}g fat</b></div>
    ${draft.notes ? html`<p class="small muted" style="margin-top:6px">${draft.notes}</p>` : ''}
    ${draft.recalcNote ? html`<p class="small muted" style="margin-top:6px">${draft.recalcNote}</p>` : ''}
    <p class="small" style="margin-top:6px;color:var(--amber, #8a5f0a)" id="st">${statusText()}</p>
    ${draft.shownMatches.length ? html`<div style="margin-top:12px"><b class="small">Use up from your pantry</b>${draft.shownMatches.map((m, i) => html`<label class="gro"><input type="checkbox" class="dd" data-i="${i}" checked><span>${m.name}: ${num(m.amount)} ${m.unit}</span></label>`)}</div>` : ''}
    <div class="row" style="margin-top:14px"><button class="btn primary" id="log" ${canLog() ? '' : 'disabled'}>Log this ${type}</button><button class="btn ghost" id="discard">Discard</button></div></div>`;
  };

  const prepare = (r) => ({
    ...r,
    items: r.items.map((i) => ({ ...i, _dirty: false, _edited: false })),
    questions: r.questions || [],
    answers: {},
    logSource: r.source === 'photo' ? 'photo' : r.source === 'ai' ? 'ai' : 'local'
  });

  const redraw = () => { text = $('#txt').value; draw(); };

  const runAnalysis = async (answers) => {
    const body = { text, today: date, answers };
    if (photo) { body.image = photo.image; body.mime = photo.mime; }
    const confirmed = draft ? draft.items.filter((i) => i._edited && named(i)).map((i) => ({ name: i.name, quantity: i.quantity, cooking: i.cooking })) : [];
    if (confirmed.length) body.confirmed = confirmed;
    try {
      draft = prepare(await post('/api/meals/analyze', body));
      draw();
    } catch (err) { $('#res').innerHTML = String(aiDown(err)); if (err.code !== 'ai_unavailable') toast(err.message, 'bad'); }
  };

  const refresh = (idx) => {
    const it = draft.items[idx];
    const nut = $(`#nut-${idx}`); if (nut) { nut.textContent = nutLine(it); nut.classList.remove('muted'); }
    const bd = $(`#bd-${idx}`); if (bd) bd.innerHTML = String(html`${badge(it)}`);
    const t = sum();
    $('#tot').textContent = `${num(t.kcal)} kcal · ${num(t.protein, 1)}g protein · ${num(t.carbs, 1)}g carbs · ${num(t.fat, 1)}g fat`;
    $('#st').textContent = statusText();
    $('#log').disabled = !canLog();
    $('#recalc').disabled = pending() === 0;
  };

  const bindDraft = () => {
    const res = $('#res');
    res.oninput = (e) => {
      const el = e.target;
      if (el.dataset.f) {
        const idx = Number(el.dataset.idx); const it = draft.items[idx]; if (!it) return;
        it[el.dataset.f] = el.value; it._dirty = true; it._edited = true; it.origin = 'user'; it.unknown = false; it.confidence = 'high';
        refresh(idx);
      } else if (el.dataset.qa) {
        draft.answers[el.dataset.qa] = el.value.trim();
        $$(`[data-q="${el.dataset.qa}"]`, res).forEach((c) => c.classList.remove('on'));
        $('#upd').disabled = !Object.values(draft.answers).some(Boolean);
      }
    };
    res.onclick = (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { draft.items.splice(Number(rm.dataset.rm), 1); redraw(); return; }
      const chip = e.target.closest('[data-q]');
      if (chip) {
        const id = chip.dataset.q;
        const was = chip.classList.contains('on');
        $$(`[data-q="${id}"]`, res).forEach((c) => c.classList.remove('on'));
        const input = $(`[data-qa="${id}"]`, res); if (input) input.value = '';
        if (was) delete draft.answers[id]; else { chip.classList.add('on'); draft.answers[id] = chip.dataset.opt; }
        $('#upd').disabled = !Object.values(draft.answers).some(Boolean);
      }
    };
    $('#add').onclick = () => {
      draft.items.push({ name: '', quantity: '', cooking: '', origin: 'user', confidence: 'high', kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, _dirty: true, _edited: true });
      redraw();
      const last = $$('#rows [data-f="name"]').pop(); if (last) last.focus();
    };
    $('#recalc').onclick = (e) => busy(e.currentTarget, async () => {
      draft.items = draft.items.filter((i) => named(i) || !i._dirty);
      const idxs = draft.items.map((_, i) => i).filter((i) => draft.items[i]._dirty);
      if (!idxs.length) { redraw(); return; }
      try {
        const r = await post('/api/meals/estimate-items', { items: idxs.map((i) => ({ name: draft.items[i].name, quantity: draft.items[i].quantity, cooking: draft.items[i].cooking })), today: date });
        idxs.forEach((i, n) => { draft.items[i] = { ...r.items[n], _dirty: false, _edited: true }; });
        draft.warnings = [...new Set([...(draft.warnings || []), ...(r.warnings || [])])];
        const have = new Set((draft.pantry_matches || []).map((m) => m.item_id));
        draft.pantry_matches = [...(draft.pantry_matches || []), ...(r.pantry_matches || []).filter((m) => !have.has(m.item_id))];
        draft.recalcNote = r.notes || '';
        redraw();
      } catch (err) { toast(err.message, 'bad'); }
    });
    if (draft.questions?.length) {
      $('#upd').onclick = (e) => busy(e.currentTarget, async () => {
        const answers = draft.questions.map((qn) => ({ question: qn.text, answer: draft.answers[qn.id] })).filter((a) => a.answer);
        text = $('#txt').value.trim();
        await runAnalysis(answers);
      });
    }
    $('#discard').onclick = () => { draft = null; redraw(); };
    $('#log').onclick = (e) => busy(e.currentTarget, async () => {
      if (!canLog()) return;
      const rows = counted();
      const deductions = $$('.dd').filter((c) => c.checked).map((c) => draft.shownMatches[Number(c.dataset.i)]).map(({ item_id, name, amount, unit }) => ({ item_id, name, amount, unit }));
      const t = sum();
      try {
        await post('/api/meals', {
          date, meal_type: type, name: rows.map((i) => i.name).join(', ').slice(0, 120),
          serving: rows.map((i) => i.quantity).filter(Boolean).join(', ').slice(0, 80), ...t, source: draft.logSource, deductions
        });
        toast(deductions.length ? 'Meal logged and pantry updated' : 'Meal logged');
        draft = null; photo = null; text = ''; await load(); draw();
      } catch (err) { toast(err.message, 'bad'); }
    });
  };

  const bind = () => {
    $('#prev').onclick = async () => { date = addDays(date, -1); draft = null; await load(); draw(); };
    $('#nextd').onclick = async () => { if (date >= today()) return; date = addDays(date, 1); draft = null; await load(); draw(); };
    $$('#types .chip').forEach((c) => c.onclick = () => { text = $('#txt').value; type = c.dataset.t; draw(); });
    $('#an').onclick = (e) => busy(e.currentTarget, async () => {
      text = $('#txt').value.trim();
      if (text.length < 2 && !photo) return toast('Describe your meal or add a photo first.', 'bad');
      draft = null;
      await runAnalysis([]);
    });
    $('#photo').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { photo = await resizePhoto(f); text = $('#txt').value; draw(); }
      catch (err) { toast(err.message, 'bad'); }
    };
    if (photo) $('#rmphoto').onclick = () => { photo = null; redraw(); };
    $('#manual').onclick = () => manualForm();
    if (draft) bindDraft();
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
