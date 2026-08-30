// ── Mapbox: the maps ──────────────────────────────────────────────────
// Every map in this app — the GL map in the booking flow, the static
// fallback, the driving route drawn on both — comes from Mapbox and lives
// here or in lib/route.ts.
//
// Address SEARCH does not: it moved to lib/places.ts (Google Places),
// because Mapbox's Aruba address data was too thin to find a real street.
// This file no longer exports GeoSuggestion/geocode/geoStatusLine — see
// places.ts for those. mapDebugOn() is the one thing shared both ways: a
// map that cannot load and a search that cannot answer are the same kind
// of question, so they share the one flag.

/**
 * The token, cleaned up on the way in.
 *
 * A token is pasted through a dashboard field and then baked into the
 * bundle, so whatever came along with it — a trailing newline from the
 * clipboard, the quotes someone added thinking they were needed — is
 * baked in too and goes to Mapbox verbatim. Mapbox answers 401 and the
 * map falls back to the sketch, which looks exactly like having no token
 * at all. Trimming here costs one line and removes the whole class.
 */
export function cleanToken(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}

export const MAPBOX_TOKEN = cleanToken(import.meta.env.VITE_MAPBOX_TOKEN);
export const mapboxEnabled = MAPBOX_TOKEN.length > 0;

/**
 * Public tokens start `pk.`. A secret token (`sk.`) must never reach a
 * browser, and anything else is a value pasted into the wrong field — a
 * style URL, a username, the token's *name*. All three fail identically at
 * the map, so say so at load rather than leaving it to a 401.
 */
if (mapboxEnabled && !MAPBOX_TOKEN.startsWith("pk.")) {
  console.warn(
    MAPBOX_TOKEN.startsWith("sk.")
      ? "[map] VITE_MAPBOX_TOKEN is a secret token. Secret tokens are rejected in a browser and must never be shipped in one — use the public pk. token."
      : "[map] VITE_MAPBOX_TOKEN does not look like a Mapbox token. Public tokens start with 'pk.' — check the value is the token itself and not its name or a style URL.",
  );
}

/**
 * Every map in this app fails soft: no token, a rejected token or a dead
 * network all end at the same drawn sketch, on purpose, because a broken
 * rectangle is worse than an honest drawing. The cost is that the three
 * causes look identical from the outside — including to whoever has to fix
 * it. This says which one happened, in the console only.
 *
 * Once per reason: a map that cannot load its style says so repeatedly, and
 * a console with forty identical lines is not a diagnosis.
 */
const said = new Set<string>();

/**
 * The same reason, but on the page.
 *
 * The console is the right place for this until the console is not
 * available: a phone has no dev tools, and on a desktop the site's own
 * warning can sit under a hundred lines from a wallet extension. Adding
 * ?mapdebug=1 to the URL puts the reason in the map's own caption, where
 * whoever is fixing it is already looking.
 *
 * A query flag rather than a build flag, so a live site can be asked the
 * question without a redeploy — and so its absence also answers a
 * question: if the flag does nothing, the build predates this code.
 */
export function mapDebugOn(): boolean {
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).has("mapdebug");
}

/**
 * A running account of what the map did.
 *
 * "It renders and then disappears" is a sequence, and a single reason
 * string cannot describe a sequence. This keeps the ordered list — created,
 * loaded, errored, torn down — so the page can show what happened rather
 * than only what went wrong last.
 */
const trace: string[] = [];
const traceListeners = new Set<() => void>();

export function traceMap(event: string): void {
  const at = typeof performance !== "undefined" ? Math.round(performance.now()) : 0;
  trace.push(`${String(at).padStart(5)}ms ${event}`);
  // long enough for a whole life cycle, short enough to read on a phone
  if (trace.length > 14) trace.shift();
  traceListeners.forEach((fn) => fn());
}

export function mapTrace(): string[] {
  return trace;
}

export function onMapTrace(fn: () => void): () => void {
  traceListeners.add(fn);
  return () => { traceListeners.delete(fn); };
}

/** What the bundle knows about itself, for the debug panel. */
export function buildLine(): string {
  const id = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "unknown";
  const tok = mapboxEnabled
    ? `${MAPBOX_TOKEN.slice(0, 11)}… (${MAPBOX_TOKEN.length} chars)`
    : "NONE";
  return `build ${id} · token ${tok}`;
}

type Listener = (reason: string) => void;
const listeners = new Set<Listener>();
let latest = "";

/** The last reason a map gave up, for anything rendering a fallback. */
export function lastMapFailure(): string {
  if (latest) return latest;
  return mapboxEnabled ? "" : NO_TOKEN;
}

export function onMapFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const NO_TOKEN =
  "VITE_MAPBOX_TOKEN is not in this build. Vite inlines it at build time, so setting it in the host's environment does nothing until the site is rebuilt.";

export function reportMapboxFailure(where: string, status?: number, detail?: unknown): void {
  const key = `${where}:${status ?? "?"}`;
  if (said.has(key)) return;
  said.add(key);

  const why =
    !mapboxEnabled
      ? NO_TOKEN
      : status === 401
      ? "Mapbox rejected the token (401). It is either wrong, or it was deleted after this build was made — the token is baked into the bundle, so a rotated token needs a redeploy."
      : status === 403
      ? "Mapbox refused the request (403). Usually the token's URL restrictions do not list the domain this page is served from."
      : status === 429
      ? "Mapbox rate-limited the request (429)."
      : "Mapbox could not be reached.";

  console.warn(`[map] ${where} fell back to the sketch. ${why}`, detail ?? "");

  // the first reason is the useful one — later ones are usually knock-ons
  if (!latest) {
    latest = `${where}: ${why}`;
    listeners.forEach((fn) => fn(latest));
  }
}

