import { get, post, patch, del } from '../api.js';
import { openScanner } from './pantry-scan.js';
import { html, icon, num, today, $, $$, toast, busy, modal, confirmBox, emptyState, cap, esc } from '../ui.js';

const LOCS = [['all', 'All'], ['fridge', 'Fridge'], ['dry', 'Dry store'], ['freezer', 'Freezer'], ['other', 'Other']];

export default async function pantry(root) {
  const date = today();
  let data = await get(`/api/pantry?today=${date}`);
  let loc = 'all';
  let q = '';

  const expiryTag = (i) => i.status === 'expired' ? html`<span class="tag red">Expired</span>`
    : i.status === 'soon' ? html`<span class="tag amber">${i.days_left === 0 ? 'Expires today' : `${i.days_left}d left`}</span>`
    : i.days_left != null ? html`<span class="tag gray">${i.days_left}d left</span>` : '';

  const draw = () => {
    const items = data.items.filter((i) => (loc === 'all' || i.location === loc) && i.name.toLowerCase().includes(q.toLowerCase()));
    const s = data.stats;
    root.innerHTML = String(html`
    <div class="top"><div><h1>Pantry</h1><p>Everything you have at home, and when it needs using.</p></div><div class="row"><button class="btn" id="scan" ${data.scan?.available ? '' : 'disabled'} title="${data.scan?.available ? '' : 'Needs a Gemini API key'}">${icon('camera')}Scan package</button><button class="btn primary" id="add">${icon('plus')}Add item</button></div></div>
    ${data.scan?.available ? '' : html`<p class="hint">Package scanning is turned off because no Gemini API key is set. You can still add items by hand.</p>`}
    <div class="stats-row">
      <div class="card stat"><div class="ico-b">${icon('pantry', 22)}</div><div><b>${s.total}</b><span>items</span></div></div>
      <div class="card stat"><div class="ico-b" style="background:#fdf3dc;color:#9a6a0a">${icon('alert', 22)}</div><div><b>${s.expiring}</b><span>expiring soon</span></div></div>
      <div class="card stat"><div class="ico-b" style="background:#fbe6df;color:#a4412a">${icon('trash', 22)}</div><div><b>${s.expired}</b><span>expired</span></div></div>
      <div class="card stat"><div class="ico-b">${icon('cart', 22)}</div><div><b>${s.low}</b><span>running low</span></div></div>
    </div>
    ${s.best_protein.length ? html`<div class="notice" style="margin-bottom:18px">${icon('sparkle')}<div>Your best protein sources right now: <b>${s.best_protein.join(', ')}</b>.</div></div>` : ''}
    <div class="row wrap between" style="margin-bottom:16px"><div class="pill-tabs" role="tablist">${LOCS.map(([k, t]) => html`<button class="${loc === k ? 'on' : ''}" data-loc="${k}">${t}</button>`)}</div>
      <input class="input" id="q" placeholder="Search pantry" value="${q}" style="max-width:240px" aria-label="Search pantry"></div>
    ${items.length ? html`<div class="pantry-grid">${items.map((i) => html`<div class="card pi ${i.status}" data-id="${i.id}">
        <h4><span>${i.name}</span>${expiryTag(i)}</h4>
        ${i.brand ? html`<div class="small muted">${i.brand}${i.source === 'scan' ? ' · from package label' : ''}</div>` : ''}
        ${i.allergens?.contains?.length ? html`<div class="small">Label declares: ${i.allergens.contains.join(', ')}</div>` : ''}
        <div class="qty">${num(i.quantity)} <span class="muted" style="font-size:14px">${i.unit}</span></div>
        <div class="nut">${i.protein100 != null ? `Per 100 g: ${num(i.kcal100)} kcal · ${num(i.protein100, 1)} g protein` : 'Nutrition not set'}</div>
        <div class="row" style="margin-top:12px"><span class="tag gray">${cap(i.location)}</span><span class="right"></span>
          <button class="icon-btn" data-edit="${i.id}" aria-label="Edit ${i.name}">${icon('settings')}</button><button class="icon-btn" data-del="${i.id}" aria-label="Delete ${i.name}">${icon('trash')}</button></div></div>`)}</div>`
      : data.items.length ? emptyState('No matches', 'Try another search or location.') : emptyState('Your pantry is empty', 'Add what you have at home and NutriSense will track it for you.', html`<button class="btn primary" id="add2">${icon('plus')}Add your first item</button>`)}`);
    $('#add').onclick = () => form();
    $('#scan').onclick = () => openScanner({ onSaved: reload });
    $('#add2') && ($('#add2').onclick = () => form());
    $$('[data-loc]').forEach((b) => b.onclick = () => { loc = b.dataset.loc; draw(); });
    const qi = $('#q'); qi.oninput = () => { q = qi.value; const pos = qi.selectionStart; draw(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
    $$('[data-edit]').forEach((b) => b.onclick = () => form(data.items.find((i) => i.id === Number(b.dataset.edit))));
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      const it = data.items.find((i) => i.id === Number(b.dataset.del));
      if (!(await confirmBox('Remove item', `Remove ${it.name} from your pantry?`, 'Remove'))) return;
      try { await del(`/api/pantry/${it.id}`); toast('Removed'); await reload(); } catch (e) { toast(e.message, 'bad'); }
    });
  };

  const reload = async () => { data = await get(`/api/pantry?today=${date}`); draw(); };

  function form(item) {
    const edit = Boolean(item);
    modal({
      title: edit ? `Edit ${item.name}` : 'Add to pantry',
      body: html`<div class="field"><label class="f" for="p-name">Name</label><input class="input" id="p-name" value="${item?.name || ''}" ${edit ? 'readonly' : ''} maxlength="80" placeholder="e.g. Moong dal"></div>
        <div class="grid2"><div class="field"><label class="f" for="p-qty">Quantity</label><input class="input" id="p-qty" inputmode="decimal" value="${item ? item.quantity : ''}"></div>
        <div class="field"><label class="f" for="p-unit">Unit</label><select class="input" id="p-unit">${['g', 'kg', 'ml', 'l', 'pcs'].map((u) => html`<option ${(item?.unit || 'g') === u ? 'selected' : ''}>${u}</option>`)}</select></div></div>
        <div class="grid2"><div class="field"><label class="f" for="p-loc">Stored in</label><select class="input" id="p-loc">${['dry', 'fridge', 'freezer', 'other'].map((l) => html`<option value="${l}" ${(item?.location || 'dry') === l ? 'selected' : ''}>${cap(l)}</option>`)}</select></div>
        <div class="field"><label class="f" for="p-exp">Expiry date (optional)</label><input class="input" id="p-exp" type="date" value="${item?.expires_on || ''}"></div></div>
        ${edit ? '' : html`<p class="hint">Nutrition is filled in automatically.</p>`}<div class="err" id="p-err" role="alert"></div>`,
      actions: [{ label: 'Cancel' }, { label: edit ? 'Save' : 'Add item', kind: 'primary', onClick: async () => {
        const body = { name: $('#p-name').value.trim(), quantity: $('#p-qty').value, unit: $('#p-unit').value, location: $('#p-loc').value, expires_on: $('#p-exp').value || (edit ? null : undefined), today: date };
        try {
          if (edit) { delete body.name; await patch(`/api/pantry/${item.id}`, body); }
          else { const r = await post('/api/pantry', body); if (r.merged) toast('Added to the existing item'); }
          await reload(); if (edit) toast('Saved');
          return false;
        } catch (e) { $('#p-err').textContent = e.message; return true; }
      } }]
    });
  }
  draw();
}
