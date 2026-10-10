import { useMemo, useRef, useState } from 'react';
import { deptNames } from '../../lib/org';
import { applyFinanceImport, financeLabels, financeTotals, makeFinanceDrafts, mappingErrors, moneyCents, reviewFinance, suggestFinanceMapping } from '../../lib/finance';
import type { FinanceDraft, FinanceField, FinanceMapping, FinanceSettings } from '../../lib/finance';
import { fingerprint, MAX_BYTES, readInventory } from '../../lib/inventory';
import type { InventorySource } from '../../lib/inventory';
import { saveOrganisation, useStore, useUI } from '../../lib/store';
import { uid } from '../../lib/format';
import { Steps } from '../../components/ui';
import { AIBadge, AIClassifyPanel, AIMapPanel, AISummaryPanel, applyAi, needsAiReview } from './FinanceAI';
import type { ClassifyRun, RowMeta } from '../../lib/ai/financeAi';
import { useCtx } from './ctx';

const BANK_SAMPLE = 'Date,Description,Debit,Credit,Department,Type,Reference,Receipt\n2026-09-01,Season sponsorship,,2000,Shared,income,SP-001,\n2026-09-03,Chassis materials,120,,Mechanical,expense,BK-001,yes\n2026-09-04,Sensor order,45.50,,Electrical,expense,BK-002,no\n2026-09-08,Material refund,,20,Mechanical,refund,BK-003,\n2026-09-10,Transfer to savings,200,,Shared,transfer,BK-004,';
const SHEET_SAMPLE = 'Date,Item,Total cost,Department,Type,Status,Receipt,Project,Reference\n2026-09-03,Chassis materials,120,Mechanical,expense,paid,yes,Chassis,BK-001\n2026-09-04,Sensor order,45.50,Electrical,expense,paid,no,Electronics,BK-002\n2026-09-12,Workshop supplies,18.50,Shared,expense,paid,,Build,SS-003';
export const catchupSamples = { bank: BANK_SAMPLE, sheet: SHEET_SAMPLE };

export function FinanceCatchup() {
  const { org, me, top, m } = useCtx();
  const [step, setStep] = useState(1), [source, setSource] = useState<InventorySource>();
  const [raw, setRaw] = useState(''), [file, setFile] = useState(''), [hash, setHash] = useState('');
  const [delimiter, setDelimiter] = useState(','), [mapping, setMapping] = useState<FinanceMapping>();
  const [settings, setSettings] = useState<FinanceSettings>({ source: 'bank', amountMode: '', numberFormat: '', dateFormat: '', currency: org.currency, dept: 'Shared' });
  const [drafts, setDrafts] = useState<FinanceDraft[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [baseline, setBaseline] = useState<'' | 'keep' | 'replace'>(Object.values(org.baseSpend).some(n => n !== 0) && !org.financeImports?.length ? '' : 'keep');
  const depts = deptNames(org);
  const [budget, setBudget] = useState(String(org.termBudget));
  const [allocations, setAllocations] = useState<Record<string, string>>(Object.fromEntries(depts.map(d => [d, String(org.budgets[d] || 0)])));
  const [page, setPage] = useState(0), [onlyIssues, setOnlyIssues] = useState(false);
  const [result, setResult] = useState<{ saved: number; excluded: number; linked: number }>();
  const saving = useRef(false);
  const [aiMeta, setAiMeta] = useState<Record<number, RowMeta>>({}), [aiRun, setAiRun] = useState<ClassifyRun>();
  const aiPending = drafts.filter(d => needsAiReview(aiMeta[d.sourceRow], d)).length;
  const review = useMemo(() => reviewFinance(drafts, settings, org), [drafts, settings, org]);
  const active = review.filter(r => !r.draft.excluded), blocked = active.filter(r => r.errors.length).length;
  const duplicateFile = org.financeImports?.some(i => i.fingerprint === hash);
  const selected = onlyIssues ? review.filter(r => !r.draft.excluded && r.errors.length) : review;
  const pages = Math.max(1, Math.ceil(selected.length / 25)), currentPage = Math.min(page, pages - 1);
  const shown = selected.slice(currentPage * 25, currentPage * 25 + 25);
  const mapProblems = mapping && source ? mappingErrors(mapping, source.columns.length, settings) : [];
  const budgetInput = () => ({ termBudget: moneyCents(budget, 'dot', false) / 100, budgets: Object.fromEntries(depts.map(d => [d, moneyCents(allocations[d] || '0', 'dot', false) / 100])) });
  const projection = useMemo(() => {
    if (step !== 4 || blocked || !active.length || !baseline) return null;
    try {
      const next = structuredClone(org);
      applyFinanceImport(next, { id: 'preview', fingerprint: hash, file, settings, drafts, baseline, ...budgetInput(), at: Date.now() }, me);
      return { totals: financeTotals(next), org: next };
    } catch (e) { return { error: (e as Error).message }; }
  }, [step, org, hash, file, settings, drafts, baseline, budget, allocations, blocked, me]);
  function parse(content: string, name: string, sep: string) {
    setSource(undefined); setMapping(undefined); setDrafts([]); setError(''); setConfirmed(false); setAiMeta({}); setAiRun(undefined);
    try {
      const parsed = readInventory(content, name, sep); setSource(parsed); setMapping(suggestFinanceMapping(parsed.columns)); setStep(2);
    } catch (e) { setError((e as Error).message); }
  }
  async function load(content: string, name: string) {
    setBusy(true); setHash('');
    try { const digest = await fingerprint(content); setRaw(content); setFile(name); setHash(digest); parse(content, name, delimiter); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function upload(file: File) {
    setError('');
    if (!/\.csv$/i.test(file.name) || file.size > MAX_BYTES) { setError('Choose a UTF-8 CSV file up to 2 MB. Export Excel sheets as CSV.'); return; }
    setBusy(true);
    try { await load(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()), file.name); }
    catch { setError('Cannot read the file. Export it as UTF-8 CSV and try again.'); } finally { setBusy(false); }
  }
  function edit(row: FinanceDraft, patch: Partial<FinanceDraft>) {
    setConfirmed(false); setError('');
    setDrafts(ds => ds.map(d => d.sourceRow === row.sourceRow ? { ...d, separate: false, ...patch } : d));
  }
  function save() {
    if (!confirmed || saving.current || !projection || 'error' in projection) return;
    saving.current = true; setError('');
    try {
      let entry: ReturnType<typeof applyFinanceImport> | undefined;
      saveOrganisation(org.id, current => {
        if (useStore.getState().currentOrgId !== org.id || (useStore.getState().viewAs[org.id] && useStore.getState().viewAs[org.id] !== me)) throw new Error('Your active team or role changed. Reopen the import.');
        entry = applyFinanceImport(current, { id: uid('FIN'), fingerprint: hash, file, settings, drafts, baseline, ...budgetInput(), at: Date.now() }, me);
      });
      setResult(entry!); setStep(5); useUI.getState().say('Your team finances are updated.');
    } catch (e) { setError((e as Error).message); } finally { saving.current = false; }
  }
  const mapped = (keys: FinanceField[]) => keys.map(k => <label className="field" key={k}>{financeLabels[k]}<select className="input" value={mapping![k]} onChange={e => { setMapping({ ...mapping!, [k]: Number(e.target.value) }); setConfirmed(false); }}><option value={-1}>Not in this file</option>{source!.columns.map((h, i) => <option value={i} key={i}>{i + 1}. {h || '(blank)'} — {source!.rows[0]?.values[i]?.slice(0, 25)}</option>)}</select></label>);

  if (!top) return <div className="card pad">Your treasurer or team leader can import financial history. You can view your department’s updated figures in Overview.</div>;
  return <div className="stack-s fade" style={{ gap: 18 }}>
    <Steps n={4} cur={Math.min(step, 4)} />
    <div><div className="title26">{step === 5 ? 'Your financial history is in' : step === 1 ? 'Already mid-build? Start from where you are.' : step === 2 ? 'Tell us what your columns mean' : step === 3 ? 'Check the transactions together' : 'See what will change'}</div><div className="muted">{org.name} · {step < 5 ? ['Choose a file', 'Confirm the meaning', 'Review the records', 'Update your team'][step - 1] : 'Continue building with your records in one place'}</div></div>
    {step === 1 && <>
      <p>Bring your bank export or the spreadsheet you already use. We’ll turn completed payments into a transaction history, match existing purchases, and update spending across your workspace.</p>
      <div className="g2">{(['bank', 'sheet'] as const).map(kind => <button key={kind} className={'card pad finance-source' + (settings.source === kind ? ' selected' : '')} aria-pressed={settings.source === kind} onClick={() => setSettings({ ...settings, source: kind })}><span className="title20">{kind === 'bank' ? 'Bank transactions' : 'Team spending sheet'}</span><span className="small muted">{kind === 'bank' ? 'Money in and out, dates and payment descriptions.' : 'Purchases, total costs, departments and receipt status.'}</span></button>)}</div>
      <section className="card pad stack-s">
        <label className="field">Upload your finance CSV<input className="input" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} /></label>
        <div className="small muted">UTF-8 CSV · up to 2 MB / 2,000 transactions. Export Excel or Google Sheets as CSV. Choose one account and one currency per file ({org.currency}).</div>
        <div className="hstack"><button className="btn btn-secondary" disabled={busy} onClick={() => void load(catchupSamples[settings.source], `example-${settings.source}.csv`)}>Try an example {settings.source === 'bank' ? 'bank export' : 'spending sheet'}</button><a className="btn btn-ghost" href={`./finance-${settings.source}-example.csv`} download>Download template</a></div>
      </section>
      <div className="callout-p">Start with the season to date, then add later exports. Overlapping payments are flagged for your review. Income won’t silently change your budget, and bank payments won’t invent inventory items.</div>
      <div className="small muted">Records save in this browser, as requested. This imports completed transactions, not forecasts, unpaid orders or budget totals.</div>
    </>}
    {step === 2 && <section className="card pad stack-s">
      <div className="hstack"><b>{file}</b><label className="field">Delimiter<select className="input" value={delimiter} onChange={e => { setDelimiter(e.target.value); parse(raw, file, e.target.value); }}><option value=",">Comma</option><option value=";">Semicolon</option><option value={'\t'}>Tab</option></select></label></div>
      {source && mapping && <>
        <div className="small muted">{source.rows.length} data records · {source.blankRows} blank records skipped. Record numbers include the header.</div>
        {source.issues.map(issue => <div key={issue} className="callout-warn">{issue}</div>)}
        <AIMapPanel columns={source.columns} sample={source.rows.slice(0, 3).map(r => r.values)} apply={m => { setMapping(cur => ({ ...cur!, ...Object.fromEntries(Object.entries(m).filter(([, v]) => (v as number) >= 0)) } as FinanceMapping)); setConfirmed(false); }} />
        <div className="inventory-grid">{mapped(['date', 'description', 'amount', 'out', 'in', 'dept'])}</div>
        <details open={settings.source === 'sheet'}><summary>Optional details: type, category, receipts, reference and project</summary><div className="inventory-grid" style={{ marginTop: 12 }}>{mapped(['kind', 'category', 'reference', 'currency', 'receipt', 'project', 'status'])}</div></details>
        <div className="inventory-grid">
          <label className="field">How are amounts recorded?<select className="input" value={settings.amountMode} onChange={e => setSettings({ ...settings, amountMode: e.target.value as FinanceSettings['amountMode'] })}><option value="">Choose explicitly</option><option value="signed">One amount: negative out, positive in</option><option value="expense">Positive total costs (expenses unless type says income/refund)</option><option value="split">Separate money-out and money-in columns</option></select></label>
          <label className="field">Date format<select className="input" value={settings.dateFormat} onChange={e => setSettings({ ...settings, dateFormat: e.target.value as FinanceSettings['dateFormat'] })}><option value="">Choose explicitly</option><option value="iso">YYYY-MM-DD</option><option value="dmy">DD/MM/YYYY</option><option value="mdy">MM/DD/YYYY</option></select></label>
          <label className="field">Number format<select className="input" value={settings.numberFormat} onChange={e => setSettings({ ...settings, numberFormat: e.target.value as FinanceSettings['numberFormat'] })}><option value="">Choose explicitly</option><option value="dot">1,200.50 (decimal point)</option><option value="comma">1.200,50 (decimal comma)</option></select></label>
          <label className="field">Default department (when no column)<select className="input" value={settings.dept} onChange={e => setSettings({ ...settings, dept: e.target.value })}>{depts.map(d => <option key={d}>{d}</option>)}</select></label>
        </div>
        <div className="small muted">Amounts are transaction totals in {org.currency}, not unit prices. Missing departments use the default only when no department column is mapped. You can assign each payment next.</div>
        <div className="small muted">Unused columns: {source.columns.map((h, i) => ({ h, i })).filter(c => !Object.values(mapping).includes(c.i)).map(c => `${c.i + 1}. ${c.h || '(blank)'}`).join(', ') || 'none'}. These will not be saved.</div>
        <details><summary>Original data (first 5 records)</summary><div className="inventory-table"><table className="tx"><thead><tr>{source.columns.map((c, i) => <th key={i}>{i + 1}. {c}</th>)}</tr></thead><tbody>{source.rows.slice(0, 5).map(r => <tr key={r.sourceRow}>{r.values.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table></div></details>
        {mapProblems.length > 0 && <div className="callout-warn">{mapProblems.join(' ')}</div>}
        <div className="hstack"><button className="btn btn-ghost" onClick={() => setStep(1)}>Choose another file</button><button className="btn btn-primary" disabled={!!mapProblems.length || duplicateFile} onClick={() => { try { setDrafts(makeFinanceDrafts(source, mapping, settings, org)); setAiMeta({}); setAiRun(undefined); setPage(0); setOnlyIssues(false); setError(''); setStep(3); } catch (e) { setError((e as Error).message); } }}>Review transactions</button></div>
      </>}
    </section>}
    {step === 3 && <>
      <div className="callout-p" role="status">{drafts.length} read · {active.length - blocked} ready · {blocked} need attention · {drafts.length - active.length} excluded{aiPending > 0 ? ` · ${aiPending} AI-unsure to review` : ''}</div>
      <AIClassifyPanel drafts={drafts} settings={settings} departments={depts} deptMapped={!!mapping && mapping.dept >= 0} run={aiRun} remaining={aiPending}
        onRun={run => { setAiRun(run); setAiMeta(run.meta); setConfirmed(false); setDrafts(ds => applyAi(ds, run.meta)); }}
        onConfirmAll={() => setAiMeta(m => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, { ...v, confirmed: true }])))} />
      <div className="small muted">Check every payment’s department and type. Mark sponsorship as income, returned purchases as refunds, and movements between your own accounts as transfers. Receipt status records your declaration; it does not upload a receipt.</div>
      <div className="small muted">Request links support full payments with matching amounts. If this is a part-payment or a different amount for an existing request, exclude it until reconciled; keeping both records can double-count it.</div>
      <label className="small"><input type="checkbox" checked={onlyIssues} onChange={e => { setOnlyIssues(e.target.checked); setPage(0); }} /> Show only rows needing attention</label>
      <div className="inventory-table finance-review"><table className="tx"><thead><tr><th>Include / record</th><th>Payment</th><th>Amount ({org.currency})</th><th>Department / type</th><th>Details</th><th>Review / request match</th></tr></thead><tbody>{shown.map(r => <tr key={r.draft.sourceRow} className={r.draft.excluded ? 'inventory-excluded' : ''}>
        <td><label><input type="checkbox" aria-label={`Include record ${r.draft.sourceRow}`} checked={!r.draft.excluded} onChange={e => edit(r.draft, { excluded: !e.target.checked })} /> {r.draft.sourceRow}</label></td>
        <td><input className="input" aria-label={`Record ${r.draft.sourceRow} date`} value={r.draft.date} onChange={e => edit(r.draft, { date: e.target.value })} /><input className="input" aria-label={`Record ${r.draft.sourceRow} description`} value={r.draft.description} onChange={e => edit(r.draft, { description: e.target.value })} /><div className="small muted">Reference: {r.draft.reference || 'not provided'}</div></td>
        <td>{(settings.amountMode === 'split' ? ['out', 'in'] as const : ['amount'] as const).map(k => <label className="small" key={k}>{k === 'out' ? 'Money out' : k === 'in' ? 'Money in' : 'Amount'}<input className="input" aria-label={`Record ${r.draft.sourceRow} ${k}`} value={r.draft[k]} onChange={e => edit(r.draft, { [k]: e.target.value, requestId: '' })} /></label>)}<input className="input" aria-label={`Record ${r.draft.sourceRow} currency`} value={r.draft.currency} onChange={e => edit(r.draft, { currency: e.target.value })} /></td>
        <td><select className="input" aria-label={`Record ${r.draft.sourceRow} department`} value={r.draft.dept} onChange={e => edit(r.draft, { dept: e.target.value, requestId: '' })}>{!depts.includes(r.draft.dept) && <option value={r.draft.dept}>{r.draft.dept || 'Choose department'}</option>}{depts.map(d => <option key={d}>{d}</option>)}</select><select className="input" aria-label={`Record ${r.draft.sourceRow} type`} value={r.draft.kind} onChange={e => edit(r.draft, { kind: e.target.value, requestId: '' })}><option value="">From amount ({r.value?.kind || 'check amount'})</option>{['expense', 'income', 'refund', 'transfer'].map(k => <option key={k}>{k}</option>)}{r.draft.kind && !['expense', 'income', 'refund', 'transfer'].includes(r.draft.kind) && <option>{r.draft.kind}</option>}</select><AIBadge meta={aiMeta[r.draft.sourceRow]} draft={r.draft} confirm={() => setAiMeta(m => ({ ...m, [r.draft.sourceRow]: { ...m[r.draft.sourceRow], confirmed: true } }))} /></td>
        <td><label className="small">Category<input className="input" aria-label={`Record ${r.draft.sourceRow} category`} value={r.draft.category} onChange={e => edit(r.draft, { category: e.target.value })} /></label><label className="small">Receipt<select className="input" aria-label={`Record ${r.draft.sourceRow} receipt`} value={r.draft.receipt} onChange={e => edit(r.draft, { receipt: e.target.value })}><option value="">Unknown</option><option value="present">Present</option><option value="missing">Missing</option>{r.draft.receipt && !['present', 'missing'].includes(r.draft.receipt) && <option>{r.draft.receipt}</option>}</select></label><label className="small">Payment status<input className="input" aria-label={`Record ${r.draft.sourceRow} status`} placeholder="Completed (confirmed at save)" value={r.draft.status} onChange={e => edit(r.draft, { status: e.target.value })} /></label></td>
        <td>{r.errors.map((e, i) => <div key={i} className="err small">{e}</div>)}{r.value && !r.errors.length && <div className="small">{r.value.date} · {m(r.value.amountCents / 100)} · {r.value.kind}</div>}
          {(r.matches.length > 0 || r.draft.requestId) && <label className="small">Existing purchase<select className="input" aria-label={`Record ${r.draft.sourceRow} request`} value={r.draft.requestId} onChange={e => { const request = org.requests.find(x => x.id === e.target.value); edit(r.draft, { requestId: e.target.value, ...(request ? { dept: request.dept } : {}) }); }}><option value="">No request linked</option>{r.matches.map(q => <option key={q.id} value={q.id}>{q.id}: {q.item} · {q.dept}</option>)}</select></label>}
          {(r.duplicate || r.matches.length > 0) && <label className="small"><input type="checkbox" checked={r.draft.separate} aria-label={`Record ${r.draft.sourceRow} separate payment`} onChange={e => edit(r.draft, { separate: e.target.checked })} /> This is a separate payment; keep it</label>}
          {r.value?.kind === 'expense' && r.value.receipt !== 'present' && <div className="small muted">Receipt needs checking.</div>}
        </td>
      </tr>)}</tbody></table></div>
      <div className="hstack"><button className="btn btn-secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="small">Page {currentPage + 1} of {pages} · {selected.length} records</span><button className="btn btn-secondary" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></div>
      <div className="hstack"><button className="btn btn-ghost" onClick={() => { setStep(2); setConfirmed(false); }}>Back to mapping (resets corrections)</button><button className="btn btn-primary" disabled={blocked > 0 || !active.length || aiPending > 0} onClick={() => { setStep(4); setConfirmed(false); setError(''); }}>Preview team finances</button></div>
    </>}
    {step === 4 && <>
      {!org.financeImports?.length && Object.values(org.baseSpend).some(n => n !== 0) && <section className="card pad stack-s"><b>Your workspace already has {m(Object.values(org.baseSpend).reduce((a, b) => a + b, 0))} of earlier spending entered as a summary.</b><label className="field">Does this file cover that earlier spending?<select className="input" value={baseline} onChange={e => { setBaseline(e.target.value as typeof baseline); setConfirmed(false); }}><option value="">Choose before saving</option><option value="replace">Yes — replace the earlier summary with these records</option><option value="keep">No — keep that earlier spend; these are additional payments</option></select></label><div className="small muted">Replacing affects only the earlier-spending summary. Existing purchase requests and inventory stay; linked payments are counted once. The previous summary is retained in import history.</div></section>}
      <section className="card pad stack-s"><div className="title20">Confirm your season budget</div><div className="small muted">Your CSV tells us what moved, not how much the team is allowed to spend. Keep these budgets or update them. Use decimal points. Income is tracked separately.</div><div className="inventory-grid"><label className="field">Team budget ({org.currency})<input className="input" value={budget} onChange={e => { setBudget(e.target.value); setConfirmed(false); }} /></label>{depts.map(d => <label key={d} className="field">{d} budget<input className="input" value={allocations[d] || ''} onChange={e => { setAllocations({ ...allocations, [d]: e.target.value }); setConfirmed(false); }} /></label>)}</div></section>
      {projection && 'error' in projection && <div className="err">{projection.error}</div>}
      {projection && 'totals' in projection && <>
        <div className="g3">{[[m(projection.totals!.paid), 'Spent, net of refunds'], [m(projection.totals!.committed), 'Approved, not yet paid'], [m(projection.org!.termBudget - projection.totals!.used), 'Team budget remaining']].map(([v, label]) => <div className="card stat" key={label}><div className="v">{v}</div><div className="small muted">{label}</div></div>)}</div>
        <section className="card pad stack-s"><b>Updates across your workspace</b><div className="small">Home and Finance: updated spending and remaining budgets. Approval panels: current department budget context. Transactions: {active.length} saved records. Requests: {active.filter(r => r.draft.requestId).length} linked payments, marked bought without adding inventory.</div><div className="inventory-table"><table className="tx"><thead><tr><th>Department</th><th>Budget used now</th><th>After import</th><th>Remaining after</th></tr></thead><tbody>{depts.map(d => <tr key={d}><td>{d}</td><td>{m(financeTotals(org, d).used)}</td><td>{m(financeTotals(projection.org!, d).used)}</td><td>{m((projection.org!.budgets[d] || 0) - financeTotals(projection.org!, d).used)}</td></tr>)}</tbody></table></div><div className="small muted">Imported income: {m(projection.totals!.income)}. Remaining budget is not your bank balance. Unallocated budget is not included in department limits.</div></section>
      </>}
      {projection && 'totals' in projection && <AISummaryPanel stats={(() => {
        const r2 = (n: number) => Math.round(n * 100) / 100, dates = active.map(r => r.value?.date).filter(Boolean).sort() as string[];
        return { currency: org.currency, from: dates[0], through: dates.at(-1), paid: r2(projection.totals!.paid), committed: r2(projection.totals!.committed), termBudget: r2(projection.org!.termBudget), remaining: r2(projection.org!.termBudget - projection.totals!.used), income: r2(projection.totals!.income),
          departments: depts.map(d => { const t = financeTotals(projection.org!, d), b = projection.org!.budgets[d] || 0; return { name: d, spent: r2(t.used), budget: r2(b), remaining: r2(b - t.used) }; }), records: active.length, needsReview: aiPending, excluded: drafts.length - active.length };
      })()} />}
      <label className="small"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I reviewed the formats, departments, payment types, request links, budgets and {drafts.length - active.length} exclusions. Included rows are completed payments, not unpaid orders or summary totals.</label>
      <div className="hstack"><button className="btn btn-secondary" onClick={() => { setStep(3); setConfirmed(false); }}>Back to records</button><button className="btn btn-primary" disabled={!confirmed || !projection || 'error' in projection || !!duplicateFile} onClick={save}>Update team finances</button></div>
    </>}
    {step === 5 && result && <section className="card pad stack-s"><div className="title20">{result.saved} transactions saved · {result.excluded} excluded · {result.linked} requests linked</div><p>Home, department budgets and purchase approvals now use the same updated financial records. You can upload your next file whenever you’re ready.</p><div className="small muted">This reflects the records you supplied. Missing payments, other accounts and unread receipts still need your review.</div><div className="hstack"><button className="btn btn-primary" onClick={() => useUI.getState().set({ finTab: 'overview' })}>See updated finances</button><button className="btn btn-secondary" onClick={() => useUI.getState().set({ finTab: 'transactions' })}>View transactions</button><button className="btn btn-ghost" onClick={() => { setStep(1); setDrafts([]); setHash(''); setConfirmed(false); setBaseline('keep'); setError(''); }}>Import another file</button></div></section>}
    {busy && <div role="status">Reading your file…</div>}{duplicateFile && step < 5 && <div className="err">This file has already been imported. Your records have not been added again.</div>}{error && <div className="err" role="alert">{error}</div>}
  </div>;
}
