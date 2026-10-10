// The AI steps of the finance catch-up. Code parses, validates and computes; AI only maps,
// classifies and explains. Everything here returns suggestions with a confidence. A person confirms.
import type { FinanceDraft, FinanceMapping, FinanceSettings } from '../finance';
import { moneyCents } from '../finance';
import { callAI, type AiFailure } from './client';
import type { Usage } from '../../../shared/ai/call';
import { CATEGORIES, ruleCategory } from '../../../shared/ai/rules';
import { isPersonTransfer, redactText } from '../../../shared/ai/redact';
import {
  type ClassifyInput, type MapColumnsOutput, type SummaryStats, MAX_CLASSIFY_ROWS,
  reconcileClassification, summaryUsesOnlyGivenNumbers, verifyMapping,
} from '../../../shared/ai/schemas';

export { CATEGORIES };
export const REVIEW_BELOW = 0.7;
const BATCH = 25, PARALLEL = 3;

export interface UsageTotals { calls: number; tokens: number; model?: string }
const addUsage = (t: UsageTotals, u: Usage | null | undefined, model?: string) => { t.calls++; t.tokens += u?.total_tokens ?? 0; if (model) t.model = model; };

// ---- Step 2: column mapping ----
export interface MappingSuggestion {
  mapping: Partial<FinanceMapping>; confidence: number; notes: string; model: string;
  /** For the UI: which source columns the AI picked, by header. */
  picked: { field: string; header: string }[];
}

export async function suggestMapping(columns: string[], sampleRows: string[][]): Promise<{ ok: true; value: MappingSuggestion } | { ok: false; error: AiFailure }> {
  const input = { headers: columns.map(c => redactText(c, 120)), sampleRows: sampleRows.slice(0, 3).map(r => r.slice(0, columns.length).map(c => redactText(c, 120))) };
  const r = await callAI('map_columns', input);
  if (!r.ok) return r;
  const out: MapColumnsOutput = verifyMapping({ headers: columns.map(c => redactText(c, 120)), sampleRows: [] }, r.result);
  // Header names may repeat; only trust a name that identifies exactly one column.
  const indexOf = (name: string | null) => {
    if (name === null) return -1;
    const hits = input.headers.map((h, i) => (h === name ? i : -1)).filter(i => i >= 0);
    return hits.length === 1 ? hits[0] : -1;
  };
  const m = out.mapping;
  const mapping: Partial<FinanceMapping> = {
    date: indexOf(m.date), description: indexOf(m.description), amount: indexOf(m.amount),
    out: indexOf(m.debit), in: indexOf(m.credit), dept: indexOf(m.department), category: indexOf(m.category),
  };
  // One amount column, or a debit/credit pair; never both.
  if (mapping.amount! >= 0) { mapping.out = -1; mapping.in = -1; }
  const picked = (Object.entries(mapping) as [string, number][]).filter(([, i]) => i >= 0).map(([field, i]) => ({ field, header: columns[i] }));
  return { ok: true, value: { mapping, confidence: out.confidence, notes: out.notes, model: r.model, picked } };
}

// ---- Step 4: department + category for what rules could not settle ----
export interface RowMeta {
  dept: string | null;
  category: string | null;
  confidence: number;
  reason: string;
  source: 'rule' | 'ai' | 'none';
  /** Which fields were actually written into the draft. */
  appliedDept: boolean;
  appliedCategory: boolean;
  /** Needs a person to look at it before the import can continue. */
  review: boolean;
  /** Value of the draft before AI touched it, so we can tell whether the user changed it. */
  baseDept: string;
  baseCategory: string;
  confirmed?: boolean;
}

/** Signed amount in major units, computed in code from the draft. Null if it can't be read. */
export function draftAmount(d: FinanceDraft, s: FinanceSettings): number | null {
  try {
    if (s.amountMode === 'split') {
      const out = d.out.trim() ? moneyCents(d.out, s.numberFormat, false) : 0;
      const inn = d.in.trim() ? moneyCents(d.in, s.numberFormat, false) : 0;
      return (inn - out) / 100;
    }
    const c = moneyCents(d.amount, s.numberFormat, s.amountMode === 'signed');
    return (s.amountMode === 'expense' ? -c : c) / 100;
  } catch { return null; }
}

export interface ClassifyRun {
  meta: Record<number, RowMeta>;
  eligible: number; byRules: number; sent: number; failed: number; heldBack: number;
  usage: UsageTotals; unavailable?: AiFailure;
}

export async function classifyDrafts(drafts: FinanceDraft[], settings: FinanceSettings, departments: string[], deptMapped: boolean): Promise<ClassifyRun> {
  const run: ClassifyRun = { meta: {}, eligible: 0, byRules: 0, sent: 0, failed: 0, heldBack: 0, usage: { calls: 0, tokens: 0 } };
  const queue: { draft: FinanceDraft; needsDept: boolean; needsCat: boolean }[] = [];

  for (const d of drafts) {
    if (d.excluded || !d.description.trim()) continue;
    const needsDept = !deptMapped || !departments.includes(d.dept);
    const needsCat = !d.category.trim() || d.category === 'Other';
    if (!needsDept && !needsCat) continue;
    run.eligible++;
    const base = { baseDept: d.dept, baseCategory: d.category };
    let category: string | null = null;
    if (needsCat) { category = ruleCategory(d.description); if (category) run.meta[d.sourceRow] = { dept: null, category, confidence: 1, reason: 'Known payee rule', source: 'rule', appliedDept: false, appliedCategory: true, review: false, ...base }; }
    if (!needsDept && (!needsCat || category)) { if (category) run.byRules++; continue; }
    if (isPersonTransfer(d.description)) {
      // Mostly a person's name: not sent to the AI at all.
      run.heldBack++;
      run.meta[d.sourceRow] = { dept: null, category, confidence: 0, reason: 'Transfer to a person: not sent to AI', source: category ? 'rule' : 'none', appliedDept: false, appliedCategory: !!category, review: true, ...base };
      continue;
    }
    queue.push({ draft: d, needsDept, needsCat: needsCat && !category });
  }

  const batches: typeof queue[] = [];
  for (let i = 0; i < queue.length; i += Math.min(BATCH, MAX_CLASSIFY_ROWS)) batches.push(queue.slice(i, i + Math.min(BATCH, MAX_CLASSIFY_ROWS)));

  const runBatch = async (batch: typeof queue) => {
    const input: ClassifyInput = {
      departments, categories: CATEGORIES,
      rows: batch.map(q => ({ id: q.draft.sourceRow, description: redactText(q.draft.description), amount: draftAmount(q.draft, settings) ?? 0 })),
    };
    run.sent += batch.length;
    const r = await callAI('classify_rows', input);
    if (!r.ok) {
      run.failed += batch.length; run.unavailable = r.error;
      for (const q of batch) {
        const prev = run.meta[q.draft.sourceRow];
        run.meta[q.draft.sourceRow] = { dept: null, category: prev?.category ?? null, confidence: 0, reason: 'AI unavailable', source: prev?.source ?? 'none', appliedDept: false, appliedCategory: !!prev?.appliedCategory, review: true, baseDept: q.draft.dept, baseCategory: q.draft.category };
      }
      return;
    }
    addUsage(run.usage, r.usage, r.model);
    const checked = reconcileClassification(input, r.result);
    for (const q of batch) {
      const row = q.draft, res = checked.get(row.sourceRow) ?? null, prev = run.meta[row.sourceRow];
      const sure = !!res && res.confidence >= REVIEW_BELOW;
      const dept = res?.department ?? null;
      const appliedDept = q.needsDept && sure && dept !== null;
      const category = prev?.category ?? (sure && res!.category !== 'Other' ? res!.category : null);
      run.meta[row.sourceRow] = {
        dept, category, confidence: res?.confidence ?? 0, reason: res?.reason || (res ? '' : 'AI result could not be used'), source: prev?.source === 'rule' ? 'rule' : 'ai',
        appliedDept, appliedCategory: !!category, review: q.needsDept && !appliedDept, baseDept: row.dept, baseCategory: row.category,
      };
    }
  };

  let next = 0;
  await Promise.all(Array.from({ length: Math.min(PARALLEL, batches.length) }, async () => { while (next < batches.length) await runBatch(batches[next++]); }));
  return run;
}

// ---- Step 7: explain computed figures ----
export async function explainStats(stats: SummaryStats): Promise<{ ok: true; summary: string; model: string } | { ok: false; error: AiFailure | 'numbers' }> {
  const r = await callAI('summarise', stats);
  if (!r.ok) return r;
  // The summary may only quote numbers we computed. Anything else is thrown away.
  if (!summaryUsesOnlyGivenNumbers(r.result.summary, stats)) return { ok: false, error: 'numbers' };
  return { ok: true, summary: r.result.summary, model: r.model };
}
