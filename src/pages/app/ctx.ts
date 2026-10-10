import type { Org, PurchaseRequest } from '../../lib/types';
import { useMe, useOrg, useStore } from '../../lib/store';
import { money } from '../../lib/format';
import { deptOf, isLead, isTop, nameOf } from '../../lib/org';

export function useCtx() {
  const org = useOrg();
  const me = useMe();
  const mutStore = useStore(s => s.mut);
  const meName = nameOf(org, me);
  return {
    org, me, meName,
    top: isTop(org, me), lead: isLead(org, me), myDept: deptOf(org, me),
    m: (n: number) => money(n, org.currency),
    mut: (fn: (o: Org) => void) => mutStore(org.id, fn),
    log: (r: PurchaseRequest, what: string, note?: string) => r.trail.push({ who: meName, what, at: Date.now(), note: note?.trim() || undefined }),
  };
}
