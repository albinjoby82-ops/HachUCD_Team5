import { useEffect, useRef, useState } from 'react';

async function api(action: string, options?: RequestInit) {
  const response = await fetch(`/api/stripe?action=${action}`, options);
  let data;
  try { data = await response.json(); } catch { throw Error('Demo checkout is unavailable. Please try again later.'); }
  if (!response.ok) throw Error(data.error || 'Could not contact Stripe.');
  return data;
}

export function DemoCheckout() {
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [retry, setRetry] = useState(0);
  const attempt = useRef(''), pending = useRef(false);
  useEffect(() => {
    let active = true;
    setError(''); setReady(false);
    api('config').then(() => { if (active) setReady(true); }).catch(e => { if (active) setError(e.message); });
    const params = new URLSearchParams(location.search);
    if (params.get('checkout') === 'cancelled') setNotice('Checkout cancelled. No payment was made.');
    if (params.get('checkout') === 'success') {
      setNotice('Checking your test payment with Stripe…');
      api(`status&session_id=${encodeURIComponent(params.get('session_id') || '')}`).then(result => {
        if (active) setNotice(result.verified ? 'Test payment confirmed by Stripe. No real money was charged. This demo does not activate a paid account.' : 'Test payment is not confirmed yet. Retry the check in a moment.');
      }).catch(e => { if (active) setNotice(`Could not verify the test payment. ${e.message}`); });
    }
    return () => { active = false; };
  }, [retry]);
  const start = async () => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      attempt.current ||= crypto.randomUUID();
      const result = await api('checkout', { method: 'POST', headers: { 'X-Checkout-Attempt': attempt.current } });
      const target = new URL(result.url);
      if (target.origin !== 'https://checkout.stripe.com') throw Error('Invalid checkout address.');
      location.assign(target.href);
    } catch (e) { setError((e as Error).message); pending.current = false; setBusy(false); }
  };
  return <section className="card pad stack-s" style={{ maxWidth: 480, width: '100%' }} aria-label="Demo subscription checkout">
    <span className="tag">Sandbox · no real payments</span>
    <h2 style={{ margin: 0 }}>Try subscription checkout</h2>
    <p style={{ margin: 0 }}>€9.99 / month per organisation — simulated for this demo.</p>
    <p className="small muted" style={{ margin: 0 }}>Use test card <strong>4242 4242 4242 4242</strong>, any future expiry and any three-digit CVC. Do not enter a real card.</p>
    {notice && <div className="callout-p" role="status">{notice}</div>}
    {error && <div role="alert">{error}</div>}
    <div className="hstack">
      <button className="btn btn-primary" disabled={!ready || busy} onClick={start}>{busy ? 'Opening Stripe…' : ready ? 'Try demo checkout' : 'Checkout unavailable'}</button>
      {(error || notice) && <button className="btn btn-ghost" disabled={busy} onClick={() => setRetry(n => n + 1)}>Retry check</button>}
    </div>
  </section>;
}
