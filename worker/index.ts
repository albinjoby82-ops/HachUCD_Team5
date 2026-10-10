// Commons AI proxy. Runs in the same Cloudflare Worker that serves the site (only /api/* reaches it).
// The browser never sees the key, and cannot use this as a general-purpose LLM: it only runs the named tasks.
import { TASKS, type TaskName } from '../shared/ai/prompts';
import { callOpenRouter } from '../shared/ai/call';

export interface Env {
  OPENROUTER_API_KEY?: string;
  MODEL_FAST?: string;
  MODEL_STRONG?: string;
  /** Extra allowed origins, comma separated. Same-origin and localhost dev are always allowed. */
  ALLOWED_ORIGIN?: string;
}

const MAX_BODY = 60_000;
const placeholder = (m?: string) => !m || m === 'REPLACE_ME';

function originAllowed(req: Request, env: Env) {
  const origin = req.headers.get('Origin');
  if (!origin) return true; // non-browser callers (curl, eval); the key stays server-side regardless
  const url = new URL(req.url);
  if (origin === url.origin) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && /^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return true;
  return (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean).includes(origin);
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!originAllowed(req, env)) return json({ error: 'forbidden_origin' }, 403);

    if (req.method === 'GET' && url.pathname === '/api/ai/health') {
      return json({ configured: !!env.OPENROUTER_API_KEY && !placeholder(env.MODEL_FAST), tiers: { fast: env.MODEL_FAST || null, strong: env.MODEL_STRONG || null } });
    }
    if (req.method !== 'POST' || url.pathname !== '/api/ai') return json({ error: 'not_found' }, 404);

    const raw = await req.text();
    if (raw.length > MAX_BODY) return json({ error: 'too_large' }, 413);
    let body: { task?: string; payload?: unknown; tier?: string };
    try { body = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }

    const name = body.task as TaskName;
    const spec = Object.prototype.hasOwnProperty.call(TASKS, name) ? TASKS[name] : undefined;
    if (!spec) return json({ error: 'unknown_task' }, 400);
    const checked = (spec.input as (v: unknown) => ReturnType<typeof TASKS.map_columns.input>)(body.payload);
    if (!checked.ok) return json({ error: 'bad_payload' }, 400);

    const tier = body.tier === 'strong' ? 'strong' : 'fast';
    const model = tier === 'strong' ? env.MODEL_STRONG : env.MODEL_FAST;
    if (!env.OPENROUTER_API_KEY || placeholder(model)) return json({ error: 'not_configured' }, 503);

    const out = await callOpenRouter({
      apiKey: env.OPENROUTER_API_KEY, model: model!, referer: url.origin,
      spec: spec as never, payload: (spec.sanitize as (i: unknown) => unknown)(checked.data),
    });
    if (!out.ok) {
      // Never forward upstream bodies. 402/429 become a plain upstream_error the client falls back from.
      const status = out.error === 'upstream_timeout' ? 504 : 502;
      return json({ error: out.error, upstream: out.status ?? null }, status);
    }
    return json({ result: out.result, usage: out.usage, model: out.model, tier });
  },
};
