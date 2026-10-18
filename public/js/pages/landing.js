import { html, icon, logo } from '../ui.js';

export default function landing(root) {
  const feats = [
    ['pantry', 'Digital pantry', 'Track what you have, how much is left and what expires soon, so food does not go to waste.'],
    ['meal', 'Fast meal logging', 'Type what you ate in plain words or snap a photo. Calories and macros are worked out for you.'],
    ['sparkle', 'Proactive diet balancing', 'Short on protein or fiber? NutriSense suggests foods you already own, with portions.'],
    ['chat', 'AI assistant', 'Ask for recipes that respect your allergies, diet and what is in your kitchen.'],
    ['planner', 'Weekly planner', 'Plan the week around your pantry and turn the gaps into a grocery list.'],
    ['progress', 'Honest progress', 'Weight trend, macro balance and a logging streak. No guesswork, no fake numbers.']
  ];
  root.innerHTML = String(html`
  <header class="land-nav">${logo()}<div class="row"><a class="btn ghost" data-link href="/login">Log in</a><a class="btn primary" data-link href="/signup">Get started</a></div></header>
  <section class="land-hero">
    <div>
      <span class="tag">${icon('leaf', 14)} Built around your kitchen</span>
      <h1 style="margin-top:14px">Eat well with what you <em>already have</em>.</h1>
      <p>NutriSense turns your pantry into a personal nutrition coach. It knows your goal, your allergies and what is about to expire, then helps you log, balance and plan every meal.</p>
      <div class="row wrap"><a class="btn primary" data-link href="/signup">Create your free plan</a><a class="btn" data-link href="/login">I have an account</a><a class="btn" data-link href="/login">Try the demo</a></div>
      <p class="small muted" style="margin-top:16px">Takes about two minutes. Your plan is based on the Mifflin-St Jeor equation, with safety limits built in.</p>
    </div>
    <div class="mock" aria-hidden="true">
      <div class="row between"><b>Today</b><span class="tag">1,340 kcal left</span></div>
      <div class="card"><div class="row between small"><span>Protein</span><b>52 / 89 g</b></div><div class="bar" style="margin:6px 0 12px"><i style="width:58%;background:var(--green)"></i></div>
        <div class="row between small"><span>Fiber</span><b>11 / 27 g</b></div><div class="bar" style="margin-top:6px"><i style="width:40%;background:var(--teal)"></i></div></div>
      <div class="card"><div class="row"><span class="tag amber">Use soon</span><b>Spinach</b><span class="small muted right">expires in 2 days</span></div>
        <p class="small muted" style="margin-top:8px">Try 100 g of moong dal and spinach to cover 14 g of your protein gap.</p></div>
    </div>
  </section>
  <section class="feat">${feats.map(([i, t, d]) => html`<div class="card"><div class="ico-b">${icon(i, 22)}</div><h4>${t}</h4><p>${d}</p></div>`)}</section>
  <footer class="small muted" style="text-align:center;padding:0 20px 40px">NutriSense gives general nutrition guidance, not medical advice. Please talk to a doctor or dietitian about health conditions.</footer>`);
}
