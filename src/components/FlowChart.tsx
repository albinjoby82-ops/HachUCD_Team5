import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { OrgNode, Person } from '../lib/types';
import {
  type Structure, chain, childrenOf, deptOfNode, deptRootOf, descendantIds, groupName, leadsOf, membersOf,
  nodeById, personById, routeNodes, titleOf, DEPT_PALETTE, TOP_COLOR,
} from '../lib/org';
import { NODE_H, NODE_W, bounds, layoutTree } from '../lib/layout';
import { uid } from '../lib/format';
import { Avatar, Switch } from './ui';

interface Props {
  value: Structure;
  onChange?: (s: Structure) => void;
  height?: number | string;
  tools?: ReactNode;
  fitKey?: unknown;
  meId?: string;
  trace?: string | null;
  onTrace?: (pid: string | null) => void;
  onOpenPerson?: (pid: string) => void;
  onToast?: (m: string) => void;
}

type View = { x: number; y: number; k: number };

export function FlowChart({ value, onChange, height = 560, tools, fitKey, meId, trace: traceProp, onTrace, onOpenPerson, onToast }: Props) {
  const editable = !!onChange;
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 40, y: 70, k: 1 });
  const [size, setSize] = useState({ w: 800, h: 560 });
  const [sel, setSel] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [personDrop, setPersonDrop] = useState<string | null>(null);
  const [panning, setPanning] = useState(false);
  const [traceLocal, setTraceLocal] = useState<string | null>(null);
  const trace = traceProp !== undefined ? traceProp : traceLocal;
  const setTrace = (p: string | null) => { onTrace ? onTrace(p) : setTraceLocal(p); };
  const S = value;
  const toast = onToast || (() => {});

  // ---------- structure edits ----------
  const commit = (nodes: OrgNode[], people: Person[] = S.people, relayout = false) => onChange?.({ nodes: relayout ? layoutTree(nodes) : nodes, people });
  const patchNode = (id: string, p: Partial<OrgNode>) => commit(S.nodes.map(n => (n.id === id ? { ...n, ...p } : n)));
  const addChild = (parentId: string | null) => {
    const parent = nodeById(S, parentId) || S.nodes[0];
    const kids = parent ? childrenOf(S, parent.id) : [];
    const id = uid('n');
    const x = parent ? (kids.length ? Math.max(...kids.map(k => k.x)) + NODE_W + 20 : parent.x) : 0;
    const node: OrgNode = { id, title: 'New role', parentId: parent?.id ?? null, x, y: (parent?.y ?? 0) + NODE_H + 60 };
    commit([...S.nodes, node], S.people, true);
    setSel(id);
  };
  const removeNode = (id: string) => {
    const n = nodeById(S, id); if (!n) return;
    if (!n.parentId) return toast('The top box can’t be removed.');
    const nodes = S.nodes.filter(x => x.id !== id).map(x => (x.parentId === id ? { ...x, parentId: n.parentId } : x));
    const people = S.people.map(p => (p.nodeId === id ? { ...p, nodeId: n.parentId!, lead: false } : p));
    commit(nodes, people, true); setSel(null);
    toast(`Removed “${n.title}”. Its people and boxes moved up a level.`);
  };
  const reparent = (id: string, parentId: string) => {
    if (id === parentId || descendantIds(S, id).has(parentId)) return toast('A box can’t report to one of its own sub-teams.');
    const n = nodeById(S, id), p = nodeById(S, parentId);
    commit(S.nodes.map(x => (x.id === id ? { ...x, parentId } : x)), S.people, true);
    toast(`${n?.title} now reports to ${p?.title}. Approvals re-route automatically.`);
  };
  const movePerson = (pid: string, nodeId: string) => {
    const p = personById(S, pid), n = nodeById(S, nodeId); if (!p || !n || p.nodeId === nodeId) return;
    const lead = leadsOf(S, nodeId).length === 0;
    commit(S.nodes, S.people.map(x => (x.id === pid ? { ...x, nodeId, lead } : x)));
    toast(lead ? `${p.name} now leads ${n.title}.` : `${p.name} moved to ${groupName(S, n)}.`);
  };
  const patchPerson = (pid: string, patch: Partial<Person>) => commit(S.nodes, S.people.map(x => (x.id === pid ? { ...x, ...patch } : x)));
  const addPerson = (nodeId: string, name: string) => {
    const lead = leadsOf(S, nodeId).length === 0;
    commit(S.nodes, [...S.people, { id: uid('p'), name, nodeId, lead }]);
  };
  const removePerson = (pid: string) => commit(S.nodes, S.people.filter(p => p.id !== pid));
  const tidy = () => { commit(S.nodes, S.people, true); setTimeout(fit, 480); };

  // ---------- viewport ----------
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const latest = useRef(S); latest.current = S;
  const fit = useCallback(() => {
    const el = wrap.current; if (!el) return;
    const w = el.clientWidth, h = el.clientHeight, b = bounds(latest.current.nodes), top = 64, pad = 40;
    const k = Math.max(0.35, Math.min(1, (w - pad * 2) / b.w, (h - top - pad - 40) / b.h));
    setView({ k, x: (w - b.w * k) / 2 - b.x * k, y: top + (h - top - 40 - b.h * k) / 2 - b.y * k });
  }, []);
  useEffect(() => { const t = setTimeout(fit, 30); return () => clearTimeout(t); }, [fitKey, fit, size.w > 0]);
  const zoom = (f: number, cx = size.w / 2, cy = size.h / 2) => setView(v => {
    const k = Math.max(0.3, Math.min(1.8, v.k * f));
    return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
  });
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else setView(v => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  const toWorld = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
  };
  const nodeAt = (wx: number, wy: number, exclude: Set<string>) =>
    S.nodes.find(n => !exclude.has(n.id) && wx >= n.x && wx <= n.x + NODE_W && wy >= n.y && wy <= n.y + NODE_H);

  // ---------- pointer: node drag & canvas pan ----------
  const onNodeDown = (e: React.PointerEvent, n: OrgNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, ox = n.x, oy = n.y;
    const exclude = new Set([n.id, ...descendantIds(S, n.id)]);
    let moved = false, target: string | null = null;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / view.k, dy = (ev.clientY - sy) / view.k;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!editable) return;
      moved = true;
      setDragPos({ id: n.id, x: ox + dx, y: oy + dy });
      const w = toWorld(ev.clientX, ev.clientY);
      const t = nodeAt(w.x, w.y, exclude);
      target = t && t.id !== n.parentId ? t.id : null;
      setDropOn(target);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setDragPos(null); setDropOn(null);
      if (!moved) { setSel(s => (s === n.id ? s : n.id)); return; }
      if (target) reparent(n.id, target);
      else { const dx = (ev.clientX - sx) / view.k, dy = (ev.clientY - sy) / view.k; patchNode(n.id, { x: Math.round(ox + dx), y: Math.round(oy + dy) }); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };
  const onBgDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.flow-tools,.inspector,.flow-route')) return;
    const sx = e.clientX, sy = e.clientY, v0 = view; let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true; setPanning(true);
      setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy });
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      setPanning(false); if (!moved) setSel(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // keyboard
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') setSel(null);
      if (editable && sel && (e.key === 'Delete' || e.key === 'Backspace')) removeNode(sel);
    };
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f);
  });

  // ---------- derived ----------
  const pos = (n: OrgNode) => (dragPos && dragPos.id === n.id ? dragPos : n);
  const routeIds = useMemo(() => (trace ? routeNodes(S, trace) : []), [S, trace]);
  const routeSet = new Set(routeIds);
  const routeEdge = (child: string, parent: string) => { const i = routeIds.indexOf(child); return i >= 0 && routeIds[i + 1] === parent; };
  const tracedPerson = personById(S, trace);
  const traceChain = trace ? chain(S, trace) : [];
  const colorOf = (n: OrgNode) => deptRootOf(S, n)?.color || TOP_COLOR;
  const selNode = nodeById(S, sel);
  const peopleSorted = useMemo(() => {
    const order = new Map(S.nodes.map((n, i) => [n.id, i]));
    return [...S.people].sort((a, b) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0) || Number(b.lead) - Number(a.lead));
  }, [S]);

  const dragPerson = (pid: string) => (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.setData('text/person', pid); e.dataTransfer.effectAllowed = 'move'; };
  const personDnD = (n: OrgNode) => editable ? {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('text/person')) { e.preventDefault(); setPersonDrop(n.id); } },
    onDragLeave: () => setPersonDrop(d => (d === n.id ? null : d)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setPersonDrop(null); const pid = e.dataTransfer.getData('text/person'); if (pid) movePerson(pid, n.id); },
  } : {};

  return (
    <div ref={wrap} className={'flow' + (panning ? ' panning' : '')} style={{ height }} onPointerDown={onBgDown}>
      <div className="flow-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} width={1} height={1}>
          {S.nodes.map(n => {
            const p = nodeById(S, n.parentId); if (!p) return null;
            const a = pos(p), b = pos(n);
            const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y, my = (y1 + y2) / 2;
            return <path key={n.id} className={'edge' + (routeEdge(n.id, p.id) ? ' route' : '')} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} />;
          })}
        </svg>
        {S.nodes.map(n => {
          const p = pos(n), leads = leadsOf(S, n.id), mems = membersOf(S, n.id), color = colorOf(n);
          const dept = deptOfNode(S, n);
          const cls = ['flow-node', editable && 'editable', dragPos?.id === n.id ? 'dragging' : 'anim', sel === n.id && 'sel', (dropOn === n.id || personDrop === n.id) && 'drop', routeSet.has(n.id) && 'route', trace && !routeSet.has(n.id) && 'dim'].filter(Boolean).join(' ');
          return (
            <div key={n.id} className={cls} style={{ left: p.x, top: p.y }} onPointerDown={e => onNodeDown(e, n)} {...personDnD(n)}
              role="button" tabIndex={0} aria-label={n.title} onKeyDown={e => e.key === 'Enter' && setSel(n.id)}>
              <div className="strip" style={{ background: color }} />
              <div className="body">
                <div className="meta" style={{ color }}>{n.dept ? 'Department · ' + n.dept : dept ? dept + ' · sub-team' : 'Leadership'}</div>
                <div className="ttl" title={n.title}>{n.title}</div>
                <div className="leadrow">
                  {leads.length ? <>
                    <Avatar name={leads[0].name} size={24} />
                    <span draggable={editable} onDragStart={dragPerson(leads[0].id)} onPointerDown={e => editable && e.stopPropagation()} style={{ fontWeight: 700, cursor: editable ? 'grab' : 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {leads[0].name}{leads[0].id === meId ? ' (you)' : ''}
                    </span>
                    {leads[0].invited && <span className="tiny muted">invited</span>}
                    {leads.length > 1 && <span className="tiny muted">+{leads.length - 1}</span>}
                  </> : <span className="nolead">{editable ? 'Drop someone here to lead' : 'No one yet'}</span>}
                </div>
                <div className="mems">
                  {mems.slice(0, 3).map(m => (
                    <span key={m.id} className={'pchip' + (m.invited ? ' inv' : '') + (m.id === trace ? ' hl' : '')} draggable={editable} onDragStart={dragPerson(m.id)}
                      onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onOpenPerson ? onOpenPerson(m.id) : setTrace(m.id); }} title={m.name}>{m.name}</span>
                  ))}
                  {mems.length > 3 && <span className="pchip" style={{ cursor: 'default' }}>+{mems.length - 3}</span>}
                  {!mems.length && !childrenOf(S, n.id).length && <span className="tiny" style={{ color: '#b3abc9' }}>No members yet</span>}
                </div>
              </div>
              {editable && <button className="flow-add" title="Add a role below" aria-label={'Add a role below ' + n.title} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); addChild(n.id); }}>+</button>}
            </div>
          );
        })}
      </div>

      <div className="flow-tools" onPointerDown={e => e.stopPropagation()}>
        {editable && <div className="grp"><button className="primary" onClick={() => addChild(sel)}>+ Add role</button><button onClick={tidy}>Tidy up</button></div>}
        {tools}
        <div className="grp">
          <button onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">−</button>
          <button onClick={fit} title="Fit to screen">{Math.round(view.k * 100)}%</button>
          <button onClick={() => zoom(1.2)} aria-label="Zoom in">+</button>
        </div>
        <div className="grp">
          <select value={trace || ''} onChange={e => setTrace(e.target.value || null)} aria-label="Trace approval route">
            <option value="">Trace approvals for…</option>
            {peopleSorted.map(p => <option key={p.id} value={p.id}>{p.name} · {titleOf(S, p.id)}</option>)}
          </select>
          {trace && <button onClick={() => setTrace(null)} aria-label="Clear trace">✕</button>}
        </div>
      </div>

      {tracedPerson ? (
        <div className="flow-route" onPointerDown={e => e.stopPropagation()}>
          <span><b>{tracedPerson.name}</b> asks</span>
          {traceChain.length ? traceChain.map(id => <span key={id}>→ <b>{personById(S, id)?.name}</b> <span style={{ opacity: .7 }}>{titleOf(S, id)}</span></span>)
            : <span>→ approved straight away (top of the chart)</span>}
        </div>
      ) : (
        <div className="flow-hint">{editable ? 'Drag boxes to move · drop a box onto another to change who it reports to · drag people between boxes · ctrl+scroll to zoom' : 'Click a box to see who’s in it · pick a person above to trace their approval route'}</div>
      )}

      {selNode && (
        <Inspector key={selNode.id} S={S} node={selNode} editable={editable} meId={meId}
          onClose={() => setSel(null)} patchNode={patchNode} reparent={reparent} removeNode={removeNode} addChild={addChild}
          addPerson={addPerson} removePerson={removePerson} patchPerson={patchPerson} movePerson={movePerson}
          dragPerson={dragPerson} onTrace={setTrace} onOpenPerson={onOpenPerson} />
      )}
    </div>
  );
}

interface InspectorProps {
  S: Structure; node: OrgNode; editable: boolean; meId?: string; onClose: () => void;
  patchNode: (id: string, p: Partial<OrgNode>) => void; reparent: (id: string, p: string) => void; removeNode: (id: string) => void; addChild: (id: string) => void;
  addPerson: (nodeId: string, name: string) => void; removePerson: (pid: string) => void; patchPerson: (pid: string, p: Partial<Person>) => void; movePerson: (pid: string, nodeId: string) => void;
  dragPerson: (pid: string) => (e: React.DragEvent) => void; onTrace: (p: string | null) => void; onOpenPerson?: (pid: string) => void;
}

function Inspector({ S, node, editable, meId, onClose, patchNode, reparent, removeNode, addChild, addPerson, removePerson, patchPerson, movePerson, dragPerson, onTrace, onOpenPerson }: InspectorProps) {
  const [title, setTitle] = useState(node.title);
  const [dept, setDept] = useState(node.dept || '');
  const [newName, setNewName] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editable && node.title === 'New role') { titleRef.current?.focus(); titleRef.current?.select(); } }, []);
  const people = S.people.filter(p => p.nodeId === node.id).sort((a, b) => Number(b.lead) - Number(a.lead));
  const inherited = deptOfNode(S, nodeById(S, node.parentId));
  const bad = descendantIds(S, node.id);
  const parentOpts = S.nodes.filter(n => n.id !== node.id && !bad.has(n.id));
  const sample = people.find(p => !p.lead) || people[0];
  const route = sample ? chain(S, sample.id) : [];
  const usedColors = new Set(S.nodes.filter(n => n.dept && n.id !== node.id).map(n => n.color));
  const commitTitle = () => title.trim() && title.trim() !== node.title && patchNode(node.id, { title: title.trim() });
  const commitDept = () => { const d = dept.trim(); if (d && d !== node.dept) patchNode(node.id, { dept: d }); };
  const toggleDept = () => {
    if (node.dept) { patchNode(node.id, { dept: undefined, color: undefined }); setDept(''); return; }
    const d = title.replace(/\s*(lead|captain|head|manager)$/i, '').trim() || 'New department';
    const color = DEPT_PALETTE.find(c => !usedColors.has(c)) || DEPT_PALETTE[0];
    patchNode(node.id, { dept: d, color }); setDept(d);
  };
  const add = () => { const n = newName.trim(); if (!n) return; addPerson(node.id, n); setNewName(''); };

  return (
    <div className="inspector" onPointerDown={e => e.stopPropagation()}>
      <div className="hstack" style={{ flexWrap: 'nowrap' }}>
        <div style={{ flex: 1 }}><div className="tiny b800 muted" style={{ textTransform: 'uppercase', letterSpacing: '.06em' }}>{editable ? 'Edit box' : 'Box'}</div>
          {!editable && <div className="title20">{node.title}</div>}</div>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {editable && <div className="field"><label>Role title</label>
        <input ref={titleRef} className="input" value={title} onChange={e => setTitle(e.target.value)} onBlur={commitTitle} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} /></div>}

      <div className="stack-s" style={{ gap: 8 }}>
        {editable ? <>
          <div className="hstack" style={{ flexWrap: 'nowrap' }}><div style={{ flex: 1 }}><div className="b800" style={{ fontSize: 14 }}>Starts a department</div>
            <div className="tiny muted">{node.dept ? 'Boxes below inherit it. Gets its own budget.' : inherited ? 'Part of ' + inherited : 'Leadership · above every department'}</div></div>
            <Switch on={!!node.dept} onClick={toggleDept} label="Starts a department" /></div>
          {node.dept && <>
            <input className="input" value={dept} onChange={e => setDept(e.target.value)} onBlur={commitDept} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} aria-label="Department name" />
            <div className="swatches">{DEPT_PALETTE.map(c => <button key={c} className={node.color === c ? 'on' : ''} style={{ background: c }} onClick={() => patchNode(node.id, { color: c })} aria-label={'Colour ' + c} />)}</div>
          </>}
        </> : <div className="small muted">{node.dept ? 'Department · ' + node.dept : inherited ? 'Part of ' + inherited : 'Leadership'}</div>}
      </div>

      {editable && <div className="field"><label>Reports to</label>
        <select className="input" value={node.parentId || ''} disabled={!node.parentId} onChange={e => e.target.value && reparent(node.id, e.target.value)}>
          {!node.parentId && <option value="">Top of the chart</option>}
          {parentOpts.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select></div>}

      <div className="stack-s" style={{ gap: 6 }}>
        <div className="b800" style={{ fontSize: 14 }}>People here · {people.length}</div>
        {people.map(p => (
          <div key={p.id} className="hstack" style={{ flexWrap: 'nowrap', gap: 8, padding: '6px 8px', borderRadius: 12, background: 'var(--rowbg)' }} draggable={editable} onDragStart={dragPerson(p.id)}>
            <Avatar name={p.name} size={26} />
            <button style={{ flex: 1, minWidth: 0, border: 0, background: 'none', textAlign: 'left', cursor: 'pointer', padding: 0 }} onClick={() => (onOpenPerson ? onOpenPerson(p.id) : onTrace(p.id))}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}{p.id === meId ? ' (you)' : ''}</div>
              <div className="tiny muted">{p.lead ? 'Leads this box' : 'Member'}{p.invited ? ' · invite sent' : ''}</div>
            </button>
            {editable && <>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => patchPerson(p.id, { lead: !p.lead })} title={p.lead ? 'Make member' : 'Make lead'}>{p.lead ? '★' : '☆'}</button>
              <button className="btn btn-ghost btn-sm" style={{ padding: '4px 8px' }} onClick={() => removePerson(p.id)} aria-label={'Remove ' + p.name} disabled={p.id === meId}>✕</button>
            </>}
          </div>
        ))}
        {!people.length && <div className="small muted">Nobody yet.</div>}
        {editable && <div className="hstack" style={{ flexWrap: 'nowrap', gap: 6 }}>
          <input className="input" placeholder="Add a person by name" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ minHeight: 38 }} />
          <button className="btn btn-secondary btn-sm" onClick={add}>Add</button></div>}
        {editable && people.length > 0 && <div className="field"><label>Move someone</label>
          <select className="input" value="" onChange={e => { const [pid, nid] = e.target.value.split('|'); if (pid && nid) movePerson(pid, nid); }}>
            <option value="">Pick person → box</option>
            {people.flatMap(p => S.nodes.filter(n => n.id !== node.id).map(n => <option key={p.id + n.id} value={p.id + '|' + n.id}>{p.name} → {n.title}</option>))}
          </select></div>}
      </div>

      {sample && <div className="inset small" style={{ lineHeight: 1.5 }}>
        <div className="b800" style={{ marginBottom: 2 }}>Approval route</div>
        {route.length ? <>Requests from {sample.name} go to {route.map(id => personById(S, id)?.name).join(' → ')}.</> : <>{sample.name} is at the top, so their requests are approved straight away.</>}
        <div><button className="btn btn-ghost btn-sm" style={{ padding: '4px 0', marginTop: 4 }} onClick={() => onTrace(sample.id)}>Show on chart</button></div>
      </div>}

      {editable && <div className="hstack" style={{ marginTop: 'auto' }}>
        <button className="btn btn-secondary btn-sm" onClick={() => addChild(node.id)}>+ Role below</button>
        <button className="btn btn-danger btn-sm" onClick={() => removeNode(node.id)} disabled={!node.parentId}>Delete box</button>
      </div>}
    </div>
  );
}
