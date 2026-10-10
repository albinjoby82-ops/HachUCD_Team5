import { useState } from 'react';
import { saveInventory, useStore, useUI } from '../../lib/store';
import { deptNames, SHARED } from '../../lib/org';
import { canManageItem, holderText, itemState } from '../../lib/cluster';
import { daysFromNow, uid } from '../../lib/format';
import { Chip, Dialog, Switch } from '../../components/ui';
import { useCtx } from './ctx';
import type { Item, ItemStatus } from '../../lib/types';
import { InventoryImport } from './InventoryImport';
import { estimatedTotals, validateDraft, writableDepartments } from '../../lib/inventory';
import type { Draft, InventoryValues } from '../../lib/inventory';

export function Inventory() {
  const { org, me, myDept, mut } = useCtx();
  const mutAll = useStore(s => s.mutAll);
  const say = useUI(s => s.say);
  const [f, setF] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item>();
  const [importing, setImporting] = useState(false);
  const [search, setSearch] = useState('');
  const depts = deptNames(org);
  const writable = writableDepartments(org, me, depts);
  const opts: [string, string][] = [['all', 'All'], ...depts.map(d => [d, d] as [string, string]), ...(org.clusterId ? [['shared', 'Shared with cluster'] as [string, string]] : []), ['mine', 'With me']];
  const list = org.items.filter(i => (f === 'all' || (f === 'shared' ? i.shared : f === 'mine' ? i.holderId === me || i.keeperId === me : i.dept === f)) && [i.name, i.supplier, i.loc].join(' ').toLowerCase().includes(search.toLowerCase()));
  const { totals, unknown } = estimatedTotals(list, org.currency);

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
      <div><div className="title20">{org.name} inventory</div><div className="small muted">Browser demo · records stay on this device and are not synced with teammates.</div></div>
      <div className="inventory-grid">
        <div className="card" style={{ padding: 18 }}><div className="small muted">Matching records</div><div className="title20">{list.length}</div></div>
        <div className="card" style={{ padding: 18 }}><div className="small muted">Estimated inventory cost</div><div className="title20">{Object.entries(totals).map(([c, n]) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: c }).format(n!)).join(' · ') || '—'}</div><div className="small muted">Quantity × reference unit cost; excludes used-up items.</div></div>
        <div className="card" style={{ padding: 18 }}><div className="small muted">Records with unknown cost</div><div className="title20">{unknown}</div><div className="small muted">Excluded from estimated cost.</div></div>
      </div>
      <input className="input" type="search" aria-label="Search inventory" placeholder="Search items, suppliers or locations…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="hstack" style={{ justifyContent: 'space-between' }}>
        <div className="pills">{opts.map(([k, l]) => <button key={k} className={'btn ' + (f === k ? 'btn-primary' : 'btn-secondary')} onClick={() => setF(k)}>{l}</button>)}</div>
        {!!writable.length && <div className="hstack"><button className="btn btn-secondary" onClick={() => setImporting(true)}>Import CSV</button><button className="btn btn-primary" onClick={() => setAdding(true)}>+ Add item</button></div>}
      </div>
      <div className="card list">
        {list.map(i => {
          const manage = canManageItem(org, i, me);
          return (
            <div key={i.id} className="row" style={{ flexWrap: 'wrap' }}>
              <div className="thumb">{i.status === 'usedup' ? '○' : '📦'}</div>
              <div style={{ flex: 1, minWidth: 160 }}><div className="t">{i.name}</div><div className="small muted">{i.qty} {i.unit || 'piece'} · {i.dept}{i.shared ? ' · shared with cluster' : ''}</div><div className="small muted">Supplier: {i.supplier || 'Unknown'} · Unit cost: {i.unitCost == null ? 'Unknown' : `${Number(i.unitCost)} ${i.currency || org.currency}`}</div>{i.importId && <div className="small muted">Import {i.importId} · record {i.sourceRow}</div>}</div>
              <div className="small muted" style={{ minWidth: 160 }}>{holderText(org, i)}</div>
              <Chip s={itemState(i)} />
              {manage && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(i)}>Edit</button>}
              {i.status === 'available' && i.qty > 0 && <button className="btn btn-ghost btn-sm" onClick={() => { patch(i.id, { status: 'borrowed', holderId: me, due: daysFromNow(7) }); say('It’s with you for a week. Return it from here.'); }}>Take it</button>}
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
      <div className="small muted">Import a CSV or add items manually. Bought requests can also add inventory records.</div>
      {!!org.inventoryImports?.length && <details className="card" style={{ padding: 16 }}><summary>Inventory import history ({org.inventoryImports.length})</summary>{org.inventoryImports.map(i => <div key={i.id} className="row small">{i.file} · {i.department} · {i.saved} saved / {i.excluded} excluded / {i.read} read · {new Date(i.at).toLocaleString()} · {i.id}</div>)}</details>}
      {importing && <InventoryImport key={org.id + me} departments={writable} onClose={() => setImporting(false)} />}
      {(adding || editing) && <ItemEditor key={org.id + me + (editing?.id || 'new')} item={editing} currency={org.currency} onClose={() => { setAdding(false); setEditing(undefined); }} depts={writable} defaultDept={writable.includes(myDept || '') ? myDept! : writable[0] || SHARED} cluster={!!org.clusterId}
        onSave={it => {
          saveInventory(org.id, o => {
            if (!writable.includes(it.dept) || !canManageItem(o, { dept: it.dept }, me)) throw new Error('Your role cannot write to this department.');
            const at = Date.now();
            if (editing) {
              const current = o.items.find(i => i.id === editing.id);
              if (!current || !canManageItem(o, current, me)) throw new Error('This item cannot be edited by your current role.');
              Object.assign(current, it, { updatedAt: at, updatedBy: me });
            } else o.items.unshift({ id: uid('I'), status: 'available', ...it, createdAt: at, createdBy: me, updatedAt: at, updatedBy: me });
          });
          setAdding(false); setEditing(undefined); say(it.name + ' saved to inventory.');
        }} />}
    </div>
  );
}

function ItemEditor({ onClose, onSave, depts, defaultDept, cluster, item, currency }: { onClose: () => void; onSave: (i: InventoryValues & { dept: string; loc: string; shared: boolean }) => void; depts: string[]; defaultDept: string; cluster: boolean; item?: Item; currency: Item['currency'] }) {
  const [f, setF] = useState({ name: item?.name || '', qty: String(item?.qty ?? 1), dept: item?.dept || defaultDept, loc: item?.loc || '', shared: item?.shared || false, cost: item?.unitCost ?? '', currency: item?.currency || currency || 'EUR', supplier: item?.supplier || '', unit: item?.unit || 'piece' });
  const [err, setErr] = useState('');
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);
  const org = useCtx().org;
  const duplicate = org.items.some(i => i.id !== item?.id && i.name.trim().toLowerCase() === f.name.trim().toLowerCase());
  const save = () => {
    const draft: Draft = { sourceRow: 0, itemName: f.name, quantity: f.qty, cost: f.cost, supplier: f.supplier, currency: f.currency, unit: f.unit, issues: [], excluded: false, keepDuplicate: false };
    const result = validateDraft(draft, { costBasis: 'unit', currency: f.currency, unit: f.unit, numberFormat: 'dot' });
    if (!result.value || result.errors.length) { setErr(result.errors.join(' ')); return; }
    if (duplicate && !duplicateConfirmed) { setErr('Confirm that this is a separate item with the same name.'); return; }
    try { onSave({ ...result.value, dept: f.dept, loc: f.loc.trim() || 'Unsorted', shared: f.shared }); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Dialog onClose={onClose} label={item ? 'Edit item' : 'Add item'} width={580}>
      <div className="title20">{item ? 'Edit item' : 'Add an item'}</div>
      <div className="small muted">Reference unit cost · use a decimal point (for example 12.50). Blank cost or supplier means unknown.</div>
      <div className="field"><label htmlFor="inventory-name">Name</label><input id="inventory-name" className="input" value={f.name} onChange={e => { setF({ ...f, name: e.target.value }); setDuplicateConfirmed(false); }} autoFocus /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        <label className="field">Quantity<input className="input" value={f.qty} inputMode="decimal" onChange={e => setF({ ...f, qty: e.target.value })} /></label>
        <label className="field">Department<select className="input" value={f.dept} onChange={e => setF({ ...f, dept: e.target.value })}>{depts.map(d => <option key={d}>{d}</option>)}</select></label>
      </div>
      <div className="inventory-grid"><label className="field">Unit cost<input className="input" value={f.cost} inputMode="decimal" placeholder="Unknown" onChange={e => setF({ ...f, cost: e.target.value })} /></label><label className="field">Currency<select className="input" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value as typeof f.currency })}>{['EUR', 'GBP', 'USD'].map(c => <option key={c}>{c}</option>)}</select></label><label className="field">Quantity unit<input className="input" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} /></label></div>
      <label className="field">Supplier<input className="input" value={f.supplier} placeholder="Unknown" onChange={e => setF({ ...f, supplier: e.target.value })} /></label>
      <label className="field">Where is it kept?<input className="input" value={f.loc} onChange={e => setF({ ...f, loc: e.target.value })} placeholder="e.g. Workshop, shelf B" /></label>
      {duplicate && <label className="inventory-warning"><input type="checkbox" checked={duplicateConfirmed} onChange={e => setDuplicateConfirmed(e.target.checked)} /> Another item has this name. Keep this as a separate record.</label>}
      {cluster && <div className="hstack" style={{ flexWrap: 'nowrap' }}><span style={{ flex: 1 }}>Share with the cluster</span><Switch on={f.shared} onClick={() => setF({ ...f, shared: !f.shared })} label="Share with cluster" /></div>}
      {err && <div className="err">{err}</div>}
      <div className="hstack" style={{ justifyContent: 'flex-end' }}><button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={save}>Save item</button></div>
    </Dialog>
  );
}
