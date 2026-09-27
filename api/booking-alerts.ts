// Vercel Node function — booking alerts to Cabby's, by email.
//
// Called by the database, never by a browser: once the moment a booking
// is inserted, and every fifteen minutes by pg_cron. docs/alerts-schema.sql
// has the whole design; the short version is that the DATABASE decides
// what is due (claim_booking_alerts) and this only writes and sends it.
//
//   new         "New booking" — the moment it is made
//   remind_12h  "Still no driver" — 12 hours before pickup
//   remind_2h   "URGENT: no driver" — 2 hours before pickup
//
// Needs one variable in Vercel: RESEND_API_KEY. It reads the database with
// the public Supabase URL and key the site already has, and proves itself
// with the secret the caller sent, which the database checks. So this
// file holds no database secret, and a stranger calling it gets 401.
//
// Self-contained on purpose, like stripe-webhook.ts: with "type": "module"
// Vercel runs each api/ file as ESM, where a relative import without an
// extension fails at runtime and nowhere earlier. Nothing here imports
// from src/ for that reason; the few things it shares with the site
// (vehicle names, the domain) are copied and a test holds them equal.

/** Resend's free plan takes two requests a second. */
const SEND_GAP_MS = 600;
/** Per run. The cron comes back in fifteen minutes for the rest. */
const PER_RUN = 5;

const SITE_URL_DEFAULT = "https://cabbystransfer.com";
const ALERT_TO_DEFAULT = "cabbystransfer@gmail.com";
const FROM = "Cabby's Alerts <alerts@cabbystransfer.com>";
const TZ = "America/Aruba";

/** src/data/vehicles.ts, by id. src/server/bookingAlerts.test.ts keeps them equal. */
export const VEHICLE_NAMES: Record<string, string> = {
  sedan: "Executive Sedan",
  suv: "Luxury SUV",
  transit: "Premium Van",
  sprinter: "Luxury Sprinter",
};

export type AlertKind = "new" | "remind_12h" | "remind_2h";

/** The ride as claim_booking_alerts returns it: the whole row, loosely. */
export type RideRow = Record<string, unknown>;

export interface ClaimedAlert {
  id: string;
  kind: AlertKind;
  attempts: number;
  pickup_at: string | null;
  ride: RideRow;
}

export interface Email {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

// ── reading the row ─────────────────────────────────────────────────────

function str(r: RideRow, key: string): string {
  const v = r[key];
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

function num(r: RideRow, key: string): number | null {
  const v = r[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** "CB-7KM4Q". Rows without one get the same fallback the site derives. */
export function bookingRef(r: RideRow): string {
  const ref = str(r, "booking_ref");
  if (ref) return ref;
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const id = str(r, "id");
  const clean = id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  let code = "";
  for (let i = 0; i < clean.length && code.length < 5; i++) if (alphabet.includes(clean[i])) code += clean[i];
  while (code.length < 5) code += alphabet[(id.length * 7 + code.length) % alphabet.length];
  return `CB-${code}`;
}

function vehicleName(r: RideRow): string {
  const id = (str(r, "vehicle_class") || str(r, "vehicle_type")).toLowerCase();
  if (!id) return "";
  return VEHICLE_NAMES[id] ?? id.charAt(0).toUpperCase() + id.slice(1);
}

/** "Sat 3 Oct" and "2:00 PM", on the island's clock whatever the server's. */
export function arubaWhen(iso: string | null): { day: string; time: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })
    .format(d).replace(",", "");
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return { day, time };
}

/** "1 h 50 min", "45 min". Rounded to the minute: this is read on a phone, not audited. */
export function countdown(fromMs: number, toIso: string | null): string | null {
  if (!toIso) return null;
  const mins = Math.round((Date.parse(toIso) - fromMs) / 60_000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

// ── writing the email ───────────────────────────────────────────────────

/** Every value in the email came from a booking form a stranger filled in. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function digits(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

/**
 * wa.me needs the number with its country code and nothing else. A phone
 * typed without one ("555 1234") cannot be turned into a working link, so
 * it gets none rather than a link that opens the wrong person's chat.
 */
function whatsappFor(phone: string): string | null {
  const d = digits(phone);
  if (d.startsWith("+")) return `https://wa.me/${d.slice(1)}`;
  if (d.startsWith("00")) return `https://wa.me/${d.slice(2)}`;
  return null;
}

const HEAD: Record<AlertKind, { tag: string; tone: string }> = {
  new: { tag: "New booking", tone: "#0B3B5C" },
  remind_12h: { tag: "Still no driver", tone: "#8A5A00" },
  remind_2h: { tag: "URGENT: no driver", tone: "#A1261B" },
};

export function buildAlertEmail(
  alert: ClaimedAlert,
  opts: { now: number; to?: string; siteUrl?: string },
): Email {
  const r = alert.ride;
  const ref = bookingRef(r);
  const when = arubaWhen(alert.pickup_at);
  const left = countdown(opts.now, alert.pickup_at);
  const needsDriver = !str(r, "driver_id");
  const whenLine = when ? `${when.day}, ${when.time}` : "No pickup time on the booking";
  const from = str(r, "pickup_location") || "Pickup not given";
  const to = str(r, "dropoff_location") || "Drop-off not given";
  const site = (opts.siteUrl || SITE_URL_DEFAULT).replace(/\/+$/, "");
  const adminUrl = `${site}/admin/rides/${encodeURIComponent(str(r, "id"))}`;

  // The subject is what shows on a locked phone, so it carries the
  // decision: is anybody driving, and how long is left.
  const subject =
    alert.kind === "new"
      ? `New booking ${needsDriver ? "— no driver yet " : ""}· ${whenLine} · ${ref}`
      : alert.kind === "remind_12h"
        ? `Still no driver — pickup ${left ? `in ${left}` : whenLine} · ${ref}`
        : `URGENT: no driver — pickup ${left ? `in ${left}` : whenLine} · ${ref}`;

  const lead =
    alert.kind === "new"
      ? needsDriver
        ? "A booking just came in and nobody is driving it yet."
        : `A booking just came in. ${str(r, "driver_name") || "A driver"} is already on it.`
      : alert.kind === "remind_12h"
        ? `This ride is still not covered${left ? ` and the pickup is in ${left}` : ""}. Assign a driver or call the guest.`
        : `Nobody is driving this ride${left ? ` and the guest is picked up in ${left}` : ""}. Assign a driver now or call the guest.`;

  const name = str(r, "contact_name");
  const phone = str(r, "contact_phone");
  const email = str(r, "contact_email");
  const pax = num(r, "passengers_count");
  const bags = num(r, "luggage_count");
  const seats = num(r, "child_seats");
  const fare = num(r, "fare_total") ?? num(r, "price");
  const flight = str(r, "flight_number");
  const notes = str(r, "notes");
  const retDate = str(r, "return_date");
  const retTime = str(r, "return_time");
  const wa = phone ? whatsappFor(phone) : null;

  // [label, plain text, html] — html is escaped here, once, so a row can
  // add a link without every other row having to remember to escape.
  const rows: [string, string, string][] = [];
  const add = (label: string, text: string, html = esc(text)) => { if (text) rows.push([label, text, html]); };
  add("Pickup", whenLine);
  add("From", from);
  add("To", to);
  add("Vehicle", vehicleName(r));
  add("Passengers", pax !== null ? String(pax) : "");
  add("Bags", bags !== null && bags > 0 ? String(bags) : "");
  add("Child seats", seats !== null && seats > 0 ? String(seats) : "");
  add("Flight", flight);
  add("Return trip", retDate ? `${retDate}${retTime ? `, ${retTime}` : ""}` : "");
  add("Guest", name || "No name given");
  add("Phone", phone,
    phone
      ? `<a href="tel:${esc(digits(phone))}" style="color:#0B3B5C">${esc(phone)}</a>` +
        (wa ? ` &nbsp;·&nbsp; <a href="${esc(wa)}" style="color:#0B3B5C">WhatsApp</a>` : "")
      : "");
  add("Email", email, email ? `<a href="mailto:${esc(email)}" style="color:#0B3B5C">${esc(email)}</a>` : "");
  add("Notes", notes);
  add("Fare", fare !== null ? `US$${Math.round(fare)}` : "");
  add("Driver", needsDriver ? "Nobody yet" : str(r, "driver_name") || "Assigned");

  const head = HEAD[alert.kind];
  const text = [
    `${head.tag} · ${ref}`,
    "",
    lead,
    "",
    ...rows.map(([l, t]) => `${l}: ${t}`),
    "",
    `Open it in the admin board: ${adminUrl}`,
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#EEF1F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A2330;">
<tr><td style="background:#020B14;padding:18px 24px;color:#FFFFFF;font-size:13px;letter-spacing:.18em;text-transform:uppercase;">Cabby&#39;s</td></tr>
<tr><td style="padding:24px 24px 8px;">
<div style="display:inline-block;background:${head.tone};color:#FFFFFF;font-size:13px;font-weight:600;padding:5px 10px;border-radius:4px;">${esc(head.tag)}</div>
<h1 style="margin:14px 0 6px;font-size:22px;line-height:1.3;font-weight:600;">${esc(whenLine)}</h1>
<p style="margin:0 0 4px;font-size:15px;color:#4A5563;">${esc(ref)}</p>
<p style="margin:14px 0 0;font-size:16px;line-height:1.5;">${esc(lead)}</p>
</td></tr>
<tr><td style="padding:12px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.45;">
${rows.map(([l, , h]) => `<tr><td style="padding:7px 12px 7px 0;color:#5B6675;white-space:nowrap;vertical-align:top;width:1%;">${esc(l)}</td><td style="padding:7px 0;vertical-align:top;">${h}</td></tr>`).join("\n")}
</table>
</td></tr>
<tr><td style="padding:12px 24px 28px;">
<a href="${esc(adminUrl)}" style="display:inline-block;background:#020B14;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:6px;">${needsDriver ? "Assign a driver" : "Open the ride"}</a>
</td></tr>
</table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#7A8594;margin:14px 0 0;">Sent by cabbystransfer.com to the Cabby&#39;s team.</p>
</td></tr></table>
</body></html>`;

  return { from: FROM, to: opts.to || ALERT_TO_DEFAULT, subject, html, text };
}

// ── the run ─────────────────────────────────────────────────────────────

export type RpcResult = { ok: true; data: unknown } | { ok: false; error: string };
export type SendResult = { ok: true; id: string } | { ok: false; error: string };

export interface Deps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<RpcResult>;
  send: (email: Email) => Promise<SendResult>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  to?: string;
  siteUrl?: string;
}

export interface RunResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Claim what is due, send each, record each.
 *
 * A failed claim is reported as a failure with its reason — never as
 * "nothing due", which is the answer that would let a broken setup look
 * like a quiet day for weeks.
 */
export async function runAlerts(secret: string, deps: Deps): Promise<RunResult> {
  const claim = await deps.rpc("claim_booking_alerts", { p_secret: secret, p_limit: PER_RUN });
  if (!claim.ok) return { status: 502, body: { ok: false, error: claim.error } };

  const data = (claim.data ?? {}) as { ok?: boolean; error?: string; alerts?: ClaimedAlert[] };
  if (data.ok !== true) {
    const why = typeof data.error === "string" ? data.error : "unreadable answer from claim_booking_alerts";
    return { status: why === "bad_secret" ? 401 : 503, body: { ok: false, error: why } };
  }

  const alerts = Array.isArray(data.alerts) ? data.alerts : [];
  let sent = 0;
  const failed: string[] = [];
  for (let i = 0; i < alerts.length; i++) {
    if (i > 0) await deps.sleep(SEND_GAP_MS);
    const a = alerts[i];
    let result: SendResult;
    try {
      result = await deps.send(buildAlertEmail(a, { now: deps.now(), to: deps.to, siteUrl: deps.siteUrl }));
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    // Recorded either way. A failure left 'sending' would wait ten
    // minutes to be retried; marked 'failed' it goes on the next run.
    await deps.rpc("finish_booking_alert", {
      p_secret: secret,
      p_alert_id: a.id,
      p_ok: result.ok,
      p_detail: result.ok ? result.id : result.error,
    });
    if (result.ok) sent++;
    else failed.push(`${a.kind} ${bookingRef(a.ride)}: ${result.error}`);
  }

  return { status: 200, body: { ok: true, due: alerts.length, sent, failed } };
}

// ── the wiring ──────────────────────────────────────────────────────────

interface Req {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status: (code: number) => { json: (body: unknown) => void };
}

function env(name: string): string {
  const e = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return (e?.[name] ?? "").trim();
}

function bearer(h: string | string[] | undefined): string {
  const v = Array.isArray(h) ? h[0] : h;
  const m = /^Bearer\s+(.+)$/i.exec(v ?? "");
  return m ? m[1].trim() : "";
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const supabaseUrl = env("SUPABASE_URL") || env("VITE_SUPABASE_URL");
  const publicKey = env("SUPABASE_ANON_KEY") || env("VITE_SUPABASE_ANON_KEY");
  const resendKey = env("RESEND_API_KEY");
  const missing = [
    !supabaseUrl && "VITE_SUPABASE_URL",
    !publicKey && "VITE_SUPABASE_ANON_KEY",
    !resendKey && "RESEND_API_KEY",
  ].filter(Boolean);
  // Names only, never values: this answer lands in net._http_response,
  // which is where somebody debugging it will look.
  if (missing.length) return res.status(501).json({ ok: false, error: `Not configured: ${missing.join(", ")}` });

  const secret = bearer(req.headers.authorization);
  if (!secret) return res.status(401).json({ ok: false, error: "bad_secret" });

  const result = await runAlerts(secret, {
    rpc: async (fn, args) => {
      try {
        const r = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/${fn}`, {
          method: "POST",
          // apikey only, the public role: no user is signed in here, and
          // the secret inside the call is what these RPCs check.
          headers: { apikey: publicKey, "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const body = await r.text();
        if (!r.ok) {
          // 404 here means docs/alerts-schema.sql has not been run.
          return { ok: false, error: `${fn} answered ${r.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true, data: body ? JSON.parse(body) : null };
      } catch (e) {
        return { ok: false, error: `${fn} unreachable: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
    send: async (email) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(email),
      });
      const body = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
      if (r.ok && typeof body.id === "string") return { ok: true, id: body.id };
      return { ok: false, error: `Resend ${r.status}: ${body.message ?? body.name ?? "no detail"}` };
    },
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    now: () => Date.now(),
    to: env("ALERT_EMAIL") || undefined,
    siteUrl: env("SITE_URL") || undefined,
  });

  return res.status(result.status).json(result.body);
}
