import { useState } from 'react';
import { useStore, useUI } from '../../lib/store';
import { chain, isOpen, isTop, nameOf, spend, titleOf, tokens } from '../../lib/org';
import { matchesFor } from '../../lib/cluster';
import { shortDate, uid, when } from '../../lib/format';
import { Chip, Drawer, Steps, Switch } from '../../components/ui';
import { useCtx } from './ctx';

async function shrink(file: File, max = 520): Promise<string> {
  const url = URL.createObjectURL(file);
  const img = new Image(); img.src = url; await img.decode();
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL('image/jpeg', 0.7);
}

export function RequestDrawer({ id }: { id: string }) {
  const { org, me, m, mut, log } = useCtx();
  const orgs = useStore(s => s.orgs), clusters = useStore(s => s.clusters), borrows = useStore(s => s.borrows);
  const ui = useUI();
  const r = org.requests.find(x => x.id === id);
  const [note, setNote] = useState('');
  const [buy, setBuy] = useState(0);
  const [img, setImg] = useState<string | null>(null);
  const [ocr, setOcr] = useState({ merchant: '', date: '', total: '', line: '' });
  const [loc, setLoc] = useState('');
  const [share, setShare] = useState(false);
  const [edit, setEdit] = useState<{ cost: string; reason: string } | null>(null);
  const close = () => ui.set({ reqId: null });
  if (!r) return null;

  const ch = chain(org, r.byId), next = ch[ch.indexOf(me) + 1];
  const canAct = isOpen(r) && r.holderId === me;
  const isRequester = r.byId === me;
  const canBuy = r.status === 'approved' && (isRequester || isTop(org, me));
  const budget = org.budgets[r.dept] || 0, left = budget - spend(org, r.dept);
  const t = tokens(r.item);
  const past = org.requests.filter(x => x.id !== r.id && x.dept === r.dept && !isOpen(x) && tokens(x.item).some(k => t.includes(k))).slice(0, 2);
  const inv = matchesFor(r.item, org, orgs, clusters, borrows);

  const decide = (kind: 'approve' | 'pass' | 'back' | 'reject') => {
    const what = kind === 'approve' ? 'Approved' : kind === 'pass' ? 'Passed up to ' + nameOf(org, next) : kind === 'back' ? 'Sent back to ' + nameOf(org, r.byId) : 'Rejected';
    mut(o => {
      const x = o.requests.find(y => y.id === id)!;
      if (kind === 'approve') { x.status = 'approved'; x.holderId = null; }
      if (kind === 'pass') { x.status = 'passed'; x.holderId = next; }
      if (kind === 'back') { x.status = 'sentback'; x.holderId = null; }
      if (kind === 'reject') { x.status = 'rejected'; x.holderId = null; }
      log(x, what, note);
    });
    setNote(''); ui.say(what + '.');
  };
  const resubmit = () => {
    const c = chain(org, me);
    mut(o => {
      const x = o.requests.find(y => y.id === id)!;
      if (edit) { const v = parseFloat(edit.cost); if (v > 0) x.cost = v; x.reason = edit.reason || x.reason; }
      x.status = c.length ? 'pending' : 'approved'; x.holderId = c[0] || null;
      log(x, 'Updated and resent' + (edit ? ' · ' + m(parseFloat(edit.cost) || r.cost) : ''));
    });
    setEdit(null); ui.say('Resent to ' + nameOf(org, c[0]) + '.');
  };
  const startBuy = () => { setBuy(1); setImg(null); setLoc(org.items.find(i => i.dept === r.dept)?.loc || 'Workshop, parts shelf'); setShare(false); };
  const toOcr = (sample: boolean) => {
    setOcr({ merchant: r.merchant || (sample ? 'RS Components' : ''), date: shortDate(Date.now()), total: String(r.cost), line: r.item });
    if (sample) setImg(null);
    setBuy(2);
  };
  const finish = (addInv: boolean) => {
    const total = parseFloat(ocr.total) || r.cost;
    mut(o => {
      const x = o.requests.find(y => y.id === id)!;
      if (Math.abs(total - x.cost) > 0.001) { log(x, `Receipt total ${m(total)} (estimate was ${m(x.cost)})`); x.cost = total; }
      x.status = 'bought'; x.receipt = true; x.merchant = ocr.merchant || x.merchant; if (img) x.receiptImg = img;
      log(x, 'Marked bought · receipt attached' + (addInv ? ' · added to inventory' : ''));
      if (addInv) o.items.unshift({ id: uid('I'), name: x.item.replace(/\s*[×x]\s*\d+\s*$/i, ''), qty: x.qty, loc: loc || 'Unsorted', dept: x.dept, status: 'available', keeperId: x.byId, shared: share });
    });
    setBuy(0);
    ui.say(addInv ? 'Bought. Added to ' + r.dept + ' inventory.' : 'Marked as bought.');
  };

  return (
    <Drawer onClose={close} label={'Request ' + r.id}>
      <div className="hstack" style={{ flexWrap: 'nowrap' }}><span className="small muted">{r.id} · {r.dept}{r.tag && r.tag !== '—' ? ' · ' + r.tag : ''}</span><button className="x" style={{ marginLeft: 'auto' }} onClick={close} aria-label="Close">✕</button></div>
      <div>
        <div className="title26">{r.item}</div>
        <div className="hstack" style={{ marginTop: 8 }}><span className="b900" style={{ fontSize: 24, color: 'var(--p800)' }}>{m(r.cost)}</span><Chip s={r.status} />{isOpen(r) && <span className="small muted">with {nameOf(org, r.holderId)}</span>}</div>
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.6 }}>
        <span className="muted">Requested by</span> {nameOf(org, r.byId)} <span className="muted">({titleOf(org, r.byId)})</span> · <span className="muted">Qty</span> {r.qty}<br />
        <span className="muted">Why:</span> {r.reason}
        {r.link && <><br /><span className="muted">Link:</span> <a href={r.link} target="_blank" rel="noreferrer">{r.link.replace(/^https?:\/\//, '').slice(0, 48)}</a></>}
        <br /><span className="muted">Route:</span> {ch.length ? ch.map(p => nameOf(org, p)).join(' → ') : 'top of the chart'}
      </div>
      {r.flag && isOpen(r) && <div className="callout-warn">⚑ {r.flag}</div>}

      {canAct && <div className="inset stack-s" style={{ gap: 4, fontSize: 14 }}>
        <span><b>{r.dept}:</b> {m(left)} of {m(budget)} budget left <span className="muted">(information only)</span>{left - r.cost < 0 ? <span style={{ color: 'var(--warn)' }}> · this would go {m(r.cost - left)} over</span> : null}</span>
        <span className="muted">{past.length ? 'Similar: ' + past.map(p => `${p.item} ${m(p.cost)} on ${shortDate(p.createdAt)}, ${p.status} by ${p.trail[1]?.who || nameOf(org, p.byId)}`).join(' · ') : 'No similar purchases this term'}</span>
        <span className="muted">{inv.length ? inv.map(x => x.text).join(' · ') : 'Nothing similar in inventory or the cluster'}</span>
      </div>}

      {canAct && <div className="stack-s" style={{ gap: 10, padding: 16, borderRadius: 18, background: 'var(--rowbg)' }}>
        <div className="b800">Your decision</div>
        <input className="input white" value={note} onChange={e => setNote(e.target.value)} placeholder="Add a note (optional)" />
        <div className="hstack" style={{ gap: 8 }}>
          <button className="btn btn-primary" onClick={() => decide('approve')}>Approve</button>
          {next && <button className="btn btn-secondary" onClick={() => decide('pass')}>Pass up to {nameOf(org, next)}</button>}
          <button className="btn btn-secondary" onClick={() => decide('back')}>Send back</button>
          <button className="btn btn-ghost" onClick={() => decide('reject')}>Reject</button>
        </div>
        <div className="tiny muted">No fixed limits. Approve if it’s within your judgement.</div>
      </div>}
      {isOpen(r) && !canAct && <div className="small muted">Waiting on {nameOf(org, r.holderId)}. {isRequester ? 'You’ll get a notification when they decide.' : ''}</div>}

      {r.status === 'sentback' && isRequester && (edit ? <div className="stack-s inset">
        <div className="b800">Update your request</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
          <div className="field"><label>Cost</label><input className="input white" value={edit.cost} onChange={e => setEdit({ ...edit, cost: e.target.value })} /></div>
          <div className="field"><label>Why</label><input className="input white" value={edit.reason} onChange={e => setEdit({ ...edit, reason: e.target.value })} /></div>
        </div>
        <div className="hstack"><button className="btn btn-primary" onClick={resubmit}>Resend</button><button className="btn btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div>
      </div> : <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setEdit({ cost: String(r.cost), reason: r.reason })}>Update and resend</button>)}

      {canBuy && !buy && <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={startBuy}>Mark as bought</button>}

      {buy > 0 && <div className="fade stack-s" style={{ padding: 16, borderRadius: 18, background: 'var(--rowbg)' }}>
        <Steps n={3} cur={buy} />
        {buy === 1 && <div className="stack-s" style={{ alignItems: 'flex-start' }}>
          <div className="b800">Add the receipt</div>
          <label style={{ width: '100%', height: 140, borderRadius: 14, background: img ? `center/contain no-repeat url(${img}) #fff` : 'repeating-linear-gradient(45deg,#fff 0 10px,#eceef2 10px 11px)', display: 'grid', placeItems: 'center', cursor: 'pointer', fontSize: 13 }} className="mono muted">
            {!img && 'Tap to snap or upload a receipt photo'}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={async e => { const file = e.target.files?.[0]; if (file) { setImg(await shrink(file)); } }} />
          </label>
          <div className="hstack">{img && <button className="btn btn-primary" onClick={() => toOcr(false)}>Read receipt</button>}<button className={'btn ' + (img ? 'btn-ghost' : 'btn-primary')} onClick={() => toOcr(true)}>Use sample receipt</button></div>
        </div>}
        {buy === 2 && <div className="stack-s" style={{ gap: 8 }}>
          <div className="b800">Check what we read <span className="tiny muted" style={{ fontWeight: 400 }}>· AI suggestion, you confirm (OCR simulated in prototype)</span></div>
          {([['merchant', 'Merchant', ocr.merchant ? '95%' : '41%'], ['date', 'Date', '91%'], ['total', 'Total', '88%'], ['line', 'Line item', '82%']] as const).map(([k, l, c]) => (
            <div key={k} className="hstack" style={{ flexWrap: 'nowrap', background: '#fff', borderRadius: 12, padding: '4px 4px 4px 12px' }}>
              <span className="small muted" style={{ width: 80 }}>{l}</span>
              <input className="input" style={{ minHeight: 34, background: 'transparent' }} value={ocr[k]} onChange={e => setOcr({ ...ocr, [k]: e.target.value })} aria-label={l} />
              <span className="tiny muted" style={{ paddingRight: 8 }}>{c}</span></div>))}
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setBuy(3)}>Looks right</button>
        </div>}
        {buy === 3 && <div className="stack-s">
          <div className="b800">Add to inventory?</div>
          <div style={{ fontSize: 14 }}>{r.item} · {r.dept} · kept by {nameOf(org, r.byId)}</div>
          <div className="field"><label>Where is it kept?</label><input className="input white" value={loc} onChange={e => setLoc(e.target.value)} /></div>
          {org.clusterId && <div className="hstack" style={{ flexWrap: 'nowrap' }}><span style={{ flex: 1, fontSize: 14 }}>Share with the cluster</span><Switch on={share} onClick={() => setShare(!share)} label="Share with cluster" /></div>}
          <div className="hstack"><button className="btn btn-primary" onClick={() => finish(true)}>Confirm</button><button className="btn btn-ghost" onClick={() => finish(false)}>Skip inventory</button></div>
        </div>}
      </div>}

      {r.receiptImg && <div><div className="b800" style={{ marginBottom: 6 }}>Receipt</div><img src={r.receiptImg} alt="Receipt" style={{ maxWidth: '100%', borderRadius: 14, border: '1px solid var(--border)' }} /></div>}

      <div>
        <div className="b800" style={{ marginBottom: 10 }}>Activity</div>
        {r.trail.map((t, i) => <div key={i} className="tl"><div className="dotcol"><span className="dot" /><span className="line" /></div>
          <div style={{ paddingBottom: 14 }}><div style={{ fontSize: 14 }}><b className="b800">{t.who}</b> · {t.what}</div><div className="tiny muted">{when(t.at)}</div>{t.note && <div className="quote">“{t.note}”</div>}</div></div>)}
      </div>
    </Drawer>
  );
}
