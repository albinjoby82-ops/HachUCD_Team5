// System prompts and task specs. Imported by the Worker (production) AND the eval, so the eval
// measures exactly what ships. The Worker only accepts these named tasks.
import {
  type Parse, type MapColumnsInput, type MapColumnsOutput, type ClassifyInput, type ClassifyOutput, type SummaryStats, type SummaryOutput,
  parseMapInput, parseMapOutput, parseClassifyInput, parseClassifyOutput, parseSummaryInput, parseSummaryOutput,
} from './schemas';
import { redactText } from './redact';

export type TaskName = 'map_columns' | 'classify_rows' | 'summarise';

export interface TaskSpec<I, O> {
  system: string;
  maxTokens: number;
  input: (v: unknown) => Parse<I>;
  output: (v: unknown) => Parse<O>;
  /** Defence in depth: the Worker redacts again even though the browser already did. */
  sanitize: (i: I) => I;
}

const mapColumns: TaskSpec<MapColumnsInput, MapColumnsOutput> = {
  system:
    'You map columns of a finance spreadsheet from a student team. Given column headers and up to 3 sample rows, say which header holds each field. ' +
    'Use ONLY headers that appear in the input; use null if a field is not present. ' +
    'If amounts are split into debit/credit columns, fill those and leave "amount" null. Do not infer values. ' +
    'Return JSON only, in exactly this shape: {"mapping":{"date":string|null,"description":string|null,"amount":string|null,"debit":string|null,"credit":string|null,"department":string|null,"category":string|null,"who":string|null},"confidence":number,"notes":string}. ' +
    '"confidence" is 0 to 1. "notes" is one short sentence.',
  maxTokens: 400,
  input: parseMapInput,
  output: parseMapOutput,
  sanitize: i => ({ headers: i.headers.map(h => redactText(h, 120)), sampleRows: i.sampleRows.map(r => r.map(c => redactText(c, 120))) }),
};

const classifyRows: TaskSpec<ClassifyInput, ClassifyOutput> = {
  system:
    'You classify transactions for a student engineering team. For each row choose ONE department from "departments" and ONE category from "categories". ' +
    'Negative amounts are money out, positive amounts are money in. ' +
    'If you are not reasonably sure of the department, use null. If unsure of the category, use "Other". ' +
    '"confidence" is 0 to 1 and must be low when the description is vague. "reason" is at most 12 words and must not invent facts about the merchant. ' +
    'Never change ids. Return JSON only, in exactly this shape: {"results":[{"id":number,"department":string|null,"category":string,"confidence":number,"reason":string}]}.',
  maxTokens: 1800,
  input: parseClassifyInput,
  output: parseClassifyOutput,
  sanitize: i => ({ ...i, rows: i.rows.map(r => ({ ...r, description: redactText(r.description, 200) })) }),
};

const summarise: TaskSpec<SummaryStats, SummaryOutput> = {
  system:
    'Write a 3-4 sentence plain-English summary of a team\'s finances for its committee. Use ONLY the figures provided. ' +
    'Do not calculate, estimate, round, sum or add numbers; quote figures exactly as given. Never describe remaining budget as a bank balance. ' +
    'Mention how many rows still need review. Return JSON only: {"summary":"..."}.',
  maxTokens: 400,
  input: parseSummaryInput,
  output: parseSummaryOutput,
  sanitize: i => i,
};

export const TASKS = { map_columns: mapColumns, classify_rows: classifyRows, summarise } as const;
