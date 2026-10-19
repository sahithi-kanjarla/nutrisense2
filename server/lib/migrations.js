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
 *   2 -> 3  pantry_items gain what a package label carries, for items saved from the pantry scanner:
 *           brand, category, ingredients, allergens (JSON list as declared on the label), sodium100, sugar100,
 *           sat_fat100 (per 100 g or 100 ml, like the existing nutrition columns), expiry_kind (use_by, best_before,
 *           expiry or unknown), expiry_text (the date as printed), mfg_on, label_nutrition (JSON: the values exactly as
 *           printed, with their unit and basis) and source ('scan'; NULL for items added by hand).
 *
 * Old rows keep NULL, which means "not recorded", never zero. Safe to run on every start.
 */
export const SCHEMA_VERSION = 3;

const STEPS = [
  { version: 1, table: 'meals', columns: [['sodium_mg', 'REAL'], ['added_sugar', 'REAL'], ['sat_fat', 'REAL'], ['nutrient_gaps', 'INTEGER NOT NULL DEFAULT 0']] },
  { version: 2, table: 'profiles', columns: [['preg_stage', 'TEXT'], ['rx_sodium_mg', 'REAL'], ['rx_protein_g', 'REAL'], ['rx_fluid_ml', 'REAL']] },
  { version: 3, table: 'pantry_items', columns: [['brand', 'TEXT'], ['category', 'TEXT'], ['ingredients', 'TEXT'], ['allergens', 'TEXT'], ['sodium100', 'REAL'], ['sugar100', 'REAL'], ['sat_fat100', 'REAL'], ['expiry_kind', 'TEXT'], ['expiry_text', 'TEXT'], ['mfg_on', 'TEXT'], ['label_nutrition', 'TEXT'], ['source', 'TEXT']] }
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
