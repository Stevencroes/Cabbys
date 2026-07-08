// Vercel Node function — creates a Stripe PaymentIntent for a ride.
//
// Security model: the client sends ONLY a ride id. The amount is read
// server-side from the rides row (written by the booking flow before payment),
// so a tampered request can never change what gets charged.
//
// Auth-then-capture: capture_method "manual" authorizes the card now; the
// charge is captured when a driver is assigned (see docs/schema.sql notes and
// api/stripe-webhook.ts for the status plumbing).
//
// Dormant until env vars are configured:
//   STRIPE_SECRET_KEY            — activates the endpoint
//   SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY — ride lookup
// `stripe` is loaded via a runtime-resolved specifier so the build never needs
// it installed. To activate: `npm i stripe` + set the env vars in Vercel.

interface StripeIntent {
  client_secret: string;
  amount: number;
}
interface StripeModule {
  default: new (key: string) => {
    paymentIntents: {
      create: (opts: unknown, reqOpts?: { idempotencyKey?: string }) => Promise<StripeIntent>;
    };
  };
}
const runtimeImport = new Function("m", "return import(m)") as (m: string) => Promise<StripeModule>;

// Fares are stored in AWG (florin); cards are charged in USD at the same
// pegged rate the UI displays (src/lib/currency.ts).
const AWG_PER_USD = 1.79;

interface Req {
  body?: { rideId?: string };
}
interface Res {
  status: (code: number) => { json: (body: unknown) => void };
}

export default async function handler(req: Req, res: Res) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(501).json({ error: "Stripe not configured" });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(501).json({ error: "Supabase service credentials not configured" });
  }

  const rideId = req.body?.rideId;
  if (!rideId || !/^[a-zA-Z0-9-]{8,64}$/.test(rideId)) {
    return res.status(400).json({ error: "Invalid ride id" });
  }

  // Server-side price lookup — never trust a client-sent amount.
  const rideRes = await fetch(
    `${supabaseUrl}/rest/v1/rides?id=eq.${encodeURIComponent(rideId)}&select=id,fare_total,price,status,booking_ref&limit=1`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  if (!rideRes.ok) return res.status(502).json({ error: "Ride lookup failed" });
  const rows = (await rideRes.json()) as Array<{
    id: string;
    fare_total?: number | string;
    price?: number | string;
    status?: string;
    booking_ref?: string;
  }>;
  const ride = rows[0];
  if (!ride) return res.status(404).json({ error: "Ride not found" });

  const status = (ride.status ?? "pending").toLowerCase();
  if (!["pending", "pending_payment"].includes(status)) {
    return res.status(409).json({ error: `Ride is not payable (status: ${status})` });
  }

  const fareAwg = Number(ride.fare_total ?? ride.price ?? 0);
  const amountUsdCents = Math.round((fareAwg / AWG_PER_USD) * 100);
  if (!Number.isFinite(amountUsdCents) || amountUsdCents < 50) {
    return res.status(422).json({ error: "Ride has no valid fare" });
  }

  const Stripe = (await runtimeImport("stripe")).default;
  const stripe = new Stripe(stripeKey);
  const intent = await stripe.paymentIntents.create(
    {
      amount: amountUsdCents,
      currency: "usd",
      capture_method: "manual",
      automatic_payment_methods: { enabled: true },
      description: `Cabby's transfer ${ride.booking_ref ?? ride.id}`,
      metadata: { ride_id: ride.id, booking_ref: ride.booking_ref ?? "" },
    },
    // One intent per ride — retries and double-clicks can't double-charge.
    { idempotencyKey: `ride-${ride.id}-v1` },
  );

  return res.status(200).json({ clientSecret: intent.client_secret, amount: intent.amount });
}
