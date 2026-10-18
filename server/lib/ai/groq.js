import { config } from '../env.js';
import { AiError } from './gemini.js';

/** Calls Groq's OpenAI-compatible chat completions endpoint. */
export async function groqGenerate({ system, messages, json = false, temperature = 0.4, maxTokens = 2048 }) {
  const key = config.groqKey;
  if (!key) throw new AiError('Groq API key is not set.', { provider: 'groq' });

  const body = {
    model: config.groqModel,
    temperature,
    max_tokens: maxTokens,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))]
  };
  if (json) body.response_format = { type: 'json_object' };

  let res;
  try {
    res = await fetch(`${config.groqBase}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)
    });
  } catch (err) {
    throw new AiError(`Groq request failed: ${err.name === 'TimeoutError' ? 'timed out' : err.message}`, { provider: 'groq' });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    throw new AiError(`Groq error: ${msg}`, { provider: 'groq', status: res.status, retryAfterMs: retryAfter * 1000 || (res.status === 429 ? 30_000 : 0) });
  }
  const text = (data?.choices?.[0]?.message?.content || '').trim();
  if (!text) throw new AiError('Groq returned an empty response.', { provider: 'groq', status: 502 });
  if (json && data?.choices?.[0]?.finish_reason === 'length') throw new AiError('Groq reply was cut off (too long).', { provider: 'groq', status: 502 });
  return text;
}
