# Inventory implementation

Implemented against the existing React / TypeScript / Vite / Zustand application. No new runtime dependencies. The bank CSV flow is unchanged.

## What works

- Inventory → Import CSV → map columns → explicitly choose cost basis and number format → review/correct/exclude → confirm and save.
- Strict UTF-8 CSV, 2 MB, 2,000 data records, 100 header columns. Comma, semicolon and tab are explicit choices; XLSX is deferred (export as CSV).
- Ordered source cells preserve duplicate headings, quoted commas, escaped quotes and embedded newlines. Record references count logical CSV records, including the header and blank records, not physical lines. Blank record count is displayed. Structural row errors require exclusion or correction in the source file; ambiguous unmatched quotes block the file.
- Header aliases only suggest mappings. All mapped columns are shown; unused columns are named and deliberately excluded from storage. Raw preview shows the first ten records; the editable preview includes every data record.
- Reference unit costs and an optional supplier per inventory record, not a purchasing ledger. Nonnegative fractional quantities with up to six decimal places, including zero. Missing cost is null, not zero. Decimal strings store costs to six places; total-to-unit conversion uses integer arithmetic with explicit rounding warnings. EUR, GBP and USD supported. Numeric values are capped at one billion.
- Duplicate names, both in the file and existing inventory, require explicit separate-record confirmation or exclusion. Existing stock is never automatically overwritten or incremented.
- SHA-256 file fingerprints scoped to destination department prevent repeated imports, even after renaming the file. BOM and line endings are normalised. A changed file still goes through duplicate review. Retrying a successful import cannot append it again; excluded rows require a corrected file for a later import.
- Import history records ID, file name, actor, time, destination, interpretation settings and read/saved/excluded counts. Saved items retain import and source-record references plus creation/update attribution. Original uploaded files are not retained.
- Manual additions/edits use the same validation. Search, department filters, supplier/cost display and separate currency totals. Estimated totals exclude used-up items and explicitly count unknown-cost records.
- Local storage is written before the inventory update is published. On a failed write the preview remains available; retry is safe. Reload retains saved records.

## Access and persistence: remaining production work

**This is still the existing browser-only demo, not a secure shared inventory service.** Role and department checks control normal UI actions and are rechecked when saving. Organisation members can view their organisation's full inventory; department leaders can maintain their own department and top-level leaders can maintain all departments. Existing cross-organisation lending stays intact.

The app intentionally offers “view as” controls and stores all demo organisations in localStorage. These checks are not authentication or a security boundary. Another device or teammate does not receive the data. There is no backend, database configuration or authenticated API in this repository. Production acceptance checks for unauthorised direct backend requests and cross-device collaboration are therefore **not implemented or verified**.

Before shared deployment, provide authenticated membership, server-side read/write authorisation, a persistent database, transactional batch saves and a unique idempotency key per organisation/destination/import. Replace `saveInventory` with that API. Do not rely on a client-supplied organisation or actor ID. A server transaction must revalidate mapping/data/duplicates and return exact results before the UI claims success. Multi-tab conflict resolution is also deferred; the demo follows the existing localStorage last-write model.

## AI teammate boundary

`readInventory(text, filename, delimiter)` returns `{ sourceFileName, columns, rows: [{ sourceRow, values, issues }], issues, blankRows }`.

`suggestMapping(columns)` supplies deterministic aliases. `validMapping(response, columnCount)` checks the complete mapping: `{ itemName, cost, quantity, supplier, currency, unit }`, where indices are zero-based and -1 means unmapped. Name and quantity must be mapped before `makeDrafts`. An OpenRouter adapter should normalise optional currency/unit mappings to -1 before this check.

The UI currently uses manual mapping only; there is no simulated AI claim, no API key, and no OpenRouter request. A future authenticated server adapter can receive headings and a bounded sample (for example ten rows), return validated suggestions and optional questions, and ask the user to review them before applying. File contents remain data; the AI must not change numeric/source values or write inventory records. Invalid/failed AI responses must preserve manual mapping. No teammate was contacted as part of this implementation.

## Verification

- `npm run build`: typecheck and production bundle.
- `npm run test:inventory`: Node 22.15+ or Node 24; tests use the installed TypeScript compiler through a test-only loader.
- Optional browser smoke: install `@playwright/test` without saving (`npm install --no-save --package-lock=false @playwright/test`), start `npm run dev -- --host 127.0.0.1`, then run `node tests/inventory.browser.mjs`. It uses installed Microsoft Edge in a headless, isolated browser and covers actual upload, review, duplicate/exclusion handling, retry after storage failure, manual add/edit, reload, role controls and mobile overflow. It writes two ignored screenshots.
- `public/inventory-example.csv`: new fictional 25-record sample including fractional stock, zero quantities/costs, quoted commas and missing optional fields. The earlier robotics file mentioned in the handoff was not supplied; tests use a separate 25-row missing-supplier fixture and do not claim to have checked the original.

Firebase, OpenRouter and email remain unconnected. Publishing the code does not verify or configure a public deployment.
