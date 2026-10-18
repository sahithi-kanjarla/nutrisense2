/* Tiny rendering helpers. html`` escapes every interpolated value unless it is already trusted markup. */
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Safe(String(s));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : v === false || v == null ? '' : esc(v));
export const html = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? part(vals[i]) : ''), ''));

/* Local dates: the server never guesses the user's timezone. */
const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => fmtDate(new Date());
export const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
export const niceDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => parseDate(s).toLocaleDateString('en-GB', opts);

export const num = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d }));
export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

export function modal({ title, body, actions = [], wide = false }) {
  const root = $('#modal-root');
  const el = document.createElement('div');
  el.className = 'overlay';
  el.innerHTML = String(html`<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${title}">
    <div class="modal-head"><h3>${title}</h3><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot">${actions.map((a, i) => html`<button class="btn ${a.kind || ''}" data-i="${i}">${a.label}</button>`)}</div>
  </div>`);
  const close = () => { el.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', async (e) => {
    if (e.target === el || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-i]');
    if (b) {
      const a = actions[Number(b.dataset.i)];
      b.disabled = true;
      try { const keep = await a.onClick?.(el); if (!keep) close(); } finally { b.disabled = false; }
    }
  });
  root.append(el);
  (el.querySelector('input,select,textarea') || el.querySelector('button')).focus();
  return { el, close };
}

export const confirmBox = (title, text, okLabel = 'Delete') => new Promise((resolve) => {
  let done = false;
  const m = modal({
    title, body: html`<p class="muted">${text}</p>`,
    actions: [
      { label: 'Cancel', onClick: () => { done = true; resolve(false); } },
      { label: okLabel, kind: 'danger', onClick: () => { done = true; resolve(true); } }
    ]
  });
  m.el.addEventListener('click', (e) => { if (!done && (e.target === m.el || e.target.closest('[data-close]'))) { done = true; resolve(false); } });
});

const ICONS = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  pantry: 'M4 3h16v4H4zM5 7h14v14H5zM9 11h6',
  meal: 'M6 3v8a3 3 0 0 0 3 3v7M9 3v6M12 3v8a3 3 0 0 1-3 3M18 3c-2 2-3 5-3 8h3v10',
  chat: 'M4 5h16v11H9l-5 4z',
  planner: 'M4 5h16v15H4zM4 10h16M8 3v4M16 3v4',
  recipe: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM9 8h6M9 12h6',
  progress: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-1-2h-4l-1 2-2 1-2-1-2 4 2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z',
  plus: 'M12 5v14M5 12h14', x: 'M6 6l12 12M18 6L6 18', check: 'M5 13l4 4L19 7',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13', alert: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z', drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  flame: 'M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-4 0-7 1-10z',
  camera: 'M4 8h4l2-3h4l2 3h4v12H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  send: 'M3 12l18-8-7 18-3-7z', menu: 'M4 6h16M4 12h16M4 18h16', logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  leaf: 'M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l8-8', cart: 'M3 4h3l2 11h10l2-8H7M10 20a1 1 0 1 0 0 .1M17 20a1 1 0 1 0 0 .1',
  bookmark: 'M6 3h12v18l-6-4-6 4z', refresh: 'M20 11a8 8 0 1 0-2 6M20 4v7h-7', copy: 'M8 8h12v12H8zM4 16V4h12', download: 'M12 4v11M7 11l5 5 5-5M4 20h16'
};
export const icon = (name, size = 18) => raw(`<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name] || ''}"/></svg>`);

export const logo = (light = false) => html`<span class="logo ${light ? 'light' : ''}"><span class="logo-mark">${icon('leaf', 18)}</span>NutriSense</span>`;

export function ring({ value, max, size = 150, label, sub }) {
  const pct = max ? Math.min(value / max, 1) : 0;
  const r = size / 2 - 11;
  const c = 2 * Math.PI * r;
  const over = max && value > max * 1.1;
  return html`<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label} ${sub}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="12"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${over ? 'var(--amber)' : 'var(--green)'}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-in"><b>${label}</b><span>${sub}</span></div></div>`;
}

export const bar = (value, max, color = 'var(--green)') =>
  html`<div class="bar"><i style="width:${max ? Math.min(100, Math.round((value / max) * 100)) : 0}%;background:${color}"></i></div>`;

export const emptyState = (title, text, action = '') => html`<div class="empty"><div class="empty-ico">${icon('leaf', 26)}</div><h4>${title}</h4><p>${text}</p>${action}</div>`;

export const aiDown = (err) => err?.code === 'ai_unavailable'
  ? html`<div class="notice warn">${icon('sparkle')}<div><b>AI is not switched on yet.</b> Add <code>GEMINI_API_KEY</code> (and optionally <code>GROQ_API_KEY</code>) to the <code>.env</code> file, then restart the server.</div></div>`
  : html`<div class="notice warn">${icon('alert')}<div>${err?.message || 'The AI is busy right now. Please try again in a minute.'}</div></div>`;

export async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.classList.add('loading');
  try { return await fn(); } finally { btn.disabled = false; btn.classList.remove('loading'); btn.innerHTML = label; }
}
