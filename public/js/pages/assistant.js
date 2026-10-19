import { get, post, del } from '../api.js';
import { html, icon, today, $, $$, toast, busy, esc, aiDown, confirmBox } from '../ui.js';
import { recipeCard } from './recipes.js';
import { state } from '../app.js';

const STARTERS = ['What can I cook with my pantry tonight?', 'I am short on protein today. What should I eat?', 'Suggest a quick high-fiber breakfast', 'What should I use up before it expires?'];

export default async function assistant(root) {
  const date = today();
  let msgs = (await get('/api/ai/chat')).messages;
  const allergies = state.profile.allergies || [];

  const msgHtml = (m) => html`<div class="msg ${m.role}">${m.content}</div>${m.recipe ? html`<div style="align-self:flex-start;max-width:min(560px,92%)">${recipeCard(m.recipe, { onSave: true })}</div>` : ''}`;

  root.innerHTML = String(html`
  <div class="top"><div><h1>AI assistant</h1><p>It knows your pantry, goals${allergies.length ? ' and allergies' : ''}.</p></div><button class="btn ghost" id="clear">Clear chat</button></div>
  <div class="card chat"><div class="msgs" id="msgs"></div><div class="sugg" id="sugg"></div>
    <form class="composer" id="form"><input class="input" id="in" placeholder="Ask about meals, recipes or your day…" maxlength="600" autocomplete="off" aria-label="Message"><button class="btn primary" id="send" aria-label="Send">${icon('send')}</button></form></div>
  <p class="small muted" style="margin-top:10px">General nutrition guidance only, not medical advice. Please talk to a doctor or registered dietitian about health conditions, medicines, pregnancy or worries about eating. Your profile and pantry are shared with the AI provider to answer you.</p>`);

  const box = $('#msgs');
  const paint = () => {
    box.innerHTML = String(msgs.length ? msgs.map(msgHtml) : html`<div class="empty" style="margin:auto"><div class="empty-ico">${icon('chat', 26)}</div><h4>Ask me anything about eating well</h4><p>I will stay within your allergies and diet.</p></div>`);
    $('#sugg').innerHTML = String(msgs.length ? '' : STARTERS.map((s) => html`<button class="chip" data-s="${s}">${s}</button>`));
    $$('#sugg .chip').forEach((c) => c.onclick = () => send(c.dataset.s));
    box.querySelectorAll('.rcard').forEach((card, i) => {
      const withRecipe = msgs.filter((m) => m.recipe);
      const r = withRecipe[i]?.recipe;
      card.querySelector('[data-save]')?.addEventListener('click', async () => { try { const x = await post('/api/recipes/saved', { recipe: r, today: date }); toast(x.already ? 'Already saved' : 'Recipe saved'); } catch (e) { toast(e.message, 'bad'); } });
    });
    box.scrollTop = box.scrollHeight;
  };
  paint();

  let sending = false;
  async function send(text) {
    text = text.trim();
    if (!text || sending) return;
    sending = true; $('#send').disabled = true; $('#in').value = '';
    msgs.push({ role: 'user', content: text }); paint();
    const typing = document.createElement('div'); typing.className = 'msg assistant typing'; typing.textContent = 'Thinking…'; box.append(typing); box.scrollTop = box.scrollHeight;
    let failed = false;
    try {
      const r = await post('/api/ai/chat', { message: text, date });
      msgs.push({ role: 'assistant', content: r.reply, recipe: r.recipe });
    } catch (err) {
      failed = true; msgs.pop();
      box.insertAdjacentHTML('beforeend', String(html`<div style="align-self:stretch">${aiDown(err)}</div>`));
      $('#in').value = text;
    } finally { typing.remove(); sending = false; $('#send').disabled = false; if (!failed) paint(); $('#in').focus(); }
  }
  $('#form').onsubmit = (e) => { e.preventDefault(); send($('#in').value); };
  $('#clear').onclick = async () => { if (!msgs.length || !(await confirmBox('Clear chat', 'This deletes the whole conversation.', 'Clear'))) return; await del('/api/ai/chat'); msgs = []; paint(); };
}
