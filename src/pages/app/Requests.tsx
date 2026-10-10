import { useUI } from '../../lib/store';
import { canSee, isOpen } from '../../lib/org';
import { Pills } from '../../components/ui';
import { useCtx } from './ctx';
import { ReqRow } from './Home';

export function Requests() {
  const { org, me, lead, m } = useCtx();
  const f = useUI(s => s.reqFilter), set = useUI(s => s.set);
  const visible = org.requests.filter(r => canSee(org, r, me));
  const list = f === 'wait' ? visible.filter(r => isOpen(r) && r.holderId === me) : f === 'mine' ? org.requests.filter(r => r.byId === me) : visible;
  const opts: ['wait' | 'mine' | 'all', string][] = [...(lead ? [['wait', 'Waiting for me'] as ['wait', string]] : []), ['mine', 'Mine'], ['all', 'Everything I can see']];
  const value = !lead && f === 'wait' ? 'mine' : f;
  const shown = !lead && f === 'wait' ? org.requests.filter(r => r.byId === me) : list;
  return (
    <div className="stack-s fade" style={{ gap: 16 }}>
      <Pills value={value} options={opts} onChange={v => set({ reqFilter: v })} />
      <div className="card list">
        {shown.map(r => <ReqRow key={r.id} r={r} org={org} m={m} showCost />)}
        {!shown.length && <div className="empty">Nothing here.</div>}
      </div>
      <div className="small muted">You see requests you made, plus anything in your approval chain once it reaches you or is decided. Higher-ups don’t see what’s still pending below them.</div>
    </div>
  );
}
