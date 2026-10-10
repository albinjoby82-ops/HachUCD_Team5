import { useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/ui';
import { useCtx } from './ctx';
import { saveInventory, useStore, useUI } from '../../lib/store';
import { uid } from '../../lib/format';
import { canManageItem } from '../../lib/cluster';
import { fields, fingerprint, makeDrafts, MAX_BYTES, readInventory, reviewDrafts, suggestMapping, validMapping } from '../../lib/inventory';
import type { Draft, InventorySource, Mapping, Settings } from '../../lib/inventory';

const labels = { itemName: 'Item name', cost: 'Cost', quantity: 'Quantity', supplier: 'Supplier', currency: 'Currency', unit: 'Quantity unit' };
export function InventoryImport({ onClose, departments }: { onClose: () => void; departments: string[] }) {
  const { org, me } = useCtx();
  const [fileName, setFileName] = useState(''), [text, setText] = useState(''), [hash, setHash] = useState('');
  const [delimiter, setDelimiter] = useState(','), [source, setSource] = useState<InventorySource>();
  const [mapping, setMapping] = useState<Mapping>(), [drafts, setDrafts] = useState<Draft[]>();
  const [settings, setSettings] = useState<Settings>({ costBasis: '', currency: org.currency, unit: 'piece', numberFormat: '' });
  const [department, setDepartment] = useState(departments[0] || '');
  const [confirmed, setConfirmed] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const review = useMemo(() => reviewDrafts(drafts || [], settings, org.items), [drafts, settings, org.items]);
  const included = review.filter(r => !r.draft.excluded), blocked = included.filter(r => r.errors.length).length;
  const already = !!hash && org.inventoryImports?.some(i => i.fingerprint === hash && i.department === department);
  const mapReady = mapping && source && validMapping(mapping, source.columns.length) && mapping.itemName >= 0 && mapping.quantity >= 0;
  const parse = (content: string, name: string, sep: string) => {
    setDrafts(undefined); setConfirmed(false); setError(''); setSource(undefined); setMapping(undefined);
    try { const parsed = readInventory(content, name, sep); setSource(parsed); setMapping(suggestMapping(parsed.columns)); }
    catch (e) { setError((e as Error).message); }
  };
  async function select(file: File) {
    setSource(undefined); setMapping(undefined); setDrafts(undefined); setHash(''); setText(''); setError(''); setConfirmed(false);
    if (!/\.csv$/i.test(file.name)) { setError('Choose a CSV file. Export Excel workbooks as UTF-8 CSV first.'); return; }
    if (file.size > MAX_BYTES) { setError('Choose a file smaller than 2 MB.'); return; }
    setBusy(true);
    try { const content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); setText(content); setFileName(file.name); setHash(await fingerprint(content)); parse(content, file.name, delimiter); }
    catch { setError('Could not read this file. Use UTF-8 CSV and try again.'); }
    finally { setBusy(false); }
  }
  function edit(index: number, patch: Partial<Draft>) {
    setConfirmed(false);
    setDrafts(rows => rows?.map((row, i) => i === index ? { ...row, keepDuplicate: false, ...patch } : row));
  }
  function save() {
    if (saving.current || !drafts || !source || !confirmed || !hash) return;
    saving.current = true; setError('');
    try {
      const id = uid('IMP'), at = Date.now();
      saveInventory(org.id, current => {
        if ((useStore.getState().viewAs[org.id] && useStore.getState().viewAs[org.id] !== me) || !departments.includes(department) || !canManageItem(current, { dept: department }, me)) throw new Error('Your role cannot write to this department.');
        if (current.inventoryImports?.some(i => i.fingerprint === hash && i.department === department)) throw new Error('This file has already been imported into this department.');
        const selected = reviewDrafts(drafts, settings, current.items).filter(r => !r.draft.excluded);
        if (!selected.length || selected.some(r => r.errors.length || !r.value)) throw new Error('Resolve all included rows before saving.');
        current.items.unshift(...selected.map(r => ({ ...r.value!, id: uid('I'), dept: department, loc: 'Unsorted', status: 'available' as const, shared: false, createdAt: at, updatedAt: at, createdBy: me, updatedBy: me, importId: id, sourceRow: r.draft.sourceRow })));
        (current.inventoryImports ||= []).unshift({ id, fingerprint: hash, file: fileName, at, by: me, read: source.rows.length, saved: selected.length, excluded: drafts.length - selected.length, department, settings });
      });
      useUI.getState().say(`Saved ${included.length} inventory records; excluded ${drafts.length - included.length}.`); onClose();
    } catch (e) { setError((e as Error).message); }
    finally { saving.current = false; }
  }
  return <Dialog label="Import inventory CSV" onClose={onClose} width={1100}>
    <div className="hstack" style={{ justifyContent: 'space-between' }}><div><div className="title20">Import inventory</div><div className="small muted">{org.name} · {drafts ? '3. Review and save' : source ? '2. Map and confirm' : '1. Choose a file'}</div></div><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
    <p className="small muted">Saved in this browser only. CSV up to 2 MB / 2,000 records. Excel: export as UTF-8 CSV.</p>
    {!drafts && <a className="small" href="./inventory-example.csv" download>Download a 25-item example CSV</a>}{!drafts && org.id === 'org-gaelforce' && <> · <a className="small" href="./gaelforce-inventory.csv" download>Download GaelForce workshop inventory</a></>}
    {!drafts && <>
      <div className="inventory-grid">
        <label className="field">Destination department<select className="input" value={department} onChange={e => { setDepartment(e.target.value); setConfirmed(false); }}>{departments.map(d => <option key={d}>{d}</option>)}</select></label>
        <label className="field">CSV file<input className="input" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void select(file); }} /></label>
        <label className="field">Delimiter<select className="input" value={delimiter} disabled={busy} onChange={e => { setDelimiter(e.target.value); if (text) parse(text, fileName, e.target.value); }}><option value=",">Comma</option><option value=";">Semicolon</option><option value={'\t'}>Tab</option></select></label>
      </div>
      {source && mapping && <>
        <div className="small">{source.rows.length} data records · {source.blankRows} blank records skipped. Source numbers refer to CSV records, including the header.</div>
        {source.issues.map(issue => <div className="inventory-warning" key={issue}>{issue}</div>)}
        <div className="inventory-grid">{fields.map(key => <label key={key} className="field">{labels[key]}{key === 'itemName' || key === 'quantity' ? ' *' : ''}<select className="input" value={mapping[key]} onChange={e => { setMapping({ ...mapping, [key]: Number(e.target.value) }); setConfirmed(false); }}><option value={-1}>{key === 'unit' || key === 'currency' ? 'Use default below' : 'Not provided'}</option>{source.columns.map((h, i) => <option key={i} value={i}>{i + 1}. {h || '(blank heading)'} — {source.rows[0]?.values[i]?.slice(0, 35)}</option>)}</select></label>)}</div>
        <div className="small muted">Unused columns: {source.columns.map((h, i) => ({ h, i })).filter(c => !Object.values(mapping).includes(c.i)).map(c => `${c.i + 1}. ${c.h || '(blank)'}`).join(', ') || 'none'}. These columns will not be saved. Original values are available below.</div>
        <details><summary>Original data (first 10 records)</summary><div className="inventory-table"><table className="tx"><thead><tr><th>Record</th>{source.columns.map((h, i) => <th key={i}>{i + 1}. {h}</th>)}</tr></thead><tbody>{source.rows.slice(0, 10).map(r => <tr key={r.sourceRow}><td>{r.sourceRow}</td>{r.values.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody></table></div></details>
        <div className="inventory-grid">
          <label className="field">Cost means<select className="input" value={settings.costBasis} onChange={e => setSettings({ ...settings, costBasis: e.target.value as Settings['costBasis'] })}><option value="">Choose explicitly</option><option value="unit">Reference cost per unit</option><option value="total">Total cost for each row</option></select></label>
          <label className="field">Number format<select className="input" value={settings.numberFormat} onChange={e => setSettings({ ...settings, numberFormat: e.target.value as Settings['numberFormat'] })}><option value="">Choose explicitly</option><option value="dot">1,200.50 (decimal point)</option><option value="comma">1.200,50 (decimal comma)</option></select></label>
          <label className="field">Default currency<select className="input" value={settings.currency} onChange={e => setSettings({ ...settings, currency: e.target.value as Settings['currency'] })}>{['EUR', 'GBP', 'USD'].map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="field">Default quantity unit<input className="input" value={settings.unit} onChange={e => setSettings({ ...settings, unit: e.target.value })} /></label>
        </div>
        <p className="small muted">Fractional quantities are supported (up to six decimal places). Blank cost or supplier stays unknown. Imports create separate records and never increase or overwrite existing stock automatically.</p>
        {!mapReady && <div className="err">Map name and quantity. Each source column can be mapped only once.</div>}
        <button className="btn btn-primary" disabled={!mapReady || !settings.numberFormat || (mapping.cost >= 0 && !settings.costBasis) || !settings.unit.trim() || !!already} onClick={() => { try { setDrafts(makeDrafts(source, mapping, settings)); setError(''); } catch (e) { setError((e as Error).message); } }}>Preview records</button>
      </>}
    </>}
    {drafts && <>
      <div className="hstack"><button className="btn btn-secondary" onClick={() => { setDrafts(undefined); setConfirmed(false); setError(''); }}>Back to mapping (resets corrections)</button><span className="small">{department} · {settings.numberFormat === 'dot' ? 'Decimal point' : 'Decimal comma'} · {settings.costBasis === 'total' ? 'Row total → unit cost' : 'Reference unit cost'}</span></div>
      <div role="status" className="inventory-warning">{drafts.length} read · {included.length - blocked} ready · {blocked} blocked · {drafts.length - included.length} excluded</div>
      <div className="inventory-table"><table className="tx inventory-preview"><thead><tr><th>Include</th><th>Record</th>{fields.map(k => <th key={k}>{labels[k]}</th>)}<th>Review</th></tr></thead><tbody>{review.map((r, i) => <tr key={r.draft.sourceRow} className={r.draft.excluded ? 'inventory-excluded' : ''}>
        <td><input type="checkbox" aria-label={`Include record ${r.draft.sourceRow}`} checked={!r.draft.excluded} onChange={e => edit(i, { excluded: !e.target.checked })} /></td><td>{r.draft.sourceRow}</td>
        {fields.map(k => <td key={k}><input className="input" aria-label={`Record ${r.draft.sourceRow} ${labels[k]}`} disabled={r.draft.excluded} value={r.draft[k]} onChange={e => edit(i, { [k]: e.target.value })} /></td>)}
        <td><div className="small">{r.errors.map((x, j) => <div className="err" key={j}>{x}</div>)}{r.warnings.map(x => <div className="muted" key={x}>{x}</div>)}{r.value?.unitCost != null && <div>Unit cost: {r.value.unitCost} {r.value.currency}</div>}{r.duplicate && <label><input type="checkbox" checked={r.draft.keepDuplicate} disabled={r.draft.excluded} onChange={e => edit(i, { keepDuplicate: e.target.checked })} /> Keep as a separate record</label>}</div></td>
      </tr>)}</tbody></table></div>
      <label className="small"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> I reviewed the mappings, costs, currencies, units, unused columns and {drafts.length - included.length} excluded records.</label>
      <button className="btn btn-primary" disabled={!confirmed || blocked > 0 || !included.length || !!already} onClick={save}>Save {included.length} records to {department}</button>
    </>}
    {busy && <div role="status">Reading file…</div>}{already && <div className="err">This file was already imported into this department. Edit the saved records to update stock.</div>}{error && <div className="err" role="alert">{error}</div>}
  </Dialog>;
}
