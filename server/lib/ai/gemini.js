import { config } from '../env.js';

export class AiError extends Error {
  constructor(message, { provider, status = 0, retryAfterMs = 0 } = {}) {
    super(message);
    this.provider = provider;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Calls the Gemini generateContent REST endpoint (free tier friendly).
 * @param {{system?:string, messages:{role:'user'|'assistant', content:string}[], json?:boolean,
 *          temperature?:number, maxTokens?:number, images?:{mime:string,data:string}[]}} opts
 */
export async function geminiGenerate({ system, messages, json = false, temperature = 0.5, maxTokens = 2048, images = [] }) {
  const key = config.geminiKey;
  if (!key) throw new AiError('Gemini API key is not set.', { provider: 'gemini' });
  const model = config.geminiModel;

  const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  if (images.length && contents.length) {
    const last = contents[contents.length - 1];
    for (const img of images) last.parts.push({ inline_data: { mime_type: img.mime, data: img.data } });
  }

  const generationConfig = { temperature, maxOutputTokens: maxTokens };
  if (json) generationConfig.responseMimeType = 'application/json';
  // Gemini 2.5 Flash "thinks" by default, which spends free-tier tokens and time on simple tasks.
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const body = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  let res;
  try {
    res = await fetch(`${config.geminiBase}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000)
    });
  } catch (err) {
    throw new AiError(`Gemini request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`, { provider: 'gemini' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw new AiError(`Gemini error: ${msg}`, { provider: 'gemini', status: res.status, retryAfterMs: retryAfter * 1000 || (res.status === 429 ? 30_000 : 0) });
  }
  if (data?.promptFeedback?.blockReason) {
    throw new AiError(`Gemini blocked the request (${data.promptFeedback.blockReason}).`, { provider: 'gemini', status: 400 });
  }
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  if (!text) throw new AiError('Gemini returned an empty response.', { provider: 'gemini', status: 502 });
  if (json && data?.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new AiError('Gemini reply was cut off (too long).', { provider: 'gemini', status: 502 });
  return text;
}
