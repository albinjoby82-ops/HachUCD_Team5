// Applied in the browser before sending AND again in the Worker. Send the minimum needed.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/gi;
const PHONE = /(?:\+|\b00)\d[\d ()-]{7,}\d/g;
const LONG_DIGITS = /\b\d(?:[ ]?\d){7,}\b/g;

export function redactText(s: string, max = 200): string {
  return s
    .replace(EMAIL, '[email]')
    .replace(IBAN, '[account]')
    .replace(PHONE, '[phone]')
    .replace(LONG_DIGITS, '[number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Transfers to or from a person: the description is mostly a name, so don't send it at all. */
export function isPersonTransfer(description: string): boolean {
  return /^\s*(tfr|transfer|trf|revolut|sepa|payment to|payment from|standing order)\b/i.test(description);
}
