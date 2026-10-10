import type { FinanceImportRecord, FinanceKind, FinanceTransaction, FinanceTransactionDetails, Org } from './types';
import type { InventorySource } from './inventory';
import { deptNames, deptOf, isLead, isTop } from './org';

export const financeFields = ['date', 'description', 'amount', 'out', 'in', 'dept', 'category', 'kind', 'reference', 'currency', 'receipt', 'project', 'status'] as const;
export type FinanceField = typeof financeFields[number];
export type FinanceMapping = Record<FinanceField, number>;
export interface FinanceSettings {
  source: 'bank' | 'sheet';
  numberFormat: '' | 'dot' | 'comma';
  dateFormat: '' | 'iso' | 'dmy' | 'mdy';
  amountMode: '' | 'signed' | 'expense' | 'split';
  currency: Org['currency'];
  dept: string;
}
export interface FinanceDraft {
  sourceRow: number;
  date: string;
  description: string;
  amount: string;
  out: string;
  in: string;
  dept: string;
  category: string;
  kind: string;
  reference: string;
  currency: string;
  receipt: string;
  project: string;
  status: string;
  requestId: string;
  separate: boolean;
  excluded: boolean;
  issues: string[];
}
export const financeLabels: Record<FinanceField, string> = { date: 'Date', description: 'Description / supplier', amount: 'Amount / total cost', out: 'Money out / debit', in: 'Money in / credit', dept: 'Department', category: 'Category', kind: 'Transaction type', reference: 'Transaction reference', currency: 'Currency', receipt: 'Receipt status', project: 'Project / event', status: 'Payment status' };
const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
export function suggestFinanceMapping(headers: string[]): FinanceMapping {
  const aliases: Record<FinanceField, string[]> = {
    date: ['date', 'posted date', 'transaction date', 'payment date', 'purchase date'], description: ['description', 'details', 'payee', 'merchant', 'supplier', 'item', 'item name'],
    amount: ['amount', 'total', 'cost', 'total cost', 'total amount', 'signed amount'], out: ['debit', 'money out', 'withdrawal', 'expense'], in: ['credit', 'money in', 'deposit'],
    dept: ['department', 'dept', 'team', 'subteam', 'subcommittee'], category: ['category', 'expense category'], kind: ['type', 'transaction type', 'kind'],
    reference: ['reference', 'transaction id', 'transaction reference', 'id'], currency: ['currency', 'currency code'], receipt: ['receipt', 'receipt status'], project: ['project', 'event', 'tag'], status: ['status', 'payment status', 'paid'],
  };
  return Object.fromEntries(financeFields.map(k => [k, headers.findIndex(h => aliases[k].includes(clean(h).replace(/[_-]/g, ' ')))])) as FinanceMapping;
}

export function mappingErrors(mapping: FinanceMapping, columns: number, settings: FinanceSettings) {
  const errors: string[] = [];
  if (financeFields.some(k => !Number.isInteger(mapping[k]) || mapping[k] < -1 || mapping[k] >= columns)) errors.push('Every mapping must refer to an existing column.');
  const used = financeFields.map(k => mapping[k]).filter(i => i >= 0);
  if (new Set(used).size !== used.length) errors.push('Map each source column only once.');
  if (mapping.date < 0 || mapping.description < 0) errors.push('Map a date and description column.');
  if (!settings.amountMode || !settings.dateFormat || !settings.numberFormat) errors.push('Confirm amount, date and number formats.');
  if (settings.amountMode === 'split') {
    if (mapping.out < 0 && mapping.in < 0) errors.push('Map at least one money-out or money-in column.');
    if (mapping.amount >= 0) errors.push('Unmap the single amount column when using separate money-in/out columns.');
  } else {
    if (mapping.amount < 0) errors.push('Map the total transaction amount. Unit prices are not transaction totals.');
    if (mapping.out >= 0 || mapping.in >= 0) errors.push('Unmap money-in/out columns when using a single amount column.');
  }
  return errors;
}

/** Strict integer minor units; never strip arbitrary text or guess decimal separators. */
export function moneyCents(raw: string, format: FinanceSettings['numberFormat'], allowNegative = true): number {
  let value = raw.trim(), sign = 1;
  if (!format) throw new Error('Confirm the number format.');
  if (value.startsWith('-')) { sign = -1; value = value.slice(1); }
  else if (value.startsWith('+')) value = value.slice(1);
  if (sign < 0 && !allowNegative) throw new Error('Use a non-negative amount.');
  const regex = format === 'dot' ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/ : /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/;
  if (!regex.test(value)) throw new Error('Use an amount with at most two decimal places and no currency symbols.');
  value = format === 'dot' ? value.replace(/,/g, '') : value.replace(/\./g, '').replace(',', '.');
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000_000) throw new Error('Amount exceeds the one-billion limit.');
  return sign * cents;
}

export function financeDate(raw: string, format: FinanceSettings['dateFormat']) {
  const s = raw.trim(); let y: number, m: number, d: number;
  if (format === 'iso') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!match) throw new Error('Use YYYY-MM-DD dates.');
    [, y, m, d] = match.map(Number);
  } else {
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s);
    if (!match || !format) throw new Error('Use the selected date format with a four-digit year.');
    y = Number(match[3]); m = Number(match[format === 'dmy' ? 2 : 1]); d = Number(match[format === 'dmy' ? 1 : 2]);
  }
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  if (y! < 2000 || y! > 2100 || date.getUTCFullYear() !== y! || date.getUTCMonth() !== m! - 1 || date.getUTCDate() !== d!) throw new Error('Enter a real date between 2000 and 2100.');
  return `${y!}-${String(m!).padStart(2, '0')}-${String(d!).padStart(2, '0')}`;
}

export function makeFinanceDrafts(source: InventorySource, mapping: FinanceMapping, settings: FinanceSettings, org: Org): FinanceDraft[] {
  const errors = mappingErrors(mapping, source.columns.length, settings);
  if (errors.length) throw new Error(errors.join(' '));
  return source.rows.map(row => {
    const val = (key: FinanceField) => mapping[key] < 0 ? '' : (row.values[mapping[key]] || '');
    const values = Object.fromEntries(financeFields.map(k => [k, val(k)])) as Record<FinanceField, string>;
    const matchedDept = deptNames(org).find(d => clean(d) === clean(values.dept));
    return { ...values, sourceRow: row.sourceRow, dept: mapping.dept < 0 ? settings.dept : matchedDept || values.dept, currency: mapping.currency < 0 ? settings.currency : values.currency, category: values.category.trim() || 'Other', requestId: '', separate: false, excluded: false, issues: [...row.issues] };
  });
}

type Candidate = Omit<FinanceTransaction, 'id' | 'importId'>;
export function validateFinanceDraft(row: FinanceDraft, settings: FinanceSettings, org: Org): { value?: Candidate; errors: string[] } {
  const errors = [...row.issues]; let date = '', amountCents = 0;
  if (!['signed', 'expense', 'split'].includes(settings.amountMode)) errors.push('Confirm how amounts are recorded.');
  try { date = financeDate(row.date, settings.dateFormat); } catch (e) { errors.push((e as Error).message); }
  if (!row.description.trim()) errors.push('Description is required.');
  if (!deptNames(org).includes(row.dept)) errors.push('Choose a department from your team chart.');
  if (row.currency.trim().toUpperCase() !== org.currency) errors.push(`Use ${org.currency}; convert other currencies outside this import first.`);
  if (row.status.trim() && !['paid', 'completed', 'complete', 'settled', 'cleared', 'bought', 'yes', 'true'].includes(clean(row.status))) errors.push('Only completed payments can be imported. Exclude unpaid, pending or budget rows.');
  let kind = clean(row.kind);
  const kinds: Record<string, FinanceKind> = { expense: 'expense', spending: 'expense', purchase: 'expense', debit: 'expense', income: 'income', sponsorship: 'income', grant: 'income', deposit: 'income', refund: 'refund', transfer: 'transfer', 'internal transfer': 'transfer' };
  if (kind) { kind = kinds[kind] || kind; if (!['expense', 'income', 'refund', 'transfer'].includes(kind)) errors.push('Choose expense, income, refund or transfer.'); }
  try {
    if (settings.amountMode === 'split') {
      const out = row.out.trim() ? moneyCents(row.out, settings.numberFormat, false) : 0;
      const incoming = row.in.trim() ? moneyCents(row.in, settings.numberFormat, false) : 0;
      if (out && incoming) throw new Error('A row cannot have both money in and money out.');
      if (!row.out.trim() && !row.in.trim()) throw new Error('An amount is required.');
      amountCents = incoming - out;
    } else {
      amountCents = moneyCents(row.amount, settings.numberFormat, settings.amountMode === 'signed');
      if (settings.amountMode === 'expense' && (!kind || kind === 'expense')) amountCents = -amountCents;
      if (settings.amountMode === 'expense' && kind === 'transfer') throw new Error('For transfers, use signed amounts or money-in/out columns to record direction.');
    }
    if (!amountCents) throw new Error('Zero-value rows are not transactions; exclude them.');
  } catch (e) { errors.push((e as Error).message); }
  if (!kind) kind = amountCents < 0 ? 'expense' : 'income';
  if (kind === 'expense' && amountCents > 0) errors.push('An expense must be money out.');
  if ((kind === 'income' || kind === 'refund') && amountCents < 0) errors.push('Income and refunds must be money in.');
  const receipts: Record<string, FinanceTransaction['receipt']> = { '': 'unknown', unknown: 'unknown', yes: 'present', true: 'present', present: 'present', attached: 'present', provided: 'present', no: 'missing', false: 'missing', missing: 'missing' };
  const receipt = receipts[clean(row.receipt)];
  if (!receipt) errors.push('Receipt status must be unknown, present or missing.');
  if (row.requestId) {
    const request = org.requests.find(r => r.id === row.requestId);
    if (!request || !['approved', 'bought'].includes(request.status) || kind !== 'expense' || Math.round(request.cost * 100) !== -amountCents || request.dept !== row.dept) errors.push('Link a fully paid request with the same amount and department.');
    if (org.financeTransactions?.some(t => t.requestId === row.requestId)) errors.push('That request is already linked to a saved transaction.');
  }
  return { errors, value: errors.length ? undefined : { date, description: row.description.trim(), amountCents, currency: org.currency, dept: row.dept, category: row.category.trim() || 'Other', kind: kind as FinanceKind, reference: row.reference.trim(), receipt, project: row.project.trim(), requestId: row.requestId || undefined, sourceRow: row.sourceRow } };
}

export const transactionKey = (t: Pick<FinanceTransaction, 'date' | 'description' | 'amountCents' | 'currency'>) => JSON.stringify([t.date, clean(t.description), t.amountCents, t.currency]);
export function reviewFinance(drafts: FinanceDraft[], settings: FinanceSettings, org: Org) {
  const validated = drafts.map(draft => ({ draft, ...validateFinanceDraft(draft, settings, org) }));
  const active = validated.filter(r => !r.draft.excluded && r.value);
  // Bank descriptions often differ from spreadsheet item names. Flag same-day/same-value
  // payments for review too; a person can explicitly retain genuine separate payments.
  const paymentKey = (t: Pick<FinanceTransaction, 'date' | 'amountCents' | 'currency'>) => `${t.date}|${t.amountCents}|${t.currency}`;
  const saved = org.financeTransactions || [];
  const savedKeys = new Set(saved.map(paymentKey)), savedRefs = new Set(saved.map(t => t.reference).filter(Boolean));
  const counts = new Map<string, number>(), refs = new Map<string, number>(), links = new Map<string, number>();
  const increment = (map: Map<string, number>, key: string) => { if (key) map.set(key, (map.get(key) || 0) + 1); };
  active.forEach(r => { increment(counts, paymentKey(r.value!)); increment(refs, r.value!.reference); increment(links, r.draft.requestId); });
  return validated.map(row => {
    const value = row.value;
    const duplicates = value && (savedKeys.has(paymentKey(value)) || (!!value.reference && savedRefs.has(value.reference)));
    const inFile = value && ((counts.get(paymentKey(value)) || 0) > 1 || (!!value.reference && (refs.get(value.reference) || 0) > 1));
    const matches = value?.kind === 'expense' ? org.requests.filter(r => ['approved', 'bought'].includes(r.status) && Math.round(r.cost * 100) === -value.amountCents && !org.financeTransactions?.some(t => t.requestId === r.id)) : [];
    const errors = [...row.errors];
    if ((duplicates || inFile) && !row.draft.separate) errors.push('Possible duplicate payment. Exclude it or confirm it is separate.');
    if (matches.length && !row.draft.requestId && !row.draft.separate) errors.push('A request has the same amount. Link it or confirm this is a separate payment.');
    if (row.draft.requestId && (links.get(row.draft.requestId) || 0) > 1) errors.push('Link each request only once.');
    return { ...row, errors, duplicate: !!duplicates || !!inFile, matches };
  });
}

export function financeTotals(org: Org, dept?: string) {
  const transactions = (org.financeTransactions || []).filter(t => !dept || t.dept === dept);
  const linked = new Set((org.financeTransactions || []).map(t => t.requestId).filter(Boolean));
  const requests = org.requests.filter(r => (!dept || r.dept === dept) && !linked.has(r.id));
  const earlier = Object.entries(org.baseSpend).filter(([d]) => !dept || d === dept).reduce((n, [, amount]) => n + Math.round(amount * 100), 0);
  const expense = transactions.filter(t => t.kind === 'expense').reduce((n, t) => n - t.amountCents, 0);
  const refunds = transactions.filter(t => t.kind === 'refund').reduce((n, t) => n + t.amountCents, 0);
  const income = transactions.filter(t => t.kind === 'income').reduce((n, t) => n + t.amountCents, 0);
  const bought = requests.filter(r => r.status === 'bought').reduce((n, r) => n + Math.round(r.cost * 100), 0);
  const committed = requests.filter(r => r.status === 'approved').reduce((n, r) => n + Math.round(r.cost * 100), 0);
  const paid = earlier + expense - refunds + bought;
  return { paid: paid / 100, committed: committed / 100, used: (paid + committed) / 100, income: income / 100, expenses: expense / 100, refunds: refunds / 100, recordedNet: transactions.reduce((n, t) => n + t.amountCents, 0) / 100 };
}

export interface FinanceImportInput {
  id: string; fingerprint: string; file: string; settings: FinanceSettings; drafts: FinanceDraft[];
  baseline: '' | 'keep' | 'replace'; budgets: Record<string, number>; termBudget: number; at: number;
}
/** Recheck against current state; caller persists the cloned organisation as one local transaction. */
export function applyFinanceImport(org: Org, input: FinanceImportInput, actor: string) {
  if (!isTop(org, actor)) throw new Error('Only a team leader or treasurer can import team finances.');
  if (!input.fingerprint || org.financeImports?.some(i => i.fingerprint === input.fingerprint)) throw new Error('This file has already been imported.');
  const selected = reviewFinance(input.drafts, input.settings, org).filter(r => !r.draft.excluded);
  if (!selected.length || selected.some(r => r.errors.length || !r.value)) throw new Error('Resolve or exclude every blocked row before saving.');
  const first = !org.financeImports?.length;
  if (!input.baseline || (!first && input.baseline !== 'keep')) throw new Error('Confirm how to handle earlier spending. Only the first catch-up can replace it.');
  if (Object.values(input.budgets).some(n => !Number.isSafeInteger(Math.round(n * 100)) || !Number.isFinite(n) || n < 0 || n > 1e9) || !Number.isFinite(input.termBudget) || input.termBudget < 0 || input.termBudget > 1e9) throw new Error('Enter valid non-negative budgets.');
  const departments = deptNames(org);
  if (departments.some(d => !(d in input.budgets)) || Object.keys(input.budgets).some(d => !departments.includes(d))) throw new Error('The team departments changed. Review the budget split again.');
  if (Math.round(Object.values(input.budgets).reduce((a, b) => a + b, 0) * 100) > Math.round(input.termBudget * 100)) throw new Error('Department allocations exceed the team budget.');
  const transactions = selected.map((r, i) => ({ ...r.value!, id: input.id + '-' + i, importId: input.id }));
  const dates = transactions.map(t => t.date).sort();
  const entry: FinanceImportRecord = { id: input.id, fingerprint: input.fingerprint, file: input.file, at: input.at, by: actor, source: input.settings.source, from: dates[0], through: dates.at(-1)!, read: input.drafts.length, saved: selected.length, excluded: input.drafts.length - selected.length, linked: transactions.filter(t => t.requestId).length, baseline: input.baseline, ...(input.baseline === 'replace' ? { previousBaseSpend: { ...org.baseSpend } } : {}) };
  if (input.baseline === 'replace') org.baseSpend = {};
  org.termBudget = input.termBudget; org.budgets = { ...input.budgets };
  for (const transaction of transactions) if (transaction.requestId) {
    const r = org.requests.find(r => r.id === transaction.requestId)!;
    r.status = 'bought'; r.holderId = null;
    if (transaction.receipt === 'present') r.receipt = true;
    r.trail.push({ who: org.people.find(p => p.id === actor)?.name || actor, what: `Payment linked from ${input.file}, record ${transaction.sourceRow}`, at: input.at, note: 'Confirmed paid in finance catch-up. Inventory was not changed.' });
  }
  org.financeTransactions = [...(org.financeTransactions || []), ...transactions];
  org.financeImports = [entry, ...(org.financeImports || [])];
  return entry;
}

export function receiptFollowups(org: Org, departments: string[]) {
  return (org.financeTransactions || []).filter(t => t.kind === 'expense' && departments.includes(t.dept) && t.receipt !== 'present' && !(t.requestId && org.requests.find(r => r.id === t.requestId)?.receipt));
}

/** Maintain reviewed allocation/receipt metadata without rewriting payment evidence. */
export function updateFinanceDetails(org: Org, id: string, details: FinanceTransactionDetails, actor: string, at: number) {
  const transaction = org.financeTransactions?.find(t => t.id === id);
  if (!transaction) throw new Error('This transaction is no longer available.');
  const top = isTop(org, actor), ownDepartment = deptOf(org, actor);
  if (!top && (!isLead(org, actor) || transaction.dept !== ownDepartment || details.dept !== ownDepartment)) throw new Error('You can only maintain transactions in your own department.');
  if (!deptNames(org).includes(details.dept)) throw new Error('Choose a department from the team chart.');
  if (!['unknown', 'present', 'missing'].includes(details.receipt)) throw new Error('Choose a valid receipt status.');
  const request = transaction.requestId ? org.requests.find(r => r.id === transaction.requestId) : undefined;
  if (request && details.dept !== request.dept) throw new Error('This payment stays in the department of its linked purchase request.');
  if (request?.receiptImg && details.receipt !== 'present') throw new Error('The linked request has an attached receipt. Its status must remain present.');
  const before = { dept: transaction.dept, category: transaction.category, project: transaction.project, receipt: transaction.receipt };
  const after = { dept: details.dept, category: details.category.trim() || 'Other', project: details.project.trim(), receipt: details.receipt };
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  Object.assign(transaction, after);
  (transaction.detailsHistory ||= []).push({ at, by: actor, before, after });
  if (request && before.receipt !== after.receipt) {
    request.receipt = after.receipt === 'present';
    request.trail.push({ at, who: org.people.find(p => p.id === actor)?.name || actor, what: `Receipt marked ${after.receipt} from imported payment` });
  }
}
