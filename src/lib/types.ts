export type OrgType = 'eng' | 'soc' | 'startup' | 'other';
export type Currency = 'EUR' | 'GBP' | 'USD';
export type ReqStatus = 'pending' | 'passed' | 'approved' | 'bought' | 'sentback' | 'rejected';
export type ItemStatus = 'available' | 'borrowed' | 'damaged' | 'usedup';

export interface Modules { finance: boolean; inventory: boolean; events: boolean; cluster: boolean }

/** A box in the chart. A box with `dept` starts a department; boxes below it inherit it. */
export interface OrgNode {
  id: string;
  title: string;
  parentId: string | null;
  dept?: string;
  color?: string;
  x: number;
  y: number;
}

/** A person sits in exactly one box, either leading it or as a member. */
export interface Person {
  id: string;
  name: string;
  email?: string;
  nodeId: string;
  lead: boolean;
  invited?: boolean;
}

export interface TrailEvent { who: string; what: string; at: number; note?: string }

export interface PurchaseRequest {
  id: string;
  item: string;
  cost: number;
  qty: number;
  byId: string;
  dept: string;
  tag: string;
  status: ReqStatus;
  holderId: string | null;
  reason: string;
  link?: string;
  flag?: string;
  merchant?: string;
  receipt?: boolean;
  receiptImg?: string;
  createdAt: number;
  trail: TrailEvent[];
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  loc: string;
  dept: string;
  status: ItemStatus;
  holderId?: string;
  holderName?: string;
  keeperId?: string;
  due?: number;
  shared?: boolean;
}

export interface ImportRecord {
  id: string;
  at: number;
  file: string;
  rows: number;
  rules: number;
  ai: number;
  reviewed: number;
  matched: number;
  flags: number;
  moneyOut: number;
  moneyIn: number;
  byCategory: Record<string, number>;
}

export interface Org {
  id: string;
  name: string;
  type: OrgType;
  currency: Currency;
  modules: Modules;
  inviteCode: string;
  nodes: OrgNode[];
  people: Person[];
  termBudget: number;
  budgets: Record<string, number>;
  baseSpend: Record<string, number>;
  requests: PurchaseRequest[];
  items: Item[];
  tags: string[];
  clusterId: string | null;
  imports: ImportRecord[];
  seq: number;
  logoColor: string;
  createdAt: number;
  demo?: boolean;
}

export interface Cluster { id: string; name: string; orgIds: string[] }

export interface Borrow {
  id: string;
  ownerOrgId: string;
  itemId: string;
  borrowerOrgId: string;
  borrowerPersonId: string;
  borrowerName: string;
  until: number;
  status: 'requested' | 'active' | 'returned' | 'declined';
  at: number;
}

export interface Account { name: string; email: string }
