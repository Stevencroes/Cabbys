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

Deno.serve(async (req) => {
  // Only the scheduler. pg_net sends the service role key; anything else
  // is turned away before it can spend a unit of somebody's quota.
  //
  // The refusal names which of the two problems it is. It used to answer
  // "no" to both, which is the same fault this project keeps finding
  // everywhere else: a true error reported as the wrong one. Neither
  // message reveals anything about the key — only whether a header
  // arrived at all — and the half hour it saves whoever is setting this
  // up is worth more than that.
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth) {
    return Response.json({
      error: "no Authorization header",
      fix: "Send 'Authorization: Bearer <service role key>'. In the dashboard's Test panel, add it under Headers.",
    }, { status: 401 });
  }
  if (auth !== `Bearer ${SERVICE}`) {
    return Response.json({
      error: "Authorization header did not match the service role key",
      fix: "Project Settings → API → service_role. Note this function needs the long JWT-style key; a short sb_secret_… key is rejected by the platform before this code runs, and that 401 looks different from this one.",
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
      auth: "ok",
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
