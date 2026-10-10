# Mid-season finance catch-up

## The user journey

A team can join Commons after a season has already started. They bring their existing bank export or spending spreadsheet instead of re-entering every payment.

1. Open **Finance → Catch up / import** as a treasurer or top-level team leader. A new **Catch up my team** entry point is also shown in Finance; Home and the setup checklist link to it.
2. Choose **Bank transactions** or **Team spending sheet**, then upload a UTF-8 CSV. Both formats receive equal support. Each has an example and downloadable template.
3. Confirm columns, date format, number format and whether amounts are signed, positive expense totals, or separate money-in/out columns. Optional columns include department, type, category, reference, currency, payment status, receipt status and project.
4. Review the actual transactions. Correct rows, assign departments, mark income/refunds/transfers and resolve possible duplicates. Matching approved/bought requests can be explicitly linked. Exclude unpaid orders, forecasts, summary rows and other records that are not completed payments. Structural CSV errors need source-file correction or explicit exclusion.
5. For the first catch-up, choose whether this file replaces an earlier-spending summary or adds payments not covered by that summary. Existing requests remain and must be linked where appropriate. Confirm the team budget and department allocations; a bank export cannot establish a budget on its own.
6. See projected paid spending, outstanding commitments, budget remaining and each department's before/after figures. Confirm and save once. The same records update Home, Finance, budget usage and approval context.
7. Import further exports or spending sheets later. Repeated files are blocked, and overlaps between bank and spreadsheet records are flagged for review.
8. In **Transactions → Update details**, correct the department, category or project and mark receipts as found or missing. Each change is recorded. Department corrections immediately update the same budget calculations; linked payments stay in their request's department. Department leads may maintain their own records; top-level leaders can reassign unlinked transactions.

## What is stored and calculated

- Every included transaction is retained with a stable ID, date, signed integer cents, organisation currency, department, type, category, optional project/reference, receipt declaration and source provenance.
- Expense payments increase spending. Refunds reduce spending. Income is shown separately and does not automatically increase the budget. Internal transfers are recorded but do not consume a department budget.
- Approved requests reserve budget. When an expense is explicitly linked to a fully paid matching request, it marks that request bought, records a trail event and counts the payment only once. No inventory items or receipt images are fabricated.
- Paid spending = retained earlier summary + imported expenses − imported refunds + bought requests not already linked to imported payments.
- Budget used = paid spending + approved requests not already covered by imported payments.
- Remaining budget is not a bank balance. The Home and department views use allocated budgets; any unallocated portion of the team budget is called out separately.
- The latest import date range describes records in that file. It does not imply that every account, period or team payment has been reconciled.
- Initial baseline replacement stores the previous summary in import history. Later imports append records and cannot reset the earlier baseline again.
- Existing legacy bank summaries are preserved but are not retroactively treated as payment records. Re-upload their original files through the new flow to review and reconcile them.

## Guardrails

CSV limits are 2 MB, 2,000 records and 100 header columns, using the strict parser introduced for inventory. It preserves quoted cells, duplicate headings and logical source-record numbers. XLSX is not accepted directly: export as CSV.

Number and date formats must be selected explicitly. Dates must be valid between 2000 and 2100. Transaction amounts use at most two decimal places, with an absolute maximum of one billion in the organisation currency. Single-currency import only: mixed currencies are blocked for user correction or exclusion. Positive sheet totals are treated as expenses unless their type explicitly says income or refund. Transfers require signed values or separate in/out columns. Zero amounts and incomplete payments are not imported.

Same-date/same-amount records are flagged even if the bank's description differs from a spreadsheet item name. Matching transaction references are also flagged. This is deliberately reviewable: two genuine payments can share an amount or reference. The user may explicitly keep a separate payment or exclude the overlap. SHA-256 file fingerprints prevent reimporting a renamed copy. No automatic overwrite, stock change or silent row omission occurs.

Request links require the same amount and department, one payment per request, and an approved or bought request. Partial payments and automatic reconciliation of differently dated/described payments are not supported; review such records explicitly. A partial payment that overlaps an already-counted request should be excluded until reconciled outside this flow; otherwise retaining both will count both.

Normal app access follows the existing chart: top-level leaders import; department leaders see their department's records; members retain their existing Home/request views. Switching team or role resets import state. This remains a browser-only demo, as requested, with no new backend, credentials or shared storage. Local role controls are not authentication. Concurrent tabs still follow the existing localStorage last-write model.

Saving validates against current records, writes the entire organisation update before publishing it to the UI, and leaves the preview intact if storage fails. Retry cannot duplicate an already saved file. Original CSV contents are not retained beyond the active import; file name, import actor/time, source record, date range and read/saved/excluded/link counts are retained.

## Verification

- `npm run build`
- `npm run test:finance`
- `npm run test:inventory`
- With the optional `@playwright/test` package and installed Microsoft Edge: start the dev server on port 5173, then `node tests/finance.browser.mjs`.

Browser checks cover both CSV types, request linking, overlap detection, exclusions, storage failure and retry, reload persistence, Home and purchase-approval totals, role-scoped views and mobile overflow. Screenshots are ignored by Git. All test data is fictional and browser tests use isolated temporary profiles.

The tests also cover a fresh team with no existing summary or requests, decimal budget editing, and receipt/department corrections after import. Logging a receipt follow-up on Home records the action without pretending a message was sent or marking the receipt as received.
