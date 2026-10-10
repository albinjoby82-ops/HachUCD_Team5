export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  APP_URL?: string;
}
export function handleStripe(request: Request, env: StripeEnv): Promise<Response>;
