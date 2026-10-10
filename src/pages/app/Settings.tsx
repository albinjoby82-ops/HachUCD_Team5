import { useState } from 'react';
import { go } from '../../lib/router';
import { useStore, useUI } from '../../lib/store';
import { leadsOf, titleOf } from '../../lib/org';
import { TEMPLATES } from '../../lib/templates';
import { plural, uid } from '../../lib/format';
import { Avatar, Pills, Switch } from '../../components/ui';
import { useCtx } from './ctx';
import type { Currency, Modules, OrgType } from '../../lib/types';

const MODS: [keyof Modules, string, string][] = [
  ['finance', 'Finance', 'Requests, budgets, bank import, receipts'],
  ['inventory', 'Inventory', 'Items, locations, who has what'],
  ['events', 'Events & projects', 'Tag records to a project or event'],
  ['cluster', 'Cluster sharing', 'Lend and borrow with nearby teams'],
];

export function Settings() {
  const { org, top, mut } = useCtx();
  const clusters = useStore(s => s.clusters), orgs = useStore(s => s.orgs), mutAll = useStore(s => s.mutAll), reset = useStore(s => s.reset);
  const ui = useUI();
  const [tab, setTab] = useState<'org' | 'mod' | 'mem' | 'cluster' | 'plan' | 'demo'>('org');
  const [inv, setInv] = useState({ name: '', email: '', node: org.nodes[org.nodes.length - 1]?.id || '' });
  const [tag, setTag] = useState('');
  const locked = !top;
  const cl = clusters.find(c => c.id === org.clusterId);
  const link = location.origin + location.pathname + '#/join?code=' + org.inviteCode;

  const invite = () => {
    if (!inv.name.trim() || !/^\S+@\S+\.\S+$/.test(inv.email)) return ui.say('Add a name and a valid email.');
    const lead = !leadsOf(org, inv.node).length;
    mut(o => { o.people.push({ id: uid('p'), name: inv.name.trim(), email: inv.email.trim(), nodeId: inv.node, lead, invited: true }); });
    ui.say(`Invite recorded for ${inv.name.trim()}. They’ll land in the chart when they join.`);
    setInv({ ...inv, name: '', email: '' });
  };

  return (
    <div className="stack-s fade" style={{ gap: 18, maxWidth: 780 }}>
      <Pills value={tab} onChange={setTab} options={[['org', 'Organisation'], ['mod', 'Modules'], ['mem', 'Members & roles'], ['cluster', 'Cluster'], ['plan', 'Plan & billing'], ['demo', 'Demo data']]} />
      {locked && tab !== 'demo' && <div className="small muted">You can view settings. People at the top of the chart can change them.</div>}

      {tab === 'org' && <section className="card pad stack-s" style={{ gap: 14 }}>
        <div className="field"><label>Organisation name</label><input className="input" value={org.name} disabled={locked} onChange={e => { const v = e.target.value; mut(o => { o.name = v; }); }} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label>Type</label><select className="input" disabled={locked} value={org.type} onChange={e => { const v = e.target.value as OrgType; mut(o => { o.type = v; }); }}>{(Object.keys(TEMPLATES) as OrgType[]).map(k => <option key={k} value={k}>{TEMPLATES[k].label}</option>)}</select></div>
          <div className="field"><label>Currency</label><select className="input" disabled={locked} value={org.currency} onChange={e => { const v = e.target.value as Currency; mut(o => { o.currency = v; }); }}><option>EUR</option><option>GBP</option><option>USD</option></select></div>
        </div>
        <div className="field"><label>Projects & events (tags)</label>
          <div className="hstack" style={{ gap: 6 }}>{org.tags.map(t => <span key={t} className="tag">{t}{!locked && <button onClick={() => mut(o => { o.tags = o.tags.filter(x => x !== t); })} style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 0 0 6px' }} aria-label={'Remove ' + t}>✕</button>}</span>)}
            {!locked && <><input className="input" style={{ width: 160, minHeight: 34 }} value={tag} onChange={e => setTag(e.target.value)} placeholder="Add tag" onKeyDown={e => { if (e.key === 'Enter' && tag.trim()) { mut(o => { o.tags.push(tag.trim()); }); setTag(''); } }} /></>}</div></div>
      </section>}

      {tab === 'mod' && <section className="card list">
        {MODS.map(([k, n, d]) => <div key={k} className="row" style={{ flexWrap: 'nowrap' }}><div className="grow"><div className="t">{n}</div><div className="small muted">{d}</div></div>
          <Switch on={org.modules[k]} disabled={locked} label={n} onClick={() => { mut(o => { o.modules[k] = !o.modules[k]; }); ui.say(n + (org.modules[k] ? ' switched off. The nav updates.' : ' switched on.')); }} /></div>)}
      </section>}

      {tab === 'mem' && <>
        <section className="card pad stack-s">
          <div className="b800">Invite someone</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1.2fr auto', gap: 8, alignItems: 'end' }}>
            <div className="field"><label>Name</label><input className="input" disabled={locked} value={inv.name} onChange={e => setInv({ ...inv, name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input className="input" disabled={locked} value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} /></div>
            <div className="field"><label>Box</label><select className="input" disabled={locked} value={inv.node} onChange={e => setInv({ ...inv, node: e.target.value })}>{org.nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></div>
            <button className="btn btn-secondary" disabled={locked} onClick={invite}>Invite</button>
          </div>
          <div className="hstack inset"><div style={{ flex: 1 }}><div className="small muted">Share code</div><div className="mono b900" style={{ fontSize: 18 }}>{org.inviteCode}</div></div>
            <button className="btn btn-secondary btn-sm" style={{ background: '#fff' }} onClick={() => { navigator.clipboard?.writeText(link); ui.say('Invite link copied.'); }}>Copy link</button>
            <button className="btn btn-ghost btn-sm" onClick={() => go('/join?code=' + org.inviteCode)}>Try the join flow</button></div>
        </section>
        <section className="card list">
          {org.people.map(p => <button key={p.id} className="row" style={{ padding: '10px 14px' }} onClick={() => ui.set({ profileId: p.id })}><Avatar name={p.name} size={34} /><span className="grow t">{p.name}{p.invited ? <span className="tiny muted"> · invited</span> : null}</span><span className="small muted">{titleOf(org, p.id)}</span></button>)}
        </section>
      </>}

      {tab === 'cluster' && <section className="card pad stack-s">
        {cl ? <>
          <div className="b800">{cl.name}</div>
          <div className="small muted">{plural(cl.orgIds.length, 'organisation')}: {cl.orgIds.map(id => orgs.find(o => o.id === id)?.name).join(', ')}. You choose which items to share from Inventory. Everything else stays private to {org.name}.</div>
          <div className="hstack"><button className="btn btn-secondary" disabled={locked} onClick={() => ui.say('Share your cluster invite: teams join from their Cluster page.')}>Invite a team</button>
            <button className="btn btn-ghost" disabled={locked} onClick={() => { mutAll(d => { const c = d.clusters.find(x => x.id === cl.id)!; c.orgIds = c.orgIds.filter(x => x !== org.id); d.orgs.find(o => o.id === org.id)!.clusterId = null; }); ui.say('Left ' + cl.name + '.'); }}>Leave cluster</button></div>
        </> : <><div className="b800">Not in a cluster</div><button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => go('/app/cluster')}>Find a cluster</button></>}
      </section>}

      {tab === 'plan' && <section className="card pad stack-s">
        <div className="hstack" style={{ alignItems: 'baseline' }}><span className="b900" style={{ fontSize: 22 }}>Team plan</span><span className="muted">€5 / month · sample price</span></div>
        <div className="small muted">Billing is not connected in this prototype.</div>
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={locked} onClick={() => ui.say('Not working yet in this prototype.')}>Manage billing</button>
      </section>}

      {tab === 'demo' && <section className="card pad stack-s">
        <div className="b800">Demo data</div>
        <div className="small muted">Everything is stored in this browser. Resetting restores Ironclad Robotics, Volt FS and SkyLab to their starting state and removes teams you registered.</div>
        <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => { if (confirm('Reset all demo data?')) { reset(); ui.set({ reqId: null, profileId: null, finTab: 'overview' }); ui.say('Demo data reset.'); go('/app/home'); } }}>Reset demo data</button>
      </section>}
    </div>
  );
}
