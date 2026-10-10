import { useState } from 'react';
import { useStore, useUI } from '../../lib/store';
import { approversFor, canLend, clusterOf, holderText, itemState } from '../../lib/cluster';
import { daysFromNow, dueText, uid } from '../../lib/format';
import { nameOf } from '../../lib/org';
import { Chip, Dialog } from '../../components/ui';
import { useCtx } from './ctx';
import type { Org } from '../../lib/types';

const shortName = (o?: Org) => (o ? o.name.split(' ')[0] : 'another team');

export function ClusterPage() {
  const { org, me, top, m: _m } = useCtx();
  const orgs = useStore(s => s.orgs), clusters = useStore(s => s.clusters), borrows = useStore(s => s.borrows), mutAll = useStore(s => s.mutAll);
  const ui = useUI();
  const [newName, setNewName] = useState('');
  const c = clusterOf(clusters, org);

  if (!c) return (
    <div className="stack fade">
      <section className="callout-p stack-s"><div className="title20">Borrow before you buy</div><div>A cluster is a group of nearby teams that lend each other tools. You choose exactly which items to share; everything else stays private to {org.name}.</div></section>
      <div className="card list">
        {clusters.map(x => <div key={x.id} className="row"><div className="thumb">🏢</div><div className="grow"><div className="t">{x.name}</div><div className="small muted">{x.orgIds.map(id => orgs.find(o => o.id === id)?.name).filter(Boolean).join(' · ')}</div></div>
          <button className="btn btn-primary btn-sm" disabled={!top} onClick={() => { mutAll(d => { d.clusters.find(y => y.id === x.id)!.orgIds.push(org.id); d.orgs.find(o => o.id === org.id)!.clusterId = x.id; }); ui.say('Joined ' + x.name + '.'); }}>Join</button></div>)}
      </div>
      {top && <div className="card pad hstack"><div className="field" style={{ flex: 1, minWidth: 200 }}><label>Or start a new cluster</label><input className="input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Science West cluster" /></div>
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-end' }} onClick={() => { if (!newName.trim()) return; const id = uid('cl-'); mutAll(d => { d.clusters.push({ id, name: newName.trim(), orgIds: [org.id] }); d.orgs.find(o => o.id === org.id)!.clusterId = id; }); ui.say('Cluster created. Invite nearby teams from Settings.'); }}>Create</button></div>}
      {!top && <div className="small muted">Ask someone at the top of your chart to join a cluster.</div>}
    </div>
  );

  const members = c.orgIds.map(id => orgs.find(o => o.id === id)).filter(Boolean) as Org[];
  const incoming = borrows.filter(b => b.ownerOrgId === org.id && b.status === 'requested');
  const approve = (bid: string, yes: boolean) => {
    const b = borrows.find(x => x.id === bid)!, it = org.items.find(i => i.id === b.itemId)!, bo = orgs.find(o => o.id === b.borrowerOrgId);
    mutAll(d => {
      const x = d.borrows.find(y => y.id === bid)!; x.status = yes ? 'active' : 'declined';
      if (yes) { const i = d.orgs.find(o => o.id === org.id)!.items.find(y => y.id === b.itemId)!; Object.assign(i, { status: 'borrowed', holderName: `${b.borrowerName} (${shortName(bo)})`, holderId: undefined, due: b.until }); }
    });
    ui.say(yes ? `Approved. ${it.name} is with ${b.borrowerName} until ${dueText(b.until)}.` : `Declined. ${b.borrowerName} has been told.`);
  };
  const ownerApprove = (bid: string) => {
    const b = borrows.find(x => x.id === bid)!, owner = orgs.find(o => o.id === b.ownerOrgId)!;
    mutAll(d => {
      d.borrows.find(y => y.id === bid)!.status = 'active';
      const i = d.orgs.find(o => o.id === owner.id)!.items.find(y => y.id === b.itemId)!;
      Object.assign(i, { status: 'borrowed', holderName: `${b.borrowerName} (${shortName(org)})`, holderId: undefined, due: b.until });
    });
    ui.say(`${owner.name} approved. It’s yours until ${dueText(b.until)}.`);
  };
  const giveBack = (bid: string) => {
    const b = borrows.find(x => x.id === bid)!;
    mutAll(d => {
      d.borrows.find(y => y.id === bid)!.status = 'returned';
      const i = d.orgs.find(o => o.id === b.ownerOrgId)!.items.find(y => y.id === b.itemId)!;
      Object.assign(i, { status: 'available', holderName: undefined, due: undefined });
    });
    ui.say('Returned. Thanks!');
  };

  const others = members.filter(o => o.id !== org.id).flatMap(o => o.items.filter(i => i.shared).map(i => ({ o, i })));
  return (
    <div className="stack-s fade" style={{ gap: 20 }}>
      <div className="stack-s" style={{ gap: 4 }}><div className="b900" style={{ fontSize: 22 }}>{c.name}</div><div className="muted">{members.map(o => o.name).join(' · ')}</div></div>
      {incoming.map(b => {
        const it = org.items.find(i => i.id === b.itemId); if (!it) return null;
        const ap = approversFor(org, it), can = canLend(org, it, me), bo = orgs.find(o => o.id === b.borrowerOrgId);
        return <section key={b.id} className="callout-p hstack" style={{ gap: 14 }}>
          <div style={{ flex: 1, minWidth: 220 }}><div className="b800">{b.borrowerName} ({bo?.name}) wants your {it.name.toLowerCase()}, until {dueText(b.until)}</div>
            <div className="small" style={{ color: 'var(--p800)' }}>{ap.leads.length ? `${ap.leads.map(id => nameOf(org, id)).join(', ')} approves because it belongs to ${it.dept}.` : 'Anyone at the top of the chart can approve.'}{!can ? ' You can see this, but it’s not your call.' : ''}</div></div>
          <button className="btn btn-primary" disabled={!can} onClick={() => approve(b.id, true)}>Approve</button>
          <button className="btn btn-secondary" disabled={!can} onClick={() => approve(b.id, false)}>Decline</button>
        </section>;
      })}
      <div className="card list">
        {others.map(({ o, i }) => {
          const mineReq = borrows.find(b => b.ownerOrgId === o.id && b.itemId === i.id && b.status === 'requested' && b.borrowerOrgId === org.id);
          const anyReq = borrows.find(b => b.ownerOrgId === o.id && b.itemId === i.id && b.status === 'requested');
          const mineActive = borrows.find(b => b.ownerOrgId === o.id && b.itemId === i.id && b.status === 'active' && b.borrowerOrgId === org.id);
          const state = mineReq ? 'requested' : itemState(i);
          const text = mineReq ? `Requested by ${mineReq.borrowerName} · waiting on ${o.name}’s captain` : i.status === 'borrowed' ? holderText(o, i) : anyReq ? 'Someone else has asked for it' : 'Free to borrow · ' + i.loc;
          return <div key={o.id + i.id} className="row" style={{ flexWrap: 'wrap' }}>
            <div className="thumb">🔧</div>
            <div style={{ flex: 1, minWidth: 160 }}><div className="t">{i.name}</div><div className="small muted">{o.name}</div></div>
            <div className="small muted" style={{ minWidth: 180 }}>{text}</div>
            <Chip s={state} />
            {mineReq ? <button className="btn btn-secondary btn-sm" onClick={() => ownerApprove(mineReq.id)} title="Prototype shortcut: approve on the other team’s behalf">Simulate their approval</button>
              : mineActive && mineActive.borrowerPersonId === me ? <button className="btn btn-secondary btn-sm" onClick={() => giveBack(mineActive.id)}>Mark returned</button>
                : i.status === 'available' && !anyReq ? <button className="btn btn-primary btn-sm" onClick={() => ui.set({ borrow: { orgId: o.id, itemId: i.id } })}>Borrow</button>
                  : <button className="btn btn-secondary btn-sm" disabled>Busy</button>}
          </div>;
        })}
        {org.items.filter(i => i.shared).map(i => <div key={i.id} className="row" style={{ flexWrap: 'wrap' }}>
          <div className="thumb">🏠</div>
          <div style={{ flex: 1, minWidth: 160 }}><div className="t">{i.name}</div><div className="small muted">{org.name} (yours)</div></div>
          <div className="small muted" style={{ minWidth: 180 }}>{holderText(org, i)}</div>
          <Chip s={itemState(i)} /><button className="btn btn-ghost btn-sm" disabled>Yours</button>
        </div>)}
        {!others.length && !org.items.some(i => i.shared) && <div className="empty">Nothing shared in this cluster yet. Share items from Inventory.</div>}
      </div>
      <div className="small muted">Records stay separate. Teams only see what each other chooses to share, and who from which team has it.</div>
    </div>
  );
}

export function BorrowDialog() {
  const { org, me, meName } = useCtx();
  const orgs = useStore(s => s.orgs), mutAll = useStore(s => s.mutAll);
  const ui = useUI();
  const [days, setDays] = useState('2');
  const b = ui.borrow!;
  const owner = orgs.find(o => o.id === b.orgId), it = owner?.items.find(i => i.id === b.itemId);
  const close = () => ui.set({ borrow: null });
  if (!owner || !it) return null;
  const send = () => {
    mutAll(d => { d.borrows.push({ id: uid('b'), ownerOrgId: owner.id, itemId: it.id, borrowerOrgId: org.id, borrowerPersonId: me, borrowerName: meName, until: daysFromNow(Number(days)), status: 'requested', at: Date.now() }); });
    close(); ui.say('Request sent to ' + owner.name + '.');
  };
  return (
    <Dialog onClose={close} label="Borrow">
      <div className="title20">Borrow {it.name}</div>
      <div className="small muted">{owner.name}’s captain will approve it. It’ll show as with {meName} ({shortName(org)}).</div>
      <div className="field"><label>Until</label><select className="input" value={days} onChange={e => setDays(e.target.value)}>
        {[['2', 'In 2 days'], ['5', 'In 5 days'], ['7', 'In a week'], ['14', 'In 2 weeks']].map(([v, l]) => <option key={v} value={v}>{l} · {dueText(daysFromNow(Number(v)))}</option>)}</select></div>
      <div className="hstack" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={send}>Send request</button></div>
    </Dialog>
  );
}
