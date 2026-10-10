import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleStripe } from '../shared/stripe/sandbox.mjs';
import vercel from '../api/stripe.js';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const env = { STRIPE_SECRET_KEY: 'sk_test_example', STRIPE_PRICE_ID: 'price_example', APP_URL: 'https://demo.example.com', STRIPE_WEBHOOK_SECRET: 'whsec_example' };
const validPrice = { active: true, livemode: false, currency: 'eur', unit_amount: 999, recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } };
const attempt = 'abcdef01-2345-6789-abcd-012345678901';
function request(action = 'config', method = 'GET', headers = {}) { return new Request(`https://demo.example.com/api/stripe?action=${action}`, { method, headers }); }
function stub(result) { globalThis.fetch = async () => Response.json(result); }

test('missing and live credentials fail closed without contacting Stripe', async () => {
  globalThis.fetch = () => { throw Error('Must not call Stripe'); };
  for (const key of [undefined, 'sk_live_example', 'sk_test_REPLACE_ME']) {
    const r = await handleStripe(request(), { ...env, STRIPE_SECRET_KEY: key });
    assert.equal(r.status, 503);
  }
});
test('public checkout requires an explicitly configured HTTPS website', async () => {
  for (const APP_URL of ['', 'http://demo.example.com', 'https://name:password@example.com', 'https://example.com/unexpected']) {
    assert.equal((await handleStripe(request(), { ...env, APP_URL })).status, 503);
  }
});
test('price must match displayed test plan and recurring interval', async () => {
  for (const p of [{ ...validPrice, livemode: true }, { ...validPrice, unit_amount: 1000 }, { ...validPrice, currency: 'usd' }, { ...validPrice, active: false }, { ...validPrice, recurring: { interval: 'year' } }]) {
    stub(p); assert.equal((await handleStripe(request(), env)).status, 503);
  }
  stub(validPrice); const r = await handleStripe(request(), env);
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
});
test('checkout uses trusted public return URLs, a fixed price and retry idempotency', async () => {
  const posts = [];
  globalThis.fetch = async (url, options) => {
    if (url.includes('/prices/')) return Response.json(validPrice);
    posts.push(options);
    return Response.json({ id: 'cs_test_example', livemode: false, url: 'https://checkout.stripe.com/c/pay/test_example' });
  };
  for (let i = 0; i < 2; i++) assert.equal((await handleStripe(request('checkout', 'POST', { 'X-Checkout-Attempt': attempt }), env)).status, 200);
  const form = new URLSearchParams(posts[0].body);
  assert.equal(form.get('success_url'), 'https://demo.example.com/?checkout=success&session_id={CHECKOUT_SESSION_ID}#/');
  assert.equal(form.get('cancel_url'), 'https://demo.example.com/?checkout=cancelled#/');
  assert.equal(form.get('line_items[0][price]'), env.STRIPE_PRICE_ID);
  assert.equal(posts[0].headers['Idempotency-Key'], posts[1].headers['Idempotency-Key']);
});
test('reject foreign origins, wrong methods, malformed attempts and session IDs', async () => {
  assert.equal((await handleStripe(request('checkout', 'POST', { Origin: 'https://evil.example' }), env)).status, 403);
  assert.equal((await handleStripe(request('checkout'), env)).status, 405);
  assert.equal((await handleStripe(request('checkout', 'POST'), env)).status, 400);
  assert.equal((await handleStripe(request('status&session_id=cs_live_example'), env)).status, 400);
});
test('both localhost spellings work through the development proxy', async () => {
  stub(validPrice);
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const r = await handleStripe(new Request('http://127.0.0.1:8787/api/stripe', { headers: { Origin: origin } }), { ...env, APP_URL: origin });
    assert.equal(r.status, 200);
  }
});
test('return screen verifies Stripe rather than trusting success query parameters', async () => {
  const session = { livemode: false, metadata: { commons_demo: 'true' }, mode: 'subscription', status: 'complete', payment_status: 'paid', customer_email: 'private@example.com' };
  stub(session);
  const r = await handleStripe(request('status&session_id=cs_test_example'), env);
  assert.deepEqual(await r.json(), { demo: true, verified: true, status: 'complete' });
  stub({ ...session, payment_status: 'unpaid' });
  assert.equal((await (await handleStripe(request('status&session_id=cs_test_example'), env)).json()).verified, false);
  stub({ ...session, metadata: {} });
  assert.equal((await handleStripe(request('status&session_id=cs_test_example'), env)).status, 400);
});
test('upstream failures do not expose Stripe error bodies or credentials', async () => {
  globalThis.fetch = async () => Response.json({ error: 'private details' }, { status: 401 });
  const r = await handleStripe(request(), env);
  assert.equal(r.status, 502); assert.ok(!(await r.text()).includes('private'));
});
function signed(body, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex');
  return new Request('https://demo.example.com/api/stripe?action=webhook', { method: 'POST', body, headers: { 'Stripe-Signature': `t=${timestamp},v1=${signature}` } });
}
test('webhook validates raw-body signature and timestamp; repeated test events are safe', async () => {
  const body = JSON.stringify({ id: 'evt_test', livemode: false, type: 'invoice.paid' });
  for (let i = 0; i < 2; i++) assert.equal((await handleStripe(signed(body), env)).status, 200);
  assert.equal((await handleStripe(signed(body, 1), env)).status, 400);
  const tampered = signed(body); const headers = tampered.headers;
  assert.equal((await handleStripe(new Request(tampered.url, { method: 'POST', headers, body: body + ' ' }), env)).status, 400);
});
test('webhook rejects live events and missing signing secrets', async () => {
  assert.equal((await handleStripe(signed('{"livemode":true}'), env)).status, 400);
  assert.equal((await handleStripe(signed('{"livemode":false}'), {})).status, 503);
});
test('Vercel adapter exposes the web handler without starting an Express server', async () => {
  assert.equal((await vercel.fetch(request('unknown'))).status, 404);
});
