import { useEffect, type ReactNode } from 'react';
import { CHIPS } from '../lib/org';
import { initials } from '../lib/format';
import { useUI } from '../lib/store';

export function Chip({ s }: { s: string }) {
  const m = CHIPS[s] || CHIPS.pending;
  return <span className="chip" style={{ background: m.bg, color: m.fg }}><span aria-hidden>{m.glyph}</span>{m.label}</span>;
}

const TINTS = [['#ffe1e5', '#8c1d33'], ['#fff1cc', '#6b4a00'], ['#d6f7f0', '#0b5c50'], ['#ede6ff', '#4a22a8'], ['#dff0ff', '#0f4c81']];
export function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  const c = TINTS[((name || 'x').charCodeAt(0) + (name || 'x').length) % TINTS.length];
  return <span aria-hidden style={{ width: size, height: size, borderRadius: '50%', background: c[0], color: c[1], display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: Math.round(size * 0.38), flex: 'none' }}>{initials(name)}</span>;
}

export function Bar({ used, total, color }: { used: number; total: number; color: string }) {
  return <div className="bar"><div style={{ width: Math.min(100, (used / Math.max(total, 1)) * 100) + '%', background: color }} /></div>;
}

export function Steps({ n, cur }: { n: number; cur: number }) {
  return <div className="steps">{Array.from({ length: n }, (_, i) => <div key={i} className={i + 1 <= cur ? 'on' : ''} />)}</div>;
}

export function Switch({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return <button role="switch" aria-checked={on} aria-label={label} className={'switch' + (on ? ' on' : '')} onClick={onClick} disabled={disabled}><span /></button>;
}

export function Pills<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="pills">{options.map(([k, l]) => <button key={k} className={'btn ' + (value === k ? 'btn-primary' : 'btn-secondary')} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Drawer({ onClose, children, label, width = 520 }: { onClose: () => void; children: ReactNode; label: string; width?: number }) {
  useEsc(onClose);
  return <div className="overlay" onClick={onClose}><div className="drawer slide" role="dialog" aria-label={label} style={{ width: `min(${width}px, 100%)` }} onClick={e => e.stopPropagation()}>{children}</div></div>;
}

export function Dialog({ onClose, children, label, width = 440 }: { onClose: () => void; children: ReactNode; label: string; width?: number }) {
  useEsc(onClose);
  return <div className="overlay center" onClick={onClose}><div className="dialog fade" role="dialog" aria-label={label} style={{ width: `min(${width}px, 100%)` }} onClick={e => e.stopPropagation()}>{children}</div></div>;
}

export function useEsc(fn: () => void) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && fn(); window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f); }, [fn]);
}

export function Toast() {
  const t = useUI(s => s.toast);
  return t ? <div className="toast" role="status">{t}</div> : null;
}

export function Logo({ onClick }: { onClick?: () => void }) {
  return <button className="logo" onClick={onClick}><span className="logo-mark"><span /></span>Teamly</button>;
}

export function Section({ title, action, children, className = 'list' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={'card ' + className}>{title && <div className="card-head">{title}{action}</div>}{children}</section>;
}
