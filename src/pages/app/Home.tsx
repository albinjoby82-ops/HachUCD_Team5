import { go } from '../../lib/router';
import { useStore, useUI } from '../../lib/store';
import { canSee, deptColor, deptNames, isOpen, nameOf, spend, titleOf, tokens } from '../../lib/org';
import { clusterOf, holding, itemState } from '../../lib/cluster';
import { DAY_MS, plural } from '../../lib/format';
import { Bar, Chip, Section } from '../../components/ui';
import { useCtx } from './ctx';
import type { Org, PurchaseRequest } from '../../lib/types';
import { financeTotals, receiptFollowups } from '../../lib/finance';

export function ReqRow({ r, org, m, showCost }: { r: PurchaseRequest; org: Org; m: (n: number) => string; showCost?: boolean }) {
  const set = useUI(s => s.set);
  return (
    <button className="row" onClick={() => set({ reqId: r.id })}>
      <div className="grow"><div className="t">{r.item}</div>
        <div className="small muted">{nameOf(org, r.byId)} · {r.dept}{isOpen(r) ? ' · with ' + nameOf(org, r.holderId) : ''}{r.flag && isOpen(r) ? ' · ⚑ flagged' : ''}</div></div>
      <Chip s={r.status} />
      {showCost && <span style={{ minWidth: 72, textAlign: 'right', fontWeight: 600 }}>{m(r.cost)}</span>}
    </button>
  );
}

export function Home() {
  const { org, me, meName, top, lead, myDept, m, mut, log } = useCtx();
  const orgs = useStore(s => s.orgs), borrows = useStore(s => s.borrows), clusters = useStore(s => s.clusters);
  const ui = useUI();
  const mods = org.modules;
  const visible = org.requests.filter(r => canSee(org, r, me));
  const waiting = visible.filter(r => isOpen(r) && r.holderId === me);
  const mine = org.requests.filter(r => r.byId === me);
  const held = holding(org, me, orgs, borrows);
  const depts = top ? deptNames(org) : myDept ? [myDept] : [];
  const bars = depts.map(d => ({ d, sp: spend(org, d), b: org.budgets[d] || 0 }));
  const tb = bars.reduce((a, x) => a + x.b, 0), ts = bars.reduce((a, x) => a + x.sp, 0);
  const missing = org.requests.filter(r => r.status === 'bought' && !r.receipt);
  const flagged = visible.filter(r => r.flag && isOpen(r));
  const overdue = org.items.filter(i => itemState(i) === 'overdue');

  // Setup checklist for a freshly registered team.
  const checklist = [
    { done: org.nodes.length > 1, text: 'Build your chart', go: () => go('/app/team') },
    { done: org.people.length > 1, text: 'Invite your people', go: () => go('/app/settings') },
    { done: org.requests.length > 0, text: 'Make the first purchase request', go: () => go('/app/new'), on: mods.finance },
    { done: org.items.length > 0, text: 'Add something to inventory', go: () => go('/app/inventory'), on: mods.inventory },
    { done: !!org.clusterId, text: 'Join a cluster to borrow from nearby teams', go: () => go('/app/cluster'), on: mods.cluster },
    { done: !!org.financeImports?.length, text: 'Catch up your team finances', go: () => { ui.set({ finTab: 'import' }); go('/app/finance'); }, on: mods.finance },
  ].filter(c => c.on !== false);
  const showChecklist = top && !org.demo && checklist.some(c => !c.done);

  // Suggestions are computed from records; never invented.
  const recent = org.requests.filter(r => r.dept === myDept && Date.now() - r.createdAt < 31 * DAY_MS);
  const counts = new Map<string, PurchaseRequest[]>();
  recent.forEach(r => new Set(tokens(r.item)).forEach(t => counts.set(t, [...(counts.get(t) || []), r])));
  const repeat = [...counts.entries()].filter(([, rs]) => rs.length >= 2).sort((a, b) => b[1].length - a[1].length)[0];
  const stock = org.items.find(i => i.status === 'available' && i.qty >= 10 && i.dept === myDept && recent.some(r => tokens(r.item).some(t => i.name.toLowerCase().includes(t))));
  const suggestion = lead && repeat
    ? `${myDept} has asked for ${repeat[1][0].item.replace(/\s*[×x]\s*\d+.*$/i, '').replace(/\(.*\)/, '').trim()} ${repeat[1].length} times this month (${repeat[1].map(r => r.id).join(', ')}). One bulk order would cost less.`
    : stock ? `There are ${stock.qty} ${stock.name} in ${stock.loc}. Check there before requesting more.` : '';

  const attention = top ? [
    ...(mods.finance && !org.financeImports?.length ? [{ text: 'Joining mid-season?', sub: 'Bring in your bank export or team spending sheet', act: 'Catch up', go: () => { ui.set({ finTab: 'import' }); go('/app/finance'); } }] : []),
    ...(mods.finance && receiptFollowups(org, depts).length ? [{ text: `${receiptFollowups(org, depts).length} imported payments need a receipt check`, sub: 'Review the records from your catch-up', act: 'Review', go: () => { ui.set({ finTab: 'transactions' }); go('/app/finance'); } }] : []),
    ...missing.map(r => ({ text: 'Missing receipt · ' + r.item, sub: nameOf(org, r.byId) + ' · ' + m(r.cost), act: 'Log follow-up', go: () => { mut(o => { const x = o.requests.find(y => y.id === r.id)!; log(x, 'Receipt follow-up recorded for ' + nameOf(org, r.byId)); }); ui.say('Follow-up recorded. The receipt is still missing; no message was sent.'); } })),
    ...flagged.map(r => ({ text: r.flag!, sub: r.id + ' · ' + nameOf(org, r.byId), act: 'View', go: () => ui.set({ reqId: r.id }) })),
    ...overdue.map(i => ({ text: i.name + ' is overdue', sub: 'With ' + (i.holderName || nameOf(org, i.holderId)), act: 'View', go: () => go('/app/inventory') })),
  ] : [];

  return (
    <div className="stack fade">
      <section className="hero">
        <span className="s1" /><span className="s2" /><span className="s3" />
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <div className="hi">Hi {meName}</div>
          <div style={{ fontSize: 17, fontWeight: 600, opacity: .92, marginTop: 6 }}>{waiting.length ? plural(waiting.length, 'request') + (waiting.length === 1 ? ' needs' : ' need') + ' your decision.' : titleOf(org, me) + ' · ' + org.name + (org.seasonStart ? ' · Week ' + (Math.floor((Date.now() - org.seasonStart) / (7 * 86_400_000)) + 1) : '')}</div>
        </div>
        {mods.finance && <button className="btn btn-white" style={{ position: 'relative', padding: '12px 22px' }} onClick={() => go('/app/new')}>+ New request</button>}
      </section>

      <div className="g2">
        <div className="stack">
          {showChecklist && <Section title={<>Get {org.name} going <span className="tag" style={{ marginLeft: 6 }}>{checklist.filter(c => c.done).length}/{checklist.length}</span></>}>
            {checklist.map(c => <div key={c.text} className="row" style={{ padding: '10px 14px' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900, background: c.done ? 'var(--ok-bg)' : 'var(--soft)', color: c.done ? 'var(--ok)' : 'var(--muted)' }}>{c.done ? '✓' : ''}</span>
              <span className="grow" style={{ textDecoration: c.done ? 'line-through' : 'none', color: c.done ? 'var(--muted)' : 'inherit' }}>{c.text}</span>
              {!c.done && <button className="btn btn-secondary btn-sm" onClick={c.go}>Go</button>}
            </div>)}
          </Section>}
          {lead && mods.finance && <Section title="Waiting for you" action={<button className="btn btn-ghost" onClick={() => { ui.set({ reqFilter: 'all' }); go('/app/requests'); }}>All requests</button>}>
            {waiting.map(r => <ReqRow key={r.id} r={r} org={org} m={m} />)}
            {!waiting.length && <div className="muted" style={{ padding: 14 }}>Nothing waiting on you.</div>}
          </Section>}
          {mods.finance && (!lead || mine.length > 0) && <Section title="My requests" action={<button className="btn btn-ghost" onClick={() => go('/app/new')}>New</button>}>
            {mine.slice(0, 5).map(r => <ReqRow key={r.id} r={r} org={org} m={m} />)}
            {!mine.length && <div className="muted" style={{ padding: 14 }}>No requests yet. Need something? Ask, and it goes straight to the right person.</div>}
          </Section>}
          {attention.length > 0 && <Section title="Worth a look">
            {attention.map((a, i) => <div key={i} className="row" style={{ padding: '12px 14px' }}><div className="grow"><div className="t">{a.text}</div><div className="small muted">{a.sub}</div></div><button className="btn btn-secondary btn-sm" onClick={a.go}>{a.act}</button></div>)}
          </Section>}
        </div>
        <div className="stack">
          {mods.inventory && <Section title="Items you’re holding">
            {held.map(h => <div key={h.key} className="row" style={{ padding: '12px 14px' }}><div className="grow"><div className="t">{h.name}</div><div className="small muted">{h.sub}</div></div><Chip s={h.state} /></div>)}
            {!held.length && <div className="muted" style={{ padding: 14 }}>You’re not holding anything.</div>}
          </Section>}
          {mods.finance && depts.length > 0 && <section className="card pad stack-s" style={{ gap: 16 }}>
            <div><div className="small muted">{top ? org.name : myDept + ' department'}</div><div className="big">{m(tb - ts)}</div><div className="small muted">left of {m(tb)} allocated budget · includes approved commitments · not a bank balance</div><div className="small muted">{m(depts.reduce((n, d) => n + financeTotals(org, d).paid, 0))} spent · {m(depts.reduce((n, d) => n + financeTotals(org, d).committed, 0))} approved but unpaid</div>{!!org.financeImports?.length && <div className="small muted">Financial history imported · latest file through {org.financeImports[0].through}</div>}</div>
            {top && bars.map(x => <div key={x.d} className="stack-s" style={{ gap: 6 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 14 }}><span>{x.d}{x.b && x.sp / x.b > 0.85 ? ' · close to budget' : ''}</span><span className="muted">{m(x.sp)} of {m(x.b)}</span></div>
              <Bar used={x.sp} total={x.b} color={deptColor(org, x.d)} /></div>)}
          </section>}
          {suggestion && <section className="callout-p stack-s" style={{ gap: 6 }}><span className="tiny b800" style={{ color: 'var(--p800)' }}>Suggestion · from your records</span><div>{suggestion}</div></section>}
          {mods.cluster && !clusterOf(clusters, org) && top && <section className="card pad stack-s"><div className="b800">Borrow before you buy</div><div className="small muted">Join a cluster of nearby teams to share tools.</div><button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => go('/app/cluster')}>See clusters</button></section>}
        </div>
      </div>
    </div>
  );
}
