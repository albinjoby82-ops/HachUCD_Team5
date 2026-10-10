import type { Borrow, Cluster, Item, Org } from './types';
import { dueText } from './format';
import { deptRootOf, isTop, leadsOf, nameOf, tokens } from './org';

export const itemState = (i: Item) => (i.status === 'borrowed' && i.due && i.due < Date.now() ? 'overdue' : i.status);

export function holderText(org: Org, i: Item) {
  if (i.status === 'borrowed') {
    const who = i.holderId ? nameOf(org, i.holderId) : i.holderName || 'someone';
    return 'With ' + who + (i.due ? (i.due < Date.now() ? ' · was due ' : ' until ') + dueText(i.due) : '');
  }
  if (i.keeperId) return 'Kept by ' + nameOf(org, i.keeperId) + ' · ' + i.loc;
  return i.loc;
}

export const clusterOf = (clusters: Cluster[], org: Org) => clusters.find(c => c.id === org.clusterId);

/** Who approves lending an item: the lead of the item's department, or anyone at the top. */
export function approversFor(org: Org, item: Item) {
  const root = org.nodes.find(n => n.dept === item.dept);
  const leads = root ? leadsOf(org, root.id).map(p => p.id) : [];
  const tops = org.people.filter(p => isTop(org, p.id)).map(p => p.id);
  return { leads, tops, all: [...leads, ...tops] };
}
export const canLend = (org: Org, item: Item, me: string) => approversFor(org, item).all.includes(me);
export const canManageItem = (org: Org, item: Item, me: string) => {
  if (isTop(org, me)) return true;
  const p = org.people.find(x => x.id === me); if (!p?.lead) return false;
  const root = deptRootOf(org, org.nodes.find(n => n.id === p.nodeId));
  return root?.dept === item.dept;
};

export interface Match { text: string; sub: string; kind: 'own' | 'cluster'; orgId: string; itemId: string; available: boolean }

/** "Before you buy": match item name tokens against own inventory (not used up) and the cluster's shared items. */
export function matchesFor(text: string, org: Org, orgs: Org[], clusters: Cluster[], borrows: Borrow[]): Match[] {
  const t = tokens(text); if (!t.length) return [];
  const hit = (name: string) => t.some(x => name.toLowerCase().includes(x));
  const own: Match[] = org.items.filter(i => i.status !== 'usedup' && hit(i.name)).map(i => ({
    text: `${i.dept} has ${i.qty} × ${i.name}`, sub: i.loc + (i.status === 'borrowed' ? ' · borrowed' + (i.due ? ' until ' + dueText(i.due) : '') : i.status === 'damaged' ? ' · damaged' : ''),
    kind: 'own', orgId: org.id, itemId: i.id, available: i.status === 'available',
  }));
  const c = clusterOf(clusters, org);
  const cl: Match[] = c ? orgs.filter(o => o.id !== org.id && c.orgIds.includes(o.id)).flatMap(o => o.items.filter(i => i.shared && i.status !== 'usedup' && hit(i.name)).map(i => {
    const pending = borrows.some(b => b.ownerOrgId === o.id && b.itemId === i.id && b.status === 'requested');
    return { text: `${o.name} shares ${i.name}`, sub: c.name + ' · ' + (i.status === 'available' ? (pending ? 'requested by someone' : 'available now') : 'busy' + (i.due ? ' until ' + dueText(i.due) : '')), kind: 'cluster' as const, orgId: o.id, itemId: i.id, available: i.status === 'available' };
  })) : [];
  return [...own, ...cl].slice(0, 3);
}

export function holding(org: Org, me: string, orgs: Org[], borrows: Borrow[]) {
  const own = org.items.filter(i => (i.status === 'borrowed' && i.holderId === me) || i.keeperId === me).map(i => ({
    key: i.id, name: i.name, sub: i.status === 'borrowed' ? (i.due ? 'Due back ' + dueText(i.due) : 'Borrowed') : 'You keep it · ' + i.loc, state: itemState(i), due: i.status === 'borrowed' ? i.due : undefined,
  }));
  const fromCluster = borrows.filter(b => b.status === 'active' && b.borrowerOrgId === org.id && b.borrowerPersonId === me).map(b => {
    const o = orgs.find(x => x.id === b.ownerOrgId), it = o?.items.find(i => i.id === b.itemId);
    return { key: b.id, name: it?.name || 'Item', sub: 'From ' + (o?.name || 'another team') + ' · due ' + dueText(b.until), state: b.until < Date.now() ? 'overdue' : 'borrowed', due: b.until };
  });
  return [...own, ...fromCluster];
}
