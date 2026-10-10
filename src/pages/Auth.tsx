import { useState } from 'react';
import { go } from '../lib/router';
import { say, useStore } from '../lib/store';
import { DEMO_ORG } from '../lib/seed';
import { Logo } from '../components/ui';

type Mode = 'signup' | 'login' | 'forgot';

export function Auth({ mode }: { mode: Mode }) {
  const setAccount = useStore(s => s.setAccount), orgs = useStore(s => s.orgs), open = useStore(s => s.open);
  const [f, setF] = useState({ name: '', email: '', pw: '' });
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setErr(''); };

  const submit = () => {
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setErr('Enter a valid email address.');
    if (mode === 'forgot') return setSent(true);
    if (f.pw.length < 8) return setErr('Password needs at least 8 characters.');
    if (mode === 'signup' && !f.name.trim()) return setErr('Add your name.');
    if (mode === 'signup') { setAccount({ name: f.name.trim(), email: f.email.trim() }); return go('/create'); }
    // Log in: open the first workspace where this email is on the chart, otherwise the demo.
    for (const o of orgs) {
      const p = o.people.find(x => x.email?.toLowerCase() === f.email.trim().toLowerCase());
      if (p) { setAccount({ name: p.name, email: f.email.trim() }); open(o.id, p.id); say('Welcome back, ' + p.name + '.'); return go('/app/home'); }
    }
    setAccount({ name: f.email.split('@')[0], email: f.email.trim() });
    open(DEMO_ORG, 'tom'); say('No workspace for that email yet, so here’s the demo.'); go('/app/home');
  };
  const google = () => {
    say('Google sign-in isn’t connected in this prototype.');
    if (mode === 'signup') { setAccount({ name: f.name.trim() || 'New organiser', email: f.email || '' }); go('/create'); }
  };

  const title = mode === 'signup' ? 'Create your account' : mode === 'login' ? 'Welcome back' : 'Reset your password';
  const cta = mode === 'signup' ? 'Create account' : mode === 'login' ? 'Log in' : 'Send reset link';
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="land-head"><Logo onClick={() => go('/')} /></header>
      <main className="center-main fade">
        <form className="card auth-card" onSubmit={e => { e.preventDefault(); submit(); }}>
          <div className="title26">{title}</div>
          {mode !== 'forgot' && <><button type="button" className="btn btn-secondary" onClick={google}>Continue with Google</button><div className="orsep">or</div></>}
          {mode === 'signup' && <div className="field"><label htmlFor="n">Your name</label><input id="n" className="input" value={f.name} onChange={set('name')} autoComplete="name" /></div>}
          <div className="field"><label htmlFor="e">Email</label><input id="e" className="input" type="email" value={f.email} onChange={set('email')} autoComplete="email" /></div>
          {mode !== 'forgot' && <div className="field"><label htmlFor="pw">Password</label><input id="pw" className="input" type="password" value={f.pw} onChange={set('pw')} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></div>}
          {err && <div role="alert" className="err">{err}</div>}
          {sent && <div role="status" className="callout-ok">✓ Check your inbox for a reset link (sample — email isn’t connected).</div>}
          <button className="btn btn-primary" type="submit">{cta}</button>
          {mode === 'login' && <div className="tiny muted">Tip: log in as <span className="mono">maya@ironclad.ie</span> or <span className="mono">tom@ironclad.ie</span> (any 8+ char password).</div>}
          <div className="hstack" style={{ justifyContent: 'space-between', fontSize: 14 }}>
            {mode === 'signup' && <button type="button" className="btn btn-ghost" style={{ padding: '4px 0' }} onClick={() => go('/login')}>Have an account? Log in</button>}
            {mode === 'login' && <><button type="button" className="btn btn-ghost" style={{ padding: '4px 0' }} onClick={() => go('/forgot')}>Forgot password?</button><button type="button" className="btn btn-ghost" style={{ padding: '4px 0' }} onClick={() => go('/signup')}>New here? Sign up</button></>}
            {mode === 'forgot' && <button type="button" className="btn btn-ghost" style={{ padding: '4px 0' }} onClick={() => go('/login')}>Back to log in</button>}
          </div>
          <div className="tiny muted">Prototype: accounts live in this browser only. Don’t use a real password.</div>
        </form>
      </main>
    </div>
  );
}
