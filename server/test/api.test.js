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

/* ------------------------------ Meal review (text + photo + editing) ------------------------------ */

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('meal review: text and photo together keep labels, limit questions and save nothing', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const before = await api('GET', `/meals?date=${TODAY}`, undefined, d.token);
  geminiReply = () => ({
    json: {
      items: [
        { name: 'Chapati', quantity: '2 pieces', cooking: 'oats and wheat flour, very little oil', origin: 'user', confidence: 'high', kcal: 180, protein: 6, carbs: 30, fat: 4, fiber: 4 },
        { name: 'Curry', quantity: '1 katori', origin: 'photo', confidence: 'medium', kcal: 150, protein: 4, carbs: 12, fat: 9, fiber: 3 },
        { name: 'Oil used', quantity: '1 tsp', origin: 'invented', confidence: 'nonsense', kcal: 40, protein: 0, carbs: 0, fat: 4.5, fiber: 0 }
      ],
      questions: [1, 2, 3, 4, 5].map((n) => ({ text: `Question ${n}?`, options: ['a', 'b', 'c', 'd', 'e', 'f'] })),
      notes: 'Oil is assumed.'
    }
  });
  const r = await api('POST', '/meals/analyze', { text: 'chapati with oats flour and wheat flour, very little oil', image: `data:image/png;base64,${PIXEL}`, mime: 'image/png', today: TODAY }, d.token);
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.source, 'photo');
  assert.equal(r.items[0].origin, 'user');
  assert.equal(r.items[1].origin, 'photo');
  assert.equal(r.items[2].origin, 'assumed', 'unknown origin values become assumed');
  assert.equal(r.items[2].confidence, 'medium');
  assert.equal(r.questions.length, 3, 'at most three follow-up questions');
  assert.ok(r.questions.every((x) => x.options.length <= 4));
  assert.ok(r.warnings.some((w) => w.includes('photo cannot show hidden ingredients')), 'allergy note for photos');
  const sent = JSON.stringify(calls.gemini[0]);
  assert.ok(sent.includes('inline_data'), 'the photo was sent to Gemini');
  assert.ok(sent.includes('chapati with oats flour'), 'the text was sent too');
  const after = await api('GET', `/meals?date=${TODAY}`, undefined, d.token);
  assert.equal(after.meals.length, before.meals.length, 'analysing does not save a meal');
});

test('meal review: answers and confirmed foods reach the AI; input is validated', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  groqReply = () => ({ json: { items: [{ name: 'Dal', quantity: '1 katori', origin: 'user', confidence: 'high', kcal: 120, protein: 7, carbs: 19, fat: 2, fiber: 4 }], questions: [] } });
  const ok = await api('POST', '/meals/analyze', {
    text: 'dal', today: TODAY, answers: [{ question: 'How much ghee?', answer: '1 tsp' }], confirmed: [{ name: 'Dal', quantity: '1 katori', cooking: 'no tadka' }]
  }, d.token);
  assert.equal(ok.source, 'ai');
  const prompt = JSON.stringify(calls.groq[0]);
  assert.ok(prompt.includes('How much ghee?') && prompt.includes('no tadka'));
  assert.equal((await api('POST', '/meals/analyze', { today: TODAY }, d.token)).status, 400, 'needs text or a photo');
  assert.equal((await api('POST', '/meals/analyze', { text: 'x rice', image: PIXEL, mime: 'image/gif' }, d.token)).status, 400, 'bad image type');
  assert.equal((await api('POST', '/meals/analyze', { text: 'x rice', confirmed: 'nope' }, d.token)).status, 400);
});

test('meal review: without AI, text still falls back to the food table with labels', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const r = await api('POST', '/meals/analyze', { text: '2 rotis and 1 bowl dal', today: TODAY }, d.token);
  assert.equal(r.source, 'local');
  assert.ok(r.items.length >= 2 && r.items.every((i) => i.origin === 'user' && i.confidence));
  assert.deepEqual(r.questions, []);
});

test('meal review: recalculating edited foods uses the table, AI for cooking notes, and flags unknown foods', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  // Plain food with a stated amount: table only, no AI call.
  const t = await api('POST', '/meals/estimate-items', { items: [{ name: 'roti', quantity: '2 pieces' }], today: TODAY }, d.token);
  assert.equal(calls.gemini.length + calls.groq.length, 0);
  assert.equal(t.items[0].origin, 'user');
  assert.equal(t.items[0].confidence, 'high');
  assert.ok(t.items[0].kcal > 150 && t.items[0].kcal < 300);
  assert.equal(t.totals.kcal, t.items[0].kcal);

  // Cooking note on a known food: calculated exactly (flour blend + oil), no AI call, and the user's wording is kept.
  const c = await api('POST', '/meals/estimate-items', { items: [{ name: 'Chapati', quantity: '2 pieces', cooking: 'oats flour and wheat flour, very little oil' }], today: TODAY }, d.token);
  assert.equal(calls.gemini.length + calls.groq.length, 0, 'known foods never need the AI');
  assert.equal(c.items[0].name, 'Chapati');
  assert.equal(c.items[0].cooking, 'oats flour and wheat flour, very little oil');
  assert.ok(c.items[0].detail.includes('flour blend') && c.items[0].detail.includes('light oil'));
  assert.ok(c.items[0].kcal > 200 && c.items[0].kcal < 260);
  assert.equal(c.items[0].basis, '2 pieces x 40 g');

  // A food the table does not know goes to the AI, which sees the cooking note.
  groqReply = () => ({ json: { items: [{ name: 'x', quantity: '1 plate', kcal: 200, protein: 7, carbs: 34, fat: 4, fiber: 5 }] } });
  const g = await api('POST', '/meals/estimate-items', { items: [{ name: 'Thalipeeth', quantity: '1 plate', cooking: 'shallow fried with very little oil' }], today: TODAY }, d.token);
  assert.equal(g.items[0].kcal, 200);
  assert.ok(JSON.stringify(calls.groq[0]).includes('very little oil'));

  // AI down: a stranger food is reported as unknown and is not counted as zero-calorie food.
  groqReply = () => ({ status: 503, body: { error: { message: 'down' } } });
  geminiReply = () => ({ status: 503, body: { error: { message: 'down' } } });
  const f = await api('POST', '/meals/estimate-items', { items: [{ name: 'roti', quantity: '2 pieces', cooking: 'with 1 tsp ghee' }, { name: 'zorblax', quantity: '1 cup' }], today: TODAY }, d.token);
  assert.ok(f.items[0].detail.includes('ghee'));
  assert.equal(f.items[1].unknown, true);
  assert.deepEqual(f.unknown, ['zorblax']);
  assert.equal(f.totals.kcal, f.items[0].kcal, 'unknown foods are not counted as zero-calorie food');

  assert.equal((await api('POST', '/meals/estimate-items', { items: [] }, d.token)).status, 400);
});

test('meal review: foods added or edited by the user are still checked against allergies', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const r = await api('POST', '/meals/estimate-items', { items: [{ name: 'peanut chikki', quantity: '30 g' }], today: TODAY }, d.token);
  assert.ok(r.warnings.some((w) => w.includes('Peanuts')));
});

test('meal review: the original photo route still works', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  geminiReply = () => ({ json: { items: [{ name: 'Idli', quantity: '3 pieces', origin: 'photo', confidence: 'medium', kcal: 150, protein: 5, carbs: 30, fat: 1, fiber: 2 }] } });
  const r = await api('POST', '/meals/analyze-photo', { image: PIXEL, mime: 'image/png' }, d.token);
  assert.equal(r.source, 'photo');
  assert.equal(r.items[0].name, 'Idli');
});

test('first-pass AI results for known foods are recalculated from the table, with the AI figure kept', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  groqReply = () => ({
    json: {
      items: [
        { name: 'chapati, oats and wheat flour', quantity: '2 pieces', cooking: 'very little oil', origin: 'user', confidence: 'high', kcal: 220, protein: 7, carbs: 40, fat: 4, fiber: 4 },
        { name: 'Rice', quantity: '1 bowl (150 g)', origin: 'user', confidence: 'high', kcal: 400, protein: 8, carbs: 80, fat: 2, fiber: 1 },
        { name: 'Thalipeeth', quantity: '1 piece', origin: 'assumed', confidence: 'medium', kcal: 180, protein: 5, carbs: 28, fat: 5, fiber: 3 }
      ]
    }
  });
  const r = await api('POST', '/meals/analyze', { text: 'chapati with oats flour and wheat flour, very little oil, rice, thalipeeth', today: TODAY }, d.token);
  const [chapati, rice, unknownFood] = r.items;
  assert.equal(chapati.kcal, 233, 'equal oats and wheat blend, light oil, 2 x 40 g');
  assert.equal(chapati.ai_kcal, 220, 'the AI figure is kept for comparison');
  assert.ok(chapati.detail.includes('flour blend') && chapati.detail.includes('equal parts assumed'));
  assert.equal(chapati.basis, '2 pieces x 40 g');
  assert.equal(rice.kcal, 195, '150 g stated in the text wins over the "1 bowl" wording');
  assert.ok(rice.check.includes('400'), 'a big gap from the AI figure is flagged');
  assert.equal(unknownFood.kcal, 180, 'foods the table does not know keep the AI estimate');
  assert.equal(unknownFood.data_source, undefined);
});

/* ------------------------------ Sodium, saturated fat and added sugar ------------------------------ */

const meal = (extra) => ({ date: TODAY, name: 'Test meal', meal_type: 'lunch', kcal: 400, protein: 15, carbs: 50, fat: 12, fiber: 5, ...extra });
const watchOfKey = (r, key) => r.watch.find((w) => w.key === key);

test('nutrients: logging stores values, blank means "no data" and 0 means a real zero', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const day = '2026-08-01'; // a day with no sample meals
  const none = await api('POST', '/meals', meal({ date: day, name: 'Old style client' }), d.token);
  assert.equal(none.status, 201);
  assert.equal(none.meal.sodium_mg, null, 'a client that does not know about the new fields stores "no data"');
  assert.equal(none.meal.sat_fat, null);
  assert.equal(none.meal.nutrient_gaps, 0);
  assert.equal(none.totals.sodium_mg, null, 'no data at all is null, not 0');
  assert.equal(watchOfKey(none, 'sodium_mg').status, 'unknown');

  const blank = await api('POST', '/meals', meal({ date: day, name: 'Blank form', sodium_mg: '', sat_fat: '', added_sugar: '' }), d.token);
  assert.equal(blank.meal.sodium_mg, null, 'empty text boxes are "no data"');

  const zero = await api('POST', '/meals', meal({ date: day, name: 'Black coffee', kcal: 2, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium_mg: 0, sat_fat: 0, added_sugar: 0 }), d.token);
  assert.equal(zero.meal.sodium_mg, 0, 'a real zero is stored as 0');
  assert.equal(zero.meal.added_sugar, 0);

  const full = await api('POST', '/meals', meal({ date: day, name: 'Dal rice', sodium_mg: '640.4', sat_fat: 3.14, added_sugar: 1.26 }), d.token);
  assert.equal(full.meal.sodium_mg, 640, 'sodium is whole milligrams');
  assert.equal(full.meal.sat_fat, 3.1);
  assert.equal(full.meal.added_sugar, 1.3);
  assert.equal(full.totals.sodium_mg, 640, 'only meals with data are added up');
  assert.deepEqual(full.totals.nutrients.sodium_mg, { value: 640, complete: 2, total: 4, partial: true });
  const w = watchOfKey(full, 'sodium_mg');
  assert.equal(w.status, 'unsure', 'under the limit but 2 of 4 meals have no data: "at least", not a green tick');
  assert.equal(w.limit, 2000);

  // A meal where one food had no data is stored as a lower bound.
  const partial = await api('POST', '/meals', meal({ date: day, name: 'Rice and shake', sodium_mg: 300, sat_fat: 1, added_sugar: 0, gaps: ['sodium_mg', 'added_sugar', 'bogus'] }), d.token);
  assert.equal(partial.meal.nutrient_gaps, 1 | 4);
  assert.equal(partial.totals.nutrients.sodium_mg.value, 940);
  assert.equal(partial.totals.nutrients.sodium_mg.complete, 2, 'a lower-bound meal is not complete');
  assert.equal(partial.totals.nutrients.sat_fat.complete, 3);

  // The meal list returns the raw values so the page can show "no data".
  const list = await api('GET', `/meals?date=${day}`, undefined, d.token);
  assert.equal(list.meals.find((m) => m.name === 'Blank form').sodium_mg, null);
  assert.equal(list.meals.find((m) => m.name === 'Black coffee').sodium_mg, 0);
  assert.equal(list.watch.length, 3);

  // Going over the limit is certain even when data is missing.
  const salty = await api('POST', '/meals', meal({ date: day, name: 'Pickle platter', sodium_mg: 1500 }), d.token);
  assert.equal(watchOfKey(salty, 'sodium_mg').status, 'over');

  const del = await api('DELETE', `/meals/${salty.meal.id}`, undefined, d.token);
  assert.equal(del.totals.nutrients.sodium_mg.value, 940);
  assert.equal(del.watch.length, 3);
});

test('nutrients: impossible values are refused', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const post = (extra) => api('POST', '/meals', meal(extra), d.token);
  const satHigh = await post({ fat: 10, sat_fat: 12 });
  assert.equal(satHigh.status, 400);
  assert.ok(satHigh.error.includes('Saturated fat'));
  assert.equal((await post({ fat: 10, sat_fat: 10.1 })).status, 201, 'rounding of 0.2 g is allowed');
  const sugarHigh = await post({ carbs: 20, added_sugar: 25 });
  assert.equal(sugarHigh.status, 400);
  assert.ok(sugarHigh.error.includes('Added sugar'));
  assert.equal((await post({ sodium_mg: -5 })).status, 400);
  assert.equal((await post({ sodium_mg: 'lots' })).status, 400);
  assert.equal((await post({ sodium_mg: 31000 })).status, 400);
  assert.equal((await post({ sat_fat: 500, fat: 400 })).status, 400);
  assert.equal((await post({ added_sugar: 2000, carbs: 1500 })).status, 400);
});

test('nutrients: the demo account shows "at least" because one sample meal has no data', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const dash = await api('GET', `/dashboard?date=${TODAY}`, undefined, d.token);
  const sodium = watchOfKey(dash, 'sodium_mg');
  assert.equal(sodium.value, 520 + 780, 'the protein shake has no data and is not counted as zero');
  assert.deepEqual([sodium.complete, sodium.total, sodium.partial], [2, 3, true]);
  assert.equal(sodium.status, 'unsure');
  assert.equal(sodium.limit, 2000);
  assert.equal(watchOfKey(dash, 'sat_fat').limit, Math.round(dash.targets.calories * 0.1 / 9), '10% of the calorie target');
  assert.equal(watchOfKey(dash, 'added_sugar').value, 2);
  assert.equal(dash.totals.kcal, 330 + 560 + 160, 'calories still include every meal');

  const yesterday = await api('GET', `/dashboard?date=2026-10-13`, undefined, d.token);
  const ys = watchOfKey(yesterday, 'sodium_mg');
  assert.deepEqual([ys.value, ys.partial, ys.status], [70 + 760 + 950, false, 'near'], 'complete data, 90% of the limit');

  const p = await api('GET', `/progress?days=7&date=${TODAY}`, undefined, d.token);
  const avg = p.watch.find((x) => x.key === 'sodium_mg');
  assert.equal(avg.days_with_data, 2);
  assert.equal(avg.partial_days, 1, 'today has a meal without data');
  assert.equal(avg.avg, Math.round(((70 + 760 + 950) + (520 + 780)) / 2 * 10) / 10);
  assert.ok(['unsure', 'over', 'near'].includes(avg.status));
  assert.equal((await api('GET', `/progress?days=7&date=2026-06-01`, undefined, d.token)).watch.find((x) => x.key === 'sodium_mg').avg, null, 'no logged days: no average, not 0');
});

test('nutrients: limits follow the profile (blood pressure, cholesterol, age)', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const limits = async () => {
    const r = await api('GET', `/dashboard?date=${TODAY}`, undefined, d.token);
    return Object.fromEntries(r.watch.map((w) => [w.key, w.limit]));
  };
  const kcal = (await api('GET', `/dashboard?date=${TODAY}`, undefined, d.token)).targets.calories;
  assert.deepEqual(await limits(), { sodium_mg: 2000, sat_fat: Math.round(kcal * 0.1 / 9), added_sugar: Math.round(kcal * 0.1 / 4) });
  assert.equal((await api('PUT', '/profile', { conditions: ['bp', 'chol'] }, d.token)).status, 200);
  const l = await limits();
  assert.equal(l.sodium_mg, 1500);
  assert.equal(l.sat_fat, Math.round(kcal * 0.06 / 9), '6% of calories with high cholesterol');
  const r = await api('GET', `/dashboard?date=${TODAY}`, undefined, d.token);
  assert.ok(r.watch.find((w) => w.key === 'sodium_mg').why.includes('blood pressure'));
  assert.equal((await api('PUT', '/profile', { age: 15, conditions: ['t2'] }, d.token)).status, 200);
  assert.equal((await limits()).added_sugar, 25, 'under 18: at most 25 g, and type 2 uses 5%');
});

test('nutrients: AI meal analysis keeps valid values, nulls missing ones, and uses the table for known foods', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  groqReply = () => ({
    json: {
      items: [
        { name: 'Rice', quantity: '150 g', origin: 'user', confidence: 'high', kcal: 195, protein: 4, carbs: 42, fat: 0.5, fiber: 0.6, sodium_mg: 900, sat_fat: 0, added_sugar: 0 },
        { name: 'Thalipeeth', quantity: '1 piece (80 g)', origin: 'assumed', confidence: 'medium', kcal: 180, protein: 5, carbs: 28, fat: 5, fiber: 3, sodium_mg: 340, sat_fat: 9, added_sugar: 40 },
        { name: 'Zorblax stew', quantity: '100 g', origin: 'assumed', confidence: 'low', kcal: 120, protein: 6, carbs: 10, fat: 6, fiber: 1 },
        { name: 'Salty mystery', quantity: '50 g', origin: 'assumed', confidence: 'low', kcal: 100, protein: 2, carbs: 10, fat: 5, fiber: 1, sodium_mg: 90000, sat_fat: 1, added_sugar: 0 }
      ],
      questions: []
    }
  });
  const r = await api('POST', '/meals/analyze', { text: 'rice, thalipeeth, stew, mystery', today: TODAY }, d.token);
  const [rice, thali, stew, mystery] = r.items;
  assert.equal(rice.sodium_mg, 2, 'known foods use the table (cooked rice, 1 mg per 100 g, 150 g), not the AI figure of 900');
  assert.ok(rice.sat_fat > 0 && rice.sat_fat < 0.5);
  assert.equal(thali.sodium_mg, 340);
  assert.equal(thali.sat_fat, 5, 'saturated fat capped at total fat');
  assert.equal(thali.added_sugar, 28, 'added sugar capped at total carbs');
  assert.ok(thali.check.includes('saturated fat'));
  assert.equal(stew.sodium_mg, null, 'the AI gave nothing, so the value is "no data" and not 0');
  assert.equal(stew.sat_fat, null);
  assert.equal(mystery.sodium_mg, null, 'impossible sodium is dropped');
  assert.equal(mystery.sat_fat, 1);
  assert.equal(r.totals.sodium_mg, 2 + 340);
  assert.deepEqual(r.totals.gaps, { sodium_mg: 2, sat_fat: 1, added_sugar: 1 });
  assert.ok(JSON.stringify(calls.groq[0]).includes('sodium_mg'), 'the prompt asks for the new fields');
});

test('nutrients: recalculating uses recipe salt, salt notes and per-food data', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const run = (items) => api('POST', '/meals/estimate-items', { items, today: TODAY }, d.token);
  const usual = (await run([{ name: 'dal', quantity: '1 katori' }])).items[0];
  assert.equal(usual.sodium_mg, 498, '150 g of the calculated dal recipe');
  const noSalt = (await run([{ name: 'dal', quantity: '1 katori', cooking: 'no salt' }])).items[0];
  assert.ok(noSalt.sodium_mg < 20 && noSalt.detail.includes('no added salt'));
  assert.equal(noSalt.kcal, usual.kcal, 'salt does not change calories');
  const extra = (await run([{ name: 'rice', quantity: '1 cup', cooking: 'with 1/2 tsp salt' }])).items[0];
  assert.ok(extra.sodium_mg > 1100 && extra.sodium_mg < 1250, String(extra.sodium_mg));
  // A food with no data stays "no data" and is listed as a gap in the totals.
  const mixed = await run([{ name: 'roti', quantity: '2 pieces' }, { name: 'protein powder', quantity: '30 g' }]);
  assert.equal(mixed.items[1].sodium_mg, null);
  assert.equal(mixed.totals.sodium_mg, mixed.items[0].sodium_mg, 'the unknown food adds nothing, and is not shown as 0');
  assert.equal(mixed.totals.gaps.sodium_mg, 1);
  assert.equal(mixed.items[1].kcal, 120, 'calories are still counted');
});

test('nutrients: account export includes the new columns', async () => {
  const d = await api('POST', '/auth/demo', { today: TODAY });
  const res = await fetch(`${base}/account/export`, { headers: { Authorization: `Bearer ${d.token}` } });
  const data = await res.json();
  const shake = data.meals.find((m) => m.name === 'Packaged protein shake');
  assert.ok(shake && 'sodium_mg' in shake && shake.sodium_mg === null);
  assert.equal(data.meals.find((m) => m.name === 'Vegetable poha').sodium_mg, 520);
});
