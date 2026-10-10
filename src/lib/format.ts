import type { Currency } from './types';

export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9);

const SYM: Record<Currency, string> = { EUR: '€', GBP: '£', USD: '$' };

export function money(n: number, cur: Currency = 'EUR') {
  const v = Math.abs(n);
  const s = v.toLocaleString('en-IE', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return (n < 0 ? '-' : '') + SYM[cur] + s;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hm = (d: Date) => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function when(t: number) {
  const now = Date.now();
  if (now - t < 60_000) return 'Just now';
  const d = new Date(t), diff = Math.round((dayStart(now) - dayStart(t)) / 86_400_000);
  if (diff === 0) return 'Today, ' + hm(d);
  if (diff === 1) return 'Yesterday, ' + hm(d);
  return d.getDate() + ' ' + MON[d.getMonth()] + ', ' + hm(d);
}

export function dueText(t: number) {
  const diff = Math.round((dayStart(t) - dayStart(Date.now())) / 86_400_000);
  const d = new Date(t);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff === -1) return 'yesterday';
  if (diff > 1 && diff < 7) return DAYL[d.getDay()];
  return DAY[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
}

export const shortDate = (t: number) => { const d = new Date(t); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };

export const DAY_MS = 86_400_000;
export const daysFromNow = (n: number, hour = 17) => { const d = new Date(Date.now() + n * DAY_MS); d.setHours(hour, 0, 0, 0); return d.getTime(); };

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';

export const plural = (n: number, one: string, many = one + 's') => n + ' ' + (n === 1 ? one : many);
