# Teamly — Stripe Sandbox Integration

Teamly's hackathon demo includes a **€9.99/month subscription per organisation** using Stripe Checkout in **test/sandbox mode**. This is a single plan, not multiple pricing tiers.

## What's implemented

- Landing-page **Subscribe for €9.99/month** button (`src/pages/Landing.tsx`).
- Express endpoint `POST /api/create-checkout-session` (`backend/server.js`) creates a Stripe Checkout Session with `mode: "subscription"` and redirects the browser to Stripe-hosted Checkout.
- Signed webhook endpoint `POST /api/stripe-webhook` verifies incoming Stripe events and logs subscription/payment events.
- Webhook event handling includes `checkout.session.completed`, `invoice.paid`, and `customer.subscription.deleted`.

**Demo limitation:** The current implementation does **not** associate a Stripe customer/subscription with a Teamly organisation, store subscription status, or restrict platform access to paid organisations. A successful Checkout redirect or logged webhook event is not an access-control mechanism. This integration demonstrates the payment flow, not production billing entitlement management.

## Stripe configuration

In the **Teamly Hackathon Stripe sandbox**, the recurring product is:

| Setting | Value |
| --- | --- |
| Product | Teamly |
| Billing | Monthly subscription |
| Price | €9.99 EUR / month |
| Stripe Price ID | `price_1UP0OHJO2U2ZDInD40iYhkgq` |
| Checkout endpoint | `POST http://localhost:3000/api/create-checkout-session` |
| Webhook endpoint | `POST http://localhost:3000/api/stripe-webhook` |

## Set up locally (Windows PowerShell)

Prerequisites: Node.js/npm, access to a Stripe **test/sandbox** account, and Stripe CLI. The commands below use `npm.cmd` and `stripe.cmd` for PowerShell environments where `.ps1` scripts are blocked.

1. Clone/pull the repository and install dependencies from the repository root:

   ```powershell
   npm.cmd install
   cd backend
   npm.cmd install
   ```

2. Create `backend/.env` **locally** (do not commit it):

   ```dotenv
   STRIPE_SECRET_KEY=sk_test_REPLACE_WITH_YOUR_SANDBOX_SECRET_KEY
   STRIPE_PRICE_ID=price_1UP0OHJO2U2ZDInD40iYhkgq
   STRIPE_WEBHOOK_SECRET=whsec_REPLACE_WITH_CURRENT_CLI_SIGNING_SECRET
   ```

   The listed Price ID belongs to the existing Teamly sandbox account. If you use **your own** Stripe sandbox, create a €9.99/month recurring price there and replace `STRIPE_PRICE_ID` with your account's Price ID. Stripe secret keys are account-specific; never put them in frontend code.

3. Start the backend (terminal 1, from `backend/`):

   ```powershell
   node server.js
   ```

   The backend should listen on `http://localhost:3000`.

4. Log in to Stripe CLI, then forward webhooks (terminal 2):

   ```powershell
   stripe.cmd login
   stripe.cmd listen --events checkout.session.completed,invoice.paid,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/stripe-webhook
   ```

   Copy the **current** `whsec_...` value printed by `stripe listen` into `backend/.env` as `STRIPE_WEBHOOK_SECRET`, then **restart the backend**. The CLI signing secret can change between listener sessions. Keep this terminal running.

5. Start the frontend (terminal 3, from the repository root):

   ```powershell
   npm.cmd run dev
   ```

   Open the local URL Vite prints (typically `http://localhost:5173/`). The frontend currently calls `http://localhost:3000` directly; the backend must be running, and its local CORS configuration must allow the frontend origin.

## Demo walkthrough

1. Open Teamly's landing page and click **Subscribe for €9.99/month**.
2. Confirm Stripe-hosted Checkout shows the monthly Teamly subscription.
3. In **Stripe sandbox/test mode only**, use test card `4242 4242 4242 4242`, any future expiration date, and any valid CVC. Complete the test checkout.
4. Inspect the **backend terminal** and **Stripe CLI listener** for verified webhook events such as `checkout.session.completed` and `invoice.paid`.
5. In the same Stripe sandbox, check **Billing → Subscriptions** and **Payments** to confirm the test subscription and payment.

You can also test webhook delivery without making a checkout using:

```powershell
stripe.cmd trigger invoice.paid
```

**Important:** `stripe trigger` sends a simulated test event. It does **not** prove that a customer completed Checkout or purchased a subscription. For the full demo, perform an actual sandbox Checkout and verify the resulting subscription in Stripe.

## Current redirect behavior

The Checkout Session uses these URLs:

- Success: `http://localhost:3000/payment-success`
- Cancellation: `http://localhost:3000/payment-cancelled`

The success page is a confirmation of the browser returning from Checkout, **not** proof of paid access. Webhook verification is the reliable server-side signal for payment events.

## Security and collaboration

- **Never commit** `backend/.env`, `sk_test_...`, `whsec_...`, or live Stripe secrets.
- Confirm the environment file is ignored: `git check-ignore backend/.env`.
- Collaborators should create their **own local** `backend/.env` and obtain authorized sandbox credentials securely; do not share secrets in GitHub commits or chat messages.
- If a signing secret has been exposed, rotate/reissue it, update `.env`, and restart the backend.
- The local CORS configuration and localhost redirects are for **development only**. Production requires deployed URLs, restricted CORS, secure secret management, persistent subscription records, idempotent webhook handling, and organisation-level access checks.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Checkout button shows an error | Backend is running on port 3000; frontend origin is permitted by CORS; Stripe keys and Price ID belong to the same sandbox account |
| Checkout opens but webhook logs are missing | Stripe CLI listener is running and forwarding to port 3000; `.env` has the listener's latest `whsec_...`; backend was restarted |
| `Invalid Stripe signature` | Incorrect/stale `STRIPE_WEBHOOK_SECRET` or webhook body was parsed before `express.raw(...)` |
| `API key loaded: false` | This log refers to the separate AI/OpenRouter configuration, not necessarily Stripe |
| `stripe` or `npm` PowerShell command is blocked | Use `stripe.cmd` and `npm.cmd` |

## Relevant files

- `src/pages/Landing.tsx` — subscription card and Checkout button
- `backend/server.js` — Checkout endpoint, webhook handler, local redirects
- `backend/package.json` / `backend/package-lock.json` — Stripe backend dependency
- `backend/.env` — **local-only** credentials (never commit)

## Add this documentation to the team repository

Copy `STRIPE_INTEGRATION.md` into the **repository root**, then:

```powershell
git add STRIPE_INTEGRATION.md
git commit -m "Document Teamly Stripe sandbox integration"
git pull --rebase origin main
git push origin main
```

If `git pull --rebase` reports a conflict, resolve it before pushing; **do not force-push** over teammates' changes.
