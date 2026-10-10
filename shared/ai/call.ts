// One OpenRouter call, used by the Worker and by the eval so both behave identically.
import type { TaskSpec } from './prompts';

export interface Usage { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
export type CallResult<O> =
  | { ok: true; result: O; usage: Usage | null; model: string; ms: number }
  | { ok: false; error: 'upstream_timeout' | 'upstream_error' | 'bad_model_json' | 'bad_model_shape'; status?: number };

/** Free and small models often wrap JSON in prose or code fences. Take the outermost object. */
export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
  throw new Error('no json');
}

export interface CallOptions<I, O> {
  apiKey: string;
  model: string;
  spec: TaskSpec<I, O>;
  payload: I;
  referer?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export async function callOpenRouter<I, O>(o: CallOptions<I, O>): Promise<CallResult<O>> {
  const f = o.fetchImpl || fetch;
  const started = Date.now();
  const send = (jsonMode: boolean) => f('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${o.apiKey}`, 'Content-Type': 'application/json', ...(o.referer ? { 'HTTP-Referer': o.referer } : {}), 'X-Title': 'Commons' },
    body: JSON.stringify({
      model: o.model,
      messages: [{ role: 'system', content: o.spec.system }, { role: 'user', content: JSON.stringify(o.payload) }],
      ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
      temperature: 0,
      max_tokens: o.spec.maxTokens,
    }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 25_000),
  });
  let res: Response;
  try {
    res = await send(true);
    // Some models don't support JSON mode. The prompt already demands JSON, so retry once without it.
    if (res.status === 400) res = await send(false);
  } catch { return { ok: false, error: 'upstream_timeout' }; }
  if (!res.ok) return { ok: false, error: 'upstream_error', status: res.status };
  let data: any;
  try { data = await res.json(); } catch { return { ok: false, error: 'upstream_error', status: res.status }; }
  const text: unknown = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string') return { ok: false, error: 'bad_model_json' };
  let parsed: unknown;
  try { parsed = extractJson(text); } catch { return { ok: false, error: 'bad_model_json' }; }
  const out = o.spec.output(parsed);
  if (!out.ok) return { ok: false, error: 'bad_model_shape' };
  return { ok: true, result: out.data, usage: data.usage ?? null, model: String(data.model || o.model), ms: Date.now() - started };
}
