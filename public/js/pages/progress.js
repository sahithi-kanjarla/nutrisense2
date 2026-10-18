import { get, post } from '../api.js';
import { html, icon, num, today, niceDate, parseDate, $, $$, toast, busy, modal, bar, emptyState } from '../ui.js';

function weightChart(series, goal) {
  if (series.length < 2) return html`<p class="muted small">Log your weight on at least two different days to see a trend.</p>`;
  const W = 640, H = 200, pad = 28;
  const vals = series.map((s) => s.kg).concat(goal ? [goal] : []);
  const min = Math.floor(Math.min(...vals) - 1), max = Math.ceil(Math.max(...vals) + 1);
  const t0 = parseDate(series[0].date).getTime(), t1 = parseDate(series.at(-1).date).getTime() || t0 + 1;
  const x = (d) => pad + ((parseDate(d).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - pad * 2);
  const y = (v) => H - pad - ((v - min) / (max - min || 1)) * (H - pad * 2);
  const pts = series.map((s) => `${x(s.date).toFixed(1)},${y(s.kg).toFixed(1)}`).join(' ');
  return html`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Weight over time, from ${series[0].kg} to ${series.at(-1).kg} kilograms">
    ${[min, (min + max) / 2, max].map((v) => html`<line x1="${pad}" x2="${W - pad}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="2" y="${y(v) + 4}" font-size="11" fill="var(--muted)">${Math.round(v)}</text>`)}
    ${goal ? html`<line x1="${pad}" x2="${W - pad}" y1="${y(goal)}" y2="${y(goal)}" stroke="var(--amber)" stroke-dasharray="5 4"/><text x="${W - pad}" y="${y(goal) - 5}" font-size="11" text-anchor="end" fill="#9a6a0a">goal ${goal} kg</text>` : ''}
    <polyline points="${pts}" fill="none" stroke="var(--green)" stroke-width="2.6" stroke-linejoin="round"/>
    ${series.map((s) => html`<circle cx="${x(s.date)}" cy="${y(s.kg)}" r="4" fill="#fff" stroke="var(--green)" stroke-width="2.2"><title>${niceDate(s.date)}: ${s.kg} kg</title></circle>`)}</svg>`;
}

export default async function progress(root) {
  const date = today();
  let days = 30, p, review = null, reviewErr = '';
  const load = async () => { p = await get(`/api/progress?date=${date}&days=${days}`); };
  await load();

  const draw = () => {
    const w = p.weight;
    const ch = w.change;
    const split = p.split;
    root.innerHTML = String(html`
    <div class="top"><div><h1>Progress</h1><p>How the last ${days} days went.</p></div>
      <div class="row wrap"><div class="pill-tabs">${[7, 30, 90].map((n) => html`<button class="${days === n ? 'on' : ''}" data-d="${n}">${n} days</button>`)}</div><button class="btn primary" id="logw">${icon('plus')}Log weight</button></div></div>
    <div class="grid4">
      <div class="card stat"><div class="ico-b">${icon('progress', 22)}</div><div><b>${num(w.current, 1)} kg</b><span>current weight${w.goal ? ` · goal ${num(w.goal, 1)}` : ''}</span></div></div>
      <div class="card stat"><div class="ico-b">${icon('flame', 22)}</div><div><b>${ch == null ? '–' : `${ch > 0 ? '+' : ''}${num(ch, 1)} kg`}</b><span>change in ${days} days</span></div></div>
      <div class="card stat"><div class="ico-b">${icon('check', 22)}</div><div><b>${p.logged_days}/${days}</b><span>days logged</span></div></div>
      <div class="card stat"><div class="ico-b">${icon('leaf', 22)}</div><div><b>${p.protein_hits}</b><span>days hit protein goal</span></div></div>
    </div>
    <div class="cols">
      <div>
        <div class="card"><div class="card-h"><h3>Weight</h3></div>${weightChart(w.series, w.goal)}</div>
        <div class="card"><div class="card-h"><span style="color:var(--green)">${icon('sparkle', 20)}</span><h3>Weekly review</h3><button class="btn sm right" id="rev">${review ? 'Refresh' : 'Generate'}</button></div>
          ${review ? html`<ul style="margin:0;padding-left:20px">${review.bullets.map((b) => html`<li style="margin:6px 0">${b}</li>`)}</ul><p class="small muted" style="margin-top:8px">${review.source === 'ai' ? 'Written by AI from your last 7 days.' : 'Based on your last 7 days.'}</p>` : reviewErr || html`<p class="muted">Get a short, personal summary of your last 7 days.</p>`}</div>
      </div>
      <div>
        <div class="card"><div class="card-h"><h3>Average day</h3></div>
          <div class="row between"><span class="muted">Calories</span><b>${num(p.avg.kcal)} / ${num(p.targets.calories)}</b></div>
          <div class="stack" style="margin-top:12px">${p.coverage.map((c) => html`<div class="macro"><div class="row between small"><span>${c.label}</span><span><b>${num(c.avg, 0)}</b> / ${num(c.target)} g · ${c.pct}%</span></div>${bar(c.avg, c.target, c.pct >= 85 && c.pct <= 125 ? 'var(--green)' : 'var(--amber)')}</div>`)}</div>
          <p class="small muted" style="margin-top:12px">Energy split: ${split.protein}% protein · ${split.carbs}% carbs · ${split.fat}% fats</p></div>
        <div class="card"><div class="card-h"><h3>Logging calendar</h3></div>
          <div class="cal">${p.calendar.map((c) => html`<i class="${c.status === 'none' ? '' : c.status}" title="${niceDate(c.date)}"></i>`)}</div>
          <div class="legend"><span><i style="background:var(--track)"></i>Not logged</span><span><i style="background:#9ad9b6"></i>Logged</span><span><i style="background:var(--green)"></i>On target</span></div></div>
      </div>
    </div>`);
    $$('[data-d]').forEach((b) => b.onclick = async () => { days = Number(b.dataset.d); await load(); draw(); });
    $('#logw').onclick = () => modal({
      title: 'Log your weight',
      body: html`<div class="field"><label class="f" for="w-kg">Weight today (kg)</label><input class="input" id="w-kg" inputmode="decimal" value="${w.current ?? ''}"></div><div class="err" id="w-err" role="alert"></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Save', kind: 'primary', onClick: async () => {
        try { await post('/api/weight', { date, kg: $('#w-kg').value }); toast('Weight saved'); await load(); draw(); return false; } catch (e) { $('#w-err').textContent = e.message; return true; }
      } }]
    });
    $('#rev').onclick = (e) => busy(e.currentTarget, async () => {
      try { review = await post('/api/ai/review', { date, refresh: Boolean(review) }); reviewErr = ''; } catch (err) { reviewErr = html`<div class="notice warn">${icon('alert')}<div>${err.message}</div></div>`; }
      draw();
    });
  };
  draw();
}
