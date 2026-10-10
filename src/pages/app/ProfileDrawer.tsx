import { useStore, useUI } from '../../lib/store';
import { chain, leadsOf, nameOf, personById, titleOf } from '../../lib/org';
import { holding } from '../../lib/cluster';
import { Avatar, Chip, Drawer } from '../../components/ui';
import { useCtx } from './ctx';

export function ProfileDrawer({ pid }: { pid: string }) {
  const { org, me, top, mut } = useCtx();
  const orgs = useStore(s => s.orgs), borrows = useStore(s => s.borrows), setViewAs = useStore(s => s.setViewAs);
  const ui = useUI();
  const p = personById(org, pid);
  const close = () => ui.set({ profileId: null });
  if (!p) return null;
  const held = holding(org, pid, orgs, borrows);
  const reqs = org.requests.filter(r => r.byId === pid);
  const route = chain(org, pid);
  const move = (nodeId: string) => {
    const lead = !leadsOf(org, nodeId).length;
    mut(o => { const x = o.people.find(y => y.id === pid)!; x.nodeId = nodeId; x.lead = lead; });
    const n = org.nodes.find(x => x.id === nodeId)!;
    ui.say(`${p.name} now ${lead ? 'leads ' + n.title : 'sits under ' + (leadsOf(org, nodeId)[0]?.name || n.title)}.`);
  };
  return (
    <Drawer onClose={close} label="Profile" width={420}>
      <div className="hstack" style={{ flexWrap: 'nowrap', gap: 14 }}>
        <Avatar name={p.name} size={64} />
        <div style={{ flex: 1 }}><div className="b900" style={{ fontSize: 22 }}>{p.name}</div><div className="muted">{titleOf(org, pid)}</div>{p.email && <div className="tiny muted mono">{p.email}</div>}</div>
        <button className="x" onClick={close} aria-label="Close">✕</button>
      </div>
      {p.invited && <div className="callout-warn">✉ Invited, hasn’t joined yet. Their route is ready.</div>}
      <div className="inset small"><b>Approval route:</b> {route.length ? route.map(id => nameOf(org, id)).join(' → ') : 'top of the chart · approved straight away'}</div>
      {top && <div className="field"><label>Box (reports to)</label>
        <select className="input" value={p.nodeId} onChange={e => move(e.target.value)}>
          {org.nodes.map(n => <option key={n.id} value={n.id}>{n.title}{leadsOf(org, n.id)[0] && leadsOf(org, n.id)[0].id !== pid ? ' · ' + leadsOf(org, n.id)[0].name : ''}</option>)}
        </select><span className="tiny muted">Keyboard-friendly alternative to dragging on the chart.</span></div>}
      <div><div className="b800" style={{ marginBottom: 6 }}>Holding</div>
        {held.map(h => <div key={h.key} className="hstack" style={{ justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}><span>{h.name} <span className="muted">· {h.sub}</span></span><Chip s={h.state} /></div>)}
        {!held.length && <div className="small muted">Nothing right now.</div>}</div>
      <div><div className="b800" style={{ marginBottom: 6 }}>Requests</div>
        {reqs.map(r => <button key={r.id} className="row" style={{ padding: '6px 8px', fontSize: 14 }} onClick={() => ui.set({ profileId: null, reqId: r.id })}><span className="grow">{r.item}</span><Chip s={r.status} /></button>)}
        {!reqs.length && <div className="small muted">No requests yet.</div>}</div>
      {pid !== me && <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => { setViewAs(org.id, pid); ui.set({ profileId: null }); ui.say('Now viewing as ' + p.name + '.'); }}>Demo: view the app as {p.name}</button>}
    </Drawer>
  );
}
