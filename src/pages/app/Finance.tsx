import { useMemo, useState } from 'react';
import { useUI } from '../../lib/store';
import { deptColor, deptNames, isOpen, nameOf, spend } from '../../lib/org';
import { analyse, categorise, CATEGORIES, FIELDS, guessMapping, parseCsv, sampleCsv, THRESHOLD, toLines, type Categorised, type Mapping } from '../../lib/csv';
import { uid, when } from '../../lib/format';
import { Bar, Chip, Pills, Section, Steps } from '../../components/ui';
import { useCtx } from './ctx';

export function Finance() {
  const tab = useUI(s => s.finTab), set = useUI(s => s.set);
  return (
    <div className="stack-s fade" style={{ gap: 18 }}>
      <Pills value={tab} options={[['overview', 'Overview'], ['budgets', 'Budgets'], ['import', 'Bank import']]} onChange={v => set({ finTab: v })} />
      {tab === 'overview' && <Overview />}
      {tab === 'budgets' && <Budgets />}
      {tab === 'import' && <Import />}
    </div>
  );
}

function Overview() {
  const { org, top, myDept, m } = useCtx();
  const depts = top ? deptNames(org) : myDept ? [myDept] : [];
  const bars = depts.map(d => ({ d, sp: spend(org, d), b: org.budgets[d] || 0 }));
  const tb = bars.reduce((a, x) => a + x.b, 0), ts = bars.reduce((a, x) => a + x.sp, 0);
  const close = bars.filter(b => b.b && b.sp / b.b > 0.85).map(b => b.d);
  const last = org.imports[0];
  // Summary is a template over computed numbers; a model may rephrase it but never computes.
  const summary = tb ? `Spending is at ${Math.round((ts / tb) * 100)}% of budget across ${bars.length} ${bars.length === 1 ? 'department' : 'departments'}. ` +
    (close.length ? `${close.join(' and ')} ${close.length > 1 ? 'are' : 'is'} close to budget.` : 'No department is close to its budget.') +
    (last ? ` The last bank import had ${last.rows} lines; ${last.matched} matched approved requests and ${last.flags} were flagged.` : '') : 'Set budgets to see how spending is tracking.';
  const missing = org.requests.filter(r => r.status === 'bought' && !r.receipt && depts.includes(r.dept));
  const flags = [
    ...(!org.imports.length ? [{ s: 'pending', text: 'This month’s bank export isn’t imported yet' }] : []),
    ...missing.map(r => ({ s: 'flag', text: `Missing receipt: ${r.item} (${nameOf(org, r.byId)})` })),
    ...org.requests.filter(r => r.flag && isOpen(r) && depts.includes(r.dept)).map(r => ({ s: 'flag', text: r.flag! })),
  ];
  const cats = last ? Object.entries(last.byCategory).sort((a, b) => b[1] - a[1]) : [];
  const maxCat = cats[0]?.[1] || 1;
  return (
    <div className="g2e">
      <section className="card pad stack-s" style={{ gap: 16 }}>
        <div className="b800">Spend by department</div>
        {bars.map(x => <div key={x.d} className="stack-s" style={{ gap: 6 }}>
          <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>{x.d}{x.b && x.sp / x.b > 0.85 ? ' · close to budget' : ''}</span><span className="muted">{m(x.sp)} of {m(x.b)}</span></div>
          <Bar used={x.sp} total={x.b} color={deptColor(org, x.d)} /></div>)}
        <div className="inset stack-s" style={{ gap: 4 }}><span className="tiny b800 muted">AI summary · written from computed totals</span><span style={{ fontSize: 14 }}>{summary}</span></div>
        <div className="tiny muted">Spent = earlier spend this term + approved and bought requests. Budgets guide decisions; they never block a request.</div>
      </section>
      <div className="stack">
        <Section title="Flags">
          {flags.map((f, i) => <div key={i} className="row" style={{ padding: '12px 14px' }}><Chip s={f.s} /><div className="grow" style={{ fontSize: 14 }}>{f.text}</div></div>)}
          {!flags.length && <div className="muted" style={{ padding: 14 }}>No flags right now.</div>}
        </Section>
        {last && <section className="card pad stack-s">
          <div className="hstack"><span className="b800">Last import</span><span className="small muted">{last.file} · {when(last.at)}</span></div>
          <div className="small muted">{last.rows} lines · {m(last.moneyOut)} out · {m(last.moneyIn)} in · {last.rules} by rules · {last.ai} AI · {last.reviewed} reviewed by you</div>
          {cats.slice(0, 6).map(([c, v]) => <div key={c} className="stack-s" style={{ gap: 4 }}><div className="hstack" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>{c}</span><span className="muted">{m(v)}</span></div><Bar used={v} total={maxCat} color="#7c4dff" /></div>)}
        </section>}
      </div>
    </div>
  );
}

function Budgets() {
  const { org, top, m, mut } = useCtx();
  const depts = deptNames(org);
  const alloc = depts.reduce((a, d) => a + (org.budgets[d] || 0), 0), un = org.termBudget - alloc;
  return (
    <section className="card pad stack-s" style={{ gap: 14, maxWidth: 640 }}>
      <div className="hstack" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}><div className="title20">Split the {m(org.termBudget)} term budget</div><div className="small muted">Budgets guide decisions. They never block a request.</div></div>
        <div className="field" style={{ width: 150 }}><label>Term budget</label><input className="input" inputMode="numeric" value={String(org.termBudget)} disabled={!top} onChange={e => { const v = Number(e.target.value.replace(/[^0-9]/g, '')) || 0; mut(o => { o.termBudget = v; }); }} style={{ textAlign: 'right' }} /></div>
      </div>
      {depts.map(d => <div key={d} className="hstack" style={{ padding: '6px 0', flexWrap: 'nowrap' }}>
        <span style={{ width: 12, height: 12, borderRadius: 4, background: deptColor(org, d), flex: 'none' }} />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{d}</div><div className="small muted">{m(spend(org, d))} spent so far</div></div>
        <span className="muted">{org.currency === 'EUR' ? '€' : org.currency === 'GBP' ? '£' : '$'}</span>
        <input className="input" inputMode="numeric" value={String(org.budgets[d] || 0)} disabled={!top} style={{ width: 120, textAlign: 'right' }} aria-label={d + ' budget'}
          onChange={e => { const v = Number(e.target.value.replace(/[^0-9]/g, '')) || 0; mut(o => { o.budgets[d] = v; }); }} />
      </div>)}
      <div style={{ padding: '12px 14px', borderRadius: 14, fontSize: 14, background: un < 0 ? 'var(--warn-bg)' : '#f6f7f9', color: un < 0 ? 'var(--warn)' : '#3c4652' }}>
        {un === 0 ? `All ${m(org.termBudget)} is allocated.` : un > 0 ? `${m(un)} not yet allocated.` : `${m(-un)} more than the term budget.`}</div>
      {!top && <div className="small muted">Only people at the top of the chart can change budgets.</div>}
    </section>
  );
}

function Import() {
  const { org, top, m, mut } = useCtx();
  const say = useUI(s => s.say), set = useUI(s => s.set);
  const [step, setStep] = useState(1);
  const [file, setFile] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [map, setMap] = useState<Mapping | null>(null);
  const [cat, setCat] = useState<Record<number, string>>({});
  const [ok, setOk] = useState<Record<number, boolean>>({});
  const [res, setRes] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ rows: number } | null>(null);

  const load = (text: string, name: string) => {
    const r = parseCsv(text);
    if (r.length < 2) return say('That file has no rows.');
    setRows(r); setFile(name); setMap(guessMapping(r[0])); setCat({}); setOk({}); setRes({}); setStep(2);
  };
  const lines: Categorised[] = useMemo(() => (map && step >= 3 ? categorise(toLines(rows, map)) : []), [rows, map, step]);
  const { flags, matches } = useMemo(() => analyse(lines, org, m), [lines, org]);
  const review = lines.filter(l => l.confidence < THRESHOLD);
  const rules = lines.filter(l => l.source === 'rule').length, ai = lines.length - rules - review.length;
  const left = review.filter(l => !ok[l.i]).length + flags.filter(f => !res[f.key]).length;

  const doImport = () => {
    const dupLines = new Set(flags.filter(f => f.kind === 'dup' && res[f.key] === 'Mark duplicate').map(f => f.lineIdx[1]));
    const kept = lines.filter(l => !dupLines.has(l.i));
    const byCategory: Record<string, number> = {};
    kept.forEach(l => { if (l.amount < 0) { const c = cat[l.i] || l.category; byCategory[c] = Math.round(((byCategory[c] || 0) - l.amount) * 100) / 100; } });
    const chased = flags.filter(f => f.kind === 'receipt' && res[f.key]?.startsWith('Chase'));
    mut(o => {
      o.imports.unshift({ id: uid('imp'), at: Date.now(), file, rows: kept.length, rules, ai, reviewed: review.length, matched: matches.length, flags: flags.length,
        moneyOut: Math.round(kept.filter(l => l.amount < 0).reduce((a, l) => a - l.amount, 0) * 100) / 100, moneyIn: Math.round(kept.filter(l => l.amount > 0).reduce((a, l) => a + l.amount, 0) * 100) / 100, byCategory });
      chased.forEach(f => { const id = f.key.replace('receipt', ''); const r = o.requests.find(x => x.id === id); if (r) r.trail.push({ who: 'Bank import', what: 'Receipt requested from ' + nameOf(o, r.byId), at: Date.now() }); });
    });
    setResult({ rows: kept.length }); setStep(4); say('Import complete.');
  };

  if (!top) return <section className="card pad small muted">Only people at the top of the chart can import bank exports.</section>;

  return (
    <div className="stack-s" style={{ gap: 18, maxWidth: 860 }}>
      <Steps n={4} cur={step} />
      {step === 1 && <section className="card stack-s" style={{ padding: '48px 32px', alignItems: 'center', textAlign: 'center', gap: 14 }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--p100)', display: 'grid', placeItems: 'center', fontSize: 28 }}>🏦</div>
        <div className="title26">Drop in your bank export</div>
        <div className="muted" style={{ maxWidth: 440 }}>Known payees are matched by rules. Unclear lines get an AI suggestion with a confidence score. Anything under {THRESHOLD * 100}% sure comes to you.</div>
        <div className="hstack" style={{ justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => load(sampleCsv(), 'sample-september.csv')}>Use sample CSV (150 rows)</button>
          <label className="btn btn-secondary">Upload a CSV<input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={async e => { const f = e.target.files?.[0]; if (f) load(await f.text(), f.name); }} /></label>
          <button className="btn btn-ghost" onClick={() => { const b = new Blob([sampleCsv()], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'sample-bank-export.csv'; a.click(); }}>Download sample</button>
        </div>
      </section>}

      {step === 2 && map && <section className="card pad stack-s">
        <div className="title20">These columns look right?</div>
        <div className="small muted">{file} · {rows.length - 1} rows. We guessed the mapping from the headers. Change anything that’s off.</div>
        {FIELDS.map(fd => <div key={fd.key} className="inset hstack" style={{ flexWrap: 'wrap' }}>
          <span className="tag">{fd.label}</span><span style={{ color: 'var(--faint)' }}>←</span>
          <select className="input white" style={{ width: 200, minHeight: 36 }} value={map[fd.key]} onChange={e => setMap({ ...map, [fd.key]: Number(e.target.value) })}>
            <option value={-1}>— not in file —</option>{rows[0].map((h, i) => <option key={i} value={i}>{h || 'Column ' + (i + 1)}</option>)}</select>
          <span className="small mono muted" style={{ marginLeft: 'auto' }}>{map[fd.key] >= 0 ? rows[1][map[fd.key]] || '(blank)' : ''}</span>
        </div>)}
        {(map.date < 0 || map.desc < 0 || (map.amount < 0 && map.out < 0 && map.in < 0)) && <div className="callout-warn">Map at least a date, a description and an amount column.</div>}
        <div className="hstack" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={() => setStep(1)}>Cancel</button>
          <button className="btn btn-primary" disabled={map.date < 0 || map.desc < 0 || (map.amount < 0 && map.out < 0 && map.in < 0)} onClick={() => setStep(3)}>Looks good</button></div>
      </section>}

      {step === 3 && <>
        <div className="g3">{[[rules, 'matched by rules'], [ai, `AI-categorised (${THRESHOLD * 100}%+ sure)`], [review.filter(l => !ok[l.i]).length, 'need your review']].map(([v, l]) =>
          <div key={l} className="card stat"><div className="v">{v}</div><div className="small muted">{l}</div></div>)}</div>
        <section className="card stack-s" style={{ padding: 20, gap: 10 }}>
          <div className="hstack"><span className="b800">Needs review · AI suggestions</span>
            {review.length > 3 && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setOk(Object.fromEntries(review.map(l => [l.i, true])))}>Accept all suggestions</button>}</div>
          {review.map(l => { const c = cat[l.i] || l.category, done = ok[l.i]; return (
            <div key={l.i} className="inset hstack" style={{ padding: '10px 12px' }}>
              <div style={{ flex: 1, minWidth: 160 }}><div className="mono" style={{ fontSize: 13 }}>{l.payee}</div><div className="tiny muted">{l.date} · {m(l.amount)} · suggestion {Math.round(l.confidence * 100)}% sure · {l.reason}</div></div>
              <select className="input white" style={{ width: 180, minHeight: 38 }} value={c} aria-label="Category" onChange={e => { setCat({ ...cat, [l.i]: e.target.value }); setOk({ ...ok, [l.i]: true }); }}>{CATEGORIES.map(x => <option key={x}>{x}</option>)}</select>
              <button className={'btn btn-sm ' + (done ? 'btn-primary' : 'btn-secondary')} onClick={() => setOk({ ...ok, [l.i]: true })}>{done ? '✓ Confirmed' : 'Confirm'}</button>
            </div>); })}
          {!review.length && <div className="small muted">Nothing to review. Every line was matched confidently.</div>}
        </section>
        <section className="card stack-s" style={{ padding: 20, gap: 10 }}>
          <div className="b800">Flags</div>
          {flags.map(f => <div key={f.key} className="inset hstack" style={{ padding: '10px 12px' }}>
            <div style={{ flex: 1, minWidth: 180 }}><div className="tiny b800 muted">{f.type}</div><div style={{ fontSize: 14 }}>{f.text}</div></div>
            {f.opts.map(o => <button key={o} className={'btn btn-sm ' + (res[f.key] === o ? 'btn-primary' : 'btn-secondary')} onClick={() => setRes({ ...res, [f.key]: o })}>{res[f.key] === o ? '✓ ' : ''}{o}</button>)}
          </div>)}
          {!flags.length && <div className="small muted">No flags.</div>}
          <div className="small muted">{matches.length} bank {matches.length === 1 ? 'line' : 'lines'} matched to approved requests{matches.length ? ': ' + matches.map(x => x.reqId).join(', ') : ''}.</div>
        </section>
        <div className="hstack" style={{ justifyContent: 'flex-end' }}><span className="small muted" style={{ marginRight: 'auto' }}>{left ? left + ' left to check' : 'All checked'}</span>
          <button className="btn btn-ghost" onClick={() => setStep(1)}>Cancel</button>
          <button className="btn btn-primary" disabled={left > 0} onClick={doImport}>Import {lines.length} transactions</button></div>
      </>}

      {step === 4 && result && <section className="card stack-s" style={{ padding: '48px 32px', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--p-h)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 28 }}>✓</div>
        <div className="title26">{result.rows} transactions imported</div>
        <div className="muted">Dashboards and flags are up to date.</div>
        <button className="btn btn-primary" onClick={() => set({ finTab: 'overview' })}>See overview</button>
      </section>}
    </div>
  );
}
