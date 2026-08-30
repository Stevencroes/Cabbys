// ── Google Maps: the maps ────────────────────────────────────────────
// The interactive map, its static-image fallback, and the driving route
// drawn on both. This used to be Mapbox's job (lib/mapbox.ts, now deleted)
// — moved for the same reason address search moved to lib/places.ts:
// coverage. A visitor who cannot get a real map at all is a harder problem
// than a slow one, and Google's map data for this island is the same data
// the address search already draws on.
//
// One key, three APIs: this reuses GOOGLE_PLACES_KEY from lib/places.ts
// rather than asking for a second one. On the Google Cloud project that
// key belongs to, "Maps JavaScript API", "Maps Static API" and "Routes
// API" all need enabling alongside "Places API (New)" — restricted the
// same way, by HTTP referrer to this site's own domain(s).
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { GOOGLE_PLACES_KEY } from "./places";
import { buildLine as sharedBuildLine } from "./mapDebug";

export const GOOGLE_MAPS_KEY = GOOGLE_PLACES_KEY;
export const googleMapsEnabled = GOOGLE_MAPS_KEY.length > 0;

/** What the bundle knows about itself, for the debug panel. */
export function buildLine(): string {
  const tok = googleMapsEnabled
    ? `${GOOGLE_MAPS_KEY.slice(0, 8)}… (${GOOGLE_MAPS_KEY.length} chars)`
    : "NONE";
  return sharedBuildLine(`Google key ${tok}`);
}

/**
 * Every map in this app fails soft: no key, a rejected key or a dead
 * network all end at the same drawn sketch, on purpose, because a broken
 * rectangle is worse than an honest drawing. The cost is that the causes
 * look identical from the outside — including to whoever has to fix it.
 * This says which one happened, in the console only.
 *
 * Once per reason: a map that cannot load its style says so repeatedly,
 * and a console with forty identical lines is not a diagnosis.
 */
const said = new Set<string>();

type Listener = (reason: string) => void;
const listeners = new Set<Listener>();
let latest = "";

export function lastMapFailure(): string {
  if (latest) return latest;
  return googleMapsEnabled ? "" : NO_KEY;
}

export function onMapFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const NO_KEY =
  "VITE_GOOGLE_PLACES_KEY is not in this build. Vite inlines it at build time, so setting it in the host's environment does nothing until the site is rebuilt.";

export function reportGoogleMapsFailure(where: string, status?: number, detail?: unknown): void {
  const key = `${where}:${status ?? "?"}`;
  if (said.has(key)) return;
  said.add(key);

  const why =
    !googleMapsEnabled
      ? NO_KEY
      : status === 401 || status === 403
      ? "Google rejected the key. Either the wrong project, the wrong key, or one of Maps JavaScript API / Maps Static API / Routes API is not enabled — a key working for address search does not automatically cover these three."
      : status === 400
      ? "Google refused the request as malformed (400)."
      : status === 429
      ? "Google rate-limited or over-quota'd the request (429)."
      : "Google could not be reached.";

  console.warn(`[map] ${where} fell back to the sketch. ${why}`, detail ?? "");

  if (!latest) {
    latest = `${where}: ${why}`;
    listeners.forEach((fn) => fn(latest));
  }
}

/**
 * Google's own failure channel for the interactive map.
 *
 * A refused or restricted key does not throw and does not reject the
 * loader's promise — the map still "loads", and paints a white "Oops!
 * Something went wrong / This page didn't load Google Maps correctly" box
 * over the whole panel. Google's only signal that this happened is a
 * GLOBAL callback it calls if one exists at `window.gm_authFailure`.
 * Registered once, before the first load.
 *
 * Subscribers matter as much as the log line: without one, a key that is
 * merely missing an API ends up SHOWING Google's error card to a customer
 * — strictly worse than this app's own sketch fallback, which is a drawn
 * map of Aruba with the route on it and says "Sketch — not to scale". The
 * flag is module-level and replayed to late subscribers, because the
 * callback can fire before a component has mounted to hear it.
 */
let authFailureWired = false;
let authFailed = false;
const authListeners = new Set<() => void>();

/** Fires when Google refuses the key for the interactive map. Replays
    immediately if it has already happened. Returns an unsubscribe. */
export function onGoogleAuthFailure(fn: () => void): () => void {
  authListeners.add(fn);
  if (authFailed) fn();
  return () => { authListeners.delete(fn); };
}

function wireAuthFailure(): void {
  if (authFailureWired) return;
  authFailureWired = true;
  (window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
    authFailed = true;
    reportGoogleMapsFailure("gl", 401);
    authListeners.forEach((fn) => fn());
  };
}

let loaderPromise: Promise<typeof google> | null = null;

/**
 * Load the Maps JavaScript API once and keep the promise, exactly the way
 * LiveMap used to dynamically `import("mapbox-gl")` once and keep the
 * module. `importLibrary` injects and tracks the `<script>` tag itself, so
 * two mounts of the map never fight over whether it is already on the
 * page — and once any library has loaded, the rest of `google.maps.*`
 * (LatLng, LatLngBounds, Marker, Polyline, event) is populated on the
 * global object too, which is what every call site after this one uses.
 */
export function loadGoogleMaps(): Promise<typeof google> {
  if (!loaderPromise) {
    wireAuthFailure();
    setOptions({ key: GOOGLE_MAPS_KEY, v: "weekly" });
    loaderPromise = importLibrary("maps").then(() => google);
  }
  return loaderPromise;
}

/**
 * A dark map to match the rest of the app, in the shape Google's `styles`
 * option expects: one rule per feature/element pair. Google renders its
 * own watermark and copyright text on every map regardless — that is a
 * term of the licence, the same way Mapbox's was, and nothing here tries
 * to hide it.
 */
export const DARK_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0d1c29" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1c29" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8fa0b3" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#2a3c4d" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#111f2c" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1c2e3e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#0d1c29" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#25384a" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#8fa0b3" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#071722" }] },
];
