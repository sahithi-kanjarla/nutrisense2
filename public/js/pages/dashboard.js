import { get, post, put } from '../api.js';
import { html, icon, ring, bar, num, today, niceDate, $, $$, toast, busy, aiDown, emptyState, cap, parseDate } from '../ui.js';
import { state } from '../app.js';
import { watchRows } from '../shared.js';

export default async function dashboard(root) {
  const date = today();
  const [d, bal] = [await get(`/api/dashboard?date=${date}`), null];
  const t = d.targets, tot = d.totals, rem = d.remaining;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const maxK = Math.max(t.calories, ...d.week.map((w) => w.kcal), 1);
  const left = Math.round(t.calories - tot.kcal);

  const macro = (name, v, goal, color) => html`<div class="macro"><div class="row"><span>${name}</span><span><b>${num(v)}</b> / ${num(goal)} g</span></div>${bar(v, goal, color)}</div>`;

  root.innerHTML = String(html`
  <div class="top"><div><h1>${hello}, ${d.name.split(' ')[0]}</h1><p>${niceDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
    <a class="btn primary" data-link href="/meals">${icon('plus')}Log a meal</a></div>
  <div class="card hero">
    ${ring({ value: tot.kcal, max: t.calories, size: 170, label: num(Math.abs(left)), sub: left >= 0 ? 'kcal left' : 'kcal over' })}
    <div class="macros">${macro('Protein', tot.protein, t.protein, 'var(--green)')}${macro('Carbs', tot.carbs, t.carbs, 'var(--amber)')}${macro('Fats', tot.fat, t.fat, 'var(--rust)')}${macro('Fiber', tot.fiber, t.fiber, 'var(--teal)')}
      <div class="small muted">${num(tot.kcal)} of ${num(t.calories)} kcal eaten</div></div>
  </div>
  <div class="grid4" style="margin-top:20px">
    <div class="card stat"><div class="ico-b">${icon('flame', 22)}</div><div><b>${d.streak}</b><span>day logging streak</span></div></div>
    <div class="card stat"><div class="ico-b">${icon('check', 22)}</div><div><b>${d.week_on_target}/${d.week_logged || 0}</b><span>logged days on target</span></div></div>
    <div class="card stat"><div class="ico-b">${icon('pantry', 22)}</div><div><b>${d.pantry_count}</b><span>items in pantry</span></div></div>
    <div class="card stat"><div class="ico-b" style="background:#fdf3dc;color:#9a6a0a">${icon('alert', 22)}</div><div><b>${d.expiring.length}</b><span>expiring soon</span></div></div>
  </div>
  <div class="cols">
    <div>
      <div class="card ai-card" id="bal"><div class="card-h"><span style="display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.14)">${icon('sparkle')}</span><h3>Smart diet balance</h3></div>
        <p class="muted">Find what to eat next using food you already have.</p><button class="btn primary" id="bal-go" style="margin-top:14px">${icon('sparkle')}Check my day</button><div id="bal-out"></div></div>
      <div class="card"><div class="card-h"><h3>Today's meals</h3><a class="small right" data-link href="/meals">Open log</a></div>
        ${d.meals.length ? html`<div class="list">${d.meals.map((m) => html`<div class="item"><div class="grow"><b>${m.name}</b><span class="small muted">${cap(m.meal_type)}${m.serving ? ` · ${m.serving}` : ''}</span></div><div style="text-align:right"><b>${num(m.kcal)} kcal</b><div class="small muted">${num(m.protein)}g protein</div></div></div>`)}</div>`
          : emptyState('Nothing logged yet', 'Log your first meal and your targets will start filling in.', html`<a class="btn primary" data-link href="/meals">Log a meal</a>`)}</div>
      <div class="card" id="watch"><div class="card-h"><h3>Watch list</h3><span class="small muted right">stay under</span></div>${d.meals.length ? watchRows(d.watch) : html`<p class="muted small">Sodium, saturated fat and added sugar appear here once you log a meal.</p>`}</div>
    </div>
    <div>
      <div class="card"><div class="card-h"><h3>Water</h3><span class="tag right">${d.water.glasses} / ${d.water.goal} glasses</span></div>
        <div class="glasses" id="glasses">${Array.from({ length: d.water.goal }, (_, i) => html`<button class="glass ${i < d.water.glasses ? 'on' : ''}" data-n="${i + 1}" aria-label="${i + 1} glasses" aria-pressed="${i < d.water.glasses}"></button>`)}</div></div>
      <div class="card"><div class="card-h"><h3>Use soon</h3></div>
        ${d.expiring.length ? html`<div class="list">${d.expiring.map((i) => html`<div class="item"><div class="grow"><b>${i.name}</b><span class="small muted">${num(i.quantity)} ${i.unit}</span></div><span class="tag amber">${i.days_left <= 0 ? 'today' : i.days_left === 1 ? 'tomorrow' : `${i.days_left} days`}</span></div>`)}</div>`
          : html`<p class="muted small">Nothing is about to expire. Nice work.</p>`}</div>
      <div class="card"><div class="card-h"><h3>Last 7 days</h3></div>
        <div class="weekbars">${d.week.map((w) => html`<div><i class="${w.logged ? (Math.abs(w.kcal - t.calories) <= t.calories * 0.1 ? 'hit' : 'on') : ''}" style="height:${w.logged ? Math.max(8, Math.round((w.kcal / maxK) * 80)) : 4}px" title="${w.kcal} kcal"></i>${parseDate(w.date).toLocaleDateString('en-GB', { weekday: 'narrow' })}</div>`)}</div>
        <p class="small muted" style="margin-top:8px">Dark green means within 10% of your target.</p></div>
    </div>
  </div>`);

  $('#glasses').onclick = async (e) => {
    const g = e.target.closest('.glass'); if (!g) return;
    let n = Number(g.dataset.n);
    if (n === d.water.glasses) n -= 1;
    try { await put('/api/water', { date, glasses: n }); d.water.glasses = n;
      $$('.glass').forEach((x, i) => { x.classList.toggle('on', i < n); x.setAttribute('aria-pressed', i < n); });
      $('.card-h .tag.right').textContent = `${n} / ${d.water.goal} glasses`;
    } catch (err) { toast(err.message, 'bad'); }
  };

  $('#bal-go').onclick = (e) => busy(e.currentTarget, async () => {
    const out = $('#bal-out');
    try {
      const r = await post('/api/ai/balance', { date });
      out.innerHTML = String(html`<h4 style="margin-top:16px">${r.headline}</h4>
        ${(r.suggestions || []).map((s) => html`<div class="sug"><b>${s.name} · ${num(s.amount)} ${s.unit}</b><span>${s.reason} (about ${num(s.protein)} g protein, ${num(s.fiber, 1)} g fiber, ${num(s.kcal)} kcal)</span></div>`)}
        ${r.idea ? html`<p style="margin-top:12px" class="muted">${r.idea}</p>` : ''}
        ${!r.suggestions?.length && r.gap ? html`<p class="muted" style="margin-top:8px">Add protein-rich foods to your pantry to get suggestions here.</p>` : ''}`);
    } catch (err) { out.innerHTML = String(html`<div style="margin-top:14px;color:#1a1a1a">${aiDown(err)}</div>`); }
  });
}
