import { useState } from 'react';
import { useUI } from '../../lib/store';
import { alsoIn, chain, departments, isOpen, nameOf, titleOf } from '../../lib/org';
import { plural } from '../../lib/format';
import { FlowChart } from '../../components/FlowChart';
import { Avatar } from '../../components/ui';
import { useCtx } from './ctx';

export function Team() {
  const { org, me, top, mut } = useCtx();
  const ui = useUI();
  const [trace, setTrace] = useState<string | null>(null);
  const depts = departments(org);
  const open = org.requests.filter(isOpen);
  // Open requests whose holder is no longer in the requester's chain after an edit.
  const stale = open.filter(r => r.holderId && !chain(org, r.byId).includes(r.holderId));

  return (
    <div className="stack-s fade" style={{ gap: 16 }}>
      <div className="hstack" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div className="b900" style={{ fontSize: 20 }}>{org.name} chart</div>
          <div className="small muted">{plural(org.nodes.length, 'box', 'boxes')} · {plural(depts.length, 'department')} · {plural(org.people.length, 'person', 'people')}. {top ? 'Edit it live: approvals, budgets and visibility follow immediately.' : 'This chart decides who approves your requests.'}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setTrace(me)}>Trace my route</button>
      </div>
      <FlowChart value={org} height="calc(100vh - 250px)" meId={me} trace={trace} onTrace={setTrace} onToast={ui.say}
        onChange={top ? s => mut(o => { o.nodes = s.nodes; o.people = s.people; }) : undefined}
        onOpenPerson={pid => ui.set({ profileId: pid })} />
      {stale.length > 0 && top && <div className="callout-warn hstack">
        <span style={{ flex: 1 }}>⚑ {plural(stale.length, 'open request')} {stale.length === 1 ? 'is' : 'are'} with someone who’s no longer on that route after your edit.</span>
        <button className="btn btn-secondary btn-sm" onClick={() => { mut(o => { o.requests.forEach(r => { if (isOpen(r) && r.holderId && !chain(o, r.byId).includes(r.holderId)) { const c = chain(o, r.byId); r.holderId = c[0] || null; if (!c.length) r.status = 'approved'; r.trail.push({ who: 'Truly', what: 'Re-routed to ' + (c[0] ? nameOf(o, c[0]) : 'approved') + ' after a chart change', at: Date.now() }); } }); }); ui.say('Re-routed to the new approvers.'); }}>Re-route them</button>
      </div>}
      <div className="g3">
        {[['🧭', 'Routes approvals', 'Requests walk up from the requester’s box, one lead at a time.'], ['💶', 'Scopes budgets', 'Each department box gets its own budget line and spend bar.'], ['👀', 'Controls visibility', 'People see what’s in their chain once it reaches them or is decided.']].map(([i, t, b]) => (
          <div key={t} className="card stat" style={{ padding: 18 }}><div className="b800">{i} {t}</div><div className="small muted" style={{ marginTop: 4 }}>{b}</div></div>))}
      </div>
      <div className="card list">
        <div className="card-head">Everyone</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 4 }}>
          {org.people.map(p => <button key={p.id} className="row" style={{ padding: '10px 12px' }} onClick={() => ui.set({ profileId: p.id })}>
            <Avatar name={p.name} size={32} /><span className="grow"><span className="t">{p.name}{p.id === me ? ' (you)' : ''}</span><br /><span className="tiny muted">{titleOf(org, p.id)}{alsoIn(org, p.id).length ? ' · also ' + alsoIn(org, p.id).join(', ') : ''}{p.invited ? ' · invited' : ''}</span></span></button>)}
        </div>
      </div>
    </div>
  );
}
