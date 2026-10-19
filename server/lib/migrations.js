import { copyFileSync, existsSync } from 'node:fs';

/**
 * Database upgrades, tracked with SQLite's PRAGMA user_version.
 *
 *   0 -> 1  meals gain sodium_mg, added_sugar, sat_fat (NULL = no data, 0 = a real zero)
 *           and nutrient_gaps (bit 1 sodium, 2 saturated fat, 4 added sugar: the stored value is a
 *           lower bound because some food in that meal had no data).
 *
 * Old rows keep NULL, which means "not recorded", never zero. Safe to run on every start.
 */
export const SCHEMA_VERSION = 1;

const MEAL_COLUMNS = [
  ['sodium_mg', 'REAL'],
  ['added_sugar', 'REAL'],
  ['sat_fat', 'REAL'],
  ['nutrient_gaps', 'INTEGER NOT NULL DEFAULT 0']
];

const columnsOf = (db, table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
export const versionOf = (db) => db.prepare('PRAGMA user_version').get().user_version;

/**
 * Brings `db` up to SCHEMA_VERSION. When an existing database file is about to change, a copy is
 * written next to it first (`<file>.before-v1`) so the upgrade can always be undone.
 */
export function migrate(db, { file = ':memory:' } = {}) {
  if (versionOf(db) >= SCHEMA_VERSION) return { from: versionOf(db), to: versionOf(db), added: [] };
  const from = versionOf(db);
  const have = columnsOf(db, 'meals');
  const missing = MEAL_COLUMNS.filter(([name]) => !have.has(name));

  if (missing.length && have.size && file !== ':memory:' && existsSync(file)) {
    const backup = `${file}.before-v1`;
    if (!existsSync(backup)) {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      copyFileSync(file, backup);
    }
  }

  db.exec('BEGIN');
  try {
    for (const [name, type] of missing) db.exec(`ALTER TABLE meals ADD COLUMN ${name} ${type}`);
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { from, to: SCHEMA_VERSION, added: missing.map(([n]) => n) };
}
