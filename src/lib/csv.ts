// Bank CSV import: parse, map columns, categorise (rules first, then a suggestion with confidence), flag anomalies.
import type { Org } from './types';

export const CATEGORIES = ['Electronics parts', 'Mechanical parts', 'Materials', 'Software', 'Food', 'Travel', 'Printing', 'Reimbursement', 'Event costs', 'Bank fees', 'Other'];

export interface Line { i: number; date: string; payee: string; amount: number }
export interface Categorised extends Line { category: string; source: 'rule' | 'ai'; confidence: number; reason: string }
export type FlagKind = 'dup' | 'nomatch' | 'receipt' | 'unusual' | 'refund';
export interface Flag { key: string; kind: FlagKind; type: string; text: string; opts: string[]; lineIdx: number[] }

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell.trim()); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(x => x)) rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  row.push(cell.trim()); if (row.some(x => x)) rows.push(row);
  return rows;
}

export interface Mapping { date: number; desc: number; out: number; in: number; amount: number }
export const FIELDS: { key: keyof Mapping; label: string }[] = [
  { key: 'date', label: 'Date' }, { key: 'desc', label: 'Description' }, { key: 'out', label: 'Money out' }, { key: 'in', label: 'Money in' }, { key: 'amount', label: 'Signed amount' },
];

export function guessMapping(headers: string[]): Mapping {
  const find = (re: RegExp) => headers.findIndex(h => re.test(h));
  const out = find(/debit|money ?out|withdraw|paid ?out/i), inn = find(/credit|money ?in|deposit|paid ?in/i);
  return {
    date: find(/date|posted/i), desc: find(/detail|desc|payee|narrat|merchant|memo|reference/i),
    out, in: inn, amount: out < 0 && inn < 0 ? find(/amount|value|sum/i) : -1,
  };
}

const num = (s: string | undefined) => { if (!s) return 0; const v = parseFloat(s.replace(/[^0-9.\-]/g, '')); return isNaN(v) ? 0 : v; };

export function toLines(rows: string[][], m: Mapping): Line[] {
  return rows.slice(1).map((r, i) => {
    const amount = m.amount >= 0 ? num(r[m.amount]) : num(r[m.in]) - Math.abs(num(r[m.out]));
    return { i, date: r[m.date] || '', payee: (r[m.desc] || '').toUpperCase(), amount: Math.round(amount * 100) / 100 };
  }).filter(l => l.payee || l.amount);
}

// Known payees: deterministic rules, always 100%.
const RULES: [RegExp, string][] = [
  [/RS COMPONENTS|FARNELL|MOUSER|DIGIKEY|DIGI-KEY|PIMORONI/, 'Electronics parts'],
  [/WOODIES|BOLTS ?& ?NUTS|ACCU|MISUMI|MCMASTER/, 'Mechanical parts'],
  [/METAL SUPERMARKET|SMITHS PLASTICS|ALUMINIUM/, 'Materials'],
  [/GITHUB|AWS|ONSHAPE|AUTODESK|NOTION|FIGMA|GOOGLE \*WORKSPACE/, 'Software'],
  [/LIDL|TESCO|ALDI|SUPERVALU|DOMINOS|JUST EAT/, 'Food'],
  [/^IRISH RAIL|DUBLIN BUS|LEAP CARD|RYANAIR|AER LINGUS|BUS EIREANN/, 'Travel'],
  [/PRINTCRAFT|SNAP PRINT|VISTAPRINT/, 'Printing'],
  [/BANK FEE|BOI FEE|AIB FEE|MAINTENANCE FEE/, 'Bank fees'],
];

// Unclear lines: a suggestion with a confidence score. (In the product this is an LLM returning
// {category, confidence, reason}; here it's simulated with weighted hints so the demo runs offline.)
const HINTS: [RegExp, string, number, string][] = [
  [/PIHUT|PI HUT/, 'Electronics parts', 0.93, 'Raspberry Pi reseller'],
  [/HOBBYKNG|HOBBYKING/, 'Electronics parts', 0.66, 'Hobby electronics shop, could also be mechanical'],
  [/AMZN|AMAZON/, 'Electronics parts', 0.82, 'Past Amazon lines were mostly parts'],
  [/ALIEXPRESS|BANGGOOD/, 'Electronics parts', 0.84, 'Usually components'],
  [/SCREWFIX|HARDWARE/, 'Mechanical parts', 0.88, 'Hardware store'],
  [/ENGSOC/, 'Event costs', 0.85, 'Engineering society event'],
  [/CAFE|COFFEE|STARBUCKS|CENTRA|SPAR/, 'Food', 0.83, 'Food & drink merchant'],
  [/SUMUP \*J MURPHY/, 'Food', 0.54, 'SumUp card reader, merchant unclear'],
  [/IRISH RAIL|CARD \d+ IRISH/, 'Travel', 0.71, 'Looks like a train ticket, card prefix unusual'],
  [/TFR|TRANSFER|REVOLUT/, 'Reimbursement', 0.48, 'Transfer to a person, could be a reimbursement'],
  [/UBER|FREENOW|TAXI/, 'Travel', 0.86, 'Ride-hailing'],
  [/PAYPAL \*/, 'Other', 0.4, 'PayPal merchant not recognised'],
  [/SUMUP \*/, 'Other', 0.42, 'SumUp merchant not recognised'],
];

export const THRESHOLD = 0.8;

export function categorise(lines: Line[]): Categorised[] {
  return lines.map(l => {
    for (const [re, cat] of RULES) if (re.test(l.payee)) return { ...l, category: cat, source: 'rule', confidence: 1, reason: 'Known payee rule' };
    for (const [re, cat, c, why] of HINTS) if (re.test(l.payee)) return { ...l, category: cat, source: 'ai', confidence: c, reason: why };
    if (l.amount > 0) return { ...l, category: 'Reimbursement', source: 'ai', confidence: 0.62, reason: 'Money in, source unclear' };
    return { ...l, category: 'Other', source: 'ai', confidence: 0.35, reason: 'No similar lines seen before' };
  });
}

const payeeKey = (p: string) => p.replace(/\s+\d+$/, '').replace(/^(CARD|POS|VDP-?)\s*\d*\s*/, '').trim();
const similar = (payee: string, merchant?: string) => {
  const t = (merchant || '').toUpperCase().split(/[^A-Z0-9]+/).filter(x => x.length >= 3 && x !== 'THE');
  return !t.length || t.some(x => payee.includes(x));
};

export function analyse(lines: Categorised[], org: Org, money: (n: number) => string) {
  const flags: Flag[] = [];
  // Matching approved/bought requests to bank lines: same amount, payee similar to merchant.
  const reqs = org.requests.filter(r => r.status === 'approved' || r.status === 'bought');
  const used = new Set<number>(), matches: { reqId: string; line: number }[] = [];
  reqs.forEach(r => {
    const l = lines.find(x => !used.has(x.i) && x.amount < 0 && Math.abs(-x.amount - r.cost) < 0.01 && similar(x.payee, r.merchant));
    if (l) { used.add(l.i); matches.push({ reqId: r.id, line: l.i }); }
  });
  // Duplicates: same payee + amount + date.
  const seen = new Map<string, number>();
  lines.forEach(l => {
    const k = l.payee + '|' + l.amount + '|' + l.date;
    if (seen.has(k) && l.amount < 0) flags.push({ key: 'dup' + l.i, kind: 'dup', type: 'Duplicate', text: `${l.payee} · ${money(-l.amount)} appears twice on ${l.date}`, opts: ['Keep both', 'Mark duplicate'], lineIdx: [seen.get(k)!, l.i] });
    else seen.set(k, l.i);
  });
  // Refunds: money in from a supplier.
  lines.filter(l => l.amount > 0 && /RS COMPONENTS|FARNELL|MOUSER|AMZN|AMAZON|REFUND/.test(l.payee)).forEach(l =>
    flags.push({ key: 'refund' + l.i, kind: 'refund', type: 'Refund', text: `${l.payee} · +${money(l.amount)}`, opts: ['Match original', 'Ignore'], lineIdx: [l.i] }));
  // Unusual: > 3x the payee's median.
  const byPayee = new Map<string, number[]>();
  lines.filter(l => l.amount < 0).forEach(l => { const k = payeeKey(l.payee); byPayee.set(k, [...(byPayee.get(k) || []), -l.amount]); });
  lines.filter(l => l.amount < 0).forEach(l => {
    const arr = (byPayee.get(payeeKey(l.payee)) || []).slice().sort((a, b) => a - b);
    if (arr.length < 3) return;
    const med = arr[Math.floor(arr.length / 2)];
    if (-l.amount > 3 * med && -l.amount >= 100) flags.push({ key: 'unusual' + l.i, kind: 'unusual', type: 'Unusual amount', text: `${l.payee} · ${money(-l.amount)}, about ${Math.round(-l.amount / med)}× usual`, opts: ['Looks right', 'Investigate'], lineIdx: [l.i] });
  });
  // Parts spend over €50 with no matching request.
  lines.filter(l => l.amount < -50 && !used.has(l.i) && /parts|Materials/.test(l.category)).forEach(l =>
    flags.push({ key: 'nomatch' + l.i, kind: 'nomatch', type: 'No matching request', text: `${l.payee} · ${money(-l.amount)} on ${l.date}`, opts: ['Link a request', 'Ask the buyer'], lineIdx: [l.i] }));
  // Bought requests that match a bank line but have no receipt.
  matches.forEach(m => {
    const r = org.requests.find(x => x.id === m.reqId)!;
    if (r.status === 'bought' && !r.receipt) {
      const l = lines.find(x => x.i === m.line)!;
      const who = org.people.find(p => p.id === r.byId)?.name || 'the buyer';
      flags.push({ key: 'receipt' + r.id, kind: 'receipt', type: 'Missing receipt', text: `${l.payee} · ${money(-l.amount)} matches ${r.id} (${who})`, opts: ['Chase ' + who, 'Got it'], lineIdx: [l.i] });
    }
  });
  return { flags, matches };
}

// --- Sample export with realistic mess ---
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

export function sampleCsv(): string {
  const r = rng(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const rows: [string, string, number][] = [];
  const day = (d: number) => `${String(d).padStart(2, '0')}/09/2026`;
  const ruled: [string, number, number][] = [
    ['RS COMPONENTS IE', 6, 45], ['FARNELL ELEMENT14', 5, 40], ['MOUSER ELECTRONICS', 4, 35], ['DIGIKEY', 3, 30], ['WOODIES DIY 0412', 6, 30],
    ['BOLTS & NUTS LTD', 4, 20], ['METAL SUPERMARKETS', 2, 45], ['GITHUB INC', 4, 9], ['ONSHAPE', 1, 25], ['LIDL DUBLIN 04', 12, 35], ['TESCO STORES 3321', 10, 30],
    ['DOMINOS PIZZA', 6, 45], ['DUBLIN BUS', 14, 0.3], ['LEAP CARD TOPUP', 12, 20], ['PRINTCRAFT LTD', 4, 30], ['BOI FEE QTR', 1, 12],
  ];
  ruled.forEach(([p, n, max]) => { for (let k = 0; k < n; k++) rows.push([day(1 + Math.floor(r() * 29)), p, -(Math.round((3 + r() * max) * 100) / 100)]); });
  const ai: [string, number][] = [['PAYPAL *PIHUT', -24.5], ['AMZN MKTP IE*2K4', -18.99], ['AMZN MKTP IE*7Q1', -32.4], ['SCREWFIX DUBLIN', -16.2], ['CAFE NERO UCD', -11.8], ['STARBUCKS 112', -9.4], ['UBER *TRIP', -14.3], ['FREENOW *RIDE', -18.6], ['ALIEXPRESS', -21.7], ['CENTRA BELFIELD', -12.5], ['SUMUP *ENGSOC', -150], ['SUMUP *ENGSOC', -140], ['SUMUP *ENGSOC', -165], ['SUMUP *ENGSOC', -155], ['BANGGOOD', -27.9], ['SPAR UCD', -8.6], ['AMZN MKTP IE*9Z0', -22.15], ['SCREWFIX DUBLIN', -31.0]];
  ai.forEach(([p, a]) => rows.push([day(1 + Math.floor(r() * 29)), p, a]));
  // Things that need a person.
  rows.push([day(4), 'SUMUP *J MURPHY', -45], [day(9), 'PAYPAL *HOBBYKNG', -72.4], [day(12), 'TFR 0931 A OBRIEN', -150], [day(18), 'CARD 7712 IRISH RAIL', -38.6]);
  // Flags.
  rows.push([day(3), 'RS COMPONENTS IE', -14.2], [day(3), 'RS COMPONENTS IE', -14.2], [day(7), 'RS COMPONENTS IE', 14.2]);
  rows.push([day(15), 'AMZN MKTP IE*4H8', -64.99], [day(22), 'SUMUP *ENGSOC', -640]);
  // Lines that match requests in the demo org.
  rows.push([day(2), 'RS COMPONENTS IE', -38], [day(28), 'PAYPAL *PIHUT', -85], [day(27), 'RS COMPONENTS IE', -9]);
  while (rows.length < 150) rows.push([day(1 + Math.floor(r() * 29)), pick(['LIDL DUBLIN 04', 'TESCO STORES 3321']), -(Math.round((3 + r() * 30) * 100) / 100)]);
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const csv = ['Posted Date,Details,Debit,Credit', ...rows.map(([d, p, a]) => `${d},"${p}",${a < 0 ? (-a).toFixed(2) : ''},${a > 0 ? a.toFixed(2) : ''}`)];
  return csv.join('\n');
}
