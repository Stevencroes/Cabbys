import { loadStripe, type Stripe } from "@stripe/stripe-js";

let p: Promise<Stripe | null> | null = null;

export function getStripe() {
  const key = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  if (!p) p = loadStripe(key);
  return p;
}
