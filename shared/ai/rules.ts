// Deterministic payee rules: always tried before any model is called.

export const CATEGORIES = ['Components', 'Tools', 'Materials', 'Travel', 'Entry fees', 'Sponsorship', 'Refund', 'Other'];

const RULES: [RegExp, string][] = [
  [/\b(refund|reversal|chargeback)\b/i, 'Refund'],
  [/\b(sponsor\w*|donation|grant)\b/i, 'Sponsorship'],
  [/\b(entry fee|registration|reg fee|competition fee)\b/i, 'Entry fees'],
  [/\b(rs components|farnell|mouser|digi-?key|pimoroni|pi ?hut|arrow electronics|rapid electronics|cpc)\b/i, 'Components'],
  [/\b(screwfix|toolstation|woodies|halfords|b ?& ?q|wickes)\b/i, 'Tools'],
  [/\b(metal supermarket|xometry|protolabs|filament|aluminium|aluminum|steel|carbon fi[bv]re|perspex|plywood)\b/i, 'Materials'],
  [/\b(irish rail|dublin bus|leap card|ryanair|aer lingus|uber|freenow|stena|ferry|airbnb|hotel|bus eireann)\b/i, 'Travel'],
];

export function ruleCategory(description: string): string | null {
  for (const [re, cat] of RULES) if (re.test(description)) return cat;
  return null;
}
