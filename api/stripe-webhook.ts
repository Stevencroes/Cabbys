// Vercel Node function — Stripe webhook → ride status.
//
// payment_intent.amount_capturable_updated  → card authorized → ride "confirmed"
// payment_intent.succeeded                  → captured (driver assigned) → payment_status "paid"
// payment_intent.payment_failed / canceled  → back to "pending" so the traveler can retry
//
// Dormant until STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + Supabase service
// credentials are configured. Signature is verified against the raw body.

export const config = { api: { bodyParser: false } };

interface StripeEvent {
  type: string;
  data: { object: { id: string; metadata?: Record<string, string> } };
}
interface StripeModule {
  default: new (key: string) => {
    webhooks: {
      constructEventAsync: (payload: string, sig: string, secret: string) => Promise<StripeEvent>;
    };
  };
}
const runtimeImport = new Function("m", "return import(m)") as (m: string) => Promise<StripeModule>;

interface RawReq extends AsyncIterable<Uint8Array> {
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => { json: (body: unknown) => void };
}

async function readRawBody(req: RawReq): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function patchRide(
  supabaseUrl: string,
  serviceKey: string,
  rideId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rides?id=eq.${encodeURIComponent(rideId)}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

export default async function handler(req: RawReq & { method?: string }, res: Res) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !webhookSecret || !supabaseUrl || !serviceKey) {
    return res.status(501).json({ error: "Webhook not configured" });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sig = req.headers["stripe-signature"];
  if (typeof sig !== "string") return res.status(400).json({ error: "Missing signature" });

  let event: StripeEvent;
  try {
    const raw = await readRawBody(req);
    const Stripe = (await runtimeImport("stripe")).default;
    const stripe = new Stripe(stripeKey);
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch {
    return res.status(400).json({ error: "Invalid signature" });
  }

  const intent = event.data.object;
  const rideId = intent.metadata?.ride_id;
  if (!rideId) return res.status(200).json({ received: true, skipped: "no ride_id" });

  let patch: Record<string, unknown> | null = null;
  switch (event.type) {
    case "payment_intent.amount_capturable_updated":
      patch = { status: "confirmed", payment_intent_id: intent.id, payment_status: "authorized" };
      break;
    case "payment_intent.succeeded":
      patch = { payment_intent_id: intent.id, payment_status: "paid" };
      break;
    case "payment_intent.payment_failed":
    case "payment_intent.canceled":
      patch = { status: "pending", payment_intent_id: intent.id, payment_status: "failed" };
      break;
    default:
      return res.status(200).json({ received: true, skipped: event.type });
  }

  // Older deployments may not have the payment columns — degrade to status-only.
  const ok =
    (await patchRide(supabaseUrl, serviceKey, rideId, patch)) ||
    ("status" in patch
      ? await patchRide(supabaseUrl, serviceKey, rideId, { status: patch.status })
      : true);

  return res.status(ok ? 200 : 502).json({ received: ok });
}
