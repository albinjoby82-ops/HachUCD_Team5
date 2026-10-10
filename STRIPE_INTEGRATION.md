# Public Stripe sandbox demo

The landing page offers a simulated €9.99/month subscription. Checkout runs on the same domain as the website, on Vercel or Cloudflare Workers. No separate Express server is needed. Live Stripe keys are rejected. The configured price must be an active **test** price for exactly €9.99 EUR per month.

## Publish on Vercel

1. Use this repository as the project, with its root directory set to the folder containing the root `package.json` (the repository root). Select Vite; build command `npm run build`; output directory `dist`. Use Node 22 or newer. The `api/stripe.js` function is deployed alongside the frontend.
2. In Project → Settings → Environment Variables, add these **server-side** values for Production (and Preview if you need preview deployments):

   | Name | Value |
   | --- | --- |
   | `STRIPE_SECRET_KEY` | Your sandbox secret beginning `sk_test_` |
   | `STRIPE_PRICE_ID` | A recurring €9.99 EUR monthly test price from that same sandbox |
   | `APP_URL` | Your exact website origin, e.g. `https://www.example.com`, without a path |
   | `STRIPE_WEBHOOK_SECRET` | Signing secret for the destination below, beginning `whsec_` |

   Never prefix secrets with `VITE_`, put them into the frontend, or commit them. The existing Teamly sandbox price is `price_1UP0OHJO2U2ZDInD40iYhkgq`; it only works with that sandbox's key.
3. In Stripe's sandbox, create a webhook destination for `https://YOUR-DOMAIN/api/stripe?action=webhook`. Select `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, and `customer.subscription.deleted`. Copy its signing secret into Vercel.
4. Redeploy after setting environment variables. Visit `/api/stripe?action=config`: it must return `demo: true`, `amount: 999`, and `currency: "eur"`. If you change the domain, update `APP_URL` and the webhook destination. A preview domain needs its own matching `APP_URL`.

This function handles Stripe only. The existing AI Worker is a separate integration; deploying to Vercel does not automatically deploy that Worker.

## Publish on Cloudflare Workers

Use the existing Wrangler configuration. Set `APP_URL` and `STRIPE_PRICE_ID` in its `vars`. Store the sandbox key and destination signing secret with `npx wrangler secret put STRIPE_SECRET_KEY` and `npx wrangler secret put STRIPE_WEBHOOK_SECRET`. Deploy with `npx wrangler deploy`. Configure the same `/api/stripe?action=webhook` destination on the public domain. Never put secrets into `wrangler.jsonc`.

## Local development (PowerShell)

Copy `.dev.vars.example` to `.dev.vars` **only if it does not already exist**, and fill in the Stripe values. Preserve your existing OpenRouter settings. Set `APP_URL=http://localhost:5173` (or `http://127.0.0.1:5173` if that is the address you use).

From the repository folder, run `npm.cmd ci` and `npm.cmd run dev:api`. In another terminal run `npm.cmd run dev`. Both AI and Stripe requests are proxied to the local Worker on port 8787. For local webhooks, use `stripe listen --forward-to "localhost:8787/api/stripe?action=webhook"` and put its signing secret into `.dev.vars`, then restart the Worker.

The optional `backend/server.js` Express adapter exposes the same `/api/stripe` handler for existing backend users. The default frontend uses the Worker, so it does not need this server. The old `/api/create-checkout-session`, `/api/stripe-webhook` and plain-text localhost return pages have been retired.

## Demonstrate the flow

1. Open the landing page. It should say **Sandbox · no real payments**.
2. Click **Try demo checkout**. In Stripe, use `4242 4242 4242 4242`, any future expiry, and any three-digit CVC. Use test details, never a real card.
3. Complete checkout. The website asks Stripe to verify the session and displays **Test payment confirmed by Stripe** only for a completed, paid test session created by this demo.
4. Try cancelling checkout: you return to the website with a cancellation message. Temporary failures show an error and retry control. Checkout retries use an idempotency key to avoid creating duplicate sessions for the same attempt.
5. Confirm the test subscription in the Stripe sandbox dashboard. Check webhook delivery there; signed test events are acknowledged without changing app data.

## Scope and verification

This is a public **payment-flow demo**, not a login or paid-access system. No account access is granted, no organisation subscription record is stored, and webhooks have no fulfilment side effects. Return-page verification is for display only. Real billing would require authenticated team ownership, durable billing state, cancellation management, and idempotent webhook fulfilment.

Run `npm.cmd run test:stripe` and `npm.cmd run build`. Tests use mocked Stripe responses and signed webhook fixtures; they do not make payments. A complete live sandbox checkout still needs the account owner's test credentials and a deployed website.

References: [Stripe testing](https://docs.stripe.com/testing), [retrieve a Checkout Session](https://docs.stripe.com/api/checkout/sessions/retrieve), [Vercel function runtime](https://vercel.com/docs/functions/runtimes/node-js).
