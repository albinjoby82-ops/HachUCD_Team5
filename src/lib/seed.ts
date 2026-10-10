import type { Borrow, Cluster, Item, Org, OrgNode, Person, PurchaseRequest } from './types';
import { DAY_MS, daysFromNow } from './format';
import { layoutTree } from './layout';

const at = (daysAgo: number, h: number, m: number) => { const d = new Date(Date.now() - daysAgo * DAY_MS); d.setHours(h, m, 0, 0); return Math.min(d.getTime(), Date.now() - 5 * 60_000); };

export const DEMO_ORG = 'org-ironclad';
export const GAEL_ORG = 'org-gaelforce';
const VOLT = 'org-volt', SKY = 'org-skylab';

function baseOrg(p: Partial<Org> & Pick<Org, 'id' | 'name' | 'nodes' | 'people'>): Org {
  return {
    type: 'eng', currency: 'EUR', modules: { finance: true, inventory: true, events: true, cluster: true },
    inviteCode: 'CODE-0000', termBudget: 0, budgets: {}, baseSpend: {}, requests: [], items: [], tags: [],
    clusterId: 'cl-eng', imports: [], seq: 100, logoColor: '#ffd166', createdAt: Date.now() - 90 * DAY_MS, ...p,
  };
}

function ironclad(): Org {
  const nodes: OrgNode[] = layoutTree([
    { id: 'cap', title: 'Captain', parentId: null, x: 0, y: 0 },
    { id: 'vc', title: 'Vice captain · Treasurer', parentId: 'cap', x: 0, y: 0 },
    { id: 'elec', title: 'Electrical captain', dept: 'Electrical', color: '#f5a623', parentId: 'vc', x: 0, y: 0 },
    { id: 'mech', title: 'Mechanical captain', dept: 'Mechanical', color: '#ff6b5c', parentId: 'vc', x: 300, y: 0 },
    { id: 'prog', title: 'Programming captain', dept: 'Programming', color: '#12b8a0', parentId: 'vc', x: 600, y: 0 },
  ]);
  const P = (id: string, name: string, nodeId: string, lead = false, email?: string): Person => ({ id, name, nodeId, lead, email });
  const people: Person[] = [
    P('maya', 'Maya', 'cap', true, 'maya@ironclad.ie'), P('aoife', 'Aoife', 'vc', true, 'aoife@ironclad.ie'),
    P('ravi', 'Ravi', 'elec', true), P('daniel', 'Daniel', 'mech', true), P('priya', 'Priya', 'prog', true),
    P('tom', 'Tom', 'mech', false, 'tom@ironclad.ie'), P('sam', 'Sam', 'mech'), P('niamh', 'Niamh', 'mech'), P('cian', 'Cian', 'mech'),
    P('leo', 'Leo', 'elec'), P('chloe', 'Chloe', 'elec'), P('finn', 'Finn', 'elec'),
    P('ella', 'Ella', 'prog'), P('jack', 'Jack', 'prog'), P('zoe', 'Zoe', 'prog'),
  ];
  const requests: PurchaseRequest[] = [
    { id: 'R-104', item: 'M3 bolts ×200', cost: 14, qty: 1, byId: 'niamh', dept: 'Mechanical', tag: 'Chassis', status: 'pending', holderId: 'daniel', reason: 'Running low for the chassis rebuild', flag: 'Possible duplicate: Niamh ordered M3 bolts 3 days ago (R-099).', createdAt: at(0, 9, 12), trail: [{ who: 'Niamh', what: 'Submitted', at: at(0, 9, 12) }] },
    { id: 'R-103', item: 'Aluminium sheet order (6061, 3mm)', cost: 420, qty: 1, byId: 'tom', dept: 'Mechanical', tag: 'Arm v2', status: 'passed', holderId: 'aoife', reason: 'Panels for the arm housing', createdAt: at(1, 14, 3), trail: [{ who: 'Tom', what: 'Submitted', at: at(1, 14, 3) }, { who: 'Daniel', what: 'Passed up to Aoife', at: at(1, 17, 40), note: 'Big chunk of our materials money. Your call.' }] },
    { id: 'R-102', item: 'NEMA 17 stepper motor ×2', cost: 38, qty: 2, byId: 'tom', dept: 'Mechanical', tag: 'Arm v2', status: 'approved', holderId: null, merchant: 'RS Components', reason: 'Drive for the wrist joint', createdAt: at(8, 10, 15), trail: [{ who: 'Tom', what: 'Submitted', at: at(8, 10, 15) }, { who: 'Daniel', what: 'Approved', at: at(8, 16, 20) }] },
    { id: 'R-101', item: 'Oscilloscope probe set', cost: 65, qty: 1, byId: 'leo', dept: 'Electrical', tag: 'Power board', status: 'pending', holderId: 'ravi', reason: 'Current probes are worn', createdAt: at(0, 8, 40), trail: [{ who: 'Leo', what: 'Submitted', at: at(0, 8, 40) }] },
    { id: 'R-100', item: 'Raspberry Pi 5 (8GB)', cost: 85, qty: 1, byId: 'ella', dept: 'Programming', tag: 'Vision', status: 'bought', receipt: false, holderId: null, merchant: 'The Pi Hut', reason: 'Vision pipeline needs more RAM', createdAt: at(12, 11, 0), trail: [{ who: 'Ella', what: 'Submitted', at: at(12, 11, 0) }, { who: 'Priya', what: 'Approved', at: at(12, 15, 30) }, { who: 'Ella', what: 'Marked bought · no receipt yet', at: at(10, 13, 5) }] },
    { id: 'R-099', item: 'M3 bolts ×100', cost: 9, qty: 1, byId: 'niamh', dept: 'Mechanical', tag: 'Chassis', status: 'bought', receipt: true, holderId: null, merchant: 'RS Components', reason: 'Chassis brackets', createdAt: at(3, 10, 0), trail: [{ who: 'Niamh', what: 'Submitted', at: at(3, 10, 0) }, { who: 'Daniel', what: 'Approved', at: at(3, 12, 0) }, { who: 'Niamh', what: 'Marked bought · receipt attached', at: at(3, 16, 0) }] },
    { id: 'R-098', item: 'Soldering iron', cost: 45, qty: 1, byId: 'chloe', dept: 'Electrical', tag: 'Power board', status: 'rejected', holderId: null, reason: 'Ours keeps overheating', createdAt: at(15, 9, 0), trail: [{ who: 'Chloe', what: 'Submitted', at: at(15, 9, 0) }, { who: 'Ravi', what: 'Rejected', at: at(15, 11, 0), note: 'Volt FS shares 4 soldering stations in the cluster. Borrow one.' }] },
  ];
  const items: Item[] = [
    { id: 'I1', name: 'Hex key set', qty: 1, loc: 'Workshop, drawer 3', dept: 'Mechanical', status: 'borrowed', holderId: 'tom', due: daysFromNow(2) },
    { id: 'I2', name: 'Torque wrench set', qty: 1, loc: 'Workshop, wall rack', dept: 'Mechanical', status: 'available', shared: true },
    { id: 'I3', name: 'Cordless drill', qty: 2, loc: 'Workshop, shelf B', dept: 'Mechanical', status: 'damaged' },
    { id: 'I4', name: 'M3 bolts', qty: 140, loc: 'Parts bin 12', dept: 'Mechanical', status: 'available' },
    { id: 'I5', name: 'Rigol oscilloscope', qty: 1, loc: 'Lab 2, bench 1', dept: 'Electrical', status: 'borrowed', holderName: 'Kev (Volt FS)', due: daysFromNow(-1), shared: true },
    { id: 'I6', name: 'Bench power supply', qty: 2, loc: 'Lab 2, shelf A', dept: 'Electrical', status: 'available' },
    { id: 'I7', name: 'Raspberry Pi 4', qty: 3, loc: 'Programming cupboard', dept: 'Programming', status: 'available' },
    { id: 'I8', name: 'PLA filament', qty: 0, loc: 'Workshop, shelf A', dept: 'Shared', status: 'usedup' },
  ];
  return baseOrg({
    id: DEMO_ORG, name: 'Ironclad Robotics', inviteCode: 'IRON-4821', nodes, people, demo: true,
    termBudget: 6000, budgets: { Mechanical: 2000, Electrical: 1800, Programming: 700, Shared: 1500 },
    baseSpend: { Mechanical: 1240, Electrical: 980, Programming: 310, Shared: 620 },
    requests, items, tags: ['Arm v2', 'Chassis', 'Power board', 'Vision', 'Competition trip'], seq: 105,
  });
}

/**
 * GaelForce UCD at week 6 of the season: the team and its chart only. No requests, items or
 * finances yet, so the story (requests, purchase orders, the CSV catch-up) starts from here.
 */
function gaelforce(): Org {
  const nodes: OrgNode[] = layoutTree([
    { id: 'cap', title: 'Team Captain', parentId: null, x: 0, y: 0 },
    { id: 'vc', title: 'Vice Captain · Treasurer', parentId: 'cap', x: 0, y: 0 },
    { id: 'mech', title: 'Mechanical captain', dept: 'Mechanical', color: '#ff6b5c', parentId: 'vc', x: 0, y: 0 },
    { id: 'elec', title: 'Electrical captain', dept: 'Electrical', color: '#f5a623', parentId: 'vc', x: 300, y: 0 },
    { id: 'prog', title: 'Programming captain', dept: 'Programming', color: '#12b8a0', parentId: 'vc', x: 600, y: 0 },
    { id: 'ops', title: 'Operations captain', dept: 'Operations', color: '#3d8bfd', parentId: 'vc', x: 900, y: 0 },
  ]);
  const P = (id: string, name: string, nodeId: string, lead = false, alsoIn?: string[]): Person => ({ id, name, nodeId, lead, ...(alsoIn ? { alsoIn } : {}) });
  const people: Person[] = [
    P('joel', 'Joel', 'cap', true), P('cj', 'CJ', 'vc', true),
    P('kenneth', 'Kenneth', 'mech', true), P('albin', 'Albin', 'elec', true), P('ronan', 'Ronan', 'prog', true), P('jan', 'Jan', 'ops', true),
    P('colin', 'Colin', 'mech'), P('harish', 'Harish', 'mech'), P('fionn', 'Fionn', 'mech'), P('liam', 'Liam', 'mech'),
    P('phebe', 'Phebe', 'prog'),
    // Two departments each: requests route through Operations; the second box is shown for visibility.
    P('celine', 'Celine', 'ops', false, ['mech']), P('selma', 'Selma', 'ops', false, ['elec']),
  ];
  // Week 6 of the season. Six requests across the team's usual suppliers, one per stage of the flow.
  const requests: PurchaseRequest[] = [
    { id: 'R-6', item: 'Raspberry Pi 5 (8GB) ×2 + active coolers', cost: 178, qty: 2, byId: 'phebe', dept: 'Programming', tag: 'Testing', status: 'passed', holderId: 'cj', merchant: 'The Pi Hut',
      reason: 'Second compute board for the telemetry rig so we can test while the first is in the car', createdAt: at(1, 15, 20),
      trail: [{ who: 'Phebe', what: 'Submitted', at: at(1, 15, 20) }, { who: 'Ronan', what: 'Passed up to CJ', at: at(1, 17, 5), note: 'Bigger than our usual order this month. Treasurer’s call.' }] },
    { id: 'R-5', item: 'VEX V5 Robot Brain + battery', cost: 389, qty: 1, byId: 'ronan', dept: 'Programming', tag: 'Competition build', status: 'pending', holderId: 'cj', merchant: 'VEX Robotics USA',
      reason: 'Spare brain for the demo robot at the outreach day, so the main one stays on the bench', createdAt: at(0, 9, 40),
      trail: [{ who: 'Ronan', what: 'Submitted', at: at(0, 9, 40) }] },
    { id: 'R-4', item: 'Digital calipers, 150 mm', cost: 34.99, qty: 1, byId: 'harish', dept: 'Mechanical', tag: 'Competition build', status: 'pending', holderId: 'kenneth', merchant: 'Amazon',
      reason: 'Only one pair in the workshop and it is always in use', createdAt: at(0, 11, 5),
      trail: [{ who: 'Harish', what: 'Submitted', at: at(0, 11, 5) }] },
    { id: 'R-3', item: 'TPS54560 buck converter eval boards ×3', cost: 118.4, qty: 3, byId: 'albin', dept: 'Electrical', tag: 'Testing', status: 'approved', holderId: null, merchant: 'Mouser Electronics',
      reason: 'Powering the data logger from the 24 V pack', createdAt: at(4, 10, 30),
      trail: [{ who: 'Albin', what: 'Submitted', at: at(4, 10, 30) }, { who: 'CJ', what: 'Approved', at: at(3, 9, 15), note: 'Fine. Order it this week.' }] },
    { id: 'R-2', item: 'VEX V5 Smart Motor (11 W) ×4', cost: 152, qty: 4, byId: 'liam', dept: 'Mechanical', tag: 'Competition build', status: 'sentback', holderId: null, merchant: 'VEX Robotics Netherlands',
      reason: 'Drive motors for the practice chassis', createdAt: at(5, 14, 0),
      trail: [{ who: 'Liam', what: 'Submitted', at: at(5, 14, 0) }, { who: 'Kenneth', what: 'Sent back to Liam', at: at(4, 16, 45), note: 'Quote has no shipping or import cost. Add delivery to UCD and resend.' }] },
    { id: 'R-1', item: 'M6 A2 stainless fastener kit (assorted)', cost: 42.6, qty: 1, byId: 'colin', dept: 'Mechanical', tag: 'Competition build', status: 'bought', holderId: null, merchant: 'RS Components', receipt: true,
      reason: 'Chassis brackets and mounting plates', createdAt: at(27, 10, 0),
      trail: [{ who: 'Colin', what: 'Submitted', at: at(27, 10, 0) }, { who: 'Kenneth', what: 'Approved', at: at(27, 12, 30) }, { who: 'Colin', what: 'Marked bought · receipt attached', at: at(25, 16, 10) }] },
  ];
  return baseOrg({
    id: GAEL_ORG, name: 'GaelForce UCD', inviteCode: 'GAEL-2026', nodes, people, logoColor: '#12b8a0', demo: true, clusterId: null,
    seasonStart: Date.now() - 37 * DAY_MS, createdAt: Date.now() - 37 * DAY_MS,
    // Placeholder season budget so "left to spend" reads sensibly. Change it in Finance → Budgets.
    termBudget: 5000, budgets: { Mechanical: 1500, Electrical: 1200, Programming: 1000, Operations: 500, Shared: 800 },
    requests, tags: ['Competition build', 'Testing', 'Outreach', 'Competition trip'], seq: 7,
  });
}

function mini(id: string, name: string, code: string, color: string, lead: [string, string], member: [string, string], items: Item[]): Org {
  const nodes = layoutTree([
    { id: 'top', title: 'Captain', parentId: null, x: 0, y: 0 },
    { id: 'team', title: 'Build lead', dept: 'Build', color: '#3d8bfd', parentId: 'top', x: 0, y: 0 },
  ]);
  return baseOrg({
    id, name, inviteCode: code, nodes, logoColor: color, demo: true,
    people: [{ id: lead[0], name: lead[1], nodeId: 'top', lead: true }, { id: member[0], name: member[1], nodeId: 'team', lead: false }],
    termBudget: 4000, budgets: { Build: 3000, Shared: 1000 }, baseSpend: { Build: 900, Shared: 200 }, items, tags: ['Build', 'Competition'],
  });
}

export function seedData(): { orgs: Org[]; clusters: Cluster[]; borrows: Borrow[] } {
  const volt = mini(VOLT, 'Volt Formula Student', 'VOLT-3310', '#2ee6c5', ['aoibhe', 'Aoibhe'], ['kev', 'Kev'], [
    { id: 'V1', name: 'Laser cutter', qty: 1, loc: 'Volt bay, Eng 1.04', dept: 'Build', status: 'borrowed', holderName: 'Aidan (SkyLab)', due: daysFromNow(3), shared: true },
    { id: 'V2', name: 'Soldering station ×4', qty: 4, loc: 'Volt bay, bench 2', dept: 'Build', status: 'available', shared: true },
    { id: 'V3', name: 'Tyre warmers', qty: 4, loc: 'Volt bay', dept: 'Build', status: 'available' },
  ]);
  const sky = mini(SKY, 'SkyLab Drone Society', 'SKY-7702', '#ff8fa3', ['hugh', 'Hugh'], ['aidan', 'Aidan'], [
    { id: 'S1', name: 'Prusa 3D printer', qty: 1, loc: 'SkyLab room, Eng 2.11', dept: 'Build', status: 'available', shared: true },
    { id: 'S2', name: 'LiPo charging station', qty: 1, loc: 'SkyLab room', dept: 'Build', status: 'available', shared: true },
  ]);
  const borrows: Borrow[] = [
    { id: 'b1', ownerOrgId: DEMO_ORG, itemId: 'I2', borrowerOrgId: VOLT, borrowerPersonId: 'kev', borrowerName: 'Kev', until: daysFromNow(5), status: 'requested', at: at(0, 8, 0) },
    { id: 'b2', ownerOrgId: DEMO_ORG, itemId: 'I5', borrowerOrgId: VOLT, borrowerPersonId: 'kev', borrowerName: 'Kev', until: daysFromNow(-1), status: 'active', at: at(6, 10, 0) },
    { id: 'b3', ownerOrgId: VOLT, itemId: 'V1', borrowerOrgId: SKY, borrowerPersonId: 'aidan', borrowerName: 'Aidan', until: daysFromNow(3), status: 'active', at: at(2, 10, 0) },
  ];
  return {
    orgs: [ironclad(), volt, sky, gaelforce()],
    clusters: [{ id: 'cl-eng', name: 'Engineering Building cluster', orgIds: [DEMO_ORG, VOLT, SKY] }],
    borrows,
  };
}
