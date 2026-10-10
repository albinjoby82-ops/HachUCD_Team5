// Browser side of the AI proxy: one retry, never throws, always tells the caller why it failed.
import type { TaskName } from '../../../shared/ai/prompts';
import type { Usage } from '../../../shared/ai/call';
import type { ClassifyOutput, MapColumnsOutput, SummaryOutput } from '../../../shared/ai/schemas';

interface Outputs { map_columns: MapColumnsOutput; classify_rows: ClassifyOutput; summarise: SummaryOutput }

export type AiFailure = 'not_configured' | 'unreachable' | 'timeout' | 'quota' | 'bad_output' | 'rejected';
export type AiReply<O> = { ok: true; result: O; usage: Usage | null; model: string } | { ok: false; error: AiFailure };

const ENDPOINT = '/api/ai';

async function once(task: TaskName, payload: unknown, tier: 'fast' | 'strong'): Promise<AiReply<unknown> & { retry?: boolean }> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task, payload, tier }), signal: AbortSignal.timeout(35_000) });
  } catch { return { ok: false, error: 'unreachable' }; }
  let body: any = null;
  try { body = await res.json(); } catch { /* not JSON: e.g. the site is served without the Worker */ }
  if (res.ok && body?.result !== undefined) return { ok: true, result: body.result, usage: body.usage ?? null, model: body.model };
  const code: string = body?.error || '';
  if (code === 'not_configured') return { ok: false, error: 'not_configured' };
  if (code === 'upstream_timeout') return { ok: false, error: 'timeout', retry: true };
  if (code === 'bad_model_json' || code === 'bad_model_shape') return { ok: false, error: 'bad_output', retry: true };
  if (code === 'upstream_error') return { ok: false, error: body?.upstream === 402 || body?.upstream === 429 ? 'quota' : 'rejected' };
  if (res.status === 404 || res.status === 405 || !body) return { ok: false, error: 'unreachable' };
  return { ok: false, error: 'rejected' };
}

export async function callAI<T extends TaskName>(task: T, payload: unknown, tier: 'fast' | 'strong' = 'fast'): Promise<AiReply<Outputs[T]>> {
  let r = await once(task, payload, tier);
  if (!r.ok && r.retry) r = await once(task, payload, tier);
  return r as never;
}

export const failureText: Record<AiFailure, string> = {
  not_configured: 'AI suggestions are not set up on this deployment yet.',
  unreachable: 'AI suggestions are unavailable right now.',
  timeout: 'The AI service took too long to respond.',
  quota: 'The AI service has hit its usage limit.',
  bad_output: 'The AI service returned something we could not use.',
  rejected: 'The AI service rejected the request.',
};
