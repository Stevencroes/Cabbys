// ── The only thing in this project that calls AeroDataBox ─────────────
//
// Runs on a schedule, holds the key, asks about the flights Cabby's is
// actually meeting, and writes the answers into public.flight_status
// where every screen reads them for free.
//
// Deliberately thin. It does not parse the vendor's response — it stores
// it verbatim and lets src/lib/providers/aerodatabox.ts read it, because
// that parser is tested against a real answer and has three traps baked
// into it that nobody guessed. Storing raw means fixing the parser fixes
// rows already on disk, instead of costing units to re-fetch.
//
// It also makes no decisions about WHICH flights to ask about. That is
// flights_due() in docs/flight-schema.sql, where the cadence is readable
// and the budget is enforceable in one place.
//
// Deploy:
//   supabase functions deploy flight-refresh
//   supabase secrets set AERODATABOX_KEY=...
// Then schedule it — the cron is at the bottom of docs/flight-schema.sql.
//
// THE KEY LIVES HERE AND NOWHERE ELSE. Not in a VITE_ variable: those
// are compiled into the bundle every visitor downloads.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("AERODATABOX_KEY") ?? "";

/** At most this many units in one run, whatever the database offers. A
    second belt beside flights_due's own limit: a bug in one of them
    should not be able to spend a month in a single tick. */
const MAX_PER_RUN = 6;

interface Due { flight: string; day: string }

/**
 * The role a presented token CLAIMS, read without verifying it.
 *
 * Diagnosis only — it never grants anything, because a claim nobody
 * checked the signature on is not evidence. What it is for: the anon key
 * and the service role key are both JWTs beginning "eyJ", they sit two
 * rows apart on the same settings page, and telling them apart by eye is
 * not realistic. Every one of those tokens is already in the hand of
 * whoever sent it, so reading its own claim back to them reveals nothing
 * they did not just type.
 */
function claimedRole(token: string): string {
  try {
    const part = token.split(".")[1];
    if (!part) return "not a JWT";
    const pad = part.replace(/-/g, "+").replace(/_/g, "/");
    const body = JSON.parse(atob(pad.padEnd(Math.ceil(pad.length / 4) * 4, "=")));
    return typeof body.role === "string" ? body.role : "no role claim";
  } catch {
    return "unreadable";
  }
}

async function ask(flight: string, day: string): Promise<{ raw: unknown; ok: boolean }> {
  const url = `https://aerodatabox.p.rapidapi.com/flights/Number/${encodeURIComponent(flight)}/${day}`
    + "?withAircraftImage=false&withLocation=false";
  const res = await fetch(url, {
    headers: { "x-rapidapi-key": KEY, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" },
  });

  // 404 is an answer: no such flight that day, usually a mistyped
  // number. Stored as a known-nothing so we stop asking about it on the
  // cadence — the row's own checked_at is what holds the silence.
  if (res.status === 404) return { raw: null, ok: true };
  if (!res.ok) return { raw: null, ok: false };
  return { raw: await res.json(), ok: true };
}

/**
 * Is this the scheduler?
 *
 * Two ways in, because one of them turned out not to be reliable enough
 * to be the only one.
 *
 * EXACT MATCH against the service key this function was handed. Simple,
 * and independent of any platform setting — but it is equality against a
 * value nobody can see from either side, so when it fails it fails
 * silently and unprovably. A key rotated after these secrets were set
 * breaks it with no signal at all.
 *
 * THE ROLE CLAIM, which is the same question asked of the token itself.
 * This is only sound because Supabase verifies the JWT's signature
 * BEFORE invoking the function — the "Verify JWT" setting, on by
 * default. With that on, the claim is this project's own word about the
 * token and not the caller's. WITH IT OFF, THIS PATH IS FORGEABLE: any
 * stranger could hand over an unsigned token claiming service_role and
 * start spending the month's units. It must stay on.
 *
 * The anon key fails both, which is the point: it is public, it ships in
 * the browser bundle, and it must never be able to spend anything.
 */
function authorised(req: Request): { ok: boolean; via: string } {
  const sent = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!sent) return { ok: false, via: "no header" };
  if (SERVICE && sent === SERVICE) return { ok: true, via: "service key" };
  if (claimedRole(sent) === "service_role") return { ok: true, via: "verified role claim" };
  return { ok: false, via: claimedRole(sent) };
}

Deno.serve(async (req) => {
  // Only the scheduler. Anything else is turned away before it can spend
  // a unit of somebody's quota.
  //
  // The refusal names what was actually wrong. It used to answer "no" to
  // everything, which is the fault this project keeps finding in itself:
  // a true error reported as the wrong one, sending the diagnosis
  // somewhere it cannot end. Nothing here reveals a key — only what the
  // token the caller just sent says about itself.
  const gate = authorised(req);
  const auth = req.headers.get("Authorization") ?? "";
  if (gate.ok) { /* fall through */ }
  else if (!auth) {
    return Response.json({
      error: "no Authorization header",
      fix: "Send 'Authorization: Bearer <service role key>'. In the dashboard's Test panel, add it under Headers.",
    }, { status: 401 });
  }
  else {
    const sent = auth.replace(/^Bearer\s+/i, "");
    const role = claimedRole(sent);
    return Response.json({
      error: "That token is not allowed to spend anything",
      you_sent: role,
      expected: "service_role",
      fix:
        role === "anon"
          ? "That is the ANON key — the public one, and it must never be able to spend units. You want the row below it on Project Settings → API, labelled service_role / secret, hidden behind Reveal."
          : role === "not a JWT"
          ? "That is not a JWT. A short sb_secret_… key is the likely culprit; this needs the long eyJ… one from the same page."
          : role === "unreadable"
          ? "The token could not be read at all — check for a truncated paste, or a stray quote around the value."
          : `The token claims the role "${role}", which cannot spend units. Only service_role can.`,
      // Lengths, never values. Catches a truncated paste, which matches
      // nothing and looks exactly like the wrong key.
      lengths: { you_sent: sent.length, expected: SERVICE.length },
    }, { status: 401 });
  }

  const db = createClient(URL_, SERVICE);

  // A dry run: proves the whole chain without spending a unit. Meant for
  // the person wiring this up, who otherwise cannot tell a missing
  // secret from an unrun migration from a cron that never fired.
  let body: { check?: boolean } = {};
  try { body = await req.json(); } catch { /* an empty body is the ordinary call */ }

  if (body.check === true) {
    const due = await db.rpc("flights_due", { p_limit: 1 });
    const meter = await db.from("flight_budget").select("month, used, cap");
    return Response.json({
      auth: `ok — via ${gate.via}`,
      // whether it is set, never what it is
      aerodatabox_key: KEY ? `set (${KEY.length} chars)` : "MISSING — add it under Edge Functions → Secrets",
      flights_due: due.error ? `FAILED — ${due.error.message}` : `ok — ${(due.data ?? []).length} due right now`,
      budget: meter.error ? `FAILED — ${meter.error.message}` : (meter.data ?? []),
      spent_this_call: 0,
    });
  }

  if (!KEY) {
    // Not an error. It is the state this project ships in, and every
    // screen is built to look right against it.
    return Response.json({ skipped: "no AERODATABOX_KEY set", asked: 0 });
  }

  const { data: due, error } = await db.rpc("flights_due", { p_limit: MAX_PER_RUN });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (due ?? []) as Due[];
  const log: Record<string, string> = {};
  let asked = 0;

  for (const d of rows.slice(0, MAX_PER_RUN)) {
    // Claimed before the call, not after. A unit spent on a request that
    // then fails is still a unit AeroDataBox counted.
    const { data: allowed } = await db.rpc("flight_budget_take");
    if (allowed !== true) {
      log["_"] = "monthly cap reached — quiet until next month";
      break;
    }

    try {
      const { raw, ok } = await ask(d.flight, d.day);
      await db.from("flight_status").upsert({
        flight: d.flight, day: d.day, raw, ok, checked_at: new Date().toISOString(),
      });
      asked++;
      log[`${d.flight} ${d.day}`] = ok ? (raw ? "answered" : "no such flight") : "vendor refused";
    } catch (e) {
      // The unit is gone either way, so the row is still stamped: not
      // stamping it would have the next run ask again immediately and
      // spend another on the same failure.
      await db.from("flight_status").upsert({
        flight: d.flight, day: d.day, raw: null, ok: false, checked_at: new Date().toISOString(),
      });
      log[`${d.flight} ${d.day}`] = e instanceof Error ? e.message : "failed";
    }
  }

  return Response.json({ due: rows.length, asked, log });
});
