// Vercel Node function — booking emails: alerts to Cabby's, and the
// guest's own confirmation.
//
// Called by the database, never by a browser: once the moment a booking
// is inserted, and every fifteen minutes by pg_cron. docs/alerts-schema.sql
// has the whole design; the short version is that the DATABASE decides
// what is due (claim_booking_alerts) and this only writes and sends it.
//
//   new                 to Cabby's: "New booking" — the moment it is made
//   remind_12h          to Cabby's: "Still no driver" — 12 hours before pickup
//   remind_2h           to Cabby's: "URGENT: no driver" — 2 hours before pickup
//   guest_confirmation  to the guest: their booking, in writing
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
// (vehicle names, the domain, the confirmation window, the cancellation
// hours, the support address) are copied and a test holds them equal.

/** Resend's free plan takes two requests a second. */
const SEND_GAP_MS = 600;
/** Per run. The cron comes back in fifteen minutes for the rest. */
const PER_RUN = 5;

const SITE_URL_DEFAULT = "https://cabbystransfer.com";
const ALERT_TO_DEFAULT = "cabbystransfer@gmail.com";
const FROM = "Cabby's Alerts <alerts@cabbystransfer.com>";
const FROM_GUEST = "Cabby's <bookings@cabbystransfer.com>";

/** src/lib/policy.ts CONFIRM_WINDOW_MINUTES. */
export const CONFIRM_WINDOW_MINUTES = 15;
/** src/lib/policy.ts FREE_CANCEL_HOURS. */
export const FREE_CANCEL_HOURS = 24;
/** src/lib/support.ts SUPPORT_EMAIL — where a guest's reply lands. */
export const SUPPORT_EMAIL = "cabbystransfer@gmail.com";
const TZ = "America/Aruba";

/** src/data/vehicles.ts, by id. src/server/bookingAlerts.test.ts keeps them equal. */
export const VEHICLE_NAMES: Record<string, string> = {
  sedan: "Executive Sedan",
  suv: "Luxury SUV",
  transit: "Premium Van",
  sprinter: "Luxury Sprinter",
};

export type AlertKind = "new" | "remind_12h" | "remind_2h" | "guest_confirmation";

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
  /** Resend's field name. A guest who hits Reply reaches a person. */
  reply_to?: string;
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

const HEAD: Record<Exclude<AlertKind, "guest_confirmation">, { tag: string; tone: string }> = {
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

  const head = HEAD[alert.kind === "guest_confirmation" ? "new" : alert.kind];
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

// ── the guest's copy ────────────────────────────────────────────────────

/**
 * What the fare means for this guest. Mirrors paymentState() in
 * src/lib/tripStatus.ts: an empty payment_status is the normal case while
 * card payment is off, and it means "pay the driver", not "unpaid".
 */
function paymentLine(r: RideRow): string {
  const p = str(r, "payment_status").toLowerCase();
  if (!p) return "Fixed price, paid to your driver on the day.";
  if (p === "paid") return "Paid by card.";
  if (p === "authorized" || p === "authorised") return "Held on your card, not charged yet.";
  if (p === "failed") return "Your card didn't go through. Reply to this email and we'll sort it out.";
  return "";
}

/** The same test the site uses (isAirportTransfer in src/lib/flight.ts). */
function fromAirport(r: RideRow): boolean {
  return str(r, "pickup_location").toLowerCase().includes("airport");
}

/**
 * The guest's written copy of their booking.
 *
 * It promises exactly what the confirmation screen promises and nothing
 * more. The screen used to add "driver details sent 12h before", which
 * nothing in this project does; an email is kept and quoted back, so a
 * promise in it that nobody keeps is worse than on a screen.
 */
export function buildGuestEmail(
  alert: ClaimedAlert,
  opts: { siteUrl?: string; whatsapp?: string },
): Email | null {
  const r = alert.ride;
  const to = str(r, "contact_email");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return null;

  const ref = bookingRef(r);
  const when = arubaWhen(alert.pickup_at);
  const whenLine = when ? `${when.day}, ${when.time} (Aruba time)` : "Time to be confirmed";
  const first = str(r, "contact_name").split(/\s+/)[0] ?? "";
  const from = str(r, "pickup_location");
  const dest = str(r, "dropoff_location");
  const flight = str(r, "flight_number");
  const pax = num(r, "passengers_count");
  const bags = num(r, "luggage_count");
  const seats = num(r, "child_seats");
  const fare = num(r, "fare_total") ?? num(r, "price");
  const retDate = str(r, "return_date");
  const retTime = str(r, "return_time");
  const site = (opts.siteUrl || SITE_URL_DEFAULT).replace(/\/+$/, "");
  const tripsUrl = `${site}/trips`;
  const waNumber = (opts.whatsapp ?? "").replace(/\D/g, "");
  const waUrl = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hi Cabby's — booking ${ref} (${from || "pickup"} → ${dest || "drop-off"}, ${when ? `${when.day}, ${when.time}` : "date to confirm"}).`,
        // encodeURIComponent leaves ( ) ' alone, and a mail app turning
        // the plain-text copy into a link stops at the closing bracket
      ).replace(/[()']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
    : null;

  const rows: [string, string][] = [];
  const add = (label: string, text: string) => { if (text) rows.push([label, text]); };
  add("Booking", ref);
  add("Pickup", whenLine);
  add("From", from);
  add("To", dest);
  add("Car", vehicleName(r));
  add("Passengers", pax !== null ? String(pax) : "");
  add("Bags", bags !== null && bags > 0 ? String(bags) : "");
  add("Child seats", seats !== null && seats > 0 ? String(seats) : "");
  add("Flight", flight ? `${flight}, tracked` : "");
  add("Return trip", retDate ? `${retDate}${retTime ? `, ${retTime}` : ""}` : "");
  add("Total", fare !== null ? `US$${Math.round(fare)}` : "");
  add("Payment", fare !== null ? paymentLine(r) : "");

  // What happens next, in the order it happens. Each line is one the
  // confirmation screen also says.
  const next: string[] = [
    `We'll confirm on WhatsApp within ${CONFIRM_WINDOW_MINUTES} minutes.`,
    ...(flight ? ["We're watching your flight. If it moves, we move with it."] : []),
    ...(fromAirport(r) ? ["Your driver waits inside the arrivals hall with your name."] : []),
    `Free cancellation until ${FREE_CANCEL_HOURS} hours before pickup.`,
  ];

  const subject = `Your Cabby's booking ${ref} · ${when ? `${when.day}, ${when.time}` : "time to be confirmed"}`;
  const hello = first ? `Thanks, ${first}. Your transfer is booked.` : "Thanks. Your transfer is booked.";

  const text = [
    hello,
    "",
    ...rows.map(([l, t]) => `${l}: ${t}`),
    "",
    "What happens next",
    ...next.map((n) => `- ${n}`),
    "",
    `Your trips: ${tripsUrl}`,
    waUrl ? `WhatsApp us: ${waUrl}` : "",
    "Or just reply to this email.",
    "",
    "Cabby's · Private transfers in Aruba · cabbystransfer.com",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

  const link = "color:#0B3B5C;";
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#EEF1F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F4;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A2330;">
<tr><td style="background:#020B14;padding:18px 24px;color:#FFFFFF;font-size:13px;letter-spacing:.18em;text-transform:uppercase;">Cabby&#39;s</td></tr>
<tr><td style="padding:26px 24px 6px;">
<h1 style="margin:0 0 8px;font-size:22px;line-height:1.3;font-weight:600;">${esc(hello)}</h1>
<p style="margin:0;font-size:16px;line-height:1.5;color:#4A5563;">Keep this email for your trip. Everything we have is below.</p>
</td></tr>
<tr><td style="padding:14px 24px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;line-height:1.45;">
${rows.map(([l, t]) => `<tr><td style="padding:7px 12px 7px 0;color:#5B6675;white-space:nowrap;vertical-align:top;width:1%;">${esc(l)}</td><td style="padding:7px 0;vertical-align:top;">${esc(t)}</td></tr>`).join("\n")}
</table>
</td></tr>
<tr><td style="padding:16px 24px 4px;">
<h2 style="margin:0 0 8px;font-size:16px;font-weight:600;">What happens next</h2>
<ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.55;">
${next.map((n) => `<li style="margin:0 0 4px;">${esc(n)}</li>`).join("\n")}
</ul>
</td></tr>
<tr><td style="padding:18px 24px 26px;">
<a href="${esc(tripsUrl)}" style="display:inline-block;background:#020B14;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:13px 22px;border-radius:6px;">See your trip</a>
<p style="margin:16px 0 0;font-size:15px;line-height:1.5;">Questions? ${waUrl ? `<a href="${esc(waUrl)}" style="${link}">WhatsApp us</a> or reply` : "Reply"} to this email and a person will answer.</p>
</td></tr>
</table>
<p style="font-family:Arial,sans-serif;font-size:12px;color:#7A8594;margin:14px 0 0;">Cabby&#39;s · Private transfers in Aruba · <a href="${esc(site)}" style="color:#7A8594;">cabbystransfer.com</a></p>
</td></tr></table>
</body></html>`;

  return { from: FROM_GUEST, to, subject, html, text, reply_to: SUPPORT_EMAIL };
}

/** Which email a claimed alert is. Null when there is nobody to send it to. */
export function buildEmail(
  alert: ClaimedAlert,
  opts: { now: number; to?: string; siteUrl?: string; whatsapp?: string },
): Email | null {
  return alert.kind === "guest_confirmation" ? buildGuestEmail(alert, opts) : buildAlertEmail(alert, opts);
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
  whatsapp?: string;
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
      const email = buildEmail(a, { now: deps.now(), to: deps.to, siteUrl: deps.siteUrl, whatsapp: deps.whatsapp });
      // The database only claims a guest email for an address that looks
      // like one, so this is a belt: recorded as failed with the reason,
      // never sent to nowhere and counted as sent.
      result = email ? await deps.send(email) : { ok: false, error: "no usable address" };
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
    whatsapp: env("VITE_WHATSAPP_NUMBER") || undefined,
  });

  return res.status(result.status).json(result.body);
}
