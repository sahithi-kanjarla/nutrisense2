import { get, store, setUnauthorizedHandler } from './api.js';
import { $, $$, html, icon, logo, toast, esc } from './ui.js';

export const state = { user: null, profile: null, targets: null, plan: null, ai: null };

const NAV = [
  ['/dashboard', 'home', 'Home'], ['/pantry', 'pantry', 'Pantry'], ['/meals', 'meal', 'Meal log'],
  ['/recipes', 'recipe', 'Recipes'], ['/planner', 'planner', 'Meal planner'], ['/assistant', 'chat', 'AI assistant'],
  ['/progress', 'progress', 'Progress']
];
const NAV2 = [['/profile', 'user', 'Health profile'], ['/settings', 'settings', 'Settings']];

const PAGES = {
  '/': () => import('./pages/landing.js'),
  '/login': () => import('./pages/auth.js'), '/signup': () => import('./pages/auth.js'),
  '/onboarding': () => import('./pages/onboarding.js'),
  '/dashboard': () => import('./pages/dashboard.js'), '/pantry': () => import('./pages/pantry.js'),
  '/meals': () => import('./pages/meals.js'), '/recipes': () => import('./pages/recipes.js'),
  '/planner': () => import('./pages/planner.js'), '/assistant': () => import('./pages/assistant.js'),
  '/progress': () => import('./pages/progress.js'), '/profile': () => import('./pages/profile.js'),
  '/settings': () => import('./pages/settings.js')
};
const PUBLIC = new Set(['/', '/login', '/signup']);

export async function loadSession() {
  if (!store.token) return false;
  try {
    const me = await get('/api/auth/me');
    state.user = me.user;
    return true;
  } catch (e) {
    // Only sign out when the server says the token is invalid, not on a network blip.
    if (e?.status === 401) store.token = null;
    return false;
  }
}

export async function refreshProfile() {
  const r = await get('/api/profile');
  state.profile = r.profile; state.targets = r.targets; state.plan = r.plan;
  return r;
}

export function logout() {
  store.token = null;
  Object.assign(state, { user: null, profile: null, targets: null, plan: null });
  navigate('/', true);
}
setUnauthorizedHandler(() => { toast('Your session has expired. Please log in again.', 'bad'); logout(); });

export function navigate(path, replace = false) {
  if (location.pathname === path) { route(); return; }
  history[replace ? 'replaceState' : 'pushState']({}, '', path);
  route();
}
window.addEventListener('popstate', () => route());
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target) return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
  $('.side')?.classList.remove('open');
});

let token = 0;
export async function route() {
  const my = ++token;
  let path = location.pathname.replace(/\/+$/, '') || '/';
  if (!PAGES[path]) path = state.user ? '/dashboard' : '/';
  const authed = Boolean(state.user);

  if (!authed && !PUBLIC.has(path)) return navigate('/login', true);
  if (authed && (path === '/' || path === '/login' || path === '/signup')) return navigate('/dashboard', true);
  if (authed) {
    if (!state.profile) { try { await refreshProfile(); } catch { return; } }
    if (my !== token) return;
    const done = state.profile?.onboarded;
    if (!done && path !== '/onboarding') return navigate('/onboarding', true);
    if (done && path === '/onboarding') return navigate('/dashboard', true);
  }

  const mod = await PAGES[path]();
  if (my !== token) return;
  const app = $('#app');
  document.title = `${(NAV.concat(NAV2).find((n) => n[0] === path) || [0, 0, 'NutriSense'])[2]} · NutriSense`;

  if (PUBLIC.has(path) || path === '/onboarding') {
    app.innerHTML = '';
    await mod.default(app, { path });
    window.scrollTo(0, 0);
    return;
  }
  app.innerHTML = String(shell(path));
  const root = $('#view');
  bindShell();
  try {
    await mod.default(root, { path });
  } catch (err) {
    console.error(err);
    root.innerHTML = String(html`<div class="card"><div class="empty"><h4>We could not load this page</h4><p>${err.message || 'Please try again.'}</p></div></div>`);
  }
  window.scrollTo(0, 0);
}

function shell(path) {
  const link = ([href, ic, label]) => html`<a data-link href="${href}" class="${href === path ? 'on' : ''}" ${href === path ? 'aria-current="page"' : ''}>${icon(ic)}${label}</a>`;
  const name = state.user?.name || '';
  return html`<div class="shell">
    <aside class="side" id="side">
      ${logo(true)}
      <nav class="nav">${NAV.map(link)}<h6>Account</h6>${NAV2.map(link)}</nav>
      <div class="side-foot"><div class="avatar">${(name[0] || '?').toUpperCase()}</div><div><b>${name}</b><span class="small" style="color:#8fb59d">Free plan</span></div>
        <button class="icon-btn" id="logout" title="Log out" aria-label="Log out">${icon('logout')}</button></div>
    </aside>
    <div><div class="mobile-bar"><button class="icon-btn" id="burger" aria-label="Open menu">${icon('menu', 22)}</button>${logo()}</div>
    <main class="main" id="view"></main></div></div>`;
}

function bindShell() {
  $('#logout').onclick = logout;
  $('#burger').onclick = () => $('#side').classList.toggle('open');
}

(async function boot() {
  await loadSession();
  state.ai = await get('/api/ai/status').catch(() => null);
  route();
})();
