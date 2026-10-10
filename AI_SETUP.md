# AI (OpenRouter) setup

Three real OpenRouter calls power the finance catch-up. They run through a small proxy in the same Cloudflare Worker that serves the site, so the key never reaches the browser.

| Step | Where | Task |
|---|---|---|
| Suggest columns | Catch-up step 2 | `map_columns` |
| Suggest departments / categories | Catch-up step 3 | `classify_rows` (rules run first, person-to-person transfers are never sent) |
| Explain where we stand | Catch-up step 4 | `summarise` (any number the AI adds is discarded) |

If the AI is unavailable the import still works. A banner says so and every unmatched row is left for manual review.

## Local

1. Copy `.dev.vars.example` to `.dev.vars` and fill in the key and two model IDs (copy IDs exactly from openrouter.ai/models; `:free` models work).
2. Terminal A: `npm run dev:api` (Worker on :8787). Terminal B: `npm run dev` (proxies `/api/ai`).

## Production

1. Set `MODEL_FAST` and `MODEL_STRONG` in `wrangler.jsonc` (they are not secrets).
2. `npx wrangler secret put OPENROUTER_API_KEY`
3. Push; Cloudflare builds and deploys. Check `https://<site>/api/ai/health` shows `"configured": true`.

## Checks

- `npm run test:ai` runs the unit and Worker tests with no network or key.
- `npm run eval:ai` runs the evaluation against OpenRouter and writes `eval/results.md` (needs the key and model IDs in the environment; optional `PRICE_FAST=in,out` per 1M tokens).
- `eval/labelled.csv` is **synthetic**. Swap in redacted real rows before quoting the numbers.

## Guarantees

AI never calculates; every AI field shows a label with its confidence until a person edits or confirms it; nothing saves without the final confirmation; descriptions are redacted in the browser and again in the Worker; the Worker accepts only the three named tasks, caps input size and never forwards upstream error bodies.
