// Business rules ported from the design handoff. Everything here is derived from the chart.
import type { Org, OrgNode, Person, PurchaseRequest, ReqStatus } from './types';

export const DEPT_PALETTE = ['#ff6b5c', '#f5a623', '#12b8a0', '#3d8bfd', '#e255a1', '#8a6cff', '#2fb36d', '#ff8a3d'];
export const SHARED = 'Shared';
export const SHARED_COLOR = '#7c4dff';
export const TOP_COLOR = '#7c4dff';

export interface Structure { nodes: OrgNode[]; people: Person[] }

export const nodeById = (s: Structure, id: string | null | undefined) => (id ? s.nodes.find(n => n.id === id) : undefined);
export const personById = (s: Structure, id: string | null | undefined) => (id ? s.people.find(p => p.id === id) : undefined);
export const nameOf = (s: Structure, id: string | null | undefined) => personById(s, id)?.name ?? 'Former member';
export const leadsOf = (s: Structure, nodeId: string) => s.people.filter(p => p.nodeId === nodeId && p.lead);
export const membersOf = (s: Structure, nodeId: string) => s.people.filter(p => p.nodeId === nodeId && !p.lead);
export const childrenOf = (s: Structure, nodeId: string) => s.nodes.filter(n => n.parentId === nodeId);
export const roots = (s: Structure) => s.nodes.filter(n => !n.parentId || !nodeById(s, n.parentId));

export function ancestors(s: Structure, node: OrgNode | undefined): OrgNode[] {
  const out: OrgNode[] = [];
  let n = node && nodeById(s, node.parentId);
  while (n && !out.includes(n)) { out.push(n); n = nodeById(s, n.parentId); }
  return out;
}

export function descendantIds(s: Structure, id: string): Set<string> {
  const out = new Set<string>(), stack = [id];
  while (stack.length) { const c = stack.pop()!; for (const k of childrenOf(s, c)) if (!out.has(k.id)) { out.add(k.id); stack.push(k.id); } }
  return out;
}

/** The department a box belongs to: its own, or the nearest one above it. */
export function deptRootOf(s: Structure, node: OrgNode | undefined): OrgNode | undefined {
  let n = node; const seen = new Set<string>();
  while (n && !seen.has(n.id)) { if (n.dept) return n; seen.add(n.id); n = nodeById(s, n.parentId); }
  return undefined;
}
export const deptOfNode = (s: Structure, node: OrgNode | undefined) => deptRootOf(s, node)?.dept;

export function departments(s: Structure): { name: string; color: string; nodeId: string }[] {
  const seen = new Set<string>(), out: { name: string; color: string; nodeId: string }[] = [];
  s.nodes.forEach(n => {
    if (n.dept && !seen.has(n.dept)) { seen.add(n.dept); out.push({ name: n.dept, color: n.color || DEPT_PALETTE[out.length % DEPT_PALETTE.length], nodeId: n.id }); }
  });
  return out;
}
export const deptNames = (s: Structure) => [...departments(s).map(d => d.name), SHARED];
export function deptColor(s: Structure, dept: string | undefined) {
  if (!dept || dept === SHARED) return SHARED_COLOR;
  return departments(s).find(d => d.name === dept)?.color || SHARED_COLOR;
}

export const deptOf = (s: Structure, pid: string | null | undefined) => {
  const p = personById(s, pid); return p ? deptOfNode(s, nodeById(s, p.nodeId)) : undefined;
};

/** Leads a box that sits above every department (captain, treasurer, founder...). */
export const isTop = (s: Structure, pid: string | null | undefined) => {
  const p = personById(s, pid); return !!p && p.lead && !deptOfNode(s, nodeById(s, p.nodeId));
};
export const isLead = (s: Structure, pid: string | null | undefined) => !!personById(s, pid)?.lead;

/** Member label: "Pneumatics lead" box -> "Pneumatics member". */
export function groupName(s: Structure, node: OrgNode) {
  const stripped = node.title.replace(/\s*(lead|captain|head|manager|director|chair(person)?)\s*$/i, '').trim();
  if (stripped && stripped !== node.title) return stripped;
  return node.dept || deptOfNode(s, node) || node.title;
}

export function titleOf(s: Structure, pid: string | null | undefined) {
  const p = personById(s, pid); if (!p) return '';
  const n = nodeById(s, p.nodeId); if (!n) return '';
  return p.lead ? n.title : groupName(s, n) + ' member';
}

/**
 * Approval chain for a requester: start at the box they're a member of
 * (or the box above the one they lead), walk up, collect each box's first lead.
 */
export function chain(s: Structure, pid: string): string[] {
  const p = personById(s, pid); if (!p) return [];
  const own = nodeById(s, p.nodeId);
  let n = p.lead ? nodeById(s, own?.parentId) : own;
  const out: string[] = [], seen = new Set<string>();
  while (n && !seen.has(n.id)) {
    seen.add(n.id);
    const l = leadsOf(s, n.id).find(x => x.id !== pid);
    if (l && !out.includes(l.id)) out.push(l.id);
    n = nodeById(s, n.parentId);
  }
  return out;
}

/** Boxes a request walks through, for highlighting on the chart. */
export function routeNodes(s: Structure, pid: string): string[] {
  const p = personById(s, pid); if (!p) return [];
  const own = nodeById(s, p.nodeId); if (!own) return [];
  return [own.id, ...ancestors(s, own).map(n => n.id)];
}

export const isOpen = (r: PurchaseRequest) => r.status === 'pending' || r.status === 'passed';

/** You see a request if you made it, or you're in its chain and it's closed or has reached you. */
export function canSee(s: Structure, r: PurchaseRequest, me: string) {
  if (r.byId === me) return true;
  const c = chain(s, r.byId), i = c.indexOf(me);
  if (i < 0) return isTop(s, me) && !isOpen(r);
  return isOpen(r) ? c.indexOf(r.holderId || '') >= i : true;
}

export const spend = (o: Org, dept: string) =>
  (o.baseSpend[dept] || 0) + o.requests.filter(r => r.dept === dept && (r.status === 'approved' || r.status === 'bought')).reduce((a, r) => a + r.cost, 0);

export const tokens = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 4 || /^m\d+$/.test(t));

export interface ChipMeta { glyph: string; label: string; bg: string; fg: string }
export const CHIPS: Record<string, ChipMeta> = {
  pending: { glyph: '◷', label: 'Pending', bg: '#eef1f5', fg: '#3c4652' },
  passed: { glyph: '↑', label: 'Passed up', bg: '#f1ecff', fg: '#5126b8' },
  approved: { glyph: '✓', label: 'Approved', bg: '#e3f2e8', fg: '#1f5a35' },
  bought: { glyph: '✓', label: 'Bought', bg: '#e3f2e8', fg: '#1f5a35' },
  sentback: { glyph: '↩', label: 'Sent back', bg: '#fdf1e4', fg: '#7a4612' },
  rejected: { glyph: '✕', label: 'Rejected', bg: '#f8e6e3', fg: '#8f2f22' },
  borrowed: { glyph: '⇄', label: 'Borrowed', bg: '#f1ecff', fg: '#5126b8' },
  overdue: { glyph: '!', label: 'Overdue', bg: '#f8e6e3', fg: '#8f2f22' },
  available: { glyph: '●', label: 'Available', bg: '#e3f2e8', fg: '#1f5a35' },
  damaged: { glyph: '▲', label: 'Damaged', bg: '#fdf1e4', fg: '#7a4612' },
  usedup: { glyph: '○', label: 'Used up', bg: '#eef1f5', fg: '#3c4652' },
  requested: { glyph: '◷', label: 'Requested', bg: '#eef1f5', fg: '#3c4652' },
  flag: { glyph: '⚑', label: 'Flag', bg: '#fdf1e4', fg: '#7a4612' },
  invited: { glyph: '✉', label: 'Invited', bg: '#eef1f5', fg: '#3c4652' },
};
export const statusWord = (s: ReqStatus) => CHIPS[s].label.toLowerCase();
