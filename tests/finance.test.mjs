import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seedData } from '../src/lib/seed.ts';
import { spend } from '../src/lib/org.ts';
import { readInventory } from '../src/lib/inventory.ts';
import { applyFinanceImport, financeDate, financeTotals, makeFinanceDrafts, mappingErrors, moneyCents, receiptFollowups, reviewFinance, suggestFinanceMapping, updateFinanceDetails, validateFinanceDraft } from '../src/lib/finance.ts';

const settings = { source: 'bank', numberFormat: 'dot', dateFormat: 'iso', amountMode: 'signed', currency: 'EUR', dept: 'Shared' };
const organisation = () => {
  const org = structuredClone(seedData().orgs[0]);
  org.baseSpend = { Mechanical: 100 };
  org.requests = org.requests.filter(r => ['R-102', 'R-099'].includes(r.id));
  return org;
};
const draft = (patch = {}) => ({ sourceRow: 2, date: '2026-09-01', description: 'Motor', amount: '-38.00', out: '', in: '', dept: 'Mechanical', category: 'Parts', kind: '', reference: '', currency: 'EUR', receipt: '', project: '', status: '', requestId: '', separate: false, excluded: false, issues: [], ...patch });
const input = (org, drafts, patch = {}) => ({ id: 'FIN-test', fingerprint: 'file-hash', file: 'test.csv', at: 123456, settings, drafts, baseline: 'keep', budgets: org.budgets, termBudget: org.termBudget, ...patch });

test('integer money parsing rejects ambiguity, malformed values, extra precision and overflows', () => {
  assert.equal(moneyCents('1,200.50', 'dot'), 120050);
  assert.equal(moneyCents('-1.200,50', 'comma'), -120050);
  assert.equal(moneyCents('+0.10', 'dot'), 10);
  for (const v of ['', '€10', '1,20', '1.234', '1e2', 'Infinity', '1000000001']) assert.throws(() => moneyCents(v, 'dot'));
  assert.throws(() => moneyCents('-1', 'dot', false));
});
test('explicit date formats prevent day/month guessing; impossible dates rejected', () => {
  assert.equal(financeDate('03/04/2026', 'dmy'), '2026-04-03');
  assert.equal(financeDate('03/04/2026', 'mdy'), '2026-03-04');
  assert.equal(financeDate('2024-02-29', 'iso'), '2024-02-29');
  for (const v of ['2026-02-29', '2026-13-01', '2026-04-31', '01/02/2026']) assert.throws(() => financeDate(v, 'iso'));
});
test('bank and spending-sheet fixtures map and normalize to the same payments', () => {
  const org = organisation();
  const bank = readInventory(readFileSync('public/finance-bank-example.csv', 'utf8'), 'bank.csv');
  const sheet = readInventory(readFileSync('public/finance-sheet-example.csv', 'utf8'), 'sheet.csv');
  const bankSettings = { ...settings, amountMode: 'split' }, sheetSettings = { ...settings, source: 'sheet', amountMode: 'expense' };
  const a = reviewFinance(makeFinanceDrafts(bank, suggestFinanceMapping(bank.columns), bankSettings, org), bankSettings, org);
  assert.ok(a.every(r => r.errors.length === 0));
  const b = reviewFinance(makeFinanceDrafts(sheet, suggestFinanceMapping(sheet.columns), sheetSettings, org), sheetSettings, org);
  assert.ok(b.every(r => r.errors.length === 0));
  assert.equal(a.find(r => r.value.reference === 'BK-001').value.amountCents, b.find(r => r.value.reference === 'BK-001').value.amountCents);
});
test('mapping requires formats and one amount representation, rejects duplicate columns', () => {
  const mapping = suggestFinanceMapping(['Date', 'Description', 'Amount', 'Debit']);
  assert.ok(mappingErrors(mapping, 4, settings).length);
  mapping.out = -1;
  assert.equal(mappingErrors(mapping, 4, settings).length, 0);
  assert.ok(mappingErrors({ ...mapping, category: mapping.description }, 4, settings).length);
  assert.ok(mappingErrors(mapping, 4, { ...settings, dateFormat: '' }).length);
});
test('paid rows only; rejects unknown departments, currency, zero and missing amounts', () => {
  const org = organisation();
  for (const patch of [{ status: 'unpaid' }, { status: 'pending' }, { status: 'budget' }, { currency: 'USD' }, { dept: 'Guess' }, { amount: '' }, { amount: '0' }, { description: '' }]) assert.ok(validateFinanceDraft(draft(patch), settings, org).errors.length);
  assert.equal(validateFinanceDraft(draft({ status: 'Paid' }), settings, org).errors.length, 0);
});
test('split columns reject simultaneous inflow/outflow and negative debit values', () => {
  const org = organisation(), s = { ...settings, amountMode: 'split' };
  assert.equal(validateFinanceDraft(draft({ out: '12', in: '' }), s, org).value.amountCents, -1200);
  assert.ok(validateFinanceDraft(draft({ out: '12', in: '3' }), s, org).errors.length);
  assert.ok(validateFinanceDraft(draft({ out: '-12' }), s, org).errors.length);
});
test('sheet positive costs honour explicit income/refund; transfers require direction', () => {
  const org = organisation(), s = { ...settings, amountMode: 'expense' };
  assert.equal(validateFinanceDraft(draft({ amount: '12' }), s, org).value.amountCents, -1200);
  assert.equal(validateFinanceDraft(draft({ amount: '12', kind: 'refund' }), s, org).value.amountCents, 1200);
  assert.ok(validateFinanceDraft(draft({ amount: '12', kind: 'transfer' }), s, org).errors.length);
});
test('initial existing summaries and request commitments keep existing budget semantics', () => {
  const org = organisation();
  assert.equal(financeTotals(org).paid, 109);
  assert.equal(financeTotals(org).committed, 38);
  assert.equal(spend(org, 'Mechanical'), 147);
});
test('linked payments update bought status and count once across department and team totals', () => {
  const org = organisation(), items = structuredClone(org.items);
  const rows = [draft({ requestId: 'R-102' }), draft({ sourceRow: 3, amount: '-12', description: 'Cable' }), draft({ sourceRow: 4, amount: '2', kind: 'refund' }), draft({ sourceRow: 5, amount: '1000', kind: 'income' }), draft({ sourceRow: 6, amount: '-100', kind: 'transfer' })];
  const entry = applyFinanceImport(org, input(org, rows), 'maya');
  assert.equal(entry.linked, 1);
  assert.deepEqual(financeTotals(org), { paid: 157, committed: 0, used: 157, income: 1000, expenses: 50, refunds: 2, recordedNet: 852 });
  assert.equal(spend(org, 'Mechanical'), 157);
  assert.equal(org.requests.find(r => r.id === 'R-102').status, 'bought');
  assert.equal(org.requests.find(r => r.id === 'R-102').receipt, undefined);
  assert.deepEqual(org.items, items);
});
test('full-season catch-up replaces only baseline and retains its prior value in history', () => {
  const org = organisation();
  applyFinanceImport(org, input(org, [draft({ requestId: 'R-102' })], { baseline: 'replace' }), 'maya');
  assert.equal(financeTotals(org).used, 47);
  assert.deepEqual(org.financeImports[0].previousBaseSpend, { Mechanical: 100 });
  assert.throws(() => applyFinanceImport(org, input(org, [draft({ amount: '-7' })], { fingerprint: 'new', baseline: 'replace' }), 'maya'), /first catch-up/);
});
test('repeat file rejected before changing records', () => {
  const org = organisation(), data = input(org, [draft({ amount: '-12' })]);
  applyFinanceImport(org, data, 'maya');
  const before = structuredClone(org);
  assert.throws(() => applyFinanceImport(org, data, 'maya'), /already been imported/);
  assert.deepEqual(org, before);
});
test('cross-file overlap catches renamed suppliers and shared references', () => {
  const org = organisation();
  applyFinanceImport(org, input(org, [draft({ amount: '-12', reference: 'BANK1' })]), 'maya');
  assert.ok(reviewFinance([draft({ amount: '-12', description: 'Entirely different spreadsheet item' })], settings, org)[0].duplicate);
  assert.ok(reviewFinance([draft({ amount: '-9', reference: 'BANK1', date: '2026-09-10' })], settings, org)[0].duplicate);
});
test('in-file duplicates blocked; excluding one or confirming separate resolves them', () => {
  const org = organisation();
  assert.ok(reviewFinance([draft({ amount: '-12' }), draft({ amount: '-12', sourceRow: 3 })], settings, org).every(r => r.errors.length));
  assert.equal(reviewFinance([draft({ amount: '-12' }), draft({ amount: '-12', sourceRow: 3, excluded: true })], settings, org)[0].errors.length, 0);
  assert.equal(reviewFinance([draft({ separate: true })], settings, org)[0].errors.length, 0);
});
test('request matches require confirmation and cannot link the same request twice', () => {
  const org = organisation();
  assert.equal(reviewFinance([draft()], settings, org)[0].matches[0].id, 'R-102');
  assert.ok(reviewFinance([draft()], settings, org)[0].errors.length);
  assert.ok(reviewFinance([draft({ requestId: 'R-102', separate: true }), draft({ requestId: 'R-102', sourceRow: 3, separate: true })], settings, org).every(r => r.errors.some(e => /only once/.test(e))));
  assert.ok(validateFinanceDraft(draft({ requestId: 'R-102', dept: 'Electrical' }), settings, org).errors.length);
});
test('role, baseline decision, invalid budgets and no valid rows prevent mutations', () => {
  for (const patch of [{ baseline: '' }, { termBudget: -1 }, { budgets: { Mechanical: 99999999 } }, { drafts: [draft({ amount: 'bad' })] }, { drafts: [draft({ excluded: true })] }]) {
    const org = organisation(), before = structuredClone(org);
    assert.throws(() => applyFinanceImport(org, input(org, [draft({ amount: '-12' })], patch), 'maya'));
    assert.deepEqual(org, before);
  }
  const org = organisation();
  for (const actor of ['tom', 'daniel', 'non-member']) assert.throws(() => applyFinanceImport(org, input(org, [draft({ amount: '-12' })]), actor), /leader or treasurer/);
});
test('receipt followups use declarations and linked request evidence', () => {
  const org = organisation();
  applyFinanceImport(org, input(org, [draft({ requestId: 'R-102' }), draft({ amount: '-10', sourceRow: 3, receipt: 'yes' })]), 'maya');
  assert.equal(receiptFollowups(org, ['Mechanical']).length, 1);
  org.requests.find(r => r.id === 'R-102').receipt = true;
  assert.equal(receiptFollowups(org, ['Mechanical']).length, 0);
});
test('finance persistence failure leaves totals unchanged; retry and reload are idempotent', async () => {
  const data = new Map(); let fail = false;
  globalThis.localStorage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => { if (fail) throw new Error('quota'); data.set(k, v); }, removeItem: k => data.delete(k) };
  const { useStore, saveOrganisation } = await import('../src/lib/store.ts');
  const org = useStore.getState().orgs[0], other = structuredClone(useStore.getState().orgs[1]);
  const before = financeTotals(org);
  const commit = () => saveOrganisation(org.id, current => applyFinanceImport(current, input(current, [draft({ amount: '-12' })]), 'maya'));
  fail = true; assert.throws(commit, /Could not save/);
  assert.deepEqual(financeTotals(useStore.getState().orgs[0]), before);
  fail = false; commit(); await useStore.persist.rehydrate();
  assert.equal(useStore.getState().orgs[0].financeTransactions.length, 1);
  assert.throws(commit, /already been imported/);
  assert.deepEqual(useStore.getState().orgs[1], other);
});

test('new team starts from its actual transactions without a seeded baseline or requests', () => {
  const org = organisation();
  org.baseSpend = {}; org.requests = []; org.items = []; org.budgets = { Electrical: 0, Mechanical: 500, Programming: 0, Shared: 0 }; org.termBudget = 500;
  applyFinanceImport(org, input(org, [draft({ amount: '-25', description: 'First historical purchase' })]), 'maya');
  assert.equal(financeTotals(org).paid, 25);
  assert.equal(org.termBudget - financeTotals(org).used, 475);
  assert.equal(org.requests.length, 0); assert.equal(org.items.length, 0);
});

test('post-import department and receipt corrections update totals with an audit trail', () => {
  const org = organisation();
  applyFinanceImport(org, input(org, [draft({ amount: '-12' })]), 'maya');
  const transaction = org.financeTransactions[0], total = financeTotals(org).used, beforeDept = financeTotals(org, 'Mechanical').used;
  updateFinanceDetails(org, transaction.id, { dept: 'Electrical', category: ' Materials ', project: 'Build', receipt: 'present' }, 'maya', 234567);
  assert.equal(financeTotals(org).used, total);
  assert.equal(financeTotals(org, 'Mechanical').used, beforeDept - 12);
  assert.equal(financeTotals(org, 'Electrical').used, 12);
  assert.equal(receiptFollowups(org, ['Electrical']).length, 0);
  assert.equal(transaction.detailsHistory[0].before.dept, 'Mechanical');
  assert.equal(transaction.detailsHistory[0].after.category, 'Materials');
  assert.equal(transaction.sourceRow, 2);
});

test('detail corrections enforce department scope and linked-request consistency', () => {
  const org = organisation();
  applyFinanceImport(org, input(org, [draft({ requestId: 'R-102' })]), 'maya');
  const transaction = org.financeTransactions[0], patch = { dept: 'Mechanical', category: 'Parts', project: '', receipt: 'present' };
  assert.throws(() => updateFinanceDetails(org, transaction.id, patch, 'ravi', 1), /own department/);
  assert.throws(() => updateFinanceDetails(org, transaction.id, { ...patch, dept: 'Electrical' }, 'maya', 1), /linked purchase/);
  updateFinanceDetails(org, transaction.id, patch, 'daniel', 2);
  assert.equal(org.requests.find(r => r.id === 'R-102').receipt, true);
  assert.equal(receiptFollowups(org, ['Mechanical']).length, 0);
  updateFinanceDetails(org, transaction.id, { ...patch, receipt: 'missing' }, 'daniel', 3);
  assert.equal(org.requests.find(r => r.id === 'R-102').receipt, false);
  org.requests.find(r => r.id === 'R-102').receiptImg = 'data:image/jpeg;base64,test';
  assert.throws(() => updateFinanceDetails(org, transaction.id, { ...patch, receipt: 'unknown' }, 'maya', 4), /attached receipt/);
});
