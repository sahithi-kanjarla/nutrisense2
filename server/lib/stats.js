import { q } from './db.js';
import { addDays, dateRange } from './dates.js';

const r1 = (n) => Math.round(n * 10) / 10;

/** Per-day totals for the `days` days ending on `endDate` (inclusive), oldest first. */
export function perDay(userId, endDate, days) {
  const from = addDays(endDate, -(days - 1));
  const rows = q.all(
    `SELECT date, SUM(kcal) AS kcal, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat, SUM(fiber) AS fiber, COUNT(*) AS meals
     FROM meals WHERE user_id = ? AND date >= ? AND date <= ? GROUP BY date`, userId, from, endDate
  );
  const byDate = new Map(rows.map((r) => [r.date, r]));
  return dateRange(from, endDate).map((date) => {
    const r = byDate.get(date);
    return r
      ? { date, kcal: Math.round(r.kcal), protein: r1(r.protein), carbs: r1(r.carbs), fat: r1(r.fat), fiber: r1(r.fiber), meals: r.meals, logged: true }
      : { date, kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, meals: 0, logged: false };
  });
}

export function rangeStats(userId, endDate, days, targets) {
  const list = perDay(userId, endDate, days);
  const logged = list.filter((d) => d.logged);
  const avgOf = (key) => (logged.length ? r1(logged.reduce((s, d) => s + d[key], 0) / logged.length) : 0);
  const avg = { kcal: Math.round(avgOf('kcal')), protein: avgOf('protein'), carbs: avgOf('carbs'), fat: avgOf('fat'), fiber: avgOf('fiber') };
  const protein_hits = logged.filter((d) => d.protein >= targets.protein * 0.9).length;
  const kcal_on_target = logged.filter((d) => d.kcal >= targets.calories * 0.85 && d.kcal <= targets.calories * 1.15).length;

  const from = addDays(endDate, -(days - 1));
  const first = q.get('SELECT date, kg FROM weight_logs WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1', userId, from)
    || q.get('SELECT date, kg FROM weight_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date ASC LIMIT 1', userId, from, endDate);
  const last = q.get('SELECT date, kg FROM weight_logs WHERE user_id = ? AND date <= ? ORDER BY date DESC LIMIT 1', userId, endDate);
  // One log is not a change; show nothing instead of "0 kg".
  const weight_change = first && last && first.date !== last.date ? r1(last.kg - first.kg) : null;

  return {
    days, logged_days: logged.length, protein_hits, kcal_on_target, avg,
    targets: { calories: targets.calories, protein: targets.protein, carbs: targets.carbs, fat: targets.fat, fiber: targets.fiber },
    weight_change, per_day: list
  };
}
