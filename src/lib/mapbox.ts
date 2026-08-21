// ── Mapbox address autocomplete ──────────────────────────────────────
// Live geocoding against the Mapbox Geocoding API, constrained to Aruba.
// When VITE_MAPBOX_TOKEN is unset it degrades gracefully to the curated
// place list (callers merge `geocode()` results with PLACES).

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

export interface GeoSuggestion {
  id: string;
  name: string;
  meta?: string;
}

// Aruba bounding box + centre (Oranjestad) to bias results to the island.
export const ARUBA_BBOX = "-70.10,12.40,-69.85,12.65";
const ARUBA_PROXIMITY = "-70.0086,12.5092";

interface MapboxFeature {
  id: string;
  text?: string;
  place_name?: string;
  place_type?: string[];
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeoSuggestion[]> {
  const q = query.trim();
  if (!mapboxEnabled || !q) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&country=aw&bbox=${ARUBA_BBOX}&proximity=${ARUBA_PROXIMITY}` +
    `&types=poi,address,place,locality,neighborhood&limit=5&autocomplete=true`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: MapboxFeature[] };
    return (data.features ?? []).map((f) => {
      const name = f.text ?? f.place_name ?? "";
      // strip the leading name from the full place string to use the rest as context
      const meta = f.place_name && f.text && f.place_name.startsWith(f.text)
        ? f.place_name.slice(f.text.length).replace(/^,\s*/, "").replace(/,?\s*Aruba$/i, "")
        : undefined;
      return { id: `mb-${f.id}`, name, meta: meta || undefined };
    }).filter((s) => s.name);
  } catch {
    return [];
  }
}
