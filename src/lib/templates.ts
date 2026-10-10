import type { OrgNode, OrgType, Person } from './types';
import { uid } from './format';
import { DEPT_PALETTE } from './org';
import { layoutTree } from './layout';

export interface Template { key: OrgType | 'blank'; label: string; blurb: string; top: string[]; depts: string[]; lead: string; tags: string[] }

export const TEMPLATES: Record<OrgType, Template> = {
  eng: { key: 'eng', label: 'Engineering team', blurb: 'Captain → Vice captain · Treasurer → department captains', top: ['Captain', 'Vice captain · Treasurer'], depts: ['Electrical', 'Mechanical', 'Programming'], lead: 'captain', tags: ['Competition build', 'Testing', 'Outreach', 'Competition trip'] },
  soc: { key: 'soc', label: 'Society', blurb: 'Chairperson → Treasurer → event, marketing & production leads', top: ['Chairperson', 'Treasurer'], depts: ['Events', 'Marketing', 'Production'], lead: 'lead', tags: ['Freshers week', 'Spring ball', 'Weekly meetups', 'Showcase'] },
  startup: { key: 'startup', label: 'Startup', blurb: 'Founder → Ops & finance lead → product, ops & growth leads', top: ['Founder', 'Ops & finance lead'], depts: ['Product', 'Ops', 'Growth'], lead: 'lead', tags: ['MVP', 'Launch', 'Fundraise', 'Hiring'] },
  other: { key: 'other', label: 'Other', blurb: 'Lead → Treasurer → two teams', top: ['Lead', 'Treasurer'], depts: ['Team A', 'Team B'], lead: 'lead', tags: ['Project 1', 'Project 2'] },
};

/** Builds a starting chart. The creator sits in the top box. */
export function buildTemplate(type: OrgType | 'blank', creator: string, creatorEmail?: string): { nodes: OrgNode[]; people: Person[] } {
  const nodes: OrgNode[] = [];
  const T = type === 'blank' ? null : TEMPLATES[type];
  let parent: string | null = null;
  (T ? T.top : ['Lead']).forEach(title => {
    const id = uid('n'); nodes.push({ id, title, parentId: parent, x: nodes.length * 10, y: 0 }); parent = id;
  });
  (T ? T.depts : []).forEach((d, i) => {
    nodes.push({ id: uid('n'), title: d + ' ' + T!.lead, dept: d, color: DEPT_PALETTE[i % DEPT_PALETTE.length], parentId: parent, x: i * 300, y: 0 });
  });
  const people: Person[] = [{ id: uid('p'), name: creator || 'You', email: creatorEmail, nodeId: nodes[0].id, lead: true }];
  return { nodes: layoutTree(nodes), people };
}

const FIRST = ['Aisling', 'Conor', 'Saoirse', 'Oisín', 'Ciara', 'Darragh', 'Róisín', 'Eoin', 'Méabh', 'Fionn', 'Orla', 'Seán', 'Nora', 'Liam', 'Clodagh', 'Rory', 'Grace', 'Adam', 'Emma', 'Jamie', 'Hannah', 'Luke', 'Amy', 'Ben'];

/** Fills empty lead slots and adds 2-3 members per department, for a quick demo. */
export function samplePeople(nodes: OrgNode[], people: Person[]): Person[] {
  const used = new Set(people.map(p => p.name.split(' ')[0]));
  const pool = FIRST.filter(n => !used.has(n));
  let i = 0;
  const next = () => pool[i++ % pool.length] + (i > pool.length ? ' ' + Math.ceil(i / pool.length) : '');
  const out = [...people];
  nodes.forEach(n => {
    if (!out.some(p => p.nodeId === n.id && p.lead)) out.push({ id: uid('p'), name: next(), nodeId: n.id, lead: true });
    const isLeaf = !nodes.some(k => k.parentId === n.id);
    if (isLeaf) {
      const have = out.filter(p => p.nodeId === n.id && !p.lead).length;
      for (let k = have; k < 2 + (n.title.length % 2); k++) out.push({ id: uid('p'), name: next(), nodeId: n.id, lead: false });
    }
  });
  return out;
}
