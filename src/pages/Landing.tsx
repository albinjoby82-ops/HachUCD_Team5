import { go } from '../lib/router';
import { useStore } from '../lib/store';
import { DEMO_ORG } from '../lib/seed';
import { Logo } from '../components/ui';

const PILLARS = [
  { icon: '🧭', title: 'Team structure', body: 'Draw your departments and roles once as a flowchart. The chart decides who approves what and who sees which records.', preview: <MiniChart /> },
  { icon: '💸', title: 'Money across departments', body: 'Requests go up the chain, budgets guide decisions, and the bank export sorts itself with rules and AI suggestions.', preview: <MiniMoney /> },
  { icon: '📦', title: 'Shared inventory', body: 'Know what you own and who has it. Borrow from nearby teams in your cluster before buying new.', preview: <MiniInv /> },
];

export function Landing() {
  const open = useStore(s => s.open);
  const demo = () => { open(DEMO_ORG, 'tom'); go('/app/home'); };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="land-head">
        <Logo onClick={() => go('/')} />
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn btn-ghost" onClick={() => go('/login')}>Log in</button>
        <button className="btn btn-primary" onClick={() => go('/signup')}>Get started</button>
      </header>
      <main className="land-main fade">
        <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20, maxWidth: 780 }}>
          <span className="tag">Hack UCD · working prototype</span>
          <h1 className="land-hero">Build your team once. <span style={{ color: 'var(--p)' }}>Commons handles the rest.</span></h1>
          <p style={{ fontSize: 19, color: 'var(--muted)', margin: 0, maxWidth: 600 }}>Every purchase goes to the right person and the money stays organised. You always know what your team, and the teams around you, own.</p>
          <div className="hstack">
            <button className="btn btn-primary" onClick={() => go('/signup')}>Create an organisation</button>
            <button className="btn btn-secondary" onClick={() => go('/join')}>Join with an invite</button>
            <button className="btn btn-ghost" onClick={demo}>Open the live demo →</button>
          </div>
          <div className="small muted">For student engineering teams, societies and early-stage startups.</div>
          <div className="card pad" style={{ marginTop: 12, maxWidth: 420 }}>
  <h2>Teamly Subscription</h2>
  <h3>€9.99 / month</h3>
  <p>One monthly subscription for your entire organisation.</p>

  <button
    className="btn btn-primary"
    onClick={async () => {
      try {
        const response = await fetch(
          'http://localhost:3000/api/create-checkout-session',
          { method: 'POST' }
        );

        if (!response.ok) {
          throw new Error('Could not start checkout');
        }

        const data = await response.json();
        window.location.href = data.url;
      } catch (error) {
        alert('Unable to open Stripe Checkout. Please try again.');
      }
    }}
  >
    Subscribe for €9.99/month
  </button>
</div>
        </section>
        <section className="g3" style={{ gap: 20 }}>
          {PILLARS.map(p => (
            <div key={p.title} className="card pad stack-s">
              <div style={{ height: 150, borderRadius: 18, background: 'var(--rowbg)', overflow: 'hidden', display: 'grid', placeItems: 'center' }}>{p.preview}</div>
              <div className="title20">{p.icon} {p.title}</div>
              <div className="muted">{p.body}</div>
            </div>
          ))}
        </section>
        <section className="card pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 18 }}>
          {[['1', 'Register', 'Pick a template or start blank, then shape your chart by dragging boxes and people.'], ['2', 'Invite', 'Every invite lands someone in the right box. Their approval route is set instantly.'], ['3', 'Request', 'Members ask, captains decide, treasurers see what was passed up. Every step is on the trail.'], ['4', 'Reconcile', 'Drop in the bank CSV. Rules, AI suggestions and flags do the boring part.']].map(([n, t, b]) => (
            <div key={n} className="stack-s" style={{ gap: 6 }}>
              <div className="hstack"><span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--p)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 900 }}>{n}</span><span className="b800">{t}</span></div>
              <div className="small muted">{b}</div></div>
          ))}
        </section>
      </main>
    </div>
  );
}

function MiniChart() {
  const box = (x: number, y: number, c: string) => <g><rect x={x} y={y} width="56" height="26" rx="8" fill="#fff" /><rect x={x} y={y} width="56" height="5" rx="2.5" fill={c} /></g>;
  return <svg viewBox="0 0 220 130" width="100%" height="100%" aria-hidden>
    <path d="M110 36 V52 M110 52 H46 V70 M110 52 V70 M110 52 H174 V70" stroke="#cfc6e8" strokeWidth="2" fill="none" />
    {box(82, 10, '#7c4dff')}{box(18, 70, '#f5a623')}{box(82, 70, '#ff6b5c')}{box(146, 70, '#12b8a0')}
    <path d="M110 96 V108" stroke="#7c4dff" strokeWidth="2" strokeDasharray="4 3" /><circle cx="110" cy="114" r="6" fill="#7c4dff" />
  </svg>;
}
function MiniMoney() {
  return <div style={{ width: '80%', display: 'flex', flexDirection: 'column', gap: 10 }}>
    {[['Mechanical', 62, '#ff6b5c'], ['Electrical', 54, '#f5a623'], ['Programming', 44, '#12b8a0']].map(([n, w, c]) => (
      <div key={n as string}><div className="tiny muted" style={{ marginBottom: 3 }}>{n}</div><div className="bar"><div style={{ width: w + '%', background: c as string }} /></div></div>))}
  </div>;
}
function MiniInv() {
  return <div style={{ width: '82%', display: 'flex', flexDirection: 'column', gap: 6 }}>
    {[['Prusa 3D printer', '● Available', '#e3f2e8', '#1f5a35'], ['Oscilloscope', '⇄ Borrowed', '#f1ecff', '#5126b8'], ['Laser cutter', '! Overdue', '#f8e6e3', '#8f2f22']].map(([n, s, bg, fg]) => (
      <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 12 }}><span style={{ flex: 1, fontWeight: 700 }}>{n}</span><span className="chip" style={{ background: bg, color: fg }}>{s}</span></div>))}
  </div>;
}
