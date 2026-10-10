import { useMemo, useState } from 'react';
import { go } from '../lib/router';
import { say, useStore } from '../lib/store';
import { chain, groupName, personById, titleOf, nodeById } from '../lib/org';
import { initials, uid } from '../lib/format';
import { Logo, Steps } from '../components/ui';
import type { Person } from '../lib/types';

export function Join() {
  const orgs = useStore(s => s.orgs), mut = useStore(s => s.mut), open = useStore(s => s.open), setAccount = useStore(s => s.setAccount);
  const initial = new URLSearchParams(location.hash.split('?')[1] || '').get('code') || '';
  const [step, setStep] = useState(1);
  const [code, setCode] = useState(initial.toUpperCase());
  const [err, setErr] = useState('');
  const [f, setF] = useState({ name: '', email: '', pw: '' });
  const [nodeId, setNodeId] = useState('');
  const [claim, setClaim] = useState<Person | null>(null);
  const org = useMemo(() => orgs.find(o => o.inviteCode.toUpperCase() === code.trim().toUpperCase()), [orgs, code]);

  const acceptCode = () => { if (!org) return setErr('That code didn’t work. Try IRON-4821, or the code from a team you just created.'); setErr(''); setStep(2); };
  const account = () => {
    if (!f.name.trim()) return setErr('Add your name.');
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Add a valid email.');
    if (f.pw.length < 8) return setErr('Password needs at least 8 characters.');
    setErr('');
    const inv = org!.people.find(p => p.email && p.email.toLowerCase() === f.email.trim().toLowerCase());
    setClaim(inv || null);
    if (inv) setNodeId(inv.nodeId);
    else { const leaf = org!.nodes.find(n => !org!.nodes.some(k => k.parentId === n.id)); setNodeId(leaf?.id || org!.nodes[0].id); }
    setStep(3);
  };

  // Preview where this person would land, using a hypothetical person on the chart.
  const preview = useMemo(() => {
    if (!org || !nodeId) return null;
    const pid = claim?.id || 'preview';
    const S = claim ? org : { nodes: org.nodes, people: [...org.people, { id: pid, name: f.name, nodeId, lead: false }] };
    const route = chain(S, pid);
    return { title: titleOf(S, pid), route: route.map(id => personById(S, id)!).map(p => `${p.name} (${titleOf(S, p.id)})`) };
  }, [org, nodeId, claim, f.name]);

  const confirm = () => {
    if (!org) return;
    let pid = claim?.id;
    if (claim) mut(org.id, o => { const p = o.people.find(x => x.id === claim.id)!; p.invited = false; p.name = f.name.trim(); });
    else { pid = uid('p'); const p: Person = { id: pid, name: f.name.trim(), email: f.email.trim(), nodeId, lead: false }; mut(org.id, o => { o.people.push(p); }); }
    setAccount({ name: f.name.trim(), email: f.email.trim() });
    open(org.id, pid);
    setStep(4);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="land-head"><Logo onClick={() => go('/')} /></header>
      <main className="center-main fade">
        <div className="card auth-card">
          <Steps n={4} cur={step} />
          {step === 1 && <>
            {org ? <div className="hstack"><span className="orgtile" style={{ width: 48, height: 48, borderRadius: 14, background: org.logoColor }}>{initials(org.name)}</span>
              <div><div className="b800">{org.name}</div><div className="small muted">{org.people.length} people · invite code recognised</div></div></div>
              : <div><div className="title26">Join your team</div><div className="muted">Paste the invite code someone shared with you.</div></div>}
            <div className="field"><label htmlFor="code">Invite code</label><input id="code" className="input mono" value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setErr(''); }} onKeyDown={e => e.key === 'Enter' && acceptCode()} placeholder="IRON-4821" /></div>
            {err && <div role="alert" className="err">{err}</div>}
            <button className="btn btn-primary" onClick={acceptCode}>Accept invite</button>
            <div className="tiny muted">Demo codes: {orgs.map(o => <button key={o.id} className="btn btn-ghost btn-sm mono" style={{ padding: '2px 6px' }} onClick={() => setCode(o.inviteCode)}>{o.inviteCode}</button>)}</div>
          </>}
          {step === 2 && <>
            <div className="title20">Create your account</div>
            <button className="btn btn-secondary" onClick={() => say('Google sign-in isn’t connected in this prototype. Use the form.')}>Continue with Google</button>
            <div className="orsep">or</div>
            <div className="field"><label>Name</label><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input className="input" type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></div>
            <div className="tiny muted">If you were invited by email, use that address and we’ll find your box.</div>
            <div className="field"><label>Password</label><input className="input" type="password" value={f.pw} onChange={e => setF({ ...f, pw: e.target.value })} onKeyDown={e => e.key === 'Enter' && account()} /></div>
            {err && <div role="alert" className="err">{err}</div>}
            <button className="btn btn-primary" onClick={account}>Create account</button>
          </>}
          {step === 3 && org && <>
            <div className="title20">Confirm your role</div>
            {claim ? <div className="callout-ok">✓ You were invited. We’ve kept your spot on the chart.</div> :
              <div className="field"><label>Where do you sit?</label>
                <select className="input" value={nodeId} onChange={e => setNodeId(e.target.value)}>
                  {org.nodes.map(n => <option key={n.id} value={n.id}>{groupName(org, n)} · under {org.people.find(p => p.nodeId === n.id && p.lead)?.name || n.title}</option>)}
                </select></div>}
            {preview && <div className="inset" style={{ lineHeight: 1.6 }}><b className="b800">{claim ? titleOf(org, claim.id) : preview.title}</b><br />
              <span className="small muted">{preview.route.length ? 'Your requests go to ' + preview.route.join(', then ') + '.' : 'You’re at the top, so your requests are approved straight away.'}</span></div>}
            <button className="btn btn-primary" onClick={confirm}>That’s me</button>
            <button className="btn btn-ghost" onClick={() => say(`We’ll let ${org.people.find(p => p.lead)?.name || 'the organiser'} know so they can fix your role.`)}>This isn’t right</button>
          </>}
          {step === 4 && org && <div className="stack-s" style={{ alignItems: 'center', textAlign: 'center', padding: '12px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--p-h)', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 28 }}>✓</div>
            <div className="title20">You’re in</div>
            <div className="small muted">You now appear on {org.name}’s chart{nodeById(org, nodeId) ? ' in ' + groupName(org, nodeById(org, nodeId)!) : ''}.</div>
            <button className="btn btn-primary" onClick={() => go('/app/home')}>Go to {org.name}</button>
          </div>}
        </div>
      </main>
    </div>
  );
}
