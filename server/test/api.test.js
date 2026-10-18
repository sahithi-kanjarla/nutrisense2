process.env.DATABASE_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

let app, base, mock, mockBase;
const calls = { gemini: [], groq: [] };
let geminiReply = () => ({ status: 503, body: { error: { message: 'unset' } } });
let groqReply = () => ({ status: 503, body: { error: { message: 'unset' } } });

const TODAY = '2026-10-14';

before(async () => {
  mock = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      const isGemini = req.url.startsWith('/gemini');
      (isGemini ? calls.gemini : calls.groq).push(body);
      const out = (isGemini ? geminiReply : groqReply)(body);
      const payload = out.body ?? (isGemini
        ? { candidates: [{ content: { parts: [{ text: typeof out.text === 'string' ? out.text : JSON.stringify(out.json) }] } }] }
        : { choices: [{ message: { content: typeof out.text === 'string' ? out.text : JSON.stringify(out.json) } }] });
      res.writeHead(out.status || 200, { 'Content-Type': 'application/json' }).end(JSON.stringify(payload));
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  mockBase = `http://127.0.0.1:${mock.address().port}`;
  process.env.GEMINI_BASE_URL = `${mockBase}/gemini`;
  process.env.GROQ_BASE_URL = `${mockBase}/groq`;
  process.env.GEMINI_API_KEY = 'test-gemini';
  process.env.GROQ_API_KEY = 'test-groq';

  const { buildServer } = await import('../index.js');
  app = buildServer();
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}/api`;
});

after(() => { app.close(); mock.close(); });

beforeEach(async () => {
  calls.gemini.length = 0;
  calls.groq.length = 0;
  geminiReply = () => ({ status: 503, body: { error: { message: 'unset' } } });
  groqReply = () => ({ status: 503, body: { error: { message: 'unset' } } });
  const { resetCooldowns } = await import('../lib/ai/index.js');
  resetCooldowns();
});

async function api(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}

let counter = 0;
async function newUser(profile = {}) {
  counter += 1;
  const s = await api('POST', '/auth/signup', { name: `User ${counter}`, email: `user${counter}@example.com`, password: 'password123' });
  assert.equal(s.status, 201);
  const o = await api('POST', '/onboarding', {
    today: TODAY, goal: 'lose', sex: 'female', age: 30, height_cm: 168, weight_kg: 74, target_weight_kg: 68,
    activity: 'moderate', diet: 'veg', allergies: ['peanuts'], pantry: ['rice', 'toor', 'paneer', 'spinach', 'almond', 'eggs'], ...profile
  }, s.token);
  assert.equal(o.status, 200, JSON.stringify(o));
  return { token: s.token, onboarding: o };
}

/* ------------------------------ Auth and profile ------------------------------ */

test('auth: signup, login, duplicate email, bad password, protected routes', async () => {
  const s = await api('POST', '/auth/signup', { name: 'Asha', email: 'asha@example.com', password: 'supersecret' });
  assert.equal(s.status, 201);
  assert.equal(s.user.onboarded, false);
  assert.equal((await api('POST', '/auth/signup', { name: 'Asha', email: 'ASHA@example.com', password: 'supersecret' })).status, 409);
  assert.equal((await api('POST', '/auth/signup', { name: 'X', email: 'nope', password: 'supersecret' })).status, 400);
  assert.equal((await api('POST', '/auth/signup', { name: 'X', email: 'x@example.com', password: 'short' })).status, 400);
  const l = await api('POST', '/auth/login', { email: 'asha@example.com', password: 'supersecret' });
  assert.equal(l.status, 200);
  assert.equal((await api('POST', '/auth/login', { email: 'asha@example.com', password: 'wrong-password' })).status, 401);
  assert.equal((await api('GET', '/auth/me')).status, 401);
  assert.equal((await api('GET', '/auth/me', undefined, l.token)).user.email, 'asha@example.com');
  assert.equal((await api('GET', '/pantry')).status, 401);
});

test('onboarding computes a plan, seeds a safe pantry and rejects bad input', async () => {
  const { onboarding } = await newUser({ diet: 'veg', pantry: ['rice', 'eggs', 'paneer', 'almond'], allergies: ['tree'] });
  assert.equal(onboarding.targets.calories, 1950);
  assert.equal(onboarding.pantry_added, 2, 'eggs (veg diet) and almonds (tree nut allergy) are not stocked');
  const s = await api('POST', '/auth/signup', { name: 'Bad', email: 'bad@example.com', password: 'password123' });
  const bad = await api('POST', '/onboarding', { goal: 'lose', sex: 'female', age: 8, height_cm: 168, weight_kg: 74, activity: 'light', diet: 'veg' }, s.token);
  assert.equal(bad.status, 400);
});

test('profile edits and targets', async () => {
  const { token } = await newUser();
  const t = await api('PUT', '/targets', { calories: 1800, protein: 100, carbs: 200, fat: 55, fiber: 28, water_glasses: 8 }, token);
  assert.equal(t.targets.calories, 1800);
  assert.equal((await api('PUT', '/targets', { calories: 100, protein: 100, carbs: 200, fat: 55, fiber: 28, water_glasses: 8 }, token)).status, 400);
  const p = await api('PUT', '/profile', { diet: 'egg', allergies: ['peanuts', 'dairy'] }, token);
  assert.equal(p.profile.diet, 'egg');
  assert.deepEqual(p.profile.allergies, ['peanuts', 'dairy']);
  const low = await api('PUT', '/targets', { calories: 900, protein: 60, carbs: 100, fat: 30, fiber: 20, water_glasses: 8 }, token);
  assert.equal(low.status, 400, 'below the calorie floor');
  const mismatch = await api('PUT', '/targets', { calories: 2000, protein: 30, carbs: 50, fat: 20, fiber: 20, water_glasses: 8 }, token);
  assert.equal(mismatch.status, 400, 'macros do not match calories');
  const future = await api('POST', '/weight', { date: '2999-01-01', kg: 70 }, token);
  assert.equal(future.status, 400);
  const w = await api('POST', '/weight', { date: '2026-10-01', kg: 70 }, token);
  assert.equal(w.targets_updated, true, 'auto targets follow the new weight');
  await api('POST', '/pantry', { name: 'Milk', quantity: 1, unit: 'l', expires_on: '2026-12-31', today: TODAY }, token);
  const m = await api('POST', '/pantry', { name: 'Milk', quantity: 1, unit: 'l', expires_on: '2026-11-01', today: TODAY }, token);
  assert.equal(m.item.expires_on, '2026-11-01', 'merged stock keeps the soonest expiry');
  const res = await fetch(base + '/pantry/%E0%A4%A', { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 400, 'bad URL encoding is a 400, not a 500');
});

/* ------------------------------ Pantry, meals, dashboard ------------------------------ */

test('pantry CRUD with expiry status, merge and isolation between users', async () => {
  const a = await newUser();
  const b = await newUser();
  const add = await api('POST', '/pantry', { name: 'Curd', quantity: 500, unit: 'g', location: 'fridge', expires_on: '2026-10-16', today: TODAY }, a.token);
  assert.equal(add.status, 201);
  assert.equal(add.item.days_left, 2);
  assert.equal(add.item.status, 'soon');
  assert.equal(add.item.protein100, 3.5, 'nutrition filled from the food table');
  const again = await api('POST', '/pantry', { name: 'curd', quantity: 250, unit: 'g' }, a.token);
  assert.equal(again.merged, true);
  assert.equal(again.item.quantity, 750);
  const kg = await api('POST', '/pantry', { name: 'Sugar', quantity: 1, unit: 'kg' }, a.token);
  assert.equal(kg.item.quantity, 1000);
  const list = await api('GET', `/pantry?today=${TODAY}`, undefined, a.token);
  assert.equal(list.stats.expiring, 1);
  assert.equal((await api('PATCH', `/pantry/${add.item.id}`, { expires_on: '2026-10-10', today: TODAY }, a.token)).item.status, 'expired');
  assert.equal((await api('PATCH', `/pantry/${add.item.id}`, { quantity: 1 }, b.token)).status, 404, 'cannot edit another user\'s item');
  assert.equal((await api('DELETE', `/pantry/${add.item.id}`, undefined, b.token)).status, 404);
  assert.equal((await api('DELETE', `/pantry/${add.item.id}`, undefined, a.token)).status, 200);
  assert.equal((await api('POST', '/pantry', { name: 'X', quantity: -1 }, a.token)).status, 400);
});

test('meal logging deducts pantry stock and feeds the dashboard', async () => {
  const { token } = await newUser();
  const pantry = await api('GET', `/pantry?today=${TODAY}`, undefined, token);
  const paneer = pantry.items.find((i) => i.name === 'Paneer');
  const log = await api('POST', '/meals', {
    date: TODAY, name: 'Paneer bhurji', meal_type: 'dinner', kcal: 300, protein: 18, carbs: 6, fat: 22, fiber: 1,
    deductions: [{ item_id: paneer.id, amount: 100 }]
  }, token);
  assert.equal(log.status, 201);
  assert.equal(log.deducted[0].amount, 100);
  const after = await api('GET', `/pantry?today=${TODAY}`, undefined, token);
  assert.equal(after.items.find((i) => i.name === 'Paneer').quantity, 100);
  await api('POST', '/meals', { date: TODAY, name: 'Oats', meal_type: 'breakfast', kcal: 400, protein: 15, carbs: 60, fat: 8, fiber: 8 }, token);
  await api('POST', '/meals', { date: '2026-10-13', name: 'Dal rice', meal_type: 'lunch', kcal: 600, protein: 20, carbs: 90, fat: 10, fiber: 9 }, token);
  await api('PUT', '/water', { date: TODAY, glasses: 5 }, token);
  const d = await api('GET', `/dashboard?date=${TODAY}`, undefined, token);
  assert.equal(d.totals.kcal, 700);
  assert.equal(d.remaining.calories, 1250);
  assert.equal(d.water.glasses, 5);
  assert.equal(d.streak, 2);
  assert.equal(d.week.length, 7);
  assert.equal((await api('POST', '/meals', { date: TODAY, name: 'X', meal_type: 'brunch', kcal: 1 }, token)).status, 400);
  const del = await api('DELETE', `/meals/${log.meal.id}`, undefined, token);
  assert.equal(del.totals.kcal, 400);
});

test('progress and weight logging', async () => {
  const { token } = await newUser();
  await api('POST', '/weight', { date: '2026-09-20', kg: 75.8 }, token);
  await api('POST', '/weight', { date: TODAY, kg: 74 }, token);
  await api('POST', '/meals', { date: TODAY, name: 'Lunch', meal_type: 'lunch', kcal: 1900, protein: 90, carbs: 250, fat: 60, fiber: 28 }, token);
  const p = await api('GET', `/progress?days=30&date=${TODAY}`, undefined, token);
  assert.equal(p.weight.series.length, 3 - 1, 'onboarding weight plus two logs share dates');
  assert.ok(p.weight.change < 0);
  assert.equal(p.logged_days, 1);
  assert.equal(p.calendar.length, 28);
  assert.equal(p.calendar.at(-1).status, 'target');
  assert.equal(p.coverage.find((c) => c.key === 'protein').pct, Math.round((90 / 89) * 100));
});

/* ------------------------------ AI layer ------------------------------ */

test('without any AI key meal analysis falls back to the built-in food table', async () => {
  const { token } = await newUser();
  const saved = { g: process.env.GEMINI_API_KEY, r: process.env.GROQ_API_KEY };
  process.env.GEMINI_API_KEY = ''; process.env.GROQ_API_KEY = '';
  try {
    const r = await api('POST', '/meals/analyze', { text: '2 roti and dal', today: TODAY }, token);
    assert.equal(r.status, 200);
    assert.equal(r.source, 'local');
    assert.ok(r.totals.kcal > 300);
    const chat = await api('POST', '/ai/chat', { message: 'hello' }, token);
    assert.equal(chat.status, 503);
    assert.equal(chat.code, 'ai_unavailable');
    const bal = await api('POST', '/ai/balance', { date: TODAY }, token);
    assert.equal(bal.status, 200, 'the balancer still works without AI');
    assert.ok(bal.suggestions.length > 0);
    assert.equal(bal.provider, null);
  } finally {
    process.env.GEMINI_API_KEY = saved.g; process.env.GROQ_API_KEY = saved.r;
  }
});

test('light tasks go to Groq first; sanity check fixes impossible calories', async () => {
  const { token } = await newUser();
  groqReply = () => ({ json: { items: [{ name: 'Paneer bhurji', quantity: '150 g', kcal: 5, protein: 21, carbs: 6, fat: 28, fiber: 1 }], notes: 'Assumed 150 g.' } });
  const r = await api('POST', '/meals/analyze', { text: 'paneer bhurji', today: TODAY }, token);
  assert.equal(r.source, 'ai');
  assert.equal(r.provider, 'groq');
  assert.equal(calls.gemini.length, 0);
  assert.ok(r.items[0].kcal > 300, 'kcal was recomputed from macros');
  assert.equal(r.pantry_matches[0].name, 'Paneer');
  const peanut = await api('POST', '/meals/analyze', { text: 'peanut chikki', today: TODAY }, token);
  groqReply = () => ({ json: { items: [{ name: 'Peanut chikki', quantity: '30 g', kcal: 150, protein: 5, carbs: 17, fat: 7, fiber: 1 }] } });
  const warn = await api('POST', '/meals/analyze', { text: 'peanut chikki', today: TODAY }, token);
  assert.ok(warn.warnings[0].includes('Peanuts'), 'logging an allergen shows a warning');
  assert.ok(peanut.status === 200 || peanut.status === 503);
});

test('falls back from Gemini to Groq on rate limit, and reports when both fail', async () => {
  const { token } = await newUser();
  geminiReply = () => ({ status: 429, body: { error: { message: 'quota' } } });
  groqReply = () => ({ json: { reply: 'Try dal and rice.', recipe: null } });
  const r = await api('POST', '/ai/chat', { message: 'what should I eat?' }, token);
  assert.equal(r.status, 200);
  assert.equal(r.provider, 'groq');
  assert.equal(r.reply, 'Try dal and rice.');
  const history = await api('GET', '/ai/chat', undefined, token);
  assert.equal(history.messages.length, 2);

  geminiReply = () => ({ status: 429, body: { error: { message: 'quota' } } });
  groqReply = () => ({ status: 500, body: { error: { message: 'boom' } } });
  const fail = await api('POST', '/ai/chat', { message: 'again' }, token);
  assert.equal(fail.status, 503);
  assert.equal(fail.code, 'ai_busy');
  assert.equal((await api('GET', '/ai/chat', undefined, token)).messages.length, 2, 'failed chats are not stored');
});

test('chat never returns a recipe that breaks allergies or diet', async () => {
  const { token } = await newUser({ allergies: ['peanuts'], diet: 'veg' });
  const bad = { title: 'Peanut chicken stir fry', ingredients: [{ name: 'chicken breast', qty: '200 g' }, { name: 'peanuts', qty: '30 g' }], steps: ['Cook.'], kcal: 500, protein: 40 };
  const good = { title: 'Palak paneer', time_min: 30, servings: 1, kcal: 480, protein: 28, carbs: 14, fat: 34, fiber: 5, ingredients: [{ name: 'Paneer', qty: '100 g' }, { name: 'Spinach', qty: '200 g' }, { name: 'Ghee', qty: '1 tsp' }], steps: ['Blanch spinach.', 'Cook with paneer.'] };
  let n = 0;
  geminiReply = () => ({ json: { reply: 'Here you go.', recipe: n++ === 0 ? bad : good } });
  const r = await api('POST', '/ai/chat', { message: 'give me a dinner recipe' }, token);
  assert.equal(r.recipe.title, 'Palak paneer');
  assert.equal(calls.gemini.length, 2, 'the model was asked to try again');
  assert.equal(r.recipe.match.have, 2, 'paneer and spinach are in the pantry');
  assert.deepEqual(r.recipe.match.missing, ['Ghee']);

  geminiReply = () => ({ json: { reply: 'Here you go.', recipe: bad } });
  const refused = await api('POST', '/ai/chat', { message: 'another recipe' }, token);
  assert.equal(refused.recipe, null);
  assert.ok(refused.reply.includes('safe'));
});

test('balancer uses AI picks only from verified pantry candidates', async () => {
  const { token } = await newUser({ allergies: ['dairy'], pantry: ['paneer', 'toor', 'oats', 'spinach'] });
  geminiReply = (body) => {
    const prompt = body.contents[0].parts[0].text;
    assert.ok(!prompt.includes('Paneer'), 'a dairy allergy removes paneer before the AI sees the list');
    const ids = [...prompt.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1]));
    return { json: { headline: 'Dal and oats close the gap', picks: [{ id: ids[0], reason: 'Lentils are rich in protein.' }, { id: 99999, reason: 'invented' }], idea: 'Dal with a bowl of oats upma.' } };
  };
  const r = await api('POST', '/ai/balance', { date: TODAY }, token);
  assert.equal(r.status, 200);
  assert.equal(r.provider, 'gemini');
  assert.equal(r.headline, 'Dal and oats close the gap');
  assert.equal(r.suggestions.length, 1);
  assert.ok(r.suggestions.every((s) => s.name !== 'Paneer'));
});

test('recipes endpoint filters unsafe recipes, ranks by pantry match and caches', async () => {
  const { token } = await newUser({ allergies: ['peanuts'] });
  geminiReply = () => ({
    json: {
      recipes: [
        { title: 'Peanut curry', ingredients: [{ name: 'peanuts', qty: '50 g' }], steps: ['x'] },
        { title: 'Needs shopping', ingredients: [{ name: 'quinoa', qty: '1 cup' }, { name: 'broccoli', qty: '100 g' }], steps: ['x'], protein: 12 },
        { title: 'Pantry pulao', ingredients: [{ name: 'rice', qty: '1 cup' }, { name: 'spinach', qty: '100 g' }], steps: ['x'], protein: 8 }
      ]
    }
  });
  const r = await api('POST', '/ai/recipes', { date: TODAY, filter: 'pantry' }, token);
  assert.equal(r.recipes.length, 2);
  assert.equal(r.dropped, 1);
  assert.equal(r.recipes[0].title, 'Pantry pulao');
  const again = await api('POST', '/ai/recipes', { date: TODAY, filter: 'pantry' }, token);
  assert.equal(again.cached, true);
  assert.equal(calls.gemini.length, 1);
  const saved = await api('POST', '/recipes/saved', { recipe: r.recipes[0] }, token);
  assert.equal(saved.status, 201);
  assert.equal((await api('GET', '/recipes/saved', undefined, token)).recipes.length, 1);
});

test('weekly planner: AI plan is stored, unsafe dishes skipped, grocery list built from gaps', async () => {
  const { token } = await newUser({ allergies: ['peanuts'] });
  const day = (n) => ({
    meals: [
      { type: 'breakfast', dish: n === 0 ? 'Peanut butter toast' : 'Oats with banana', kcal: 400, protein: 15, ingredients: [{ name: n === 0 ? 'peanut butter' : 'rolled oats', qty: '60 g' }] },
      { type: 'lunch', dish: 'Dal rice', kcal: 600, protein: 22, ingredients: [{ name: 'toor dal', qty: '60 g' }, { name: 'rice', qty: '80 g' }] },
      { type: 'dinner', dish: 'Tofu stir fry', kcal: 550, protein: 30, ingredients: [{ name: 'tofu', qty: '150 g' }, { name: 'capsicum', qty: '1' }] }
    ]
  });
  geminiReply = () => ({ json: { days: [0, 1, 2, 3, 4, 5, 6].map(day) } });
  const r = await api('POST', '/ai/plan-week', { date: TODAY, start: TODAY }, token);
  assert.equal(r.status, 200);
  assert.equal(r.start, '2026-10-12');
  assert.equal(r.saved, 20);
  assert.equal(r.skipped, 1);
  const plan = await api('GET', `/planner?start=2026-10-12&today=${TODAY}`, undefined, token);
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days[0].meals.length, 2, 'the unsafe breakfast was dropped');
  const lunch = plan.days[1].meals.find((m) => m.meal_type === 'lunch');
  assert.equal(lunch.status, 'in_pantry');
  const dinner = plan.days[1].meals.find((m) => m.meal_type === 'dinner');
  assert.equal(dinner.status, 'needs');
  assert.deepEqual(dinner.missing.sort(), ['capsicum', 'tofu']);
  const g = await api('POST', '/grocery/from-plan', { today: TODAY, start: '2026-10-12' }, token);
  assert.ok(g.added >= 2);
  const list = await api('GET', '/grocery', undefined, token);
  assert.ok(list.items.some((i) => i.name === 'capsicum' && i.category === 'produce'));
  const first = list.items[0];
  await api('PATCH', `/grocery/${first.id}`, { checked: true }, token);
  assert.equal((await api('POST', '/grocery/clear-checked', {}, token)).removed, 1);
});

test('review falls back to local bullets when AI fails', async () => {
  const { token } = await newUser();
  await api('POST', '/meals', { date: TODAY, name: 'Lunch', meal_type: 'lunch', kcal: 1900, protein: 95, carbs: 250, fat: 60, fiber: 20 }, token);
  const r = await api('POST', '/ai/review', { date: TODAY, refresh: true }, token);
  assert.equal(r.source, 'local');
  assert.ok(r.bullets.length >= 2);
  geminiReply = () => ({ json: { bullets: ['You hit protein.', 'Fiber is low.', 'Add oats.'] } });
  const ai = await api('POST', '/ai/review', { date: TODAY, refresh: true }, token);
  assert.equal(ai.source, 'ai');
});

/* ------------------------------ Account ------------------------------ */

test('settings, export and account deletion', async () => {
  const { token } = await newUser();
  const s = await api('PUT', '/settings', { name: 'Renamed', units: 'imperial', notifications: { hydration: true } }, token);
  assert.equal(s.user.name, 'Renamed');
  assert.equal(s.profile.units, 'imperial');
  assert.equal(s.profile.notifications.hydration, true);
  const ex = await api('GET', '/account/export', undefined, token);
  assert.ok(Array.isArray(ex.pantry) && ex.user.email);
  assert.equal((await api('POST', '/account/password', { current: 'nope', next: 'newpassword1' }, token)).status, 403);
  assert.equal((await api('POST', '/account/password', { current: 'password123', next: 'newpassword1' }, token)).status, 200);
  assert.equal((await api('DELETE', '/account', { password: 'wrong' }, token)).status, 403);
  assert.equal((await api('DELETE', '/account', { password: 'newpassword1' }, token)).status, 200);
  assert.equal((await api('GET', '/auth/me', undefined, token)).status, 401, 'tokens of deleted accounts stop working');
});

test('static files and unknown routes', async () => {
  const origin = base.replace('/api', '');
  const html = await fetch(origin + '/some/client/route');
  assert.equal(html.status, 200);
  assert.ok((await html.text()).includes('<'));
  assert.equal((await fetch(origin + '/missing.js')).status, 404);
  assert.equal((await fetch(origin + '/api/nope')).status, 404);
  assert.equal((await fetch(origin + '/../package.json')).status, 404, 'package.json is not served');
  const trav = await fetch(origin + '/%2e%2e/%2e%2e/etc/passwd');
  assert.notEqual((await trav.text()).includes('root:'), true);
});

test('demo guest account comes with sample data', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  assert.equal(d.status, 201);
  assert.equal(d.user.onboarded, true);
  const dash = await api('GET', `/dashboard?date=${TODAY}`, undefined, d.token);
  assert.equal(dash.status, 200);
  assert.ok(dash.totals.kcal > 0 && dash.pantry_count > 5);
});
