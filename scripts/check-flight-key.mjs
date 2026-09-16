#!/usr/bin/env node
// ── Does this key work, and what does it get me? ─────────────────────
//
// Answers the only question worth answering before any code is written
// against a vendor: is this key live, is it on a plan that can see AUA
// arrivals, and how much of it is left.
//
// THE KEY NEVER LEAVES YOUR MACHINE. It is read from the environment,
// sent to its own vendor and to nobody else, and never printed — not in
// full, not in part, not in an error. Run it like this, replacing only
// the line that matches the key you actually hold:
//
//   AERODATABOX_KEY=xxxx  node scripts/check-flight-key.mjs   # RapidAPI
//   AEROAPI_KEY=xxxx      node scripts/check-flight-key.mjs   # FlightAware
//   OPENSKY_CLIENT_ID=xxx OPENSKY_CLIENT_SECRET=xxx node scripts/check-flight-key.mjs
//
// Costs one call. On a 600-unit month that is a rounding error, and it
// is the cheapest way to find out that a key is on the wrong plan.
//
// Queen Beatrix International is AUA to a passenger and TNCA to a
// controller. Vendors disagree about which one they want, so each probe
// below uses the one its own vendor documents.

const AUA_IATA = "AUA";
const AUA_ICAO = "TNCA";

const pad = (n) => String(n).padStart(2, "0");
/** AeroDataBox wants a local naive window, max 12 hours wide. */
function windowLocal(hours = 8) {
  const now = new Date();
  const end = new Date(now.getTime() + hours * 3600_000);
  const f = (d) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return [f(now), f(end)];
}

/** Anything the vendor said about what is left. Never the key. */
function quotaLines(headers) {
  const out = [];
  for (const [k, v] of headers.entries()) {
    if (/ratelimit|rate-limit|quota|remaining|usage/i.test(k)) out.push(`    ${k}: ${v}`);
  }
  return out;
}

function verdict(ok, headline, detail) {
  console.log(`\n  ${ok ? "WORKS" : "NO"} — ${headline}`);
  if (detail) console.log(`\n${detail}`);
  console.log("");
  process.exit(ok ? 0 : 1);
}

async function aerodatabox(key) {
  const [from, to] = windowLocal(8);
  const url = `https://aerodatabox.p.rapidapi.com/flights/airports/iata/${AUA_IATA}/${from}/${to}`
    + `?direction=Arrival&withLeg=false&withCancelled=true&withCodeshared=true&withLocation=false`;
  console.log("  Asking AeroDataBox (via RapidAPI) for AUA arrivals, next 8 hours…");

  const res = await fetch(url, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": "aerodatabox.p.rapidapi.com" },
  });
  const quota = quotaLines(res.headers);
  const body = await res.text();

  if (res.status === 401 || res.status === 403) {
    return verdict(false,
      `the key was rejected (HTTP ${res.status}).`,
      "  Most often this is a live RapidAPI key that is not SUBSCRIBED to\n"
      + "  AeroDataBox. One RapidAPI account has one key, but each API has to\n"
      + "  be subscribed to separately — open the AeroDataBox listing and pick\n"
      + "  a plan, including the free one.");
  }
  if (res.status === 429) {
    return verdict(false, "the key is real but the quota for this period is spent.",
      quota.join("\n"));
  }
  if (!res.ok) {
    return verdict(false, `HTTP ${res.status}.`, `  ${body.slice(0, 300)}`);
  }

  let rows = [];
  try {
    const data = JSON.parse(body);
    rows = data.arrivals ?? data.departures ?? [];
  } catch { /* fall through to the raw body below */ }

  const sample = rows.slice(0, 5).map((r) => {
    const t = r.movement?.revisedTime?.local ?? r.movement?.scheduledTime?.local ?? "?";
    return `    ${(r.number ?? "?").padEnd(9)} ${t}  ${r.status ?? ""}`;
  });

  return verdict(true,
    `${rows.length} arrival${rows.length === 1 ? "" : "s"} into AUA in the next 8 hours.`,
    [
      rows.length ? "  What it can see:" : "  Nothing arriving in that window — which is a real answer, not a fault.",
      ...sample,
      quota.length ? "\n  What's left on the plan:" : "",
      ...quota,
    ].filter(Boolean).join("\n"));
}

async function aeroapi(key) {
  const url = `https://aeroapi.flightaware.com/aeroapi/airports/${AUA_ICAO}/flights/arrivals?max_pages=1`;
  console.log("  Asking FlightAware AeroAPI for TNCA arrivals…");

  const res = await fetch(url, { headers: { "x-apikey": key } });
  const quota = quotaLines(res.headers);
  const body = await res.text();

  if (res.status === 401) return verdict(false, "the key was rejected (HTTP 401).");
  if (res.status === 402) {
    return verdict(false, "the key is real but this month's credit is spent (HTTP 402).",
      "  Feeding ADS-B to FlightAware raises the free monthly credit from $5 to $20.");
  }
  if (!res.ok) return verdict(false, `HTTP ${res.status}.`, `  ${body.slice(0, 300)}`);

  let rows = [];
  try { rows = JSON.parse(body).arrivals ?? []; } catch { /* below */ }

  return verdict(true,
    `${rows.length} recent arrival${rows.length === 1 ? "" : "s"} at TNCA.`,
    [
      ...rows.slice(0, 5).map((r) =>
        `    ${(r.ident_iata ?? r.ident ?? "?").padEnd(9)} ${r.actual_on ?? r.estimated_on ?? r.scheduled_on ?? "?"}`),
      quota.length ? "\n  What's left on the plan:" : "",
      ...quota,
    ].filter(Boolean).join("\n"));
}

async function opensky(id, secret) {
  console.log("  Getting an OpenSky token…");
  const tok = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: id, client_secret: secret }),
  });
  if (!tok.ok) return verdict(false, `the OpenSky credentials were rejected (HTTP ${tok.status}).`);
  const { access_token } = await tok.json();

  const end = Math.floor(Date.now() / 1000);
  const url = `https://opensky-network.org/api/flights/arrival?airport=${AUA_ICAO}&begin=${end - 86400}&end=${end}`;
  console.log("  Asking for TNCA arrivals over the last 24 hours…");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });

  if (res.status === 404) {
    return verdict(false, "OpenSky has no arrival records for TNCA in the last 24 hours.",
      "  That is coverage, not a bad key: OpenSky sees what volunteer\n"
      + "  receivers hear, and an island approach over water is exactly where\n"
      + "  that thins out. It also has no SCHEDULES at all, so it cannot answer\n"
      + "  'when is KL767 due on the 20th' however many credits you have.");
  }
  if (!res.ok) return verdict(false, `HTTP ${res.status}.`);

  const rows = await res.json();
  return verdict(true,
    `${rows.length} arrival${rows.length === 1 ? "" : "s"} seen at TNCA in the last 24 hours.`,
    "  Note this is what ALREADY LANDED, not what is due. OpenSky has no\n"
    + "  schedule data, and its licence excludes commercial use without\n"
    + "  consent — both are true no matter how many credits feeding earns.");
}

const env = process.env;
console.log("\n  Cabby's — flight data key check");
console.log("  (the key is read from the environment and never printed)\n");

try {
  if (env.AERODATABOX_KEY) await aerodatabox(env.AERODATABOX_KEY);
  else if (env.AEROAPI_KEY) await aeroapi(env.AEROAPI_KEY);
  else if (env.OPENSKY_CLIENT_ID && env.OPENSKY_CLIENT_SECRET) {
    await opensky(env.OPENSKY_CLIENT_ID, env.OPENSKY_CLIENT_SECRET);
  } else {
    console.log("  No key found in the environment. Set whichever one you hold:\n");
    console.log("    AERODATABOX_KEY=…   your RapidAPI key");
    console.log("    AEROAPI_KEY=…       your FlightAware AeroAPI key");
    console.log("    OPENSKY_CLIENT_ID=… OPENSKY_CLIENT_SECRET=…\n");
    process.exit(2);
  }
} catch (e) {
  verdict(false, "the request didn't complete.", `  ${e instanceof Error ? e.message : String(e)}`);
}
