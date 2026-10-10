import { useState } from 'react';
import { useStore, useUI } from '../../lib/store';
import { deptNames, SHARED } from '../../lib/org';
import { canManageItem, holderText, itemState } from '../../lib/cluster';
import { daysFromNow, uid } from '../../lib/format';
import { Chip, Dialog, Switch } from '../../components/ui';
import { useCtx } from './ctx';
import type { ItemStatus } from '../../lib/types';

export function Inventory() {
  const { org, me, lead, myDept, mut } = useCtx();
  const mutAll = useStore(s => s.mutAll);
  const say = useUI(s => s.say);
  const [f, setF] = useState('all');
  const [adding, setAdding] = useState(false);
  const depts = deptNames(org);
  const opts: [string, string][] = [['all', 'All'], ...depts.map(d => [d, d] as [string, string]), ...(org.clusterId ? [['shared', 'Shared with cluster'] as [string, string]] : []), ['mine', 'With me']];
  const list = org.items.filter(i => f === 'all' || (f === 'shared' ? i.shared : f === 'mine' ? i.holderId === me || i.keeperId === me : i.dept === f));

  const patch = (id: string, p: Record<string, unknown>) => mut(o => { const i = o.items.find(x => x.id === id); if (i) Object.assign(i, p); });
  const returnExternal = (id: string, name: string) => {
    mutAll(d => {
      const o = d.orgs.find(x => x.id === org.id)!, i = o.items.find(x => x.id === id)!;
      Object.assign(i, { status: 'available', holderName: undefined, holderId: undefined, due: undefined });
      d.borrows.filter(b => b.ownerOrgId === org.id && b.itemId === id && b.status === 'active').forEach(b => (b.status = 'returned'));
    });
    say(name + ' is back. Marked available.');
  };

  return (
    <div className="stack-s fade" style={{ gap: 16 }}>
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <div className="pills">{opts.map(([k, l]) => <button key={k} className={'btn ' + (f === k ? 'btn-primary' : 'btn-secondary')} onClick={() => setF(k)}>{l}</button>)}</div>
        {lead && <button className="btn btn-secondary" onClick={() => setAdding(true)}>+ Add item</button>}
      </div>
      <div className="card list">
        {list.map(i => {
          const manage = canManageItem(org, i, me);
          return (
            <div key={i.id} className="row" style={{ flexWrap: 'wrap' }}>
              <div className="thumb">{i.status === 'usedup' ? '○' : '📦'}</div>
              <div style={{ flex: 1, minWidth: 160 }}><div className="t">{i.name}</div><div className="small muted">{i.qty} · {i.dept}{i.shared ? ' · shared with cluster' : ''}</div></div>
              <div className="small muted" style={{ minWidth: 160 }}>{holderText(org, i)}</div>
              <Chip s={itemState(i)} />
              {i.status === 'available' && <button className="btn btn-ghost btn-sm" onClick={() => { patch(i.id, { status: 'borrowed', holderId: me, due: daysFromNow(7) }); say('It’s with you for a week. Return it from here.'); }}>Take it</button>}
              {i.status === 'borrowed' && i.holderId === me && <button className="btn btn-secondary btn-sm" onClick={() => { patch(i.id, { status: 'available', holderId: undefined, due: undefined }); say('Returned. Thanks!'); }}>Return</button>}
              {i.status === 'borrowed' && i.holderName && manage && <button className="btn btn-secondary btn-sm" onClick={() => returnExternal(i.id, i.name)}>Mark returned</button>}
              {manage && org.clusterId && <button className="btn btn-ghost btn-sm" onClick={() => { patch(i.id, { shared: !i.shared }); say(i.shared ? i.name + ' is private again.' : i.name + ' is now shared with the cluster.'); }}>{i.shared ? 'Stop sharing' : 'Share'}</button>}
              {manage && <select className="input" style={{ width: 120, minHeight: 34, fontSize: 13 }} aria-label="Condition" value="" onChange={e => { const s = e.target.value as ItemStatus; if (s) { patch(i.id, { status: s, holderId: undefined, due: undefined }); say(i.name + ' marked ' + (s === 'usedup' ? 'used up' : s) + '.'); } }}>
                <option value="">Condition…</option><option value="available">Available</option><option value="damaged">Damaged</option><option value="usedup">Used up</option></select>}
            </div>
          );
        })}
        {!list.length && <div className="empty">Nothing here yet. Items appear automatically when a request is marked bought, or add one by hand.</div>}
      </div>
      <div className="small muted">Items are added automatically from bought requests and receipts. You confirm each one.</div>
      {adding && <AddItem onClose={() => setAdding(false)} depts={depts} defaultDept={myDept || SHARED} cluster={!!org.clusterId}
        onAdd={it => { mut(o => { o.items.unshift({ id: uid('I'), status: 'available', ...it }); }); setAdding(false); say(it.name + ' added to inventory.'); }} />}
    </div>
  );
}

function AddItem({ onClose, onAdd, depts, defaultDept, cluster }: { onClose: () => void; onAdd: (i: { name: string; qty: number; dept: string; loc: string; shared: boolean }) => void; depts: string[]; defaultDept: string; cluster: boolean }) {
  const [f, setF] = useState({ name: '', qty: '1', dept: defaultDept, loc: '', shared: false });
  const [err, setErr] = useState('');
  return (
    <Dialog onClose={onClose} label="Add item">
      <div className="title20">Add an item</div>
      <div className="field"><label>Name</label><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <div className="field"><label>Quantity</label><input className="input" value={f.qty} inputMode="numeric" onChange={e => setF({ ...f, qty: e.target.value })} /></div>
        <div className="field"><label>Department</label><select className="input" value={f.dept} onChange={e => setF({ ...f, dept: e.target.value })}>{depts.map(d => <option key={d}>{d}</option>)}</select></div>
      </div>
      <div className="field"><label>Where is it kept?</label><input className="input" value={f.loc} onChange={e => setF({ ...f, loc: e.target.value })} placeholder="e.g. Workshop, shelf B" /></div>
      {cluster && <div className="hstack" style={{ flexWrap: 'nowrap' }}><span style={{ flex: 1 }}>Share with the cluster</span><Switch on={f.shared} onClick={() => setF({ ...f, shared: !f.shared })} label="Share with cluster" /></div>}
      {err && <div className="err">{err}</div>}
      <div className="hstack" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => f.name.trim() ? onAdd({ name: f.name.trim(), qty: Number(f.qty) || 1, dept: f.dept, loc: f.loc.trim() || 'Unsorted', shared: f.shared }) : setErr('Add a name.')}>Add</button></div>
    </Dialog>
  );
}
