import { q, tx } from '../lib/db.js';
import { HttpError, bad, num, oneOf, rateLimit } from '../lib/http.js';
import { dateOr } from '../lib/dates.js';
import { getPantry, getProfile } from '../lib/data.js';
import { aiStatus } from '../lib/ai/index.js';
import { extractLabel } from '../lib/ai/features.js';
import { prefsFromProfile } from '../lib/safety.js';
import { findDuplicates, labelConflicts, readImages, readProduct, toPer100 } from '../lib/scan.js';
import { LOCATIONS, normalizeQty, ownedItem, withStatus } from './pantry.js';

const MAX_BODY = 16_000_000; // four photos of up to 3.5 million base64 characters each

const SCAN_UNAVAILABLE = 'Package scanning needs a Gemini API key, so it is turned off right now. You can still add items by hand.';

/** What a person is shown and edits: the cleaned product plus the numbers the pantry would store. */
function preview(product) {
  const unit = product.package ? normalizeQty(product.package.size, product.package.unit).unit : 'g';
  return toPer100(product.nutrition, unit);
}

const family = (u) => (u === 'ml' ? 'ml' : 'g');

export function register(router) {
  // Reads the photos and returns a candidate product. Nothing is saved and the photos are not kept.
  router.add('POST', '/api/pantry/scan', async (ctx) => {
    rateLimit(`scan:${ctx.user.id}`, 10, 60_000);
    if (!aiStatus().gemini) throw new HttpError(503, SCAN_UNAVAILABLE, 'scan_unavailable');
    const images = readImages(ctx.body.images);
    const { raw, provider } = await extractLabel(images);

    if (!raw || typeof raw !== 'object' || raw.readable === false) {
      return { readable: false, message: 'That does not look like a readable package label. Try a closer, brighter photo of the front, the nutrition panel or the ingredients.' };
    }
    const { product, notes } = readProduct(raw, { strict: false });
    const found = Boolean(product.name || product.brand || product.package || product.expiry || product.ingredients || product.allergens.length || product.nutrition);
    if (!found) {
      return { readable: false, message: 'Nothing could be read from those photos. Try a closer, brighter photo, and make sure the text is in focus.' };
    }
    const profile = getProfile(ctx.user.id);
    return {
      readable: true,
      verified: false, // nothing here is verified until the person has reviewed and confirmed it
      product, notes, provider,
      stored: preview(product),
      conflicts: labelConflicts(product, prefsFromProfile(profile)),
      duplicates: findDuplicates(getPantry(ctx.user.id, dateOr(ctx.body.today)), product),
      images_used: images.length
    };
  }, { maxBody: MAX_BODY });

  // Saves the product after the person has reviewed it. The payload is checked again as strictly as any form.
  router.add('POST', '/api/pantry/scan/confirm', async (ctx) => {
    const b = ctx.body;
    if (b.confirmed !== true) throw bad('Please review and confirm the details before saving.', 'not_confirmed');
    const today = dateOr(b.today);
    const { product } = readProduct(b.product, { strict: true });
    if (!product.name) throw bad('Product name is required.');
    const location = b.location === undefined ? 'dry' : oneOf(b.location, LOCATIONS, 'Location');
    const packs = b.packs === undefined ? 1 : num(b.packs, { min: 1, max: 100, field: 'Number of packs' });
    if (!Number.isInteger(packs)) throw bad('Number of packs must be a whole number.');

    if (product.expiry?.date && product.expiry.ambiguous && b.expiry_confirmed !== true) {
      throw bad('The printed date can be read more than one way. Please check the expiry date and confirm it.', 'expiry_unconfirmed');
    }

    const size = product.package ? normalizeQty(product.package.size * packs, product.package.unit) : { quantity: 0, unit: 'g' };
    const items = getPantry(ctx.user.id, today);
    const dups = findDuplicates(items, product);
    if (dups.length && !['update', 'add'].includes(b.on_duplicate)) {
      return { saved: false, needs_decision: true, duplicates: dups };
    }

    const per = toPer100(product.nutrition, size.unit);
    const allergens = JSON.stringify({ contains: product.allergens, may_contain: product.may_contain });
    const label = product.nutrition ? JSON.stringify({ ...product.nutrition, per100_note: per.note || null }) : null;
    const expiry = product.expiry;

    const result = tx(() => {
      if (b.on_duplicate === 'update') {
        const row = ownedItem(ctx.user.id, b.duplicate_id);
        if (family(row.unit) !== family(size.unit)) throw bad('That item is measured in a different unit, so it cannot be updated with this package.');
        const earliest = [row.expires_on, expiry?.date].filter(Boolean).sort()[0] || null;
        const takesExpiry = Boolean(expiry?.date) && earliest === expiry.date;
        q.run(
          `UPDATE pantry_items SET quantity = quantity + ?, expires_on = ?, expiry_kind = ?, expiry_text = ?, mfg_on = COALESCE(?, mfg_on),
             brand = COALESCE(?, brand), category = COALESCE(?, category), ingredients = COALESCE(?, ingredients), allergens = ?,
             kcal100 = COALESCE(?, kcal100), protein100 = COALESCE(?, protein100), carbs100 = COALESCE(?, carbs100), fat100 = COALESCE(?, fat100),
             fiber100 = COALESCE(?, fiber100), sodium100 = COALESCE(?, sodium100), sugar100 = COALESCE(?, sugar100), sat_fat100 = COALESCE(?, sat_fat100),
             label_nutrition = COALESCE(?, label_nutrition), source = 'scan', updated_at = datetime('now') WHERE id = ?`,
          size.quantity, earliest, takesExpiry ? expiry.kind : row.expiry_kind, takesExpiry ? expiry.text : row.expiry_text, product.mfg?.date || null,
          product.brand, product.category, product.ingredients, allergens,
          per.kcal100, per.protein100, per.carbs100, per.fat100, per.fiber100, per.sodium100, per.sugar100, per.sat_fat100, label, row.id
        );
        return { id: row.id, merged: true };
      }
      const r = q.run(
        `INSERT INTO pantry_items (user_id, name, quantity, unit, location, expires_on, kcal100, protein100, carbs100, fat100, fiber100,
           brand, category, ingredients, allergens, sodium100, sugar100, sat_fat100, expiry_kind, expiry_text, mfg_on, label_nutrition, source)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'scan')`,
        ctx.user.id, product.name, size.quantity, size.unit, location, expiry?.date || null,
        per.kcal100, per.protein100, per.carbs100, per.fat100, per.fiber100,
        product.brand, product.category, product.ingredients, allergens, per.sodium100, per.sugar100, per.sat_fat100,
        expiry?.date ? expiry.kind : null, expiry?.text || null, product.mfg?.date || null, label
      );
      return { id: Number(r.lastInsertRowid), merged: false };
    });

    ctx.status = result.merged ? 200 : 201;
    return { saved: true, merged: result.merged, item: withStatus(ownedItem(ctx.user.id, result.id), today), note: per.note || null };
  }, { maxBody: 100_000 });
}
