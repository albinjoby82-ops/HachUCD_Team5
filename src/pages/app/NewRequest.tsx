import { useEffect, useState } from 'react';
import { go } from '../../lib/router';
import { useStore, useUI } from '../../lib/store';
import { chain, nameOf, titleOf, tokens, SHARED } from '../../lib/org';
import { matchesFor } from '../../lib/cluster';
import { DAY_MS } from '../../lib/format';
import { useCtx } from './ctx';
import type { PurchaseRequest } from '../../lib/types';

const SHOPS: [RegExp, string][] = [[/rs-online|rs-components/, 'RS Components'], [/amazon|amzn/, 'Amazon'], [/farnell/, 'Farnell'], [/mouser/, 'Mouser Electronics'], [/thepihut/, 'The Pi Hut'], [/digikey/, 'DigiKey']];
function merchantFrom(link: string) {
  if (!link) return undefined;
  const hit = SHOPS.find(([re]) => re.test(link.toLowerCase()));
  if (hit) return hit[1];
  const host = link.match(/https?:\/\/(?:www\.)?([^/]+)/)?.[1];
  return host ? host.split('.')[0] : undefined;
}

export function NewRequest() {
  const { org, me, meName, myDept, mut } = useCtx();
  const orgs = useStore(s => s.orgs), clusters = useStore(s => s.clusters), borrows = useStore(s => s.borrows);
  const ui = useUI();
  const blank = { item: '', link: '', qty: '1', cost: '', reason: '', tag: org.tags[0] || '' };
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const example = org.id === 'org-ironclad'
    ? { item: 'M3 bolts ×100', link: 'https://uk.rs-online.com/web/p/socket-screws/', qty: '1', cost: '9', reason: 'Mounting the wrist bracket', tag: org.tags[0] }
    : { item: '3D printer filament (PLA, 1kg)', link: '', qty: '2', cost: '44', reason: 'Prototype parts for the next build', tag: org.tags[0] || '' };
  useEffect(() => { if (ui.prefill) { setF(example); ui.set({ prefill: false }); } }, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { setF({ ...f, [k]: e.target.value }); setErr(''); };
  const route = chain(org, me);
  const matches = matchesFor(f.item, org, orgs, clusters, borrows);

  const submit = () => {
    const cost = parseFloat(f.cost);
    if (!f.item.trim()) return setErr('Add the item name.');
    if (!(cost > 0)) return setErr('Add an estimated cost above zero.');
    const id = 'R-' + org.seq, now = Date.now(), atTop = !route.length;
    // Possible duplicate: same person asked for something with overlapping words in the last week.
    const t = tokens(f.item);
    const dup = org.requests.find(r => r.byId === me && now - r.createdAt < 7 * DAY_MS && r.status !== 'rejected' && tokens(r.item).some(x => t.includes(x)));
    const r: PurchaseRequest = {
      id, item: f.item.trim(), cost, qty: Number(f.qty) || 1, byId: me, dept: myDept || SHARED, tag: org.modules.events ? f.tag : '—',
      status: atTop ? 'approved' : 'pending', holderId: atTop ? null : route[0], reason: f.reason.trim() || '—', link: f.link.trim() || undefined,
      flag: dup ? `Possible duplicate: ${meName} asked for ${dup.item} ${Math.max(1, Math.round((now - dup.createdAt) / DAY_MS))} day(s) ago (${dup.id}).` : undefined,
      merchant: merchantFrom(f.link), createdAt: now,
      trail: [{ who: meName, what: atTop ? 'Submitted · approved straight away (top of the chart)' : 'Submitted', at: now }],
    };
    mut(o => { o.requests.unshift(r); o.seq++; });
    ui.set({ reqFilter: 'mine', reqId: id });
    ui.say(atTop ? 'Approved.' : 'Sent to ' + nameOf(org, route[0]) + '.');
    go('/app/requests');
  };

  return (
    <div className="g2 fade" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)' }}>
      <div className="card pad stack-s" style={{ gap: 14 }}>
        <div className="hstack"><span className="title20">What do you need?</span><button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setF(example)}>Fill example</button></div>
        <div className="field"><label htmlFor="it">Item</label><input id="it" className="input" value={f.item} onChange={set('item')} placeholder="e.g. M3 bolts" autoFocus /></div>
        <div className="field"><label htmlFor="ln">Link or photo (optional)</label><input id="ln" className="input" value={f.link} onChange={set('link')} placeholder="Paste a product link" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label htmlFor="q">Quantity</label><input id="q" className="input" value={f.qty} onChange={set('qty')} inputMode="numeric" /></div>
          <div className="field"><label htmlFor="c">Estimated cost ({org.currency})</label><input id="c" className="input" value={f.cost} onChange={set('cost')} inputMode="decimal" /></div>
        </div>
        <div className="field"><label htmlFor="w">Why do you need it?</label><input id="w" className="input" value={f.reason} onChange={set('reason')} /></div>
        {org.modules.events && org.tags.length > 0 && <div className="field"><label htmlFor="tg">Project or event</label><select id="tg" className="input" value={f.tag} onChange={set('tag')}>{org.tags.map(t => <option key={t}>{t}</option>)}</select></div>}
        {err && <div role="alert" className="err">{err}</div>}
        <div className="hstack" style={{ justifyContent: 'flex-end' }}>
          <span className="small muted" style={{ marginRight: 'auto' }}>{route.length ? <>Goes to <b>{nameOf(org, route[0])}</b> ({titleOf(org, route[0])}){route[1] ? <>, then {nameOf(org, route[1])} if passed up</> : null}</> : 'You’re at the top, so this is approved straight away.'}</span>
          <button className="btn btn-ghost" onClick={() => go('/app/home')}>Cancel</button>
          <button className="btn btn-primary" onClick={submit}>Send request</button>
        </div>
      </div>
      <div className="card stack-s" style={{ padding: 20, gap: 10 }}>
        <div className="b800">Before you buy</div>
        <div className="small muted">We check your team’s inventory{org.clusterId ? ' and your cluster' : ''} as you type.</div>
        {matches.map(x => <div key={x.orgId + x.itemId} className="inset hstack" style={{ flexWrap: 'nowrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{x.text}</div><div className="small muted">{x.sub}</div></div>
          {x.kind === 'own' ? <button className="btn btn-secondary btn-sm" onClick={() => go('/app/inventory')}>View</button>
            : <button className="btn btn-secondary btn-sm" disabled={!x.available} onClick={() => { ui.set({ borrow: { orgId: x.orgId, itemId: x.itemId } }); }}>Borrow instead</button>}
        </div>)}
        {!matches.length && <div className="inset small muted">{f.item.trim() ? 'Nothing similar found. Go ahead.' : 'Start typing an item name.'}</div>}
      </div>
    </div>
  );
}
