import { get, put, post, del, store } from '../api.js';
import { html, icon, $, $$, toast, busy, modal } from '../ui.js';
import { state, logout } from '../app.js';

const NOTIFY = [['expiry', 'Expiry reminders', 'Heads up before pantry items expire'], ['meals', 'Meal reminders', 'A nudge to log your meals'], ['hydration', 'Hydration reminders', 'Remind me to drink water'], ['weekly', 'Weekly review', 'A summary every week']];

export default async function settings(root) {
  const P = state.profile;
  const n = { ...P.notifications };
  const ai = state.ai || {};

  root.innerHTML = String(html`
  <div class="top"><div><h1>Settings</h1><p>Your account, preferences and data.</p></div></div>
  <div class="cols" style="margin-top:0"><div>
    <div class="card"><div class="card-h"><h3>Account</h3></div>
      <div class="field"><label class="f" for="s-name">Name</label><input class="input" id="s-name" value="${state.user.name}" maxlength="60"></div>
      <div class="field"><label class="f">Email</label><input class="input" value="${state.user.email}" disabled></div>
      <button class="btn primary" id="sn">Save name</button></div>
    <div class="card"><div class="card-h"><h3>Preferences</h3></div>
      <p class="hint" style="margin:0 0 12px">NutriSense shows all numbers in kcal and metric units (kg, cm, g, ml).</p>
      <h4 style="margin:12px 0 4px">Reminders</h4>
      ${NOTIFY.filter(([k]) => !(k === 'hydration' && P.conditions?.includes('clin'))).map(([k, t, d]) => html`<div class="row" style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="grow"><b>${t}</b><div class="small muted">${d}</div></div><button class="switch ${n[k] ? 'on' : ''}" role="switch" aria-checked="${Boolean(n[k])}" data-k="${k}" aria-label="${t}"></button></div>`)}
      <p class="hint">Reminder choices are saved. Delivery needs a notification service, which is not set up in this version.</p>
      <button class="btn primary" id="sp" style="margin-top:12px">Save preferences</button></div>
  </div><div>
    <div class="card"><div class="card-h"><h3>AI status</h3></div>
      <div class="row"><span class="tag ${ai.gemini ? '' : 'gray'}">Gemini ${ai.gemini ? 'connected' : 'no key'}</span><span class="tag ${ai.groq ? '' : 'gray'}">Groq ${ai.groq ? 'connected' : 'no key'}</span></div>
      <p class="small muted" style="margin-top:10px">${ai.any ? 'Gemini handles chat, recipes and planning. Groq handles quick lookups and takes over if Gemini is busy.' : 'Add your keys to the .env file and restart the server. Without keys, meal logging uses the built-in food table.'}</p></div>
    <div class="card"><div class="card-h"><h3>Password</h3></div>
      <div class="field"><label class="f" for="pw1">Current password</label><input class="input" id="pw1" type="password" autocomplete="current-password"></div>
      <div class="field"><label class="f" for="pw2">New password</label><input class="input" id="pw2" type="password" autocomplete="new-password"><div class="hint">At least 8 characters.</div></div>
      <div class="err" id="pe" role="alert"></div><button class="btn" id="pc">Change password</button></div>
    <div class="card"><div class="card-h"><h3>Your data</h3></div>
      <p class="small muted">Profile and pantry details are sent to the AI provider only when you use an AI feature.</p>
      <div class="row wrap" style="margin-top:12px"><button class="btn" id="ex">${icon('download', 16)}Export my data</button><button class="btn danger" id="dl">Delete account</button></div></div>
  </div></div>`);

  $('#sn').onclick = (e) => busy(e.currentTarget, async () => { try { const r = await put('/api/settings', { name: $('#s-name').value.trim() }); state.user.name = r.user.name; toast('Name saved'); } catch (err) { toast(err.message, 'bad'); } });
  $$('.switch').forEach((s) => s.onclick = () => { n[s.dataset.k] = !n[s.dataset.k]; s.classList.toggle('on', n[s.dataset.k]); s.setAttribute('aria-checked', n[s.dataset.k]); });
  $('#sp').onclick = (e) => busy(e.currentTarget, async () => {
    try { const r = await put('/api/settings', { notifications: n }); state.profile = r.profile; toast('Preferences saved'); } catch (err) { toast(err.message, 'bad'); }
  });
  $('#pc').onclick = (e) => busy(e.currentTarget, async () => {
    $('#pe').textContent = '';
    try { await post('/api/account/password', { current: $('#pw1').value, next: $('#pw2').value }); $('#pw1').value = $('#pw2').value = ''; toast('Password changed'); } catch (err) { $('#pe').textContent = err.message; }
  });
  $('#ex').onclick = (e) => busy(e.currentTarget, async () => {
    try {
      const res = await fetch('/api/account/export', { headers: { Authorization: `Bearer ${store.token}` } });
      if (!res.ok) throw new Error('Could not export your data.');
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: 'nutrisense-export.json' });
      document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (err) { toast(err.message, 'bad'); }
  });
  $('#dl').onclick = () => modal({
    title: 'Delete your account',
    body: html`<p class="muted">This permanently deletes your profile, pantry, meals and chats. It cannot be undone.</p><div class="field" style="margin-top:14px"><label class="f" for="dpw">Enter your password to confirm</label><input class="input" id="dpw" type="password" autocomplete="current-password"></div><div class="err" id="de" role="alert"></div>`,
    actions: [{ label: 'Cancel' }, { label: 'Delete forever', kind: 'danger', onClick: async () => {
      try { await del('/api/account', { password: $('#dpw').value }); toast('Account deleted'); logout(); return false; } catch (err) { $('#de').textContent = err.message; return true; }
    } }]
  });
}
