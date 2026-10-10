import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readInventory, suggestMapping, makeDrafts, validateDraft, reviewDrafts, validMapping, estimatedTotals, fingerprint, writableDepartments } from '../src/lib/inventory.ts';

const settings = { costBasis: 'unit', currency: 'EUR', unit: 'piece', numberFormat: 'dot' };
const draft = (patch = {}) => ({ sourceRow: 2, itemName: 'Motor', cost: '14.00', quantity: '12', supplier: 'Robotics', currency: 'EUR', unit: 'piece', issues: [], excluded: false, keepDuplicate: false, ...patch });
test('quoted commas, escaped quotes, embedded newlines, BOM and logical source records', () => {
  const parsed = readInventory('\uFEFFName,Qty,Supplier\r\n"Motor, small",12,"Parts ""R"" Us"\r\n"Cable\nred",2,Shop\r\n', 'a.csv');
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows[0].values, ['Motor, small', '12', 'Parts "R" Us']);
  assert.equal(parsed.rows[1].sourceRow, 3);
  assert.equal(parsed.rows[1].values[0], 'Cable\nred');
});
test('only the selected delimiter splits fields', () => {
  const parsed = readInventory('Name;Qty;Cost\nMotor;2;1,20', 'a.csv', ';');
  assert.deepEqual(parsed.rows[0].values, ['Motor', '2', '1,20']);
  assert.equal(readInventory('Name,Qty\nCable; red,2', 'a.csv').rows[0].values[0], 'Cable; red');
});
test('blank records accounted for and duplicate headings preserved', () => {
  const source = readInventory('Name,Qty,Qty\n\nMotor,1,2\n,,\n', 'a.csv');
  assert.equal(source.blankRows, 2);
  assert.equal(source.columns.length, 3);
  assert.match(source.issues[0], /Duplicate/);
  assert.deepEqual(source.rows[0].values, ['Motor', '1', '2']);
});
test('empty, header-only and unclosed quote files fail clearly', () => {
  for (const text of ['', '\n\n', 'Name,Qty', 'Name,Qty\n"Motor,2']) assert.throws(() => readInventory(text, 'a.csv'));
});
test('malformed quotes and wrong column counts block affected records', () => {
  const source = readInventory('Name,Qty\nMo"tor,2\nCable,2,extra', 'a.csv');
  assert.ok(source.rows.every(r => r.issues.length));
  const ds = makeDrafts(source, suggestMapping(source.columns), settings);
  assert.ok(reviewDrafts(ds, settings, []).every(r => r.errors.length));
});
test('invalid encoding and explicit scale limits', () => {
  assert.throws(() => readInventory('Name,Qty\n\0Motor,1', 'a.csv'), /UTF-8/);
  assert.throws(() => readInventory('Name,Qty\n' + 'Motor,1\n'.repeat(2001), 'a.csv'), /2,000/);
  assert.throws(() => readInventory('x'.repeat(2 * 1024 * 1024 + 1), 'a.csv'), /2 MB/);
});
test('25 robotics records import with unknown suppliers', () => {
  const source = readInventory('Product,Qty,Unit Price\n' + Array.from({ length: 25 }, (_, i) => `Part ${i},${i},14.00`).join('\n'), 'robotics.csv');
  const rows = makeDrafts(source, suggestMapping(source.columns), settings);
  const result = reviewDrafts(rows, settings, []);
  assert.equal(result.length, 25);
  assert.ok(result.every(r => r.value && r.value.supplier === null));
  assert.equal(result[0].value.qty, 0);
});
test('manual reordered mapping; mapping response bounds and unique columns', () => {
  const source = readInventory('Vendor,Custom quantity,Product\nShop,2,Motor', 'a.csv');
  const mapping = { ...suggestMapping(source.columns), quantity: 1 };
  assert.equal(makeDrafts(source, mapping, settings)[0].quantity, '2');
  assert.equal(validMapping({ ...mapping, cost: 20 }, 3), false);
  assert.equal(validMapping({ ...mapping, quantity: 2 }, 3), false);
  assert.equal(validMapping({ itemName: 0 }, 3), false);
});
test('missing costs differ from genuine zero costs', () => {
  assert.equal(validateDraft(draft({ cost: '' }), settings).value.unitCost, null);
  assert.equal(validateDraft(draft({ cost: '0' }), settings).value.unitCost, '0.000000');
});
test('zero and fractional quantities allowed, invalid quantities rejected', () => {
  assert.equal(validateDraft(draft({ quantity: '0' }), settings).value.qty, 0);
  assert.equal(validateDraft(draft({ quantity: '2.5' }), settings).value.qty, 2.5);
  for (const quantity of ['', '-1', 'NaN', '2x', '1e3', '1.0000001', '1000000001']) assert.ok(validateDraft(draft({ quantity }), settings).errors.length);
});
test('locale resolves thousands versus decimal commas without guessing', () => {
  assert.equal(validateDraft(draft({ cost: '1,200' }), settings).value.unitCost, '1200.000000');
  assert.equal(validateDraft(draft({ cost: '1,200' }), { ...settings, numberFormat: 'comma' }).value.unitCost, '1.200000');
  assert.ok(validateDraft(draft({ cost: '12,34' }), settings).errors.length);
  assert.ok(validateDraft(draft(), { ...settings, numberFormat: '' }).errors.length);
});
test('row total conversion, zero division and explicit cost basis', () => {
  assert.equal(validateDraft(draft({ cost: '10', quantity: '4' }), { ...settings, costBasis: 'total' }).value.unitCost, '2.500000');
  const rounded = validateDraft(draft({ cost: '1', quantity: '3' }), { ...settings, costBasis: 'total' });
  assert.equal(rounded.value.unitCost, '0.333333');
  assert.match(rounded.warnings[0], /rounded/);
  assert.ok(validateDraft(draft({ quantity: '0' }), { ...settings, costBasis: 'total' }).errors.length);
  assert.ok(validateDraft(draft(), { ...settings, costBasis: '' }).errors.length);
});
test('unknown supplier, currency validation and required name/unit', () => {
  assert.equal(validateDraft(draft({ supplier: ' ' }), settings).value.supplier, null);
  for (const patch of [{ itemName: ' ' }, { unit: '' }, { currency: 'XXX' }, { cost: '$12' }]) assert.ok(validateDraft(draft(patch), settings).errors.length);
});
test('existing and intra-file duplicates require explicit retention', () => {
  assert.ok(reviewDrafts([draft()], settings, [{ name: ' motor ' }])[0].errors.length);
  assert.ok(reviewDrafts([draft(), draft()], settings, []).every(r => r.errors.length));
  assert.equal(reviewDrafts([draft({ keepDuplicate: true })], settings, [{ name: 'Motor' }])[0].errors.length, 0);
  assert.equal(reviewDrafts([draft(), draft({ excluded: true })], settings, [])[0].errors.length, 0);
});
test('estimates separate currencies and exclude unknown or used-up items', () => {
  assert.deepEqual(estimatedTotals([{ qty: 2, unitCost: '3', currency: 'EUR' }, { qty: 1, unitCost: '5', currency: 'USD' }, { qty: 1 }, { qty: 99, status: 'usedup', unitCost: '1' }], 'EUR'), { totals: { EUR: 6, USD: 5 }, unknown: 1 });
});
test('fingerprints ignore filename, BOM and platform line endings', async () => {
  assert.equal(await fingerprint('\uFEFFName,Qty\r\nMotor,2\r\n'), await fingerprint('Name,Qty\nMotor,2'));
  assert.notEqual(await fingerprint('Name,Qty\nMotor,2'), await fingerprint('Name,Qty\nMotor,3'));
});

test('local persistence survives rehydrate; quota failures do not mutate state; scope is isolated', async () => {
  const map = new Map(); let fail = false;
  globalThis.localStorage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => { if (fail) throw new Error('quota'); map.set(key, value); }, removeItem: key => map.delete(key) };
  const { useStore, saveInventory } = await import('../src/lib/store.ts');
  const before = useStore.getState().orgs;
  const id = before[0].id, other = structuredClone(before[1]);
  saveInventory(id, org => org.items.push({ id: 'test-item', name: 'Test', qty: 0, dept: 'Shared', loc: 'Test', status: 'available' }));
  await useStore.persist.rehydrate();
  assert.equal(useStore.getState().orgs[0].items.at(-1).id, 'test-item');
  assert.deepEqual(useStore.getState().orgs[1], other);
  const count = useStore.getState().orgs[0].items.length;
  fail = true;
  assert.throws(() => saveInventory(id, org => { org.items = []; }), /Could not save/);
  assert.equal(useStore.getState().orgs[0].items.length, count);
  fail = false;
  const org = useStore.getState().orgs[0];
  assert.deepEqual(writableDepartments(org, 'non-member', ['Shared', 'Mechanical']), []);
});
