import { copyFileSync, existsSync } from 'node:fs';

/**
 * Database upgrades, tracked with SQLite's PRAGMA user_version.
 *
 *   0 -> 1  meals gain sodium_mg, added_sugar, sat_fat (NULL = no data, 0 = a real zero)
 *           and nutrient_gaps (bit 1 sodium, 2 saturated fat, 4 added sugar: the stored value is a
 *           lower bound because some food in that meal had no data).
 *   1 -> 2  profiles gain preg_stage (t1, t2, t3 or bf) and the limits a clinician may have given the user:
 *           rx_sodium_mg, rx_protein_g, rx_fluid_ml. NULL means "not set", never zero.
 *
 * Old rows keep NULL, which means "not recorded", never zero. Safe to run on every start.
 */
export const SCHEMA_VERSION = 2;

const STEPS = [
  { version: 1, table: 'meals', columns: [['sodium_mg', 'REAL'], ['added_sugar', 'REAL'], ['sat_fat', 'REAL'], ['nutrient_gaps', 'INTEGER NOT NULL DEFAULT 0']] },
  { version: 2, table: 'profiles', columns: [['preg_stage', 'TEXT'], ['rx_sodium_mg', 'REAL'], ['rx_protein_g', 'REAL'], ['rx_fluid_ml', 'REAL']] }
];

const columnsOf = (db, table) => new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
export const versionOf = (db) => db.prepare('PRAGMA user_version').get().user_version;

/**
 * Brings `db` up to SCHEMA_VERSION. When an existing database file is about to change, a copy is
 * written next to it first (`<file>.before-v<N>`) so the upgrade can always be undone.
 */
export function migrate(db, { file = ':memory:' } = {}) {
  const from = versionOf(db);
  if (from >= SCHEMA_VERSION) return { from, to: from, added: [] };
  const added = [];

  for (const step of STEPS) {
    if (versionOf(db) >= step.version) continue;
    const have = columnsOf(db, step.table);
    const missing = step.columns.filter(([name]) => !have.has(name));

    if (missing.length && have.size && file !== ':memory:' && existsSync(file)) {
      const backup = `${file}.before-v${step.version}`;
      if (!existsSync(backup)) {
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        copyFileSync(file, backup);
      }
    }

    db.exec('BEGIN');
    try {
      for (const [name, type] of missing) db.exec(`ALTER TABLE ${step.table} ADD COLUMN ${name} ${type}`);
      db.exec(`PRAGMA user_version = ${step.version}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    added.push(...missing.map(([n]) => n));
  }
  return { from, to: SCHEMA_VERSION, added };
}
