// Public demonstration only: no paid access or durable subscription state is granted.
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const local = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
function appOrigin(req, env) {
  const requestUrl = new URL(req.url);
  const origin = new URL(env.APP_URL || (local(requestUrl.hostname) ? 'http://localhost:5173' : 'invalid:'));
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && local(origin.hostname)))) throw Error('config');
  return origin.origin;
}
function configured(env) {
  return /^sk_test_[A-Za-z0-9]+$/.test(env.STRIPE_SECRET_KEY || '') && /^price_[A-Za-z0-9]+$/.test(env.STRIPE_PRICE_ID || '');
}
async function stripe(env, path, form, idempotencyKey) {
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(idempotencyKey ? { 'Idempotency-Key': `commons-demo-${idempotencyKey}` } : {}) },
    body: form?.toString(), signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw Error('upstream');
  return response.json();
}
async function price(env) {
  const p = await stripe(env, `prices/${env.STRIPE_PRICE_ID}`);
  if (p.livemode !== false || !p.active || p.currency !== 'eur' || p.unit_amount !== 999 || p.recurring?.interval !== 'month' || p.recurring?.interval_count !== 1 || p.recurring?.usage_type !== 'licensed') throw Error('price');
}
async function webhook(req, env) {
  if (!env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) return json({ error: 'Webhook is not configured.' }, 503);
  const body = await req.text();
  if (body.length > 1000000) return json({ error: 'Request too large.' }, 413);
  const parts = (req.headers.get('stripe-signature') || '').split(',').map(x => x.trim().split('='));
  const timestamp = parts.find(([k]) => k === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return json({ error: 'Invalid signature.' }, 400);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  let valid = false;
  for (const [k, v] of parts) {
    if (k !== 'v1' || !/^[a-f0-9]{64}$/i.test(v || '')) continue;
    const signature = Uint8Array.from(v.match(/../g), x => parseInt(x, 16));
    if (await crypto.subtle.verify('HMAC', key, signature, enc.encode(`${timestamp}.${body}`))) valid = true;
  }
  if (!valid) return json({ error: 'Invalid signature.' }, 400);
  let event;
  try { event = JSON.parse(body); } catch { return json({ error: 'Invalid event.' }, 400); }
  if (event.livemode !== false) return json({ error: 'Only sandbox events are accepted.' }, 400);
  // Acknowledge only. Replays are harmless: this demo has no fulfilment side effects.
  return json({ received: true, demo: true });
}
export async function handleStripe(req, env) {
  const url = new URL(req.url), action = url.searchParams.get('action') || 'config';
  if (action === 'webhook' && req.method === 'POST') return webhook(req, env);
  if (!['config', 'checkout', 'status'].includes(action)) return json({ error: 'Not found.' }, 404);
  if (req.method !== (action === 'checkout' ? 'POST' : 'GET')) return json({ error: 'Method not allowed.' }, 405);
  try {
    if (!configured(env)) return json({ error: 'Demo checkout is not configured. The site owner must add a Stripe test key and test price.', demo: true }, 503);
    const origin = appOrigin(req, env), caller = req.headers.get('Origin');
    if (caller && caller !== origin && !(local(url.hostname) && /^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(caller))) return json({ error: 'This website is not configured for checkout.' }, 403);
    if (action === 'config') {
      await price(env);
      return json({ demo: true, amount: 999, currency: 'eur', interval: 'month' });
    }
    if (action === 'checkout') {
      const attempt = req.headers.get('X-Checkout-Attempt') || '';
      if (!/^[a-f0-9-]{36}$/i.test(attempt)) return json({ error: 'Invalid checkout attempt.' }, 400);
      await price(env);
      const form = new URLSearchParams({ mode: 'subscription', 'line_items[0][price]': env.STRIPE_PRICE_ID, 'line_items[0][quantity]': '1', 'metadata[commons_demo]': 'true', 'subscription_data[metadata][commons_demo]': 'true', success_url: `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}#/`, cancel_url: `${origin}/?checkout=cancelled#/`, 'custom_text[submit][message]': 'Commons demo only. No real payment or paid account access.' });
      const session = await stripe(env, 'checkout/sessions', form, attempt);
      if (session.livemode !== false || !session.id?.startsWith('cs_test_') || !session.url || new URL(session.url).origin !== 'https://checkout.stripe.com') throw Error('upstream');
      return json({ url: session.url });
    }
    const id = url.searchParams.get('session_id') || '';
    if (!/^cs_test_[A-Za-z0-9]+$/.test(id)) return json({ error: 'Invalid demo session.' }, 400);
    const session = await stripe(env, `checkout/sessions/${id}`);
    if (session.livemode !== false || session.metadata?.commons_demo !== 'true' || session.mode !== 'subscription') return json({ error: 'Not a Commons demo session.' }, 400);
    return json({ demo: true, verified: session.status === 'complete' && session.payment_status === 'paid', status: session.status });
  } catch (error) {
    const message = error.message === 'price' ? 'Configure an active Stripe test price of €9.99 per month in EUR.' : error.message === 'config' ? 'The site owner must configure APP_URL with the public website address.' : 'Stripe is temporarily unavailable. Please try again.';
    return json({ error: message }, error.message === 'upstream' ? 502 : 503);
  }
}
