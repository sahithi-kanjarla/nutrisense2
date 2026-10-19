import { q } from '../lib/db.js';
import { bad, num } from '../lib/http.js';
import { computePlan, isAutoPlan } from '../lib/plan.js';
import { addDays, dateOr, dateRange, todayStr } from '../lib/dates.js';
import { dayTotals, getPantry, getProfile, remainingOf, targetsOf, watchFor } from '../lib/data.js';
import { clinicalOf, limitsOf, WATCH } from '../lib/limits.js';
import { perDay, rangeStats } from '../lib/stats.js';

function streakFor(userId, date) {
  const rows = q.all('SELECT DISTINCT date FROM meals WHERE user_id = ? AND date >= ? AND date <= ?', userId, addDays(date, -90), date);
  const set = new Set(rows.map((r) => r.date));
  let d = set.has(date) ? date : addDays(date, -1);
  let n = 0;
  while (set.has(d)) { n += 1; d = addDays(d, -1); }
  return n;
}

const waterFor = (userId, date) => q.get('SELECT glasses FROM water_logs WHERE user_id = ? AND date = ?', userId, date)?.glasses ?? 0;

export function register(router) {
  router.add('GET', '/api/dashboard', async (ctx) => {
    const date = dateOr(ctx.query.date);
    const profile = getProfile(ctx.user.id);
    const targets = targetsOf(profile);
    const totals = dayTotals(ctx.user.id, date);
    const pantry = getPantry(ctx.user.id, date);
    const week = perDay(ctx.user.id, date, 7).map((d) => ({ date: d.date, kcal: d.kcal, logged: d.logged }));
    const withinTenPct = week.filter((d) => d.logged && Math.abs(d.kcal - targets.calories) <= targets.calories * 0.15).length;
    return {
      date,
      name: ctx.user.name,
      targets,
      totals,
      remaining: remainingOf(targets, totals),
      watch: watchFor(profile, totals),
      clinical: clinicalOf(profile),
      meals: q.all('SELECT * FROM meals WHERE user_id = ? AND date = ? ORDER BY id', ctx.user.id, date),
      water: { glasses: waterFor(ctx.user.id, date), goal: targets.water_glasses, managed: (profile.conditions || []).includes('clin'), limit_ml: profile.rx_fluid_ml ?? null },
      streak: streakFor(ctx.user.id, date),
      week,
      week_on_target: withinTenPct,
      week_logged: week.filter((d) => d.logged).length,
      expiring: pantry.filter((i) => i.status === 'soon').sort((a, b) => a.days_left - b.days_left).slice(0, 4),
      pantry_count: pantry.length
    };
  });

  router.add('GET', '/api/water', async (ctx) => {
    const date = dateOr(ctx.query.date);
    return { date, glasses: waterFor(ctx.user.id, date), goal: targetsOf(getProfile(ctx.user.id)).water_glasses };
  });

  router.add('PUT', '/api/water', async (ctx) => {
    const date = dateOr(ctx.body.date);
    const glasses = Math.round(num(ctx.body.glasses, { min: 0, max: 30, field: 'Glasses' }));
    q.run('INSERT INTO water_logs (user_id, date, glasses) VALUES (?,?,?) ON CONFLICT(user_id, date) DO UPDATE SET glasses = excluded.glasses', ctx.user.id, date, glasses);
    return { date, glasses };
  });

  router.add('POST', '/api/weight', async (ctx) => {
    const date = dateOr(ctx.body.date);
    if (date > todayStr()) throw bad('Weight cannot be logged for a future date.');
    const kg = Math.round(num(ctx.body.kg, { min: 25, max: 300, field: 'Weight' }) * 10) / 10;
    const before = getProfile(ctx.user.id);
    const hadAutoTargets = isAutoPlan(before);
    q.run('INSERT INTO weight_logs (user_id, date, kg) VALUES (?,?,?) ON CONFLICT(user_id, date) DO UPDATE SET kg = excluded.kg', ctx.user.id, date, kg);
    const latest = q.get('SELECT kg FROM weight_logs WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1', ctx.user.id, todayStr());
    q.run('UPDATE profiles SET weight_kg = ? WHERE user_id = ?', latest.kg, ctx.user.id);
    // Keep targets in step with the new weight, unless the user set custom targets.
    let targets_updated = false;
    if (hadAutoTargets) {
      const plan = computePlan({ ...before, weight_kg: latest.kg });
      q.run('UPDATE profiles SET calories=?, protein=?, carbs=?, fat=?, fiber=?, water_glasses=? WHERE user_id = ?',
        plan.calories, plan.protein, plan.carbs, plan.fat, plan.fiber, plan.water_glasses, ctx.user.id);
      targets_updated = true;
    }
    return { date, kg, targets_updated };
  });

  router.add('GET', '/api/progress', async (ctx) => {
    const date = dateOr(ctx.query.date);
    const days = [7, 30, 90].includes(Number(ctx.query.days)) ? Number(ctx.query.days) : 30;
    const profile = getProfile(ctx.user.id);
    const targets = targetsOf(profile);
    const stats = rangeStats(ctx.user.id, date, days, targets);
    const from = addDays(date, -(days - 1));

    const weights = q.all('SELECT date, kg FROM weight_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date', ctx.user.id, from, date);
    const latest = q.get('SELECT date, kg FROM weight_logs WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1', ctx.user.id, date);

    const a = stats.avg;
    const kcalFromMacros = a.protein * 4 + a.carbs * 4 + a.fat * 9;
    const split = kcalFromMacros > 0
      ? { protein: Math.round((a.protein * 4 / kcalFromMacros) * 100), carbs: Math.round((a.carbs * 4 / kcalFromMacros) * 100), fat: Math.round((a.fat * 9 / kcalFromMacros) * 100) }
      : { protein: 0, carbs: 0, fat: 0 };

    const pct = (v, t) => (t ? Math.round((v / t) * 100) : 0);
    const coverage = [
      { key: 'protein', label: 'Protein', avg: a.protein, target: targets.protein, pct: pct(a.protein, targets.protein) },
      { key: 'fiber', label: 'Fiber', avg: a.fiber, target: targets.fiber, pct: pct(a.fiber, targets.fiber) },
      { key: 'carbs', label: 'Carbs', avg: a.carbs, target: targets.carbs, pct: pct(a.carbs, targets.carbs) },
      { key: 'fat', label: 'Fats', avg: a.fat, target: targets.fat, pct: pct(a.fat, targets.fat) }
    ];

    // Logging calendar: last 28 days.
    const cal = perDay(ctx.user.id, date, 28).map((d) => ({
      date: d.date,
      status: !d.logged ? 'none' : d.kcal >= targets.calories * 0.85 && d.kcal <= targets.calories * 1.15 ? 'target' : 'logged'
    }));

    // Average sodium, saturated fat and added sugar per day (days with data only) against the daily limits.
    const limits = limitsOf(profile, targets);
    const watchAvg = WATCH.map((w) => {
      const s = stats.watch[w.key];
      const lim = limits[w.key].limit;
      const status = s.avg == null ? 'unknown' : s.avg > lim ? 'over' : s.partial_days > 0 || s.days_with_data < s.logged_days ? 'unsure' : s.avg >= lim * 0.85 ? 'near' : 'ok';
      return { key: w.key, label: w.label, unit: w.unit, limit: lim, why: limits[w.key].why, ...s, status };
    });

    return {
      date, days, targets, watch: watchAvg, clinical: clinicalOf(profile),
      weight: { series: weights, current: latest?.kg ?? profile.weight_kg, goal: profile.target_weight_kg, change: stats.weight_change },
      avg: a, split, coverage, calendar: cal,
      logged_days: stats.logged_days, protein_hits: stats.protein_hits, kcal_on_target: stats.kcal_on_target
    };
  });
}
