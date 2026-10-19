import { post } from '../api.js';
import { html, icon, today, $, $$, toast, modal } from '../ui.js';

const MAX_IMAGES = 4;
const HINTS = ['Front of the pack', 'Nutrition facts', 'Ingredients', 'Date (expiry / best before)'];
const NUTRIENTS = [
  ['energy_kcal', 'Calories (kcal)'], ['energy_kj', 'Energy (kJ)'], ['protein_g', 'Protein (g)'], ['carbs_g', 'Carbs (g)'], ['sugar_g', 'of which sugars (g)'],
  ['fat_g', 'Fat (g)'], ['sat_fat_g', 'of which saturated (g)'], ['fiber_g', 'Fibre (g)'], ['sodium_mg', 'Sodium (mg)'], ['salt_g', 'Salt (g)']
];

/** Shrinks a photo in the browser (labels need more detail than meal photos). The result only lives in memory. */
function resizePhoto(file, max = 1600) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(new Error('Please use a JPEG, PNG or WebP photo.'));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve({ mime: 'image/jpeg', image: c.toDataURL('image/jpeg', 0.85) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That photo could not be read. Please try a JPEG or PNG.')); };
    img.src = url;
  });
}

const val = (sel) => $(sel).value.trim();
const numOrUndef = (sel) => { const v = val(sel); return v === '' ? undefined : (Number.isFinite(Number(v)) ? Number(v) : v); };
const list = (sel) => val(sel).split(/[,;]/).map((s) => s.trim()).filter(Boolean);

/** Step 1: choose up to four photos of one product. Step 2: review and correct. Step 3: save. */
export function openScanner({ onSaved }) {
  let shots = []; // [{ mime, image }] held in memory only

  const m = modal({
    title: 'Scan a package',
    wide: true,
    body: html`<p class="muted small">Add up to ${MAX_IMAGES} photos of <b>one</b> product: the front, the nutrition facts, the ingredients and the date. Photos are read once and are not stored.</p>
      <div id="shots" class="shots"></div>
      <label class="btn" for="sc-file">${icon('camera')}Add photos</label><input type="file" id="sc-file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <div class="err" id="sc-err" role="alert"></div>`,
    actions: [
      { label: 'Cancel' },
      { label: 'Read the label', kind: 'primary', onClick: async () => {
        if (!shots.length) { $('#sc-err').textContent = 'Add at least one photo first.'; return true; }
        $('#sc-err').textContent = '';
        try {
          const r = await post('/api/pantry/scan', { images: shots, today: today() });
          if (!r.readable) { $('#sc-err').textContent = r.message; return true; }
          m.close();
          review(r);
          return true;
        } catch (e) { $('#sc-err').textContent = e.message; return true; }
      } }
    ]
  });

  const drawShots = () => {
    $('#shots').innerHTML = String(shots.length
      ? html`${shots.map((s, i) => html`<div class="shot"><img src="${s.image}" alt="Photo ${i + 1}"><div class="small muted">${HINTS[i] || `Photo ${i + 1}`}</div>
          <button class="btn ghost" type="button" data-replace="${i}">Replace</button><button class="btn ghost" type="button" data-remove="${i}">Remove</button></div>`)}`
      : html`<p class="hint">No photos yet.</p>`);
    $$('[data-remove]', m.el).forEach((b) => { b.onclick = () => { shots.splice(Number(b.dataset.remove), 1); drawShots(); }; });
    $$('[data-replace]', m.el).forEach((b) => { b.onclick = () => pick(false, Number(b.dataset.replace)); });
  };

  function pick(multiple, replaceIndex) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.multiple = multiple;
    inp.onchange = async () => {
      $('#sc-err').textContent = '';
      for (const f of [...inp.files]) {
        try {
          const shot = await resizePhoto(f);
          if (replaceIndex !== undefined) shots[replaceIndex] = shot;
          else if (shots.length < MAX_IMAGES) shots.push(shot);
          else { $('#sc-err').textContent = `Use at most ${MAX_IMAGES} photos of one product.`; break; }
        } catch (e) { $('#sc-err').textContent = e.message; }
      }
      drawShots();
    };
    inp.click();
  }
  $('#sc-file').onchange = (e) => { const files = [...e.target.files]; e.target.value = ''; pickFrom(files); };
  async function pickFrom(files) {
    $('#sc-err').textContent = '';
    for (const f of files) {
      if (shots.length >= MAX_IMAGES) { $('#sc-err').textContent = `Use at most ${MAX_IMAGES} photos of one product.`; break; }
      try { shots.push(await resizePhoto(f)); } catch (e) { $('#sc-err').textContent = e.message; }
    }
    drawShots();
  }
  drawShots();

  /* ------------------------------ Review ------------------------------ */

  function review(r) {
    const p = r.product;
    const ex = p.expiry || {};
    const nu = p.nutrition || { basis: null, values: {} };
    const ambiguous = Boolean(ex.date && ex.ambiguous);
    let decision = null; // { on_duplicate, duplicate_id } once the person has chosen

    const field = (id, label, value, attrs = '') => html`<div class="field"><label class="f" for="${id}">${label}</label><input class="input" id="${id}" value="${value ?? ''}" ${attrs}></div>`;
    const sel = (id, label, opts, cur) => html`<div class="field"><label class="f" for="${id}">${label}</label><select class="input" id="${id}">${opts.map(([v, t]) => html`<option value="${v}" ${cur === v ? 'selected' : ''}>${t}</option>`)}</select></div>`;

    const rv = modal({
      title: 'Check what was read',
      wide: true,
      body: html`<div class="notice">${icon('alert')}<div><b>Not verified yet.</b> This was read from your photos by AI and can be wrong. Compare every field with the package, correct it, and clear any value you are not sure of. A blank value means <b>unknown</b>; <b>0</b> means the label really says zero.</div></div>
        ${r.conflicts.length ? html`<div class="notice warn">${icon('alert')}<div><b>Check before you eat this.</b> The label mentions ${[...new Set(r.conflicts.map((c) => c.word))].join(', ')}, which conflicts with what you told us (allergy, diet or dislike).</div></div>` : ''}
        <div class="notice">${icon('alert')}<div>Allergens below are only what the label declares. A product is <b>not</b> safe just because an allergen is not listed: always read the package yourself.</div></div>
        ${r.notes.length ? html`<ul class="small muted">${r.notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
        <h4>Product</h4>
        <div class="grid2">${field('rv-name', 'Name', p.name, 'maxlength="80"')}${field('rv-brand', 'Brand', p.brand, 'maxlength="60"')}</div>
        <div class="grid2">${field('rv-cat', 'Category', p.category, 'maxlength="40"')}
          ${sel('rv-loc', 'Stored in', [['dry', 'Dry store'], ['fridge', 'Fridge'], ['freezer', 'Freezer'], ['other', 'Other']], 'dry')}</div>
        <div class="grid3">${field('rv-size', 'Package size', p.package?.size, 'inputmode="decimal"')}
          ${sel('rv-unit', 'Unit', ['g', 'kg', 'ml', 'l', 'pcs'].map((u) => [u, u]), p.package?.unit || 'g')}
          ${field('rv-packs', 'Number of packs', 1, 'inputmode="numeric"')}</div>
        <h4>Dates</h4>
        <div class="grid2">${field('rv-extext', 'Date as printed', ex.text, 'maxlength="60"')}
          ${sel('rv-exkind', 'Date type', [['unknown', 'Not sure'], ['best_before', 'Best before'], ['use_by', 'Use by'], ['expiry', 'Expiry']], ex.kind || 'unknown')}</div>
        <div class="grid2"><div class="field"><label class="f" for="rv-exdate">Expiry date</label><input class="input" id="rv-exdate" type="date" value="${ex.date || ''}"></div>
          <div class="field"><label class="f" for="rv-mfg">Manufacturing date (optional)</label><input class="input" id="rv-mfg" type="date" value="${p.mfg?.date || ''}"></div></div>
        ${ex.note ? html`<p class="small" style="color:var(--amber, #9a6a0a)">${ex.note}</p>` : ''}
        ${ambiguous ? html`<label class="check"><input type="checkbox" id="rv-exok"> I have checked this expiry date against the package.</label>` : ''}
        <h4>Ingredients and allergens</h4>
        <div class="field"><label class="f" for="rv-ing">Ingredients</label><textarea class="input" id="rv-ing" rows="3" maxlength="1500">${p.ingredients || ''}</textarea></div>
        <div class="grid2">${field('rv-all', 'Allergens declared on the label (comma separated)', p.allergens.join(', '))}${field('rv-may', 'May contain traces of', p.may_contain.join(', '))}</div>
        <h4>Nutrition as printed</h4>
        <div class="grid3">${sel('rv-basis', 'Values are', [['', 'Not sure'], ['100g', 'Per 100 g'], ['100ml', 'Per 100 ml'], ['serving', 'Per serving']], nu.basis || '')}
          ${field('rv-serv', 'Serving size', nu.serving_size, 'inputmode="decimal"')}
          ${sel('rv-servu', 'Serving unit', [['', '–'], ['g', 'g'], ['ml', 'ml']], nu.serving_unit || '')}</div>
        <div class="grid3">${NUTRIENTS.map(([k, t]) => field(`rv-n-${k}`, t, nu.values?.[k], 'inputmode="decimal"'))}</div>
        <p class="hint small" id="rv-stored">${storedText(r.stored)}</p>
        <label class="check"><input type="checkbox" id="rv-ok"> I have checked these details against the package.</label>
        <div id="rv-dup"></div>
        <div class="err" id="rv-err" role="alert"></div>`,
      actions: [
        { label: 'Back to photos', onClick: () => { openScanner({ onSaved }); } },
        { label: 'Save to pantry', kind: 'primary', onClick: () => save() }
      ]
    });

    function build() {
      const values = {};
      for (const [k] of NUTRIENTS) { const v = numOrUndef(`#rv-n-${k}`); if (v !== undefined) values[k] = v; }
      const hasNutrition = Object.keys(values).length || val('#rv-basis');
      const exText = val('#rv-extext');
      const exDate = val('#rv-exdate');
      const sizeV = numOrUndef('#rv-size');
      return {
        name: val('#rv-name'), brand: val('#rv-brand'), category: val('#rv-cat'), ingredients: val('#rv-ing'),
        allergens: list('#rv-all'), may_contain: list('#rv-may'),
        package: sizeV === undefined ? undefined : { size: sizeV, unit: val('#rv-unit') },
        expiry: exText || exDate ? { text: exText, kind: val('#rv-exkind'), date: exDate || undefined } : undefined,
        mfg: val('#rv-mfg') ? { date: val('#rv-mfg') } : undefined,
        nutrition: hasNutrition ? { basis: val('#rv-basis') || undefined, serving_size: numOrUndef('#rv-serv'), serving_unit: val('#rv-servu') || undefined, values } : undefined
      };
    }

    async function save() {
      $('#rv-err').textContent = '';
      if (!$('#rv-ok').checked) { $('#rv-err').textContent = 'Please tick the box to confirm you have checked the details.'; return true; }
      try {
        const body = {
          confirmed: true, product: build(), location: val('#rv-loc'), packs: Number(val('#rv-packs') || 1), today: today(),
          expiry_confirmed: Boolean($('#rv-exok')?.checked), ...(decision || {})
        };
        const res = await post('/api/pantry/scan/confirm', body);
        if (res.needs_decision) { askDuplicate(res.duplicates); return true; }
        toast(res.merged ? 'Pantry item updated' : 'Saved to your pantry');
        if (res.note) toast(res.note);
        onSaved?.();
        return false;
      } catch (e) {
        $('#rv-err').textContent = e.message;
        return true;
      }
    }

    function askDuplicate(dups) {
      $('#rv-dup').innerHTML = String(html`<div class="notice warn">${icon('alert')}<div><b>You may already have this.</b> Choose what to do:
        ${dups.map((d, i) => html`<label class="check"><input type="radio" name="dup" value="update:${d.id}" ${i === 0 ? 'checked' : ''}> Add this package to <b>${d.name}</b>${d.brand ? ` (${d.brand})` : ''} – you have ${d.quantity} ${d.unit}</label>`)}
        <label class="check"><input type="radio" name="dup" value="add"> Keep it separate as another item</label>
        <button class="btn" type="button" id="dup-go">Continue</button></div></div>`);
      $('#dup-go').onclick = async () => {
        const v = $('input[name="dup"]:checked').value;
        decision = v === 'add' ? { on_duplicate: 'add' } : { on_duplicate: 'update', duplicate_id: Number(v.split(':')[1]) };
        const keep = await save();
        if (!keep) rv.close();
      };
    }
  }
}

const storedText = (s) => {
  if (!s) return '';
  if (s.note) return s.note;
  if (s.kcal100 == null) return 'No calories to store per 100 g / 100 ml yet, so this item will show "Nutrition not set" until you add them.';
  return `Stored for tracking: ${s.kcal100} kcal, ${s.protein100 ?? '–'} g protein per 100 g/ml. The values as printed are also kept.`;
};
