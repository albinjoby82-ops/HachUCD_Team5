// Evaluation: accuracy, cost and latency of rules vs cheap vs strong model, using the PRODUCTION
// prompts and validation (shared/ai). Run:  OPENROUTER_API_KEY=... MODEL_FAST=... MODEL_STRONG=... npm run eval:ai
// Optional prices (USD per 1M tokens, "input,output"): PRICE_FAST=0.15,0.6 PRICE_STRONG=3,15
import { readFileSync, writeFileSync } from 'node:fs';
import { TASKS } from '../shared/ai/prompts.ts';
import { callOpenRouter } from '../shared/ai/call.ts';
import { CATEGORIES, ruleCategory } from '../shared/ai/rules.ts';
import { redactText } from '../shared/ai/redact.ts';
import { reconcileClassification, verifyMapping } from '../shared/ai/schemas.ts';

const KEY = process.env.OPENROUTER_API_KEY;
const MODELS = { fast: process.env.MODEL_FAST, strong: process.env.MODEL_STRONG };
const DEPTS = ['Electrical', 'Mechanical', 'Programming', 'Shared'];
const THRESHOLD = 0.7, BATCH = 25;
if (!KEY || !MODELS.fast) { console.error('Set OPENROUTER_API_KEY and MODEL_FAST (and MODEL_STRONG) first.'); process.exit(1); }

const rows = readFileSync(new URL('./labelled.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).slice(1).map(l => {
  const [id, description, amount, dept, cat] = l.split(',');
  return { id: Number(id), description, amount: Number(amount), dept, cat };
});

const price = tier => { const p = process.env['PRICE_' + tier.toUpperCase()]; if (!p) return null; const [i, o] = p.split(',').map(Number); return { i, o }; };
const cost = (tier, u) => { const p = price(tier); return p ? (u.prompt * p.i + u.completion * p.o) / 1e6 : null; };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function classify(tier) {
  const preds = new Map(), failures = [], latencies = [], usage = { prompt: 0, completion: 0 }, errors = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const payload = { departments: DEPTS, categories: CATEGORIES, rows: batch.map(r => ({ id: r.id, description: redactText(r.description), amount: r.amount })) };
    let r = await callOpenRouter({ apiKey: KEY, model: MODELS[tier], spec: TASKS.classify_rows, payload });
    if (!r.ok && r.error !== 'upstream_error') r = await callOpenRouter({ apiKey: KEY, model: MODELS[tier], spec: TASKS.classify_rows, payload });
    if (!r.ok) { errors.push(r.error + (r.status ? ' ' + r.status : '')); continue; }
    latencies.push(r.ms); usage.prompt += r.usage?.prompt_tokens || 0; usage.completion += r.usage?.completion_tokens || 0;
    const rec = reconcileClassification(payload, r.result);
    for (const row of batch) preds.set(row.id, rec.get(row.id));
  }
  return { preds, latencies, usage, errors, failures };
}

function score(name, get, { cost: c = null, latency = null, note = '' } = {}) {
  let catOk = 0, deptOk = 0, deptN = 0, review = 0; const wrong = [];
  for (const r of rows) {
    const p = get(r);
    const cat = p?.category ?? 'Other', dept = p?.department ?? null, conf = p?.confidence ?? 0;
    if (cat === r.cat) catOk++;
    if (p && p.department !== undefined) { deptN++; if (dept === r.dept) deptOk++; }
    if (conf < THRESHOLD) review++;
    if (cat !== r.cat || (p && p.department !== undefined && dept !== r.dept)) wrong.push({ description: r.description, predicted: `${dept ?? 'null'} / ${cat}`, truth: `${r.dept} / ${r.cat}`, confidence: conf });
  }
  return { name, cat: catOk / rows.length, dept: deptN ? deptOk / deptN : null, review, c, latency, wrong, note };
}

const results = [];
// 1. rules only: category from payee rules, no department at all.
results.push(score('Rules only', r => { const c = ruleCategory(r.description); return c ? { category: c, confidence: 1 } : { category: 'Other', confidence: 0 }; }, { cost: 0, latency: 0 }));

const ran = {};
for (const tier of ['fast', 'strong']) {
  if (!MODELS[tier]) continue;
  console.log(`Running ${tier} model (${MODELS[tier]}) on ${rows.length} rows…`);
  ran[tier] = await classify(tier);
  const run = ran[tier];
  const total = run.latencies.length ? cost(tier, run.usage) : null;
  results.push(score(tier === 'fast' ? 'Cheap model only' : 'Strong model only', r => run.preds.get(r.id),
    { cost: total === null ? null : (total / rows.length) * 100, latency: median(run.latencies), note: run.errors.length ? 'errors: ' + run.errors.join(', ') : '' }));
}
if (ran.fast) {
  const run = ran.fast, total = cost('fast', run.usage);
  results.push(score('Rules + cheap model', r => {
    const p = run.preds.get(r.id), rule = ruleCategory(r.description);
    if (rule) return { department: p?.department ?? null, category: rule, confidence: p ? Math.max(p.confidence, 0.9) : 0.9 };
    return p;
  }, { cost: total === null ? null : (total / rows.length) * 100, latency: median(run.latencies) }));
}

// Column mapping on three layouts.
const LAYOUTS = [
  { name: "Team's own sheet", headers: ['Date', 'Item', 'Total cost', 'Department', 'Type', 'Status', 'Receipt', 'Project'], rows: [['2026-09-03', 'Chassis materials', '120', 'Mechanical', 'expense', 'paid', 'yes', 'Chassis']], expect: { date: 'Date', description: 'Item', amount: 'Total cost', department: 'Department' } },
  { name: 'Bank export', headers: ['Posted Date', 'Details', 'Debit', 'Credit', 'Balance'], rows: [['03/09/2026', 'RS COMPONENTS IE', '38.00', '', '4210.55']], expect: { date: 'Posted Date', description: 'Details', debit: 'Debit', credit: 'Credit' } },
  { name: 'Messy sheet', headers: ['when', 'whats it for', 'out', 'in', 'who paid', 'which sub-team', 'notes'], rows: [['3rd Sep', 'stepper motors x2', '38', '', 'Tom', 'mech', 'for the arm']], expect: { date: 'when', description: 'whats it for', debit: 'out', credit: 'in', department: 'which sub-team' } },
];
const mapRuns = [];
for (const L of LAYOUTS) {
  let right = 0, total = 0, errs = 0; const wrong = [];
  for (let k = 0; k < 2; k++) {
    const payload = { headers: L.headers, sampleRows: L.rows };
    const r = await callOpenRouter({ apiKey: KEY, model: MODELS.fast, spec: TASKS.map_columns, payload });
    total++;
    if (!r.ok) { errs++; continue; }
    const m = verifyMapping(payload, r.result).mapping;
    const bad = Object.entries(L.expect).filter(([f, h]) => m[f] !== h).map(([f, h]) => `${f}: got ${m[f]} want ${h}`);
    if (!bad.length && !m.amount === !L.expect.amount) right++; else wrong.push(bad.join('; ') || 'extra amount mapping');
  }
  mapRuns.push({ layout: L.name, right, total, errs, wrong });
}

const pc = n => n === null ? 'n/a' : (n * 100).toFixed(0) + '%';
const eur = n => n === null ? 'n/a (set PRICE_*)' : '$' + n.toFixed(4);
const ms = n => n === null ? '—' : Math.round(n) + ' ms/call';
let md = `# AI evaluation\n\nData: ${rows.length} **synthetic** rows written by hand to resemble a student team's bank export and spending sheet (\`eval/labelled.csv\`). Not real transactions. The payee rules were written alongside this data, so "Rules only" is optimistic; replace the rows with redacted real spending for an honest number.\nPrompts and validation are the production ones (\`shared/ai\`). Models: fast = \`${MODELS.fast}\`, strong = \`${MODELS.strong || 'not run'}\`.\nDepartments: ${DEPTS.join(', ')}. Review threshold: ${THRESHOLD}.\n\n`;
md += `| Approach | Category acc. | Dept. acc. | Cost / 100 rows | Latency | Sent to review |\n|---|---|---|---|---|---|\n`;
for (const r of results) md += `| ${r.name} | ${pc(r.cat)} | ${r.dept === null ? 'n/a (rules have no department)' : pc(r.dept)} | ${r.name === 'Rules only' ? '$0' : eur(r.c)} | ${ms(r.latency)} | ${r.review} | ${r.note ? '' : ''}\n`.replace(/ \| \n$/, ' |\n');
md += `\n## Column mapping (cheap model, 2 runs per layout)\n\n| Layout | Fully correct | Errors |\n|---|---|---|\n`;
for (const m of mapRuns) md += `| ${m.layout} | ${m.right}/${m.total} | ${m.errs} |\n`;
for (const r of results.filter(x => x.wrong.length)) {
  md += `\n## Wrong predictions: ${r.name} (${r.wrong.length})\n\n| Description | Predicted (dept / category) | True | Confidence |\n|---|---|---|---|\n`;
  for (const w of r.wrong) md += `| ${w.description} | ${w.predicted} | ${w.truth} | ${w.confidence.toFixed(2)} |\n`;
}
md += `\n## What changed after seeing failures\n\n_(Fill in after each run: prompt edits, new payee rules, threshold changes, and the before/after numbers.)_\n`;
writeFileSync(new URL('./results.md', import.meta.url), md);
console.log(md.split('\n## Wrong')[0]);
console.log('Full report with every wrong prediction: eval/results.md');
