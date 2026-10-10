import type { Currency, Item, Org } from './types';
import { canManageItem } from './cluster';

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const fields = ['itemName', 'cost', 'quantity', 'supplier', 'currency', 'unit'] as const;
export type Field = typeof fields[number];
export type Mapping = Record<Field, number>;
export interface SourceRow { sourceRow: number; values: string[]; issues: string[] }
export interface InventorySource { sourceFileName: string; columns: string[]; rows: SourceRow[]; issues: string[]; blankRows: number }
export interface Settings { costBasis: '' | 'unit' | 'total'; currency: Currency; unit: string; numberFormat: '' | 'dot' | 'comma' }
export interface Draft { sourceRow: number; itemName: string; cost: string; quantity: string; supplier: string; currency: string; unit: string; excluded: boolean; keepDuplicate: boolean; issues: string[] }
export type InventoryValues = Pick<Item, 'name' | 'qty' | 'unitCost' | 'currency' | 'unit' | 'supplier'>;

/** Logical CSV record numbers (header = 1), not physical lines. Keep cells ordered and unmodified. */
export function readInventory(text: string, sourceFileName: string, delimiter = ','): InventorySource {
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('Choose comma, semicolon or tab as the delimiter.');
  if (new TextEncoder().encode(text).length > MAX_BYTES) throw new Error('The file exceeds the 2 MB limit.');
  if (text.includes('\uFFFD') || text.includes('\0')) throw new Error('Export the file as UTF-8 CSV and try again.');
  text = text.replace(/^\uFEFF/, '');
  const records: SourceRow[] = [];
  let values: string[] = [], cell = '', mode: 'start' | 'plain' | 'quoted' | 'closed' = 'start', issues: string[] = [];
  let sourceRow = 1, blankRows = 0;
  const field = () => { values.push(cell); cell = ''; mode = 'start'; };
  const record = () => {
    field();
    if (values.some(v => v.trim()) || issues.length) records.push({ sourceRow, values, issues }); else blankRows++;
    sourceRow++; values = []; issues = [];
    if (records.length > MAX_ROWS + 1) throw new Error('Import at most 2,000 data rows at a time.');
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (mode === 'quoted') {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else mode = 'closed'; }
      else cell += c;
    } else if (c === delimiter) field();
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; record(); }
    else if (c === '"' && mode === 'start') mode = 'quoted';
    else {
      if (c === '"' || mode === 'closed') issues.push('Unexpected text or quote outside a quoted field. Fix the CSV or exclude this record.');
      cell += c; mode = 'plain';
    }
  }
  if (mode === 'quoted') throw new Error('An opening quote has no closing quote. Fix the CSV before importing.');
  if (cell || values.length || mode !== 'start') record();
  const header = records.shift();
  if (!header || !records.length) throw new Error('Add a header and at least one data record.');
  if (header.issues.length) throw new Error('The header has malformed quoting. Fix the file before importing.');
  const columns = header.values;
  if (columns.length > 100) throw new Error('At most 100 columns are supported.');
  const warnings: string[] = [];
  if (columns.length < 2) warnings.push('Only one column found. Check the delimiter.');
  if (new Set(columns.map(c => c.trim().toLowerCase())).size !== columns.length) warnings.push('Duplicate headings preserved. Use column numbers and sample values to choose the correct mapping.');
  if (columns.some(c => !c.trim())) warnings.push('Blank headings preserved with their column numbers.');
  for (const row of records) if (row.values.length !== columns.length) row.issues.push(`Expected ${columns.length} cells, found ${row.values.length}. Fix the CSV or exclude this record.`);
  return { sourceFileName, columns, rows: records, issues: warnings, blankRows };
}

export function suggestMapping(columns: string[]): Mapping {
  const names: Record<Field, string[]> = {
    itemName: ['item', 'item name', 'name', 'product', 'description', 'equipment'],
    cost: ['cost', 'unit cost', 'unit price', 'price', 'total cost', 'total price'],
    quantity: ['quantity', 'qty', 'stock', 'count', 'amount held'],
    supplier: ['supplier', 'vendor', 'merchant'], currency: ['currency', 'currency code'], unit: ['unit', 'uom', 'units'],
  };
  return Object.fromEntries(fields.map(k => [k, columns.findIndex(c => names[k].includes(c.trim().toLowerCase().replace(/[_-]/g, ' ')))])) as Mapping;
}

/** Boundary for the AI teammate: validate suggestions; never apply unreviewed writes. */
export function validMapping(mapping: unknown, count: number): mapping is Mapping {
  if (!mapping || typeof mapping !== 'object') return false;
  const m = mapping as Mapping;
  return fields.every(k => Number.isInteger(m[k]) && m[k] >= -1 && m[k] < count)
    && new Set(fields.map(k => m[k]).filter(i => i >= 0)).size === fields.filter(k => m[k] >= 0).length;
}

export function makeDrafts(source: InventorySource, mapping: Mapping, settings: Settings): Draft[] {
  if (!validMapping(mapping, source.columns.length) || mapping.itemName < 0 || mapping.quantity < 0) throw new Error('Map item name and quantity, using each source column only once.');
  return source.rows.map(row => {
    const val = (key: Field) => mapping[key] < 0 ? '' : (row.values[mapping[key]] || '');
    return { sourceRow: row.sourceRow, itemName: val('itemName'), cost: val('cost'), quantity: val('quantity'), supplier: val('supplier'), currency: mapping.currency < 0 ? settings.currency : val('currency'), unit: mapping.unit < 0 ? settings.unit : val('unit'), issues: row.issues, excluded: false, keepDuplicate: false };
  });
}

function decimal(raw: string, format: Settings['numberFormat']): string {
  const s = raw.trim();
  if (!format) throw new Error('Confirm the number format.');
  const regex = format === 'dot' ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/ : /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;
  if (!regex.test(s)) throw new Error('Use a non-negative number in the selected format, without currency symbols.');
  const canonical = format === 'dot' ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  const n = Number(canonical);
  if (!Number.isFinite(n) || n > 1_000_000_000) throw new Error('Values must be at most 1,000,000,000.');
  return canonical;
}

export function validateDraft(draft: Draft, settings: Settings): { value?: InventoryValues; errors: string[]; warnings: string[] } {
  const errors = [...draft.issues], warnings: string[] = [];
  const name = draft.itemName.trim(), unit = draft.unit.trim(), supplier = draft.supplier.trim() || null;
  const currency = draft.currency.trim().toUpperCase() as Currency;
  if (!name) errors.push('Item name is required.');
  if (!unit) errors.push('Quantity unit is required.');
  if (!['EUR', 'GBP', 'USD'].includes(currency)) errors.push('Choose EUR, GBP or USD.');
  let qty = 0, unitCost: string | null = null;
  try {
    const q = decimal(draft.quantity, settings.numberFormat);
    if ((q.split('.')[1]?.length || 0) > 6) throw new Error('Use at most six decimal places.');
    qty = Number(q);
  } catch (e) { errors.push('Quantity: ' + (e as Error).message); }
  if (draft.cost.trim()) {
    try {
      if (!settings.costBasis) throw new Error('Confirm unit cost or row total.');
      const price = decimal(draft.cost, settings.numberFormat);
      const [whole, fraction = ''] = price.split('.');
      if (fraction.length > 6) throw new Error('Use at most six decimal places.');
      const micros = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
      let normalized = micros;
      if (settings.costBasis === 'total') {
        if (!qty) throw new Error('A row total cannot be divided by zero quantity. Use unit cost or leave cost unknown.');
        const quantityMicros = BigInt(Math.round(qty * 1_000_000));
        const numerator = micros * 1_000_000n;
        normalized = (numerator + quantityMicros / 2n) / quantityMicros;
        if (numerator % quantityMicros !== 0n) warnings.push('Unit cost rounded to six decimal places.');
      }
      if (normalized > 1_000_000_000_000_000n) throw new Error('Derived unit cost is too large.');
      unitCost = `${normalized / 1_000_000n}.${String(normalized % 1_000_000n).padStart(6, '0')}`;
    } catch (e) { errors.push('Cost: ' + (e as Error).message); }
  } else warnings.push('Cost unknown.');
  if (!supplier) warnings.push('Supplier unknown.');
  return { value: errors.length ? undefined : { name, qty, unitCost, currency, unit, supplier }, errors, warnings };
}

export const nameKey = (name: string) => name.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function reviewDrafts(drafts: Draft[], settings: Settings, items: Item[]) {
  const names = new Map<string, number>();
  drafts.filter(d => !d.excluded).forEach(d => names.set(nameKey(d.itemName), (names.get(nameKey(d.itemName)) || 0) + 1));
  return drafts.map(d => {
    const result = validateDraft(d, settings);
    const duplicate = !!d.itemName.trim() && (items.some(i => nameKey(i.name) === nameKey(d.itemName)) || (names.get(nameKey(d.itemName)) || 0) > 1);
    if (duplicate && !d.keepDuplicate) result.errors.push('Possible duplicate: exclude it or explicitly keep as a separate record.');
    return { ...result, duplicate, draft: d };
  });
}

export function writableDepartments(org: Org, me: string, departments: string[]) {
  return departments.filter(dept => canManageItem(org, { dept }, me));
}

export async function fingerprint(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim());
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}

export function estimatedTotals(items: Item[], fallback: Currency) {
  const totals: Partial<Record<Currency, number>> = {};
  let unknown = 0;
  for (const item of items.filter(i => i.status !== 'usedup')) {
    if (item.unitCost == null) { unknown++; continue; }
    const currency = item.currency || fallback;
    totals[currency] = (totals[currency] || 0) + Number(item.unitCost) * item.qty;
  }
  return { totals, unknown };
}
