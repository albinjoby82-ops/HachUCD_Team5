import { useState } from 'react';
import type { FinanceDraft, FinanceMapping, FinanceSettings } from '../../lib/finance';
import { failureText, type AiFailure } from '../../lib/ai/client';
import { classifyDrafts, explainStats, suggestMapping, type ClassifyRun, type MappingSuggestion, type RowMeta } from '../../lib/ai/financeAi';
import type { SummaryStats } from '../../../shared/ai/schemas';

const NOTICE = 'Descriptions and amounts are sent to an AI service. Names and account numbers are removed first. AI suggests, you confirm.';
const pct = (n: number) => Math.round(n * 100) + '%';

export const Banner = ({ error }: { error: AiFailure | 'numbers' }) => (
  <div className="callout-warn" role="status">
    {error === 'numbers' ? 'The AI wrote a figure we did not compute, so we discarded its text. The table is the full picture.' : <>{failureText[error]} Review every unmatched row yourself; nothing else changes.</>}
  </div>
);

/** Rows the AI was unsure about (or could not reach) stay in a queue until a person looks at them. */
export const needsAiReview = (meta: RowMeta | undefined, d: FinanceDraft) => !!meta && meta.review && !meta.confirmed && !d.excluded && d.dept === meta.baseDept;

export function applyAi(drafts: FinanceDraft[], meta: Record<number, RowMeta>): FinanceDraft[] {
  return drafts.map(d => {
    const m = meta[d.sourceRow];
    if (!m) return d;
    return { ...d, ...(m.appliedDept && m.dept ? { dept: m.dept, requestId: '' } : {}), ...(m.appliedCategory && m.category ? { category: m.category } : {}) };
  });
}

export function AIMapPanel({ columns, sample, apply }: { columns: string[]; sample: string[][]; apply: (m: Partial<FinanceMapping>) => void }) {
  const [busy, setBusy] = useState(false), [s, setS] = useState<MappingSuggestion>(), [err, setErr] = useState<AiFailure>();
  async function run() {
    setBusy(true); setErr(undefined);
    const r = await suggestMapping(columns, sample);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setS(r.value); apply(r.value.mapping);
  }
  return <div className="ai-panel stack-s">
    <div className="hstack"><button className="btn btn-secondary" disabled={busy} onClick={() => void run()}>{busy ? 'Reading your columns…' : '✦ Suggest columns with AI'}</button><span className="small muted">For sheets with unusual headings.</span></div>
    {s && <div className="small" role="status"><span className="ai-badge">AI suggestion · {pct(s.confidence)}</span> Picked {s.picked.map(p => `${p.header} → ${p.field}`).join(', ') || 'nothing certain'}. {s.notes} <b>Check the columns below before continuing.</b> <span className="muted">Model: {s.model}</span></div>}
    {err && <Banner error={err} />}
    <div className="tiny muted">{NOTICE}</div>
  </div>;
}

export function AIClassifyPanel({ drafts, settings, departments, deptMapped, run, onRun, remaining, onConfirmAll }: {
  drafts: FinanceDraft[]; settings: FinanceSettings; departments: string[]; deptMapped: boolean;
  run?: ClassifyRun; onRun: (r: ClassifyRun) => void; remaining: number; onConfirmAll: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); const r = await classifyDrafts(drafts, settings, departments, deptMapped); setBusy(false); onRun(r); }
  const ai = run ? run.sent - run.failed : 0;
  return <div className="ai-panel stack-s">
    <div className="hstack"><button className="btn btn-secondary" disabled={busy} onClick={() => void go()}>{busy ? 'Classifying…' : run ? '✦ Run AI again' : '✦ Suggest departments with AI'}</button>
      {remaining > 0 && <button className="btn btn-ghost" onClick={onConfirmAll}>Keep default for the {remaining} left</button>}</div>
    {run && <div className="small" role="status">
      <b>{run.eligible}</b> rows needed a department or category. Rules settled <b>{run.byRules}</b> without AI · AI classified <b>{ai}</b>{run.heldBack ? <> · <b>{run.heldBack}</b> person-to-person transfers held back</> : null} · <b>{remaining}</b> need your review.
      {run.usage.calls > 0 && <span className="muted"> Model: {run.usage.model} · {run.usage.calls} call{run.usage.calls === 1 ? '' : 's'} · {run.usage.tokens} tokens</span>}
    </div>}
    {run?.unavailable && <Banner error={run.unavailable} />}
    <div className="tiny muted">{NOTICE}</div>
  </div>;
}

export function AIBadge({ meta, draft, confirm }: { meta?: RowMeta; draft: FinanceDraft; confirm: () => void }) {
  if (!meta) return null;
  if (needsAiReview(meta, draft)) return <div className="ai-badge review" role="status">? Needs review · {meta.reason}{meta.confidence ? ` · ${pct(meta.confidence)}` : ''}
    <button className="btn btn-ghost btn-sm" onClick={confirm}>Keep {draft.dept || 'as is'}</button></div>;
  const deptSame = !meta.appliedDept || draft.dept === meta.dept, catSame = !meta.appliedCategory || draft.category === meta.category;
  if ((meta.appliedDept || meta.appliedCategory) && deptSame && catSame)
    return <div className="ai-badge">{meta.source === 'rule' && !meta.appliedDept ? 'Rule' : 'AI suggestion'} · {meta.source === 'rule' && !meta.appliedDept ? meta.category : pct(meta.confidence)}{meta.reason ? ` · ${meta.reason}` : ''}</div>;
  return <div className="ai-badge ok">✓ Confirmed by you</div>;
}

export function AISummaryPanel({ stats }: { stats: SummaryStats }) {
  const [busy, setBusy] = useState(false), [text, setText] = useState(''), [model, setModel] = useState(''), [err, setErr] = useState<AiFailure | 'numbers'>();
  async function go() {
    setBusy(true); setErr(undefined);
    const r = await explainStats(stats);
    setBusy(false);
    if (r.ok) { setText(r.summary); setModel(r.model); } else { setText(''); setErr(r.error); }
  }
  return <div className="ai-panel stack-s">
    <div className="hstack"><button className="btn btn-secondary" disabled={busy} onClick={() => void go()}>{busy ? 'Writing…' : text ? '✦ Write it again' : '✦ Explain where we stand'}</button></div>
    {text && <div className="inset"><div className="tiny b800 muted">AI summary · written from computed totals · {model}</div><div style={{ fontSize: 14 }}>{text}</div></div>}
    {err && <Banner error={err} />}
    <div className="tiny muted">Figures above are computed in code. The AI only describes them, and any number it adds is discarded.</div>
  </div>;
}
