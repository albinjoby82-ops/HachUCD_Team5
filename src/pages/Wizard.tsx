import { useMemo, useState } from 'react';
import type { Currency, Modules, Org, OrgType } from '../lib/types';
import { go } from '../lib/router';
import { say, useStore } from '../lib/store';
import { buildTemplate, samplePeople, TEMPLATES } from '../lib/templates';
import { type Structure, chain, deptNames, departments, titleOf, nodeById } from '../lib/org';
import { money, plural, uid } from '../lib/format';
import { FlowChart } from '../components/FlowChart';
import { Logo, Steps, Switch } from '../components/ui';

const LOGO_COLORS = ['#ffd166', '#2ee6c5', '#ff8fa3', '#c8b6ff', '#8fd3ff'];
const MODS: [keyof Modules, string, string][] = [
  ['finance', 'Finance', 'Purchase requests, budgets, bank import, receipts'],
  ['inventory', 'Inventory', 'What you own, where it is, who has it'],
  ['events', 'Events & projects', 'Tag records to a project or event'],
  ['cluster', 'Cluster sharing', 'Lend and borrow with nearby teams'],
];

const makeCode = (name: string) => (name.replace(/[^a-z]/gi, '').slice(0, 4).toUpperCase() || 'TEAM') + '-' + String(1000 + Math.floor(Math.random() * 9000));

export function Wizard() {
  const account = useStore(s => s.account), clusters = useStore(s => s.clusters), addOrg = useStore(s => s.addOrg), mutAll = useStore(s => s.mutAll);
  const [step, setStep] = useState(1);
  const [you, setYou] = useState(account?.name || '');
  const [org, setOrg] = useState({ name: '', type: 'eng' as OrgType, cur: 'EUR' as Currency, budget: '5000', color: LOGO_COLORS[0] });
  const [mods, setMods] = useState<Modules>({ finance: true, inventory: true, events: true, cluster: true });
  const [joinCluster, setJoinCluster] = useState(true);
  const [tpl, setTpl] = useState<OrgType | 'blank' | null>(null);
  const [S, setS] = useState<Structure>({ nodes: [], people: [] });
  const [fitKey, setFitKey] = useState(0);
  const [touched, setTouched] = useState(false);
  const [inv, setInv] = useState({ name: '', email: '', node: '' });
  const [err, setErr] = useState('');
  const code = useMemo(() => makeCode(org.name), [org.name]);

  const pickTemplate = (k: OrgType | 'blank') => {
    if (touched && !confirm('Replace your chart with the ' + (k === 'blank' ? 'blank' : TEMPLATES[k].label) + ' template?')) return;
    const t = buildTemplate(k, you.trim() || 'You', account?.email);
    setS(t); setTpl(k); setTouched(false); setFitKey(x => x + 1);
  };
  const onChart = (s: Structure) => { setS(s); setTouched(true); };

  const next = () => {
    setErr('');
    if (step === 1) {
      if (!you.trim()) return setErr('Add your name so we can put you on the chart.');
      if (!org.name.trim()) return setErr('Give your organisation a name.');
      if (!tpl) pickTemplate(org.type);
      else if (S.people[0]) setS({ ...S, people: S.people.map((p, i) => (i === 0 ? { ...p, name: you.trim() } : p)) });
    }
    if (step === 3 && !S.nodes.length) return setErr('Add at least one box.');
    setStep(s => Math.min(5, s + 1));
  };
  const back = () => setStep(s => Math.max(1, s - 1));

  const addInvite = () => {
    if (!inv.name.trim()) return say('Add their name.');
    if (!/^\S+@\S+\.\S+$/.test(inv.email)) return say('Add a valid email.');
    if (!inv.node) return say('Pick where they sit in the chart.');
    const hasLead = S.people.some(p => p.nodeId === inv.node && p.lead);
    setS({ ...S, people: [...S.people, { id: uid('p'), name: inv.name.trim(), email: inv.email.trim(), nodeId: inv.node, lead: !hasLead, invited: true }] });
    setInv({ name: '', email: '', node: inv.node });
  };
  const setEmail = (pid: string, email: string) => setS({ ...S, people: S.people.map(p => (p.id === pid ? { ...p, email, invited: !!email || p.invited } : p)) });

  const finish = () => {
    const me = S.people[0];
    const depts = deptNames(S);
    const total = Number(org.budget) || 0, each = depts.length ? Math.floor(total / depts.length / 50) * 50 : 0;
    const budgets: Record<string, number> = {};
    depts.forEach((d, i) => (budgets[d] = i === depts.length - 1 ? total - each * (depts.length - 1) : each));
    const o: Org = {
      id: uid('org-'), name: org.name.trim(), type: org.type, currency: org.cur, modules: mods, inviteCode: code,
      nodes: S.nodes, people: S.people, termBudget: total, budgets, baseSpend: {}, requests: [], items: [],
      tags: (tpl && tpl !== 'blank' ? TEMPLATES[tpl] : TEMPLATES.other).tags, clusterId: mods.cluster && joinCluster ? clusters[0]?.id ?? null : null,
      imports: [], seq: 1, logoColor: org.color, createdAt: Date.now(),
    };
    addOrg(o, me.id);
    if (o.clusterId) mutAll(d => { const c = d.clusters.find(x => x.id === o.clusterId); if (c) c.orgIds.push(o.id); });
    say(o.name + ' is live. You’re viewing it as ' + me.name + '.');
    go('/app/home');
  };

  const invitedCount = S.people.filter(p => p.invited).length;
  const depts = departments(S);
  const longest = S.people.reduce((a, p) => Math.max(a, chain(S, p.id).length), 0);
  const wide = step === 3;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="land-head"><Logo onClick={() => go('/')} /><span style={{ marginLeft: 'auto' }} className="small muted">Step {step} of 5</span></header>
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 16px 64px' }}>
        <div style={{ width: wide ? 'min(1240px,100%)' : 'min(720px,100%)', display: 'flex', flexDirection: 'column', gap: 20, transition: 'width .3s' }}>
          <Steps n={5} cur={step} />

          {step === 1 && <section className="card fade" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><div className="title26">Register your team</div><div className="muted">You can change any of this later.</div></div>
            <div className="g2e" style={{ gap: 12 }}>
              <div className="field"><label htmlFor="you">Your name</label><input id="you" className="input" value={you} onChange={e => setYou(e.target.value)} placeholder="e.g. Maya" /></div>
              <div className="field"><label htmlFor="on">Organisation name</label><input id="on" className="input" value={org.name} onChange={e => setOrg({ ...org, name: e.target.value })} placeholder="e.g. UCD Rocketry" /></div>
            </div>
            <div className="field"><label>Type · picks your starting chart</label>
              <div className="g4">{(Object.keys(TEMPLATES) as OrgType[]).map(k => (
                <button key={k} className={'typebtn' + (org.type === k ? ' on' : '')} aria-pressed={org.type === k} onClick={() => { setOrg({ ...org, type: k }); setTpl(null); }}>
                  <span className="b800">{TEMPLATES[k].label}</span><span className="tiny muted">{TEMPLATES[k].depts.join(' · ')}</span></button>))}</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 16, alignItems: 'end' }}>
              <div className="field"><label>Logo</label><div className="hstack" style={{ gap: 6 }}>
                <span className="orgtile" style={{ width: 44, height: 44, borderRadius: 14, background: org.color }}>{(org.name || 'NT').slice(0, 2).toUpperCase()}</span>
                <div className="swatches">{LOGO_COLORS.map(c => <button key={c} className={org.color === c ? 'on' : ''} style={{ background: c }} onClick={() => setOrg({ ...org, color: c })} aria-label={'Logo colour ' + c} />)}</div></div></div>
              <div className="field"><label htmlFor="cur">Currency</label><select id="cur" className="input" value={org.cur} onChange={e => setOrg({ ...org, cur: e.target.value as Currency })}><option>EUR</option><option>GBP</option><option>USD</option></select></div>
              <div className="field"><label htmlFor="tb">Term budget</label><input id="tb" className="input" inputMode="numeric" value={org.budget} onChange={e => setOrg({ ...org, budget: e.target.value.replace(/[^0-9]/g, '') })} /></div>
            </div>
            {err && <div role="alert" className="err">{err}</div>}
            <div className="hstack" style={{ justifyContent: 'flex-end' }}><button className="btn btn-primary" onClick={next}>Continue</button></div>
          </section>}

          {step === 2 && <section className="card fade" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ marginBottom: 6 }}><div className="title26">Pick what you need</div><div className="muted">Switch modules on or off at any time. The nav follows.</div></div>
            {MODS.map(([k, n, d]) => <div key={k} className="hstack" style={{ padding: '14px 4px', flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}><div className="b800" style={{ fontWeight: 700 }}>{n}</div><div className="small muted">{d}</div></div>
              <Switch on={mods[k]} label={n} onClick={() => setMods({ ...mods, [k]: !mods[k] })} /></div>)}
            {mods.cluster && clusters[0] && <div className="inset hstack" style={{ flexWrap: 'nowrap' }}>
              <div style={{ flex: 1 }}><div className="b800">Join “{clusters[0].name}”</div><div className="small muted">{plural(clusters[0].orgIds.length, 'team')} nearby already share tools like a 3D printer and soldering stations.</div></div>
              <Switch on={joinCluster} label="Join cluster" onClick={() => setJoinCluster(!joinCluster)} /></div>}
            <div className="hstack" style={{ justifyContent: 'space-between', marginTop: 10 }}><button className="btn btn-ghost" onClick={back}>Back</button><button className="btn btn-primary" onClick={next}>Continue</button></div>
          </section>}

          {step === 3 && <section className="card fade" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="hstack" style={{ alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 260 }}><div className="title26">Build your structure</div>
                <div className="muted">This flowchart is the engine: requests travel up it for approval, budgets follow departments, and it decides who sees what.</div></div>
              <div className="pills">{([...Object.keys(TEMPLATES), 'blank'] as (OrgType | 'blank')[]).map(k => (
                <button key={k} className={'btn btn-sm ' + (tpl === k ? 'btn-primary' : 'btn-secondary')} onClick={() => pickTemplate(k)}>{k === 'blank' ? 'Blank' : TEMPLATES[k].label}</button>))}</div>
            </div>
            <FlowChart value={S} onChange={onChart} height={620} fitKey={fitKey} meId={S.people[0]?.id} onToast={say}
              tools={<div className="grp"><button onClick={() => { setS({ ...S, people: samplePeople(S.nodes, S.people) }); setTouched(true); say('Added sample people so you can try routing.'); }}>Fill sample people</button></div>} />
            <div className="g4" style={{ gap: 12 }}>
              {[[String(S.nodes.length), 'boxes in the chart'], [String(depts.length), depts.length ? 'departments: ' + depts.map(d => d.name).join(', ') : 'departments — toggle one on a box'], [String(S.people.length), 'people placed'], [longest ? longest + ' steps' : '—', 'longest approval route']].map(([v, l]) => (
                <div key={l} className="inset"><div className="b900" style={{ fontSize: 22 }}>{v}</div><div className="tiny muted">{l}</div></div>))}
            </div>
            {err && <div role="alert" className="err">{err}</div>}
            <div className="hstack" style={{ justifyContent: 'space-between' }}><span className="small muted">Tip: click a box to rename it, make it a department, or add people. Hover a box and hit + to add a role below.</span>
              <div className="hstack"><button className="btn btn-ghost" onClick={back}>Back</button><button className="btn btn-primary" onClick={next}>Continue</button></div></div>
          </section>}

          {step === 4 && <section className="card fade" style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div><div className="title26">Invite your team</div><div className="muted">Each invite lands someone in the right box, so their approval route is ready before they log in.</div></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1.2fr auto', gap: 8, alignItems: 'end' }}>
              <div className="field"><label>Name</label><input className="input" value={inv.name} onChange={e => setInv({ ...inv, name: e.target.value })} /></div>
              <div className="field"><label>Email</label><input className="input" value={inv.email} onChange={e => setInv({ ...inv, email: e.target.value })} placeholder="name@college.ie" onKeyDown={e => e.key === 'Enter' && addInvite()} /></div>
              <div className="field"><label>Box</label><select className="input" value={inv.node} onChange={e => setInv({ ...inv, node: e.target.value })}><option value="">Pick…</option>{S.nodes.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></div>
              <button className="btn btn-secondary" onClick={addInvite}>Add</button>
            </div>
            <div className="stack-s" style={{ gap: 6, maxHeight: 300, overflow: 'auto' }}>
              {S.people.slice(1).map(p => <div key={p.id} className="hstack inset" style={{ padding: '8px 12px', flexWrap: 'nowrap' }}>
                <span style={{ flex: 1, minWidth: 0 }}><span className="b800">{p.name}</span> <span className="small muted">· {titleOf(S, p.id)}</span></span>
                <input className="input white" style={{ maxWidth: 230, minHeight: 36 }} placeholder="email to invite" value={p.email || ''} onChange={e => setEmail(p.id, e.target.value)} />
                {p.invited && p.email && <span className="chip" style={{ background: '#e3f2e8', color: '#1f5a35' }}>✉ Invite ready</span>}
              </div>)}
              {S.people.length < 2 && <div className="small muted">No one else on the chart yet. Add people above, or go back and use “Fill sample people”.</div>}
            </div>
            <div className="hstack" style={{ padding: 14, borderRadius: 16, background: 'var(--p100)' }}>
              <div style={{ flex: 1, minWidth: 180 }}><div className="small" style={{ color: 'var(--p800)' }}>Or share a code — they pick their box when they join</div><div className="mono b900" style={{ fontSize: 20, color: 'var(--p900)' }}>{code}</div></div>
              <button className="btn btn-secondary" style={{ background: '#fff' }} onClick={() => { navigator.clipboard?.writeText(location.origin + location.pathname + '#/join?code=' + code); say('Invite link copied.'); }}>Copy invite link</button>
            </div>
            <div className="hstack" style={{ justifyContent: 'space-between' }}><button className="btn btn-ghost" onClick={back}>Back</button><button className="btn btn-primary" onClick={next}>{invitedCount ? 'Send ' + plural(invitedCount, 'invite') : 'Skip for now'}</button></div>
            <div className="tiny muted">Email sending isn’t connected in this prototype. Invites are recorded on the chart.</div>
          </section>}

          {step === 5 && <section className="card fade" style={{ padding: '48px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--p-h)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 28 }}>✓</div>
            <div className="title26">{org.name} is ready</div>
            <div className="muted" style={{ maxWidth: 460 }}>{plural(S.nodes.length, 'box', 'boxes')}, {plural(depts.length, 'department')}, {plural(S.people.length, 'person', 'people')}. {money(Number(org.budget) || 0, org.cur)} term budget split across {deptNames(S).join(', ')}.
              {invitedCount ? ' ' + plural(invitedCount, 'invite') + ' recorded.' : ''}</div>
            <div className="inset small" style={{ maxWidth: 460 }}>Invite code <b className="mono">{code}</b>. Try the join flow with it to see a new member land in the chart.</div>
            <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={finish}>Open {org.name}</button>
            <button className="btn btn-ghost" onClick={back}>Back</button>
          </section>}
        </div>
      </main>
    </div>
  );
}
