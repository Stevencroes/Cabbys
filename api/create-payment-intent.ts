// Vercel Node function — dormant until STRIPE_SECRET_KEY is configured.
// To activate: set STRIPE_SECRET_KEY in Vercel env vars and run `npm i stripe`.
// The `stripe` package is dynamically imported so the Vite build does not
// require it to be installed.

export default async function handler(req: { body?: { amount?: number; currency?: string } }, res: { status: (code: number) => { json: (body: unknown) => void } }) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(501).json({ error: "Stripe not configured" });

  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(key);
  const { amount, currency = "usd" } = req.body ?? {};
  const intent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
  });
  return res.status(200).json({ clientSecret: intent.client_secret });
}
