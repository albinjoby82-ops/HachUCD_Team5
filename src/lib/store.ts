import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Account, Borrow, Cluster, Org } from './types';
import { DEMO_ORG, seedData } from './seed';
import { personById } from './org';

interface Data { orgs: Org[]; clusters: Cluster[]; borrows: Borrow[] }

interface State extends Data {
  account: Account | null;
  currentOrgId: string;
  viewAs: Record<string, string>;
  mut: (orgId: string, fn: (o: Org) => void) => void;
  mutAll: (fn: (d: Data) => void) => void;
  addOrg: (o: Org, asPerson: string) => void;
  open: (orgId: string, personId?: string) => void;
  setViewAs: (orgId: string, pid: string) => void;
  setAccount: (a: Account | null) => void;
  reset: () => void;
}

export const useStore = create<State>()(persist((set, get) => ({
  ...seedData(),
  account: null,
  currentOrgId: DEMO_ORG,
  viewAs: { [DEMO_ORG]: 'tom' },
  mut: (orgId, fn) => set(s => ({ orgs: s.orgs.map(o => { if (o.id !== orgId) return o; const c = structuredClone(o); fn(c); return c; }) })),
  mutAll: fn => set(s => { const d = structuredClone({ orgs: s.orgs, clusters: s.clusters, borrows: s.borrows }); fn(d); return d; }),
  addOrg: (o, asPerson) => set(s => ({ orgs: [...s.orgs, o], currentOrgId: o.id, viewAs: { ...s.viewAs, [o.id]: asPerson } })),
  open: (orgId, personId) => set(s => ({ currentOrgId: orgId, viewAs: personId ? { ...s.viewAs, [orgId]: personId } : s.viewAs })),
  setViewAs: (orgId, pid) => set(s => ({ viewAs: { ...s.viewAs, [orgId]: pid } })),
  setAccount: a => set({ account: a }),
  reset: () => set({ ...seedData(), currentOrgId: DEMO_ORG, viewAs: { [DEMO_ORG]: 'tom' }, account: get().account }),
}), { name: 'commons-demo-v1' }));

export const useOrg = () => {
  const orgs = useStore(s => s.orgs), id = useStore(s => s.currentOrgId);
  return orgs.find(o => o.id === id) || orgs[0];
};

export const useMe = () => {
  const org = useOrg();
  const v = useStore(s => s.viewAs[org.id]);
  if (v && personById(org, v)) return v;
  return (org.people.find(p => p.lead) || org.people[0])?.id || '';
};

interface UI {
  toast: string;
  reqId: string | null;
  profileId: string | null;
  bell: boolean;
  orgs: boolean;
  tour: boolean;
  borrow: { orgId: string; itemId: string } | null;
  finTab: 'overview' | 'budgets' | 'import';
  prefill: boolean;
  reqFilter: 'wait' | 'mine' | 'all';
  set:(p: Partial<Omit<UI, 'set' | 'say'>>) => void;
  say: (msg: string) => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useUI = create<UI>()(set => ({
  toast: '', reqId: null, profileId: null, bell: false, orgs: false, tour: false, borrow: null, finTab: 'overview', prefill: false, reqFilter: 'wait',
  set: p => set(p),
  say: msg => { set({ toast: msg }); clearTimeout(toastTimer); toastTimer = setTimeout(() => set({ toast: '' }), 3200); },
}));
export const say = (m: string) => useUI.getState().say(m);
