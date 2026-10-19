import { config } from '../env.js';
import { AiError, looksLikeSchemaRejection, schemaSupport } from './gemini.js';

/**
 * Calls Groq's OpenAI-compatible chat completions endpoint.
 * Schema-enforced output (response_format json_schema) is only supported by some Groq models, so it is off unless
 * GROQ_JSON_SCHEMA=true is set. If Groq rejects it, the call is repeated once in plain JSON mode.
 */
export async function groqGenerate(opts) {
  const wantSchema = Boolean(opts.json && opts.schema && config.groqJsonSchema && schemaSupport.groq);
  try {
    return await groqCall(opts, wantSchema);
  } catch (err) {
    if (wantSchema && looksLikeSchemaRejection(err)) {
      schemaSupport.groq = false;
      console.warn('[ai] Groq rejected the response schema; using plain JSON mode.');
      return groqCall(opts, false);
    }
    throw err;
  }
}

async function groqCall({ system, messages, json = false, temperature = 0.4, maxTokens = 2048, schema }, useSchema) {
  const key = config.groqKey;
  if (!key) throw new AiError('Groq API key is not set.', { provider: 'groq' });

  const body = {
    model: config.groqModel,
    temperature,
    max_tokens: maxTokens,
    messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((m) => ({ role: m.role, content: m.content }))]
  };
  if (json) body.response_format = useSchema ? { type: 'json_schema', json_schema: { name: 'response', schema } } : { type: 'json_object' };

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
