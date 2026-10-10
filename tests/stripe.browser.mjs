// Optional browser check: install @playwright/test without saving, start Vite on :5175.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  let configFails = true, checkoutFails = true, paid = true, posts = [];
  await page.route('**/api/stripe?*', async route => {
    const u = new URL(route.request().url()), action = u.searchParams.get('action');
    let status = 200, data;
    if (action === 'config') { status = configFails ? 503 : 200; data = configFails ? { error: 'Demo checkout is not configured.' } : { demo: true, amount: 999 }; }
    if (action === 'status') data = { verified: paid, demo: true, status: paid ? 'complete' : 'open' };
    if (action === 'checkout') {
      posts.push(route.request().headers()['x-checkout-attempt']);
      status = checkoutFails ? 502 : 200;
      data = checkoutFails ? { error: 'Stripe is temporarily unavailable.' } : { url: 'https://checkout.stripe.com/c/pay/test_demo' };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Mock Stripe checkout</h1>' }));
  const url = process.env.DEMO_URL || 'http://localhost:5175';
  await page.goto(url);
  await page.getByRole('alert').filter({ hasText: 'not configured' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Checkout unavailable' }).isDisabled(), true);
  configFails = false;
  await page.getByRole('button', { name: 'Retry check' }).click();
  await page.getByRole('button', { name: 'Try demo checkout' }).click();
  await page.getByRole('alert').filter({ hasText: 'temporarily unavailable' }).waitFor();
  checkoutFails = false;
  await page.getByRole('button', { name: 'Try demo checkout' }).click();
  await page.getByRole('heading', { name: 'Mock Stripe checkout' }).waitFor();
  assert.equal(posts.length, 2); assert.equal(posts[0], posts[1]);
  await page.goto(`${url}/?checkout=success&session_id=cs_test_example#/`);
  await page.getByRole('status').filter({ hasText: 'Test payment confirmed by Stripe' }).waitFor();
  paid = false;
  await page.getByRole('button', { name: 'Retry check' }).click();
  await page.getByRole('status').filter({ hasText: 'not confirmed yet' }).waitFor();
  await page.goto(`${url}/?checkout=cancelled#/`);
  await page.getByRole('status').filter({ hasText: 'Checkout cancelled' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: 'Demo subscription checkout' }).scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: configuration failure/retry, checkout failure/retry and idempotency, hosted redirect, verified/pending/cancelled returns, mobile layout. Stripe was mocked.');
} finally { await browser.close(); }
