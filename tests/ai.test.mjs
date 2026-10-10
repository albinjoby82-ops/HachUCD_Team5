import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redactText, isPersonTransfer } from '../shared/ai/redact.ts';
import { ruleCategory, CATEGORIES } from '../shared/ai/rules.ts';
import { extractJson } from '../shared/ai/call.ts';
import {
  parseClassifyInput, parseClassifyOutput, reconcileClassification, parseMapOutput, verifyMapping,
  numbersIn, summaryUsesOnlyGivenNumbers, parseSummaryInput,
} from '../shared/ai/schemas.ts';
import worker from '../worker/index.ts';
import { classifyDrafts } from '../src/lib/ai/financeAi.ts';

const realFetch = globalThis.fetch;
const restore = () => { globalThis.fetch = realFetch; };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

test('redaction removes emails, accounts, phones and long digit runs but keeps merchant text', () => {
  assert.equal(redactText('RS COMPONENTS 8842'), 'RS COMPONENTS 8842');
  assert.equal(redactText('pay anna.byrne@ucd.ie now'), 'pay [email] now');
  assert.match(redactText('TFR IE29 AIBK 9311 5212 3456 78 A OBRIEN'), /\[account\]/);
  assert.match(redactText('call +353 87 123 4567 re order'), /\[phone\]/);
  assert.match(redactText('CARD 4929 1234 5678 9012 SHOP'), /\[number\]/);
  assert.equal(redactText('x'.repeat(500)).length, 200);
  assert.ok(isPersonTransfer('TFR 0931 A OBRIEN'));
  assert.ok(!isPersonTransfer('RS COMPONENTS'));
});

test('rules settle known payees; unknown payees fall through', () => {
  assert.equal(ruleCategory('RS COMPONENTS IE'), 'Components');
  assert.equal(ruleCategory('SCREWFIX DUBLIN'), 'Tools');
  assert.equal(ruleCategory('Sponsorship from Acme'), 'Sponsorship');
  assert.equal(ruleCategory('SUMUP *J MURPHY'), null);
});

test('extractJson survives code fences and surrounding prose', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here you go: {"a":2} hope that helps'), { a: 2 });
  assert.throws(() => extractJson('no json here'));
});

test('classify input limits and output reconciliation', () => {
  const ok = { departments: ['Electrical', 'Mechanical'], categories: CATEGORIES, rows: [{ id: 1, description: 'RS', amount: -10 }, { id: 2, description: 'X', amount: -5 }, { id: 3, description: 'Y', amount: 4 }] };
  assert.ok(parseClassifyInput(ok).ok);
  assert.ok(!parseClassifyInput({ ...ok, rows: [] }).ok);
  assert.ok(!parseClassifyInput({ ...ok, rows: Array.from({ length: 31 }, (_, i) => ({ id: i, description: 'a', amount: 1 })) }).ok);
  assert.ok(!parseClassifyInput({ ...ok, rows: [ok.rows[0], ok.rows[0]] }).ok, 'duplicate ids rejected');
  assert.ok(!parseClassifyInput({ ...ok, rows: [{ id: 1, description: 'a', amount: Infinity }] }).ok);
  const out = parseClassifyOutput({ results: [
    { id: 1, department: 'Electrical', category: 'Components', confidence: 0.9, reason: 'electronics' },
    { id: 2, department: 'Marketing', category: 'Tools', confidence: 0.9, reason: 'invented dept' },
    // id 3 missing
  ] });
  assert.ok(out.ok);
  const rec = reconcileClassification(ok, out.data);
  assert.equal(rec.get(1).department, 'Electrical');
  assert.equal(rec.get(2), null, 'department outside the chart is unclassified');
  assert.equal(rec.get(3), null, 'missing id goes to review');
  const dup = reconcileClassification(ok, { results: [{ id: 1, department: null, category: 'Other', confidence: 1, reason: '' }, { id: 1, department: null, category: 'Other', confidence: 1, reason: '' }] });
  assert.equal(dup.get(1), null, 'an id returned twice is unusable');
  const cat = reconcileClassification(ok, { results: [{ id: 1, department: null, category: 'Spaceships', confidence: 1, reason: '' }] });
  assert.equal(cat.get(1), null, 'category outside the list is unclassified');
});

test('column mapping may only use real headers', () => {
  const out = parseMapOutput({ mapping: { date: 'Posted', description: 'Narrative', amount: 'Totally Invented' }, confidence: 1.7, notes: 'ok' });
  assert.ok(out.ok);
  assert.equal(out.data.confidence, 1);
  const v = verifyMapping({ headers: ['Posted', 'Narrative'], sampleRows: [] }, out.data);
  assert.equal(v.mapping.date, 'Posted');
  assert.equal(v.mapping.amount, null);
  assert.equal(v.mapping.who, null);
});

test('summary number check rejects any figure that was not supplied', () => {
  const stats = { currency: 'EUR', paid: 1250.5, committed: 420, termBudget: 6000, remaining: 4329.5, income: 2000, departments: [{ name: 'Mechanical', spent: 900, budget: 2000, remaining: 1100 }], records: 42, needsReview: 3, excluded: 1, from: '2026-09-01', through: '2026-09-30' };
  assert.ok(parseSummaryInput(stats).ok);
  assert.deepEqual(numbersIn('€1,250.50 of 6,000'), [1250.5, 6000]);
  assert.ok(summaryUsesOnlyGivenNumbers('You have spent €1,250.50 of €6,000 and 3 rows still need review.', stats));
  assert.ok(!summaryUsesOnlyGivenNumbers('You have spent €1,250.50, about 21% of budget.', stats), 'a derived percentage is a number the AI computed');
  assert.ok(!summaryUsesOnlyGivenNumbers('Spent 1,251 so far.', stats));
});

test('worker only runs known tasks, validates input, never leaks the key', async () => {
  const env = { OPENROUTER_API_KEY: 'sk-or-test-SECRET', MODEL_FAST: 'vendor/fast:free', MODEL_STRONG: 'vendor/strong' };
  const post = (body, headers = {}) => worker.fetch(new Request('https://commons.example/api/ai', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), env);
  const payload = { departments: ['Electrical'], categories: CATEGORIES, rows: [{ id: 1, description: 'RS COMPONENTS 4929123456789012', amount: -10 }] };
  try {
    assert.equal((await post({ task: 'write_poem', payload: {} })).status, 400);
    assert.equal((await post({ task: 'toString', payload: {} })).status, 400, 'prototype keys are not tasks');
    assert.equal((await post({ task: 'classify_rows', payload: { rows: [] } })).status, 400);
    assert.equal((await post({ task: 'classify_rows', payload }, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await worker.fetch(new Request('https://commons.example/api/ai', { method: 'POST', body: JSON.stringify({ task: 'classify_rows', payload }) }), { ...env, OPENROUTER_API_KEY: undefined })).status, 503);
    assert.equal((await worker.fetch(new Request('https://commons.example/api/ai', { method: 'POST', body: JSON.stringify({ task: 'classify_rows', payload }) }), { ...env, MODEL_FAST: 'REPLACE_ME' })).status, 503);
    assert.equal((await worker.fetch(new Request('https://commons.example/'), env)).status, 404);

    let sentToUpstream;
    globalThis.fetch = async (url, init) => {
      sentToUpstream = JSON.parse(init.body);
      assert.equal(init.headers.Authorization, 'Bearer sk-or-test-SECRET');
      return json({ model: 'vendor/fast:free', usage: { total_tokens: 55 }, choices: [{ message: { content: '```json\n{"results":[{"id":1,"department":"Electrical","category":"Components","confidence":0.93,"reason":"electronics supplier"}]}\n```' } }] });
    };
    const ok = await post({ task: 'classify_rows', payload }, { Origin: 'https://commons.example' });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.result.results[0].department, 'Electrical');
    assert.equal(body.model, 'vendor/fast:free');
    assert.ok(!JSON.stringify(body).includes('SECRET'));
    assert.ok(!JSON.stringify(sentToUpstream).includes('4929123456789012'), 'worker redacts again before sending');
    assert.equal(sentToUpstream.model, 'vendor/fast:free');

    globalThis.fetch = async () => json({ error: { message: 'insufficient credits SECRET-DETAIL' } }, 402);
    const quota = await post({ task: 'classify_rows', payload });
    assert.equal(quota.status, 502);
    const q = await quota.json();
    assert.equal(q.error, 'upstream_error');
    assert.equal(q.upstream, 402);
    assert.ok(!JSON.stringify(q).includes('SECRET-DETAIL'), 'upstream bodies are never forwarded');

    globalThis.fetch = async () => json({ choices: [{ message: { content: 'I cannot help with that' } }] });
    assert.equal((await (await post({ task: 'classify_rows', payload })).json()).error, 'bad_model_json');
    globalThis.fetch = async () => json({ choices: [{ message: { content: '{"results":"nope"}' } }] });
    assert.equal((await (await post({ task: 'classify_rows', payload })).json()).error, 'bad_model_shape');
  } finally { restore(); }
});

const settings = { source: 'bank', numberFormat: 'dot', dateFormat: 'iso', amountMode: 'signed', currency: 'EUR', dept: 'Shared' };
const draft = (n, description, amount, patch = {}) => ({ sourceRow: n, date: '2026-09-01', description, amount, out: '', in: '', dept: 'Shared', category: 'Other', kind: '', reference: '', currency: 'EUR', receipt: '', project: '', status: '', requestId: '', separate: false, excluded: false, issues: [], ...patch });
const DEPTS = ['Electrical', 'Mechanical', 'Shared'];

test('classification: rules first, AI for the rest, low confidence goes to review, transfers never sent', async () => {
  const sent = [];
  globalThis.fetch = async (_url, init) => {
    const input = JSON.parse(init.body).payload;
    sent.push(...input.rows.map(r => r.description));
    return json({ result: { results: input.rows.map(r => r.id === 3 ? { id: 3, department: null, category: 'Other', confidence: 0.4, reason: 'vague' } : { id: r.id, department: 'Electrical', category: 'Components', confidence: 0.9, reason: 'electronics' }) }, usage: { total_tokens: 100 }, model: 'm' });
  };
  try {
    const rows = [draft(2, 'RS COMPONENTS IE', '-30'), draft(3, 'SUMUP *J MURPHY', '-45'), draft(4, 'TFR 0931 A OBRIEN', '-150'), draft(5, 'CAPACITOR KIT', '-12', { dept: 'Mechanical', category: 'Components' })];
    const run = await classifyDrafts(rows, settings, DEPTS, false);
    assert.equal(run.meta[2].appliedDept, true);
    assert.equal(run.meta[2].dept, 'Electrical');
    assert.equal(run.meta[2].category, 'Components', 'rule category wins and is labelled a rule');
    assert.equal(run.meta[2].source, 'rule');
    assert.equal(run.meta[3].review, true, 'low confidence needs a person');
    assert.equal(run.meta[3].appliedDept, false);
    assert.equal(run.meta[4].review, true);
    assert.ok(!sent.some(d => d.includes('OBRIEN')), 'person transfers are not sent to the AI');
    assert.equal(run.heldBack, 1);
  } finally { restore(); }
});

test('classification: unreachable AI leaves every row for review and throws nothing', async () => {
  globalThis.fetch = async () => { throw new TypeError('network'); };
  try {
    const run = await classifyDrafts([draft(2, 'MYSTERY LTD', '-30'), draft(3, 'ANOTHER', '-5')], settings, DEPTS, false);
    assert.equal(run.unavailable, 'unreachable');
    assert.equal(run.failed, 2);
    assert.ok(Object.values(run.meta).every(m => m.review && !m.appliedDept && m.reason === 'AI unavailable'));
  } finally { restore(); }
});

test('classification: respects a department the user already supplied and large files batch', async () => {
  let calls = 0;
  globalThis.fetch = async (_u, init) => { calls++; const input = JSON.parse(init.body).payload; return json({ result: { results: input.rows.map(r => ({ id: r.id, department: 'Mechanical', category: 'Tools', confidence: 0.95, reason: 'x' })) }, usage: null, model: 'm' }); };
  try {
    const rows = Array.from({ length: 60 }, (_, i) => draft(i + 2, 'UNKNOWN SHOP ' + i, '-5'));
    const withDept = draft(100, 'SHOP', '-5', { dept: 'Electrical', category: 'Tools' });
    const run = await classifyDrafts([...rows, withDept], settings, DEPTS, true);
    assert.equal(calls, 3, '60 unclassified rows go in batches of 25');
    assert.equal(run.meta[100], undefined, 'rows with a valid department and category are left alone');
    assert.equal(run.meta[2].appliedDept, false, 'a department the user already has is never overwritten');
    assert.equal(run.meta[2].category, 'Tools');
    assert.equal(run.meta[2].review, false);
  } finally { restore(); }
});

test('models that answer in odd shapes are still understood', async () => {
  const { messageText } = await import('../shared/ai/call.ts');
  assert.equal(messageText({ content: '{"a":1}' }), '{"a":1}');
  assert.equal(messageText({ content: [{ type: 'text', text: '{"a":2}' }] }), '{"a":2}');
  assert.equal(messageText({ content: '', reasoning: 'thinking... {"a":3}' }), 'thinking... {"a":3}');
  assert.equal(messageText({ content: null }), '');
});

test('worker retries unusable model output before giving up', async () => {
  const env = { OPENROUTER_API_KEY: 'k', MODEL_FAST: 'm', MODEL_STRONG: 'm' };
  const payload = { headers: ['Date', 'Details'], sampleRows: [['01/01/2026', 'RS']] };
  let calls = 0;
  globalThis.fetch = async () => { calls++; return calls < 3 ? json({ choices: [{ message: { content: 'sorry, no' } }] }) : json({ model: 'm', choices: [{ message: { content: '{"mapping":{"date":"Date","description":"Details"},"confidence":0.9,"notes":""}' } }] }); };
  try {
    const res = await worker.fetch(new Request('https://x.example/api/ai', { method: 'POST', body: JSON.stringify({ task: 'map_columns', payload }) }), env);
    assert.equal(res.status, 200);
    assert.equal(calls, 3);
    calls = -10; // always bad from here on: must stop, not loop forever
    globalThis.fetch = async () => { calls++; return json({ choices: [{ message: { content: 'nope' } }] }); };
    const bad = await worker.fetch(new Request('https://x.example/api/ai', { method: 'POST', body: JSON.stringify({ task: 'map_columns', payload }) }), env);
    assert.equal(bad.status, 502);
    assert.equal(calls, -7);
  } finally { restore(); }
});
