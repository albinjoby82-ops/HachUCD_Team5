import { handleStripe } from '../shared/stripe/sandbox.mjs';

// Vercel Node function; all Stripe credentials remain server-side.
export default { fetch(request) { return handleStripe(request, process.env); } };
