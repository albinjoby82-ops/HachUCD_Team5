import { useState } from 'react';
import { saveOrganisation, useUI } from '../../lib/store';
import { deptColor, deptNames, isTop, spend } from '../../lib/org';
import { financeTotals, moneyCents, receiptFollowups, updateFinanceDetails } from '../../lib/finance';
import { when } from '../../lib/format';
import { Bar, Dialog, Pills } from '../../components/ui';
import { useCtx } from './ctx';
import { FinanceCatchup } from './FinanceCatchup';
import type { FinanceTransaction, FinanceTransactionDetails } from '../../lib/types';

export function Finance() {
  const { org, me } = useCtx();
  const tab = useUI(s => s.finTab), set = useUI(s => s.set);
  return <div className="stack-s fade" style={{ gap: 18 }}>
    <Pills value={tab} options={[[ 'overview', 'Overview'], ['transactions', 'Transactions'], ['budgets', 'Budgets'], ['import', 'Catch up / import']]} onChange={v => set({ finTab: v })} />
    {tab === 'overview' && <Overview />}{tab === 'budgets' && <Budgets />}{tab === 'transactions' && <Transactions />}{tab === 'import' && <FinanceCatchup key={org.id + me} />}
  </div>;
}

function Overview() {
  const { org, top, myDept, m } = useCtx();
  const depts = top ? deptNames(org) : myDept ? [myDept] : [];
  const bars = depts.map(d => ({ d, ...financeTotals(org, d), budget: org.budgets[d] || 0 }));
  const sum = (field: 'paid' | 'committed' | 'income' | 'used') => bars.reduce((n, b) => n + b[field], 0);
  const allocated = bars.reduce((n, b) => n + b.budget, 0);
  const last = org.financeImports?.[0];
  const transactions = (org.financeTransactions || []).filter(t => depts.includes(t.dept));
  const receiptChecks = receiptFollowups(org, depts);
  const linked = new Set(transactions.map(t => t.requestId));
  const missingRequests = org.requests.filter(r => r.status === 'bought' && !r.receipt && depts.includes(r.dept) && !linked.has(r.id));
  const categories: Record<string, number> = {};
  transactions.filter(t => t.kind === 'expense' || t.kind === 'refund').forEach(t => { categories[t.category] = (categories[t.category] || 0) - t.amountCents; });
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  return <div className="stack-s" style={{ gap: 18 }}>
    {top && !last && <section className="callout-p stack-s"><div className="title20">Already building? Bring your finances with you.</div><div>Import a bank CSV or your team’s spending sheet. Review once, then see the same figures on Home, budgets and purchase approvals.</div><button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => useUI.getState().set({ finTab: 'import' })}>Catch up my team</button></section>}
    <div className="g4">{[[m(sum('paid')), 'Spent, net of refunds'], [m(sum('committed')), 'Approved, not yet paid'], [m(allocated - sum('used')), 'Allocated budget remaining'], [m(sum('income')), 'Imported income']].map(([value, label]) => <div className="card stat" key={label}><div className="v">{value}</div><div className="small muted">{label}</div></div>)}</div>
    <div className="small muted">Remaining budget includes approved commitments and is not a bank balance. Income does not automatically increase budget. {top && org.termBudget !== allocated ? `${m(org.termBudget - allocated)} of the team budget is unallocated.` : ''}</div>
    <div className="g2">
      <section className="card pad stack-s" style={{ gap: 16 }}><div className="b800">Your season by department</div>{bars.map(b => <div key={b.d} className="stack-s" style={{ gap: 6 }}><div className="hstack" style={{ justifyContent: 'space-between' }}><b>{b.d}</b><span className="small">{m(b.used)} of {m(b.budget)} used{b.used > b.budget ? ' · over budget' : b.budget > 0 && b.used / b.budget > .85 ? ' · close to budget' : ''}</span></div><Bar used={Math.max(0, b.used)} total={b.budget} color={deptColor(org, b.d)} /><div className="small muted">{m(b.paid)} spent · {m(b.committed)} approved but unpaid</div></div>)}<div className="inset small">Calculated from earlier spending, imported payments and purchase requests. Linked payments are counted once. Refunds reduce spending; transfers do not use budget.</div></section>
      <section className="card pad stack-s"><div className="b800">What still needs your attention</div>{!receiptChecks.length && !missingRequests.length && <div className="small muted">No missing-receipt checks from the records available.</div>}{receiptChecks.slice(0, 6).map(t => <div className="inset small" key={t.id}>Check receipt · {t.description} · {m(-t.amountCents / 100)} · {t.dept}</div>)}{missingRequests.slice(0, 6).map(r => <button className="btn btn-ghost" key={r.id} onClick={() => useUI.getState().set({ reqId: r.id })}>Missing receipt · {r.item}</button>)}{receiptChecks.length > 0 && <button className="btn btn-secondary" onClick={() => useUI.getState().set({ finTab: 'transactions' })}>Review transactions ({receiptChecks.length} receipt checks)</button>}<div className="small muted">A CSV’s “receipt present” flag is a declaration, not an uploaded receipt.</div></section>
    </div>
    {last && <section className="card pad stack-s"><div className="hstack"><b>Latest catch-up</b><span className="small muted">{last.file} · {when(last.at)}</span></div><div>{last.saved} transactions saved · {last.excluded} excluded · {last.linked} requests linked</div><div className="small muted">Imported dates: {last.from} to {last.through}. This describes the file’s records, not a guarantee that every team payment is included.</div>{top && <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => useUI.getState().set({ finTab: 'import' })}>Add the next export</button>}</section>}
    {!!sorted.length && <section className="card pad stack-s"><b>Imported spending by category, net of refunds</b>{sorted.map(([category, cents]) => <div className="hstack" key={category} style={{ justifyContent: 'space-between' }}><span>{category}</span><b>{m(cents / 100)}</b></div>)}</section>}
    {!!org.imports.length && <details className="card pad"><summary>Earlier demo bank summaries ({org.imports.length})</summary><p className="small muted">The old importer stored summaries without transaction records. Those summaries are not added to spending. Upload the original CSV through Catch up to reconcile them.</p></details>}
  </div>;
}

function Transactions() {
  const { org, top, myDept, m } = useCtx();
  const [query, setQuery] = useState(''), [department, setDepartment] = useState('all'), [receiptOnly, setReceiptOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<FinanceTransaction>();
  const depts = top ? deptNames(org) : myDept ? [myDept] : [];
  const checks = new Set(receiptFollowups(org, depts).map(t => t.id));
  const list = (org.financeTransactions || []).filter(t => depts.includes(t.dept) && (department === 'all' || t.dept === department) && (!receiptOnly || checks.has(t.id)) && [t.description, t.reference, t.project, t.category].join(' ').toLowerCase().includes(query.toLowerCase())).slice().sort((a, b) => b.date.localeCompare(a.date));
  const pages = Math.max(1, Math.ceil(list.length / 50)), current = Math.min(page, pages - 1);
  return <section className="card pad stack-s"><div className="hstack"><div className="title20">Your transaction history</div>{top && <button className="btn btn-secondary" onClick={() => useUI.getState().set({ finTab: 'import' })}>Import more records</button>}</div><div className="inventory-grid"><label className="field">Search transactions<input className="input" type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} placeholder="Supplier, reference, project…" /></label><label className="field">Department<select className="input" value={department} onChange={e => { setDepartment(e.target.value); setPage(0); }}><option value="all">All visible departments</option>{depts.map(d => <option key={d}>{d}</option>)}</select></label></div><label className="small"><input type="checkbox" checked={receiptOnly} onChange={e => { setReceiptOnly(e.target.checked); setPage(0); }} /> Only receipts needing a check</label>
    <div className="inventory-table"><table className="tx"><thead><tr><th>Date</th><th>Payment</th><th>Department</th><th>Type</th><th>Amount</th><th>Receipt</th><th>Source / actions</th></tr></thead><tbody>{list.slice(current * 50, current * 50 + 50).map(t => <tr key={t.id}><td>{t.date}</td><td><b>{t.description}</b><div className="small muted">{t.category}{t.project ? ' · ' + t.project : ''}{t.reference ? ' · ' + t.reference : ''}</div>{t.requestId && <button className="btn btn-ghost btn-sm" onClick={() => useUI.getState().set({ reqId: t.requestId })}>{t.requestId}</button>}</td><td>{t.dept}</td><td>{t.kind}</td><td className="mono">{m(t.amountCents / 100)}</td><td>{t.kind === 'expense' ? checks.has(t.id) ? 'Needs checking' : 'Marked present' : '—'}</td><td>{org.financeImports?.find(i => i.id === t.importId)?.file}<div className="small muted">Record {t.sourceRow}</div><button className="btn btn-ghost btn-sm" aria-label={`Update details for ${t.description}`} onClick={() => setEditing(t)}>Update details</button></td></tr>)}</tbody></table></div>
    {!list.length && <div className="empty">No matching transactions. Import your bank export or spending sheet to begin.</div>}<div className="hstack"><button className="btn btn-secondary" disabled={!current} onClick={() => setPage(current - 1)}>Previous</button><span className="small">{list.length} transactions · page {current + 1} of {pages}</span><button className="btn btn-secondary" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></div>
    {top && !!org.financeImports?.length && <details><summary>Import history</summary>{org.financeImports.map(i => <div key={i.id} className="inset small" style={{ marginTop: 8 }}>{i.file} · {i.source === 'bank' ? 'Bank export' : 'Spending sheet'} · {i.saved} saved / {i.excluded} excluded / {i.read} read · {i.from} to {i.through} · {when(i.at)}{i.baseline === 'replace' && <div>Replaced earlier-spending summary ({m(Object.values(i.previousBaseSpend || {}).reduce((a, b) => a + b, 0))}).</div>}</div>)}</details>}
    {editing && <TransactionDetails transaction={editing} departments={depts} onClose={() => setEditing(undefined)} />}
  </section>;
}

function TransactionDetails({ transaction, departments, onClose }: { transaction: FinanceTransaction; departments: string[]; onClose: () => void }) {
  const { org, me, m } = useCtx();
  const request = org.requests.find(r => r.id === transaction.requestId);
  const [details, setDetails] = useState<FinanceTransactionDetails>({ dept: transaction.dept, category: transaction.category, project: transaction.project, receipt: request?.receipt ? 'present' : transaction.receipt });
  const [error, setError] = useState('');
  const save = () => {
    try {
      saveOrganisation(org.id, current => updateFinanceDetails(current, transaction.id, details, me, Date.now()));
      useUI.getState().say('Transaction details updated across your workspace.'); onClose();
    } catch (e) { setError((e as Error).message); }
  };
  return <Dialog label="Update transaction details" onClose={onClose} width={520}>
    <div className="title20">{transaction.description}</div><div className="small muted">{transaction.date} · {m(transaction.amountCents / 100)} · {transaction.kind}</div>
    <label className="field">Transaction department<select className="input" disabled={!!transaction.requestId} value={details.dept} onChange={e => setDetails({ ...details, dept: e.target.value })}>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
    {transaction.requestId && <div className="small muted">Department follows linked request {transaction.requestId}.</div>}
    <label className="field">Transaction category<input className="input" value={details.category} onChange={e => setDetails({ ...details, category: e.target.value })} /></label>
    <label className="field">Transaction project<input className="input" value={details.project} onChange={e => setDetails({ ...details, project: e.target.value })} /></label>
    {transaction.kind === 'expense' && <label className="field">Transaction receipt status<select className="input" value={details.receipt} disabled={!!request?.receiptImg} onChange={e => setDetails({ ...details, receipt: e.target.value as FinanceTransaction['receipt'] })}><option value="unknown">Not checked</option><option value="missing">Missing</option><option value="present">I have the receipt</option></select></label>}
    <div className="small muted">Receipt status records your confirmation, not an uploaded image. Department corrections update spending and approval context immediately.</div>
    {!!transaction.detailsHistory?.length && <details><summary>Previous changes ({transaction.detailsHistory.length})</summary>{transaction.detailsHistory.map((change, i) => <div className="small inset" key={i}>{new Date(change.at).toLocaleString()} · {org.people.find(p => p.id === change.by)?.name || change.by}<div>{change.before.dept} → {change.after.dept} · receipt: {change.before.receipt} → {change.after.receipt}</div></div>)}</details>}
    {error && <div className="err" role="alert">{error}</div>}<div className="hstack"><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save transaction details</button></div>
  </Dialog>;
}

function Budgets() {
  const { org, me, top, m } = useCtx();
  const [error, setError] = useState('');
  const updateBudget = (input: HTMLInputElement, department?: string) => {
    try {
      const amount = moneyCents(input.value, 'dot', false) / 100;
      saveOrganisation(org.id, current => {
        if (!isTop(current, me)) throw new Error('Only team leaders can change budgets.');
        if (department) current.budgets[department] = amount; else current.termBudget = amount;
      });
      setError('');
    } catch (e) { setError((e as Error).message); input.value = String(department ? org.budgets[department] || 0 : org.termBudget); }
  };
  const depts = deptNames(org);
  const alloc = depts.reduce((a, d) => a + (org.budgets[d] || 0), 0), un = org.termBudget - alloc;
  return <section className="card pad stack-s" style={{ gap: 14, maxWidth: 640 }}>
    <div className="title20">Split the {m(org.termBudget)} term budget</div><div className="small muted">Budget used includes paid spending and approved commitments. Budgets guide decisions; they never block a request.</div>
    <label className="field">Term budget<input key={org.termBudget} className="input" inputMode="decimal" defaultValue={String(org.termBudget)} disabled={!top} onBlur={e => updateBudget(e.currentTarget)} /></label>
    {depts.map(d => <div key={d} className="hstack" style={{ flexWrap: 'nowrap' }}><span style={{ width: 12, height: 12, borderRadius: 4, background: deptColor(org, d), flex: 'none' }} /><div style={{ flex: 1 }}><b>{d}</b><div className="small muted">{m(spend(org, d))} used · {m(financeTotals(org, d).committed)} of this is approved but unpaid</div></div><input key={org.budgets[d]} className="input" inputMode="decimal" defaultValue={String(org.budgets[d] || 0)} disabled={!top} style={{ width: 120, textAlign: 'right' }} aria-label={d + ' budget'} onBlur={e => updateBudget(e.currentTarget, d)} /></div>)}
    <div className="small muted">Use decimal points. Changes save when you leave a field.</div>{error && <div className="err" role="alert">{error}</div>}
    <div className="inset small">{un === 0 ? `All ${m(org.termBudget)} is allocated.` : un > 0 ? `${m(un)} not yet allocated.` : `${m(-un)} more than the term budget.`}</div>{!top && <div className="small muted">Only people at the top of the chart can change budgets.</div>}
  </section>;
}
