// Vercel Node function — dormant until STRIPE_SECRET_KEY is configured.
// To activate: run `npm i stripe`, set STRIPE_SECRET_KEY in Vercel env vars.
// `stripe` is loaded via a runtime-resolved specifier so the build never needs
// it installed (the bundler cannot statically resolve it, so the deploy is safe
// even though `stripe` is not a dependency yet).

const runtimeImport = new Function("m", "return import(m)") as (m: string) => Promise<{ default: new (key: string) => { paymentIntents: { create: (opts: unknown) => Promise<{ client_secret: string }> } } }>;

export default async function handler(
  req: { body?: { amount?: number; currency?: string } },
  res: { status: (code: number) => { json: (body: unknown) => void } },
) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(501).json({ error: "Stripe not configured" });

  const Stripe = (await runtimeImport("stripe")).default;
  const stripe = new Stripe(key);
  const { amount, currency = "usd" } = req.body ?? {};
  const intent = await stripe.paymentIntents.create({
    amount,
    currency,
    automatic_payment_methods: { enabled: true },
  });
  return res.status(200).json({ clientSecret: intent.client_secret });
}
