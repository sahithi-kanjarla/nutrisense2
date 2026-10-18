import { post, store } from '../api.js';
import { html, icon, logo, $, busy } from '../ui.js';
import { navigate, loadSession, state } from '../app.js';

export default function auth(root, { path }) {
  const signup = path === '/signup';
  root.innerHTML = String(html`<div class="auth">
    <section class="auth-art">
      <div>${logo(true)}<h1>Nutrition that fits your kitchen and your life.</h1>
        <p>Set up your profile once and NutriSense keeps your pantry, meals and goals working together.</p>
        <ul><li>${icon('pantry')}Pantry-aware suggestions</li><li>${icon('sparkle')}AI help that respects your allergies</li><li>${icon('progress')}Targets that adapt to your goal</li></ul></div>
      <p class="small">Your data stays on your own NutriSense server.</p>
    </section>
    <section class="auth-form"><form class="auth-box" id="f" novalidate>
      <h2>${signup ? 'Create your account' : 'Welcome back'}</h2>
      <p class="muted" style="margin-bottom:22px">${signup ? 'Then we will ask a few questions to build your plan.' : 'Log in to see your day.'}</p>
      ${signup ? html`<div class="field"><label class="f" for="name">Your name</label><input class="input" id="name" autocomplete="name" required maxlength="60"></div>` : ''}
      <div class="field"><label class="f" for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" required></div>
      <div class="field"><label class="f" for="pw">Password</label><div class="pw"><input class="input" id="pw" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="8">
        <button type="button" class="icon-btn" id="eye" aria-label="Show password">${icon('eye')}</button></div>${signup ? html`<div class="hint">At least 8 characters.</div>` : ''}</div>
      <div class="err" id="err" role="alert"></div>
      <button class="btn primary block" id="go" style="margin-top:8px">${signup ? 'Create account' : 'Log in'}</button>
      <p class="small muted" style="text-align:center;margin-top:18px">${signup ? 'Already have an account?' : 'New to NutriSense?'} <a data-link href="${signup ? '/login' : '/signup'}">${signup ? 'Log in' : 'Create an account'}</a></p>
      <div class="row" style="align-items:center;gap:10px;margin:18px 0 6px"><hr style="flex:1;border:0;border-top:1px solid var(--line, #ddd)"><span class="small muted">or</span><hr style="flex:1;border:0;border-top:1px solid var(--line, #ddd)"></div>
      <button type="button" class="btn block" id="demo">Try the demo (no sign-up)</button>
      <p class="small muted" style="text-align:center;margin-top:8px">Opens a guest account filled with sample meals, pantry and weight. Please do not enter real health details.</p>
      <p style="text-align:center;margin-top:8px"><a data-link href="/" class="small">Back to home</a></p>
    </form></section></div>`);
  $('#eye').onclick = () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('#demo').onclick = () => busy($('#demo'), async () => {
    try {
      const r = await post('/api/auth/demo', { today: new Date().toLocaleDateString('en-CA') });
      store.token = r.token;
      state.user = r.user; state.profile = null;
      navigate('/dashboard', true);
    } catch (err) { $('#err').textContent = err.message; }
  });
  $('#f').onsubmit = async (e) => {
    e.preventDefault();
    $('#err').textContent = '';
    const body = { email: $('#email').value.trim(), password: $('#pw').value };
    if (signup) body.name = $('#name').value.trim();
    await busy($('#go'), async () => {
      try {
        const r = await post(signup ? '/api/auth/signup' : '/api/auth/login', body);
        store.token = r.token;
        state.user = r.user; state.profile = null;
        navigate(r.user.onboarded ? '/dashboard' : '/onboarding', true);
      } catch (err) { $('#err').textContent = err.message; }
    });
  };
}
