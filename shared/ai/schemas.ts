// Task contracts shared by the Worker, the browser client, the tests and the eval.
// Plain validators (no dependency): anything the model returns is untrusted until it passes these.

export type Parse<T> = { ok: true; data: T } | { ok: false; reason: string };
const bad = (reason: string): Parse<never> => ({ ok: false, reason });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ---- Task A: map_columns ----
export const MAP_FIELDS = ['date', 'description', 'amount', 'debit', 'credit', 'department', 'category', 'who'] as const;
export type MapField = typeof MAP_FIELDS[number];
export interface MapColumnsInput { headers: string[]; sampleRows: string[][] }
export interface MapColumnsOutput { mapping: Record<MapField, string | null>; confidence: number; notes: string }

export function parseMapInput(v: unknown): Parse<MapColumnsInput> {
  if (!isObj(v) || !Array.isArray(v.headers) || !Array.isArray(v.sampleRows)) return bad('shape');
  if (v.headers.length < 1 || v.headers.length > 100 || !v.headers.every(h => isStr(h, 120))) return bad('headers');
  if (v.sampleRows.length > 3) return bad('too many sample rows');
  const rows: string[][] = [];
  for (const r of v.sampleRows) {
    if (!Array.isArray(r) || r.length > 100 || !r.every(c => isStr(c, 200))) return bad('sample row');
    rows.push(r as string[]);
  }
  return { ok: true, data: { headers: v.headers as string[], sampleRows: rows } };
}

export function parseMapOutput(v: unknown): Parse<MapColumnsOutput> {
  if (!isObj(v) || !isObj(v.mapping)) return bad('mapping missing');
  const mapping = {} as Record<MapField, string | null>;
  for (const f of MAP_FIELDS) {
    const x = (v.mapping as Record<string, unknown>)[f];
    if (x === undefined || x === null || x === '') mapping[f] = null;
    else if (isStr(x, 120)) mapping[f] = x;
    else return bad('mapping value');
  }
  if (!isNum(v.confidence)) return bad('confidence');
  return { ok: true, data: { mapping, confidence: clamp01(v.confidence), notes: typeof v.notes === 'string' ? v.notes.slice(0, 240) : '' } };
}

/** Every mapped name must be a real header; unknown names are dropped so the model cannot invent columns. */
export function verifyMapping(input: MapColumnsInput, out: MapColumnsOutput): MapColumnsOutput {
  const mapping = { ...out.mapping };
  for (const f of MAP_FIELDS) if (mapping[f] !== null && !input.headers.includes(mapping[f]!)) mapping[f] = null;
  return { ...out, mapping };
}

// ---- Task B: classify_rows ----
export interface ClassifyRow { id: number; description: string; amount: number }
export interface ClassifyInput { departments: string[]; categories: string[]; rows: ClassifyRow[] }
export interface ClassifyResult { id: number; department: string | null; category: string; confidence: number; reason: string }
export interface ClassifyOutput { results: ClassifyResult[] }
export const MAX_CLASSIFY_ROWS = 30;

export function parseClassifyInput(v: unknown): Parse<ClassifyInput> {
  if (!isObj(v) || !Array.isArray(v.departments) || !Array.isArray(v.categories) || !Array.isArray(v.rows)) return bad('shape');
  if (v.departments.length < 1 || v.departments.length > 30 || !v.departments.every(d => isStr(d, 60) && d.length > 0)) return bad('departments');
  if (v.categories.length < 1 || v.categories.length > 20 || !v.categories.every(d => isStr(d, 40) && d.length > 0)) return bad('categories');
  if (v.rows.length < 1 || v.rows.length > MAX_CLASSIFY_ROWS) return bad('rows');
  const rows: ClassifyRow[] = [];
  for (const r of v.rows) {
    if (!isObj(r) || !Number.isInteger(r.id) || !isStr(r.description, 300) || !isNum(r.amount) || Math.abs(r.amount) > 1e9) return bad('row');
    rows.push({ id: r.id as number, description: r.description, amount: r.amount });
  }
  if (new Set(rows.map(r => r.id)).size !== rows.length) return bad('duplicate ids');
  return { ok: true, data: { departments: v.departments as string[], categories: v.categories as string[], rows } };
}

export function parseClassifyOutput(v: unknown): Parse<ClassifyOutput> {
  if (!isObj(v) || !Array.isArray(v.results) || v.results.length > 100) return bad('results');
  const results: ClassifyResult[] = [];
  for (const r of v.results) {
    if (!isObj(r) || !Number.isInteger(r.id) || !isNum(r.confidence)) return bad('result');
    if (!(r.department === null || r.department === undefined || isStr(r.department, 60))) return bad('department');
    if (!isStr(r.category, 60)) return bad('category');
    results.push({ id: r.id as number, department: (r.department as string | null | undefined) ?? null, category: r.category, confidence: clamp01(r.confidence), reason: typeof r.reason === 'string' ? r.reason.slice(0, 120) : '' });
  }
  return { ok: true, data: { results } };
}

/**
 * Code-side checks from the brief: every input id exactly once, department in the chart or null,
 * category in the list. Anything else is "unclassified" (null) and goes to review.
 */
export function reconcileClassification(input: ClassifyInput, out: ClassifyOutput): Map<number, ClassifyResult | null> {
  const byId = new Map<number, ClassifyResult[]>();
  for (const r of out.results) byId.set(r.id, [...(byId.get(r.id) || []), r]);
  const res = new Map<number, ClassifyResult | null>();
  for (const row of input.rows) {
    const got = byId.get(row.id);
    if (!got || got.length !== 1) { res.set(row.id, null); continue; }
    const r = got[0];
    if (r.department !== null && !input.departments.includes(r.department)) { res.set(row.id, null); continue; }
    if (!input.categories.includes(r.category)) { res.set(row.id, null); continue; }
    res.set(row.id, r);
  }
  return res;
}

// ---- Task C: summarise ----
export interface SummaryDept { name: string; spent: number; budget: number; remaining: number }
export interface SummaryStats {
  currency: string;
  from?: string; through?: string;
  paid: number; committed: number; termBudget: number; remaining: number; income: number;
  departments: SummaryDept[];
  records: number; needsReview: number; excluded: number;
}
export interface SummaryOutput { summary: string }

export function parseSummaryInput(v: unknown): Parse<SummaryStats> {
  if (!isObj(v) || !isStr(v.currency, 8) || !Array.isArray(v.departments) || v.departments.length > 30) return bad('shape');
  for (const k of ['paid', 'committed', 'termBudget', 'remaining', 'income', 'records', 'needsReview', 'excluded'] as const) if (!isNum(v[k])) return bad(k);
  for (const d of v.departments) if (!isObj(d) || !isStr(d.name, 60) || !isNum(d.spent) || !isNum(d.budget) || !isNum(d.remaining)) return bad('department');
  for (const k of ['from', 'through'] as const) if (v[k] !== undefined && !isStr(v[k], 12)) return bad(k);
  return { ok: true, data: v as unknown as SummaryStats };
}
export function parseSummaryOutput(v: unknown): Parse<SummaryOutput> {
  if (!isObj(v) || !isStr(v.summary, 1200) || v.summary.trim().length < 10) return bad('summary');
  return { ok: true, data: { summary: v.summary.trim() } };
}

/** All numeric values in a text, ignoring thousands commas. "€1,250.50" -> 1250.5 */
export function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) || []).map(s => parseFloat(s.replace(/,/g, ''))).filter(Number.isFinite);
}

/** The summary may only contain numbers that already exist in the computed stats. */
export function summaryUsesOnlyGivenNumbers(summary: string, stats: unknown): boolean {
  const allowed = new Set(numbersIn(JSON.stringify(stats)));
  return numbersIn(summary).every(n => allowed.has(n));
}
