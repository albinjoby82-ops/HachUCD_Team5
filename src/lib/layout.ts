import type { OrgNode } from './types';

export const NODE_W = 220;
export const NODE_H = 132;
const GAP_X = 32, GAP_Y = 76;

/** Tidy top-down tree layout. Keeps the current left-to-right order of siblings. */
export function layoutTree(nodes: OrgNode[]): OrgNode[] {
  const ids = new Set(nodes.map(n => n.id));
  const kids = new Map<string, OrgNode[]>();
  const rootList: OrgNode[] = [];
  nodes.forEach(n => {
    if (n.parentId && ids.has(n.parentId)) { const a = kids.get(n.parentId) || []; a.push(n); kids.set(n.parentId, a); }
    else rootList.push(n);
  });
  kids.forEach(a => a.sort((p, q) => p.x - q.x));
  rootList.sort((p, q) => p.x - q.x);

  const width = new Map<string, number>();
  const measure = (n: OrgNode, seen: Set<string>): number => {
    if (seen.has(n.id)) return NODE_W; seen.add(n.id);
    const c = kids.get(n.id) || [];
    const w = c.length ? Math.max(NODE_W, c.reduce((a, k) => a + measure(k, seen), 0) + GAP_X * (c.length - 1)) : NODE_W;
    width.set(n.id, w); return w;
  };
  const pos = new Map<string, { x: number; y: number }>();
  const place = (n: OrgNode, left: number, depth: number, seen: Set<string>) => {
    if (seen.has(n.id)) return; seen.add(n.id);
    const w = width.get(n.id) || NODE_W;
    pos.set(n.id, { x: Math.round(left + w / 2 - NODE_W / 2), y: depth * (NODE_H + GAP_Y) });
    const c = kids.get(n.id) || [];
    const total = c.reduce((a, k) => a + (width.get(k.id) || NODE_W), 0) + GAP_X * Math.max(0, c.length - 1);
    let x = left + (w - total) / 2;
    c.forEach(k => { place(k, x, depth + 1, seen); x += (width.get(k.id) || NODE_W) + GAP_X; });
  };
  let left = 0;
  const seenM = new Set<string>(), seenP = new Set<string>();
  rootList.forEach(r => { const w = measure(r, seenM); place(r, left, 0, seenP); left += w + GAP_X * 2; });
  return nodes.map(n => ({ ...n, ...(pos.get(n.id) || { x: n.x, y: n.y }) }));
}

export function bounds(nodes: OrgNode[]) {
  if (!nodes.length) return { x: 0, y: 0, w: NODE_W, h: NODE_H };
  const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) + NODE_W - x, h: Math.max(...ys) + NODE_H - y };
}
