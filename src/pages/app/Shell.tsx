import { useEffect } from 'react';
import { go } from '../../lib/router';
import { useStore, useUI } from '../../lib/store';
import { canSee, isOpen, nameOf, statusWord } from '../../lib/org';
import { canLend, holding } from '../../lib/cluster';
import { initials } from '../../lib/format';
import { Logo } from '../../components/ui';
import { useCtx } from './ctx';
import { Home } from './Home';
import { Requests } from './Requests';
import { NewRequest } from './NewRequest';
import { RequestDrawer } from './RequestDrawer';
import { Finance } from './Finance';
import { Inventory } from './Inventory';
import { ClusterPage, BorrowDialog } from './Cluster';
import { Team } from './Team';
import { Settings } from './Settings';
import { ProfileDrawer } from './ProfileDrawer';
import { DemoBar, OrgSwitcher } from './DemoBar';

const TITLES: Record<string, string> = { home: '', requests: 'Requests', new: 'New request', finance: 'Finance', inventory: 'Inventory', cluster: 'Cluster', team: 'Team', settings: 'Settings' };

export function Shell({ page }: { page: string }) {
  const { org, me, lead, top, m } = useCtx();
  const orgs = useStore(s => s.orgs), borrows = useStore(s => s.borrows);
  const ui = useUI();
  const mods = org.modules;

  const visible = org.requests.filter(r => canSee(org, r, me));
  const waiting = visible.filter(r => isOpen(r) && r.holderId === me);
  const incoming = borrows.filter(b => b.ownerOrgId === org.id && b.status === 'requested').filter(b => { const it = org.items.find(i => i.id === b.itemId); return it && canLend(org, it, me); });
  const held = holding(org, me, orgs, borrows).filter(h => h.due && h.due - Date.now() < 3 * 86_400_000);

  const notifs = [
    ...waiting.map(r => ({ k: r.id, text: nameOf(org, r.byId) + ' needs a decision', sub: r.item + ' · ' + m(r.cost), go: () => ui.set({ reqId: r.id, bell: false }) })),
    ...org.requests.filter(r => r.byId === me && ['approved', 'sentback', 'rejected'].includes(r.status)).map(r => ({ k: 'm' + r.id, text: 'Your request was ' + statusWord(r.status), sub: r.item, go: () => ui.set({ reqId: r.id, bell: false }) })),
    ...held.map(h => ({ k: 'h' + h.key, text: h.name + (h.state === 'overdue' ? ' is overdue' : ' is due back soon'), sub: h.sub, go: () => { ui.set({ bell: false }); go('/app/inventory'); } })),
    ...incoming.map(b => ({ k: b.id, text: b.borrowerName + ' (' + (orgs.find(o => o.id === b.borrowerOrgId)?.name || 'another team') + ') wants to borrow', sub: org.items.find(i => i.id === b.itemId)?.name || '', go: () => { ui.set({ bell: false }); go('/app/cluster'); } })),
    ...(top && mods.finance && !org.financeImports?.length ? [{ k: 'imp', text: 'Catch up your team finances', sub: 'Import a bank export or spending sheet', go: () => { ui.set({ bell: false, finTab: 'import' }); go('/app/finance'); } }] : []),
  ];

  const nav: [string, string, boolean, number][] = [
    ['home', 'Home', true, 0],
    ['requests', 'Requests', mods.finance, waiting.length],
    ['finance', 'Finance', mods.finance && lead, 0],
    ['inventory', 'Inventory', mods.inventory, 0],
    ['cluster', 'Cluster', mods.cluster, incoming.length],
    ['team', 'Team', true, 0],
    ['settings', 'Settings', true, 0],
  ];
  const allowed = nav.find(n => n[0] === (page === 'new' ? 'requests' : page));
  useEffect(() => {
    // Only redirect if the URL still points at this page (a demo-script jump may already be on its way elsewhere).
    if (location.hash.split('?')[0].split('/')[2] !== page) return;
    if (!allowed || !allowed[2]) go('/app/home');
  }, [page, allowed?.[2]]);

  const body = (() => {
    switch (page) {
      case 'requests': return <Requests />;
      case 'new': return <NewRequest />;
      case 'finance': return <Finance key={org.id + me} />;
      case 'inventory': return <Inventory key={org.id + me} />;
      case 'cluster': return <ClusterPage />;
      case 'team': return <Team />;
      case 'settings': return <Settings />;
      default: return <Home />;
    }
  })();

  return (
    <div className="shell">
      <aside className="side">
        <Logo onClick={() => go('/')} />
        <nav className="nav" aria-label="Main">
          {nav.filter(n => n[2]).map(([k, label, , badge]) => (
            <button key={k} className={page === k || (k === 'requests' && page === 'new') ? 'on' : ''} onClick={() => go('/app/' + k)} aria-current={page === k ? 'page' : undefined}>
              <span>{label}</span>{badge ? <span className="badge">{badge}</span> : null}
            </button>
          ))}
        </nav>
        <button className="orgchip side-extra" onClick={() => ui.set({ orgs: true })}>
          <span className="orgtile" style={{ background: org.logoColor }}>{initials(org.name)}</span>
          <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25, flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{org.name}</span>
            <span className="tiny muted">Switch organisation</span></span>
        </button>
      </aside>
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header className="topbar">
          <h2>{TITLES[page] ?? ''}</h2>
          {org.demo && <span className="sample-pill">Sample data</span>}
          <div style={{ position: 'relative' }}>
            <button className="bell" onClick={() => ui.set({ bell: !ui.bell })} aria-label={'Notifications, ' + notifs.length}>🔔{notifs.length > 0 && <span className="count">{notifs.length}</span>}</button>
            {ui.bell && <div className="pop fade">
              <div style={{ padding: '10px 12px', fontWeight: 800 }}>Notifications</div>
              {notifs.map(n => <button key={n.k} className="row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '10px 12px' }} onClick={n.go}><span style={{ fontSize: 14, fontWeight: 600 }}>{n.text}</span><span className="tiny muted">{n.sub}</span></button>)}
              {!notifs.length && <div style={{ padding: '14px 12px' }} className="muted">You’re all caught up.</div>}
            </div>}
          </div>
          {mods.finance && <button className="btn btn-primary" onClick={() => go('/app/new')}>New request</button>}
        </header>
        <div className={'content' + (page === 'team' ? ' wide' : '')} key={page + me}>{body}</div>
      </main>
      {ui.reqId && <RequestDrawer id={ui.reqId} />}
      {ui.profileId && <ProfileDrawer pid={ui.profileId} />}
      {ui.borrow && <BorrowDialog />}
      {ui.orgs && <OrgSwitcher />}
      <DemoBar page={page} />
    </div>
  );
}
