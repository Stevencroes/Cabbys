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

/**
 * The key this function uses for both doors: proving who called it, and
 * reaching the database.
 *
 * CABBYS_SERVICE_KEY is one this project sets by hand — an sb_secret_…
 * key from Project Settings → API Keys. It is preferred over Supabase's
 * managed SUPABASE_SERVICE_ROLE_KEY for one reason: the managed one held
 * something nobody could read, and the whole afternoon that cost went
 * into finding out that a header did not equal a value neither side
 * could see. A key set here is one both ends can be checked against.
 *
 * It also cuts the last tie to the legacy JWT keys, which are being
 * switched off — a legacy key in SUPABASE_SERVICE_ROLE_KEY would take
 * this function's database access down with them, silently.
 *
 * The fallback keeps today working until the secret is added.
 */
const SERVICE = Deno.env.get("CABBYS_SERVICE_KEY")
  ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  ?? "";
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
/**
 * Is this the scheduler?
 *
 * One door now: the header must equal CABBYS_SERVICE_KEY exactly.
 *
 * There used to be a second, which accepted any token CLAIMING the
 * service_role. That was only ever sound because Supabase verified the
 * signature first — and switching off "Verify JWT with legacy secret",
 * which this migration does, is exactly what removes that. Left in, an
 * unsigned token claiming service_role would walk straight in and spend
 * the month's units. It is gone rather than guarded, because a door that
 * is safe only while a setting elsewhere stays a particular way is a
 * door nobody will remember to re-check.
 *
 * Equality is workable here in a way it was not before: the secret is
 * one this project set by hand, so both ends can be compared against
 * something a person can actually read.
 */
function authorised(req: Request): { ok: boolean; via: string } {
  // apikey first, because that is where the platform insists an sb_ key
  // goes. Put one in Authorization and the gateway rejects the request
  // with "Conflicting API keys" before this function is reached at all —
  // so the header that works is not the one the legacy keys used.
  // Authorization is still read, so a legacy JWT and anything already
  // pointed at this function keep working while the migration finishes.
  const sent = (
    req.headers.get("apikey") ||
    (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
  ).trim();
  if (!sent) return { ok: false, via: "no apikey or Authorization header" };
  if (SERVICE && sent === SERVICE) return { ok: true, via: "service key" };
  return { ok: false, via: sent.startsWith("eyJ") ? `legacy JWT (${claimedRole(sent)})` : "not the service key" };
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
  if (!gate.ok) {
    // One refusal, reporting what actually arrived. The previous version
    // had two branches and picked the wrong one: an apikey header that
    // did not match was reported as "no Authorization header", which is
    // a true failure described as a different failure — and sends the
    // next half hour in the wrong direction. Shapes and lengths only,
    // never a character of either key, which is enough to separate every
    // case that has actually come up: nothing sent, sent in the header
    // the gateway strips, a legacy key after the migration, a truncated
    // paste, and the secret not being set at all.
    const seen = {
      apikey: req.headers.get("apikey") ? "present" : "absent",
      authorization: req.headers.get("Authorization") ? "present" : "absent",
    };
    const sent = (
      req.headers.get("apikey") ||
      (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "")
    ).trim();
    return Response.json({
      error: "Not the scheduler",
      why: gate.via,
      headers_seen: seen,
      // "sb_secret_" vs "eyJ" vs nothing. A prefix that long identifies a
      // FORMAT and not a key; every sb_ key in the world shares it.
      you_sent: sent ? `${sent.slice(0, 10)}… (${sent.length} chars)` : "nothing",
      expected: SERVICE ? `${SERVICE.slice(0, 10)}… (${SERVICE.length} chars)` : "CABBYS_SERVICE_KEY IS NOT SET",
      fix: !SERVICE
        ? "Add CABBYS_SERVICE_KEY under Edge Functions → Secrets, set to your sb_secret_… key."
        : seen.apikey === "absent"
        ? "Send the key in an 'apikey' header — plain, no 'Bearer'. An sb_ key in Authorization is rejected by the gateway before this function runs."
        : "The apikey arrived but does not match CABBYS_SERVICE_KEY. Compare the two above: same length and prefix means a stray space; different length means a truncated paste; different prefix means a different key.",
    }, { status: 401 });
  }

  const db = createClient(URL_, SERVICE);

  // A dry run: proves the whole chain without spending a unit. Meant for
  // the person wiring this up, who otherwise cannot tell a missing
  // secret from an unrun migration from a cron that never fired.
  let body: { check?: boolean; flight?: string; day?: string } = {};
  try { body = await req.json(); } catch { /* an empty body is the ordinary call */ }

  if (body.check === true) {
    const due = await db.rpc("flights_due", { p_limit: 1 });
    const meter = await db.from("flight_budget").select("month, used, cap");
    return Response.json({
      auth: `ok — via ${gate.via}`,
      // whether it is set, never what it is
      aerodatabox_key: KEY ? `set (${KEY.length} chars)` : "MISSING — add it under Edge Functions → Secrets",
      // The SHAPE of the service key, never a character of it. This
      // decides whether disabling the legacy API keys takes the
      // function's database access down with them: a legacy JWT here
      // stops working the moment they are disabled, a new secret key
      // does not. Worth knowing BEFORE pressing that button rather than
      // from the silence afterwards.
      service_key: !SERVICE
        ? "MISSING"
        : Deno.env.get("CABBYS_SERVICE_KEY")
        ? "CABBYS_SERVICE_KEY — set by hand, independent of the legacy keys"
        : SERVICE.startsWith("eyJ")
        ? "falling back to the managed legacy JWT — WILL BREAK when legacy keys are disabled"
        : "falling back to the managed key (not a legacy JWT)",
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

  // One named flight, on demand. SPENDS A UNIT — it is a real call.
  //
  // Here because the alternative was worse: flights_due() only answers
  // about flights somebody is actually being collected from, so proving
  // this chain end to end otherwise means inventing a booking in the
  // rides table, which puts a fake job on the board and in the pool and
  // then has to be found and deleted again. This asks the same question
  // of the same vendor and writes to the same table, without lying to
  // the rest of the business to do it.
  if (typeof body.flight === "string" && typeof body.day === "string") {
    const flight = body.flight.trim().toUpperCase();
    const { data: allowed } = await db.rpc("flight_budget_take");
    if (allowed !== true) {
      return Response.json({ error: "monthly cap reached", asked: 0 }, { status: 429 });
    }
    const { raw, ok } = await ask(flight, body.day);
    const wrote = await db.from("flight_status").upsert({
      flight, day: body.day, raw, ok, checked_at: new Date().toISOString(),
    });
    return Response.json({
      asked: 1,
      flight,
      day: body.day,
      vendor: ok ? (raw ? "answered" : "no such flight that day") : "refused the request",
      // the rotation's leg count — three for KL765, which is the shape
      // that caught us out in the first place
      legs: Array.isArray(raw) ? raw.length : 0,
      stored: wrote.error ? `FAILED — ${wrote.error.message}` : "written to flight_status",
      spent_this_call: 1,
    });
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
