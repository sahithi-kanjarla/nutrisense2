import { createHash } from 'node:crypto';
import { targetsOf } from './data.js';

const list = (v) => [...(Array.isArray(v) ? v : [])].map(String).sort();

/**
 * A short fingerprint of everything in a profile that can change what the AI is allowed to say.
 * Cached AI results are only reused while this stays the same, so a change to allergies, a health
 * condition, a pregnancy stage, a doctor's limit or the daily targets can never serve a stale answer.
 */
export function profileSignature(profile) {
  const p = profile || {};
  return createHash('sha1').update(JSON.stringify([
    p.diet, list(p.allergies), p.dislikes || '', list(p.conditions), p.preg_stage || null,
    p.rx_sodium_mg ?? null, p.rx_protein_g ?? null, p.rx_fluid_ml ?? null,
    p.age ?? null, p.sex ?? null, p.goal ?? null, targetsOf(p)
  ])).digest('hex').slice(0, 16);
}
