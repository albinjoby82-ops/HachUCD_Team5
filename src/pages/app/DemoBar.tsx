import { go } from '../../lib/router';
import { useStore, useUI } from '../../lib/store';
import { deptOfNode, isTop, nodeById, titleOf } from '../../lib/org';
import { initials } from '../../lib/format';
import { DEMO_ORG } from '../../lib/seed';
import { Dialog } from '../../components/ui';
import { useCtx } from './ctx';

const IRONCLAD_CHIPS: [string, string][] = [['tom', 'Mech member'], ['daniel', 'Mech captain'], ['aoife', 'Treasurer'], ['maya', 'Captain']];

export function DemoBar({ page }: { page: string }) {
  const { org, me } = useCtx();
  const setViewAs = useStore(s => s.setViewAs), open = useStore(s => s.open);
  const ui = useUI();
  const as = (pid: string) => { setViewAs(org.id, pid); ui.set({ reqId: null, profileId: null, bell: false }); };

  // Pick a representative cast: top people, one department lead, one member.
  const chips: [string, string][] = org.id === DEMO_ORG ? IRONCLAD_CHIPS : (() => {
    const tops = org.people.filter(p => isTop(org, p.id)).slice(0, 2);
    const dl = org.people.find(p => p.lead && deptOfNode(org, nodeById(org, p.nodeId)));
    const mem = org.people.find(p => !p.lead && deptOfNode(org, nodeById(org, p.nodeId)));
    return [...tops, dl, mem].filter(Boolean).map(p => [p!.id, titleOf(org, p!.id)] as [string, string]);
  })();

  const steps: { t: string; b: string; run: () => void }[] = [
    { t: 'Tom needs a part', b: 'Member submits a request. “Before you buy” finds 140 M3 bolts in the parts bin.', run: () => { open(DEMO_ORG, 'tom'); ui.set({ prefill: true, reqId: null }); go('/app/new'); } },
    { t: 'Daniel decides', b: 'Mech captain sees budget context, past purchases, a duplicate flag. Approve, pass up, send back or reject.', run: () => { open(DEMO_ORG, 'daniel'); go('/app/home'); ui.set({ reqId: 'R-104' }); } },
    { t: 'Aoife gets what was passed up', b: 'Treasurer only sees escalations, with Daniel’s note on the trail.', run: () => { open(DEMO_ORG, 'aoife'); go('/app/home'); ui.set({ reqId: 'R-103' }); } },
    { t: 'Tom marks it bought', b: 'Snap a receipt, OCR proposes fields, the item lands in inventory.', run: () => { open(DEMO_ORG, 'tom'); go('/app/requests'); ui.set({ reqId: 'R-102', reqFilter: 'mine' }); } },
    { t: 'Catch up mid-season', b: 'Import a bank export or spending sheet, review departments and overlaps, then see updated budgets across the workspace.', run: () => { open(DEMO_ORG, 'aoife'); ui.set({ finTab: 'import', reqId: null }); go('/app/finance'); } },
    { t: 'Borrow from the cluster', b: 'Tom borrows SkyLab’s 3D printer instead of buying one.', run: () => { open(DEMO_ORG, 'tom'); ui.set({ reqId: null }); go('/app/cluster'); } },
    { t: 'Daniel lends to Volt FS', b: 'Incoming borrow request. Approver is set by the chart: the item is Mechanical’s.', run: () => { open(DEMO_ORG, 'daniel'); ui.set({ reqId: null }); go('/app/cluster'); } },
    { t: 'Edit the chart live', b: 'As Maya: + under Mechanical captain, name it “Pneumatics lead”, drag Sam in, then Tom. Trace Tom: Sam → Daniel → Aoife → Maya.', run: () => { open(DEMO_ORG, 'maya'); ui.set({ reqId: null }); go('/app/team'); } },
    { t: 'Register a new team from scratch', b: 'Sign-up → modules → build the flowchart → invite → live workspace.', run: () => go('/signup') },
  ];

  return (
    <>
      {ui.tour && <div className="tour" role="dialog" aria-label="Demo script">
        <div className="hstack" style={{ flexWrap: 'nowrap' }}><span className="b900" style={{ fontSize: 17, flex: 1 }}>Demo script</span><button className="x" onClick={() => ui.set({ tour: false })} aria-label="Close">✕</button></div>
        <div className="small muted" style={{ padding: '0 10px 4px' }}>Each step switches to the right person and screen.</div>
        {steps.map((s, i) => <button key={i} className="stepbtn" onClick={s.run}><span className="num">{i + 1}</span><span><span className="b800" style={{ fontSize: 14 }}>{s.t}</span><br /><span className="tiny muted">{s.b}</span></span></button>)}
      </div>}
      <div className="demo">
        <div className="lbl">Demo · view as
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className="who mini" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => ui.set({ tour: !ui.tour })}>{ui.tour ? 'Hide script' : 'Script'}</button>
            <button className="who mini" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() => go('/')}>Exit</button>
          </span></div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {chips.map(([pid, label]) => { const p = org.people.find(x => x.id === pid); if (!p) return null; return (
            <button key={pid} className={'who' + (pid === me ? ' on' : '')} aria-pressed={pid === me} onClick={() => as(pid)}><span className="b800">{p.name}</span><span style={{ fontSize: 11, opacity: .75 }}>{label}</span></button>); })}
          <select value={me} onChange={e => as(e.target.value)} aria-label="View as anyone">
            {org.people.map(p => <option key={p.id} value={p.id}>{p.name} · {titleOf(org, p.id)}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

export function OrgSwitcher() {
  const { org } = useCtx();
  const orgs = useStore(s => s.orgs), viewAs = useStore(s => s.viewAs), open = useStore(s => s.open);
  const ui = useUI();
  const close = () => ui.set({ orgs: false });
  return (
    <Dialog onClose={close} label="Switch organisation">
      <div className="title20">Your organisations</div>
      <div className="small muted">One account, separate workspaces. Records never mix.</div>
      {orgs.map(o => {
        const cur = o.id === org.id, pid = viewAs[o.id] || o.people.find(p => p.lead)?.id;
        return <button key={o.id} onClick={() => { open(o.id, pid); close(); ui.set({ reqId: null, profileId: null }); go('/app/home'); }}
          className="hstack" style={{ flexWrap: 'nowrap', padding: '12px 14px', border: cur ? '2px solid var(--p-h)' : '2px solid transparent', borderRadius: 16, background: cur ? 'var(--p100)' : '#f4f5f7', cursor: 'pointer', textAlign: 'left' }}>
          <span className="orgtile" style={{ background: o.logoColor }}>{initials(o.name)}</span>
          <span style={{ flex: 1 }}><span style={{ fontWeight: 700 }}>{o.name}</span><br /><span className="small muted">{cur ? 'Current · ' : ''}{pid ? titleOf(o, pid) : ''}{o.demo ? ' · sample' : ' · registered here'}</span></span>
        </button>;
      })}
      <div className="hstack" style={{ marginTop: 6 }}><button className="btn btn-secondary" onClick={() => { close(); go('/create'); }}>Create organisation</button><button className="btn btn-ghost" onClick={() => { close(); go('/join'); }}>Join with invite</button></div>
    </Dialog>
  );
}
