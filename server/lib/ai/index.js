import { config } from '../env.js';
import { HttpError } from '../http.js';
import { AiError, geminiGenerate } from './gemini.js';
import { groqGenerate } from './groq.js';

/**
 * Provider routing:
 *  - tier "heavy" (chat, recipes, planning, balancing, photos): Gemini first, Groq as fallback.
 *  - tier "light" (quick parsing and estimates): Groq first to save the Gemini free-tier quota,
 *    Gemini as fallback.
 * A provider that returns 429 is put on a short cooldown so the next call goes straight to the other one.
 */

const IMPLS = { gemini: geminiGenerate, groq: groqGenerate };
const cooldownUntil = { gemini: 0, groq: 0 };

export const configured = (p) => Boolean(p === 'gemini' ? config.geminiKey : config.groqKey);

export function aiStatus() {
  return { gemini: configured('gemini'), groq: configured('groq'), any: configured('gemini') || configured('groq') };
}

export function resetCooldowns() {
  cooldownUntil.gemini = 0;
  cooldownUntil.groq = 0;
}

export function parseJson(text) {
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); } catch { /* try to locate an object */ }
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { /* fall through */ }
  }
  throw new AiError('The AI reply was not valid JSON.', { status: 502 });
}

export async function generate({ tier = 'heavy', system, messages, json = false, images = [], temperature, maxTokens }) {
  const order = tier === 'light' ? ['groq', 'gemini'] : ['gemini', 'groq'];
  const usable = order.filter((p) => configured(p) && !(p === 'groq' && images.length));
  if (!usable.length) {
    if (images.length && configured('groq') && !configured('gemini')) {
      throw new HttpError(503, 'Photo analysis needs a Gemini API key. Add GEMINI_API_KEY to your .env file.', 'ai_unavailable');
    }
    throw new HttpError(503, 'AI is not set up yet. Add GEMINI_API_KEY (and optionally GROQ_API_KEY) to your .env file.', 'ai_unavailable');
  }

  const now = Date.now();
  const ready = usable.filter((p) => cooldownUntil[p] <= now);
  const attempts = ready.length ? [...ready, ...usable.filter((p) => !ready.includes(p))] : usable;
  const failures = [];

  for (const provider of attempts) {
    try {
      const text = await IMPLS[provider]({ system, messages, json, images, temperature, maxTokens });
      const parsed = json ? parseJson(text) : undefined;
      return { text, json: parsed, provider };
    } catch (err) {
      failures.push(err);
      if (err.status === 429) cooldownUntil[provider] = Date.now() + (err.retryAfterMs || 30_000);
    }
  }

  console.warn('[ai] all providers failed:', failures.map((e) => e.message).join(' | '));
  const rateLimited = failures.some((e) => e.status === 429);
  throw new HttpError(
    503,
    rateLimited
      ? 'The AI free-tier limit was reached. Please wait a minute and try again.'
      : 'The AI service is unavailable right now. Please try again in a moment.',
    'ai_busy'
  );
}
