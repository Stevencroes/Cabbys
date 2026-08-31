// ── Where a catalog place really is ──────────────────────────────────
//
// The catalog's sixty-odd places carry no coordinates. Until now each one
// was drawn at the centre of its AREA, which put "Eagle Beach" about a
// kilometre inland — near Bubali, four minutes' drive from the beach it
// names. On a map whose whole job is to make the fare underneath it
// believable, a pin in the wrong neighbourhood is worse than no pin.
//
// The fix is not a column of hand-typed coordinates. Sixty guesses would
// look authoritative while being wrong in exactly the way that started
// this, and they would still disagree with the map: the tiles, the labels
// and the driving line all come from Google, so a pin from anywhere else
// is a second opinion drawn on top of a first. Ask the same source the
// map came from, and the pin lands on the label by construction.
//
// Cached in localStorage because these places do not move — one lookup per
// place per browser, ever. Everything here fails to null, and null means
// the area centre, which is what the map did before this file existed.
import { AREAS, metresBetween, type PlaceSel } from "../data/places";
import { geocode } from "./places";
import { mapDebugOn, traceMap } from "./mapDebug";

export interface Coord {
  lat: number;
  lon: number;
}

const CACHE_KEY = "cabbys.pins.v1";

/**
 * How far a resolved pin may sit from the centre of the area the catalog
 * assigns it before we refuse it.
 *
 * The area centre is coarse — that is the entire problem — but it is
 * reliable to within a kilometre or two, which makes it a good prior for
 * catching a search that matched the wrong thing entirely. "Eagle Beach"
 * has an obvious answer; "The Old Man & The Sea" could match a fish shop
 * in another hemisphere. Five kilometres is comfortably more than any
 * centre is wrong by and comfortably less than the length of the island,
 * so a correction passes and a mismatch does not.
 */
const MAX_DRIFT_M = 5000;

const BY_AREA = new Map(AREAS.map((a) => [a.name, { lat: a.lat, lon: a.lon }]));

const pins = new Map<string, Coord>();
/** ids already asked about — a miss must not re-ask on every render */
const tried = new Set<string>();
const listeners = new Set<() => void>();

function load(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, Coord>;
    for (const [id, c] of Object.entries(saved)) {
      if (typeof c?.lat === "number" && typeof c?.lon === "number") pins.set(id, c);
    }
  } catch {
    // a private window, a full quota, a half-written value — the map is
    // fine without any of this, so nothing here is worth an error
  }
}
load();

function save(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(pins)));
  } catch { /* see load() */ }
}

/** The real coordinate for a catalog id, if one has been resolved. Sync,
    so coordOf() stays sync and every caller of it is unchanged. */
export function pinFor(id: string): Coord | null {
  return pins.get(id) ?? null;
}

/** Fires when a pin lands, so a map already on screen can move it. */
export function onPinsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Ask Google where this place is, once.
 *
 * Skipped entirely for anything that already knows: a geocoded address
 * arrived with coordinates, and the airport has an exact hand-set point.
 * Resolves to nothing on every failure path — no key, no network, no
 * match, a match in the wrong place — and the map carries on drawing the
 * area centre it always drew.
 */
export async function resolvePin(sel: PlaceSel | null | undefined): Promise<void> {
  if (!sel) return;
  if (typeof sel.lat === "number" && typeof sel.lon === "number") return;
  if (sel.area === "Airport") return;
  // A custom address is a line somebody typed and an area they picked. It
  // is not a place Google has a canonical answer for, and searching the
  // typed text is how a villa ends up pinned to a same-named hotel.
  if (sel.custom) return;
  if (pins.has(sel.id) || tried.has(sel.id)) return;
  tried.add(sel.id);

  const home = BY_AREA.get(sel.area);
  if (!home) return;

  const answer = await geocode(sel.name);
  const hit = answer.results[0];
  if (!hit) {
    if (mapDebugOn()) traceMap(`pin ${sel.id}: no match — area centre stands`);
    return;
  }

  const drift = metresBetween(hit.lat, hit.lon, home.lat, home.lon);
  if (drift > MAX_DRIFT_M) {
    // Google answered, but not about this place. The coarse centre is the
    // better of the two answers and is what stays on the map.
    if (mapDebugOn()) {
      traceMap(`pin ${sel.id}: REFUSED "${hit.name}" — ${Math.round(drift / 100) / 10} km from ${sel.area}`);
    }
    return;
  }

  pins.set(sel.id, { lat: hit.lat, lon: hit.lon });
  save();
  if (mapDebugOn()) traceMap(`pin ${sel.id}: moved ${Math.round(drift)} m to the real point`);
  listeners.forEach((fn) => fn());
}

/** Test seam — the module holds a page's worth of state by design. */
export function resetPins(): void {
  pins.clear();
  tried.clear();
  try { localStorage.removeItem(CACHE_KEY); } catch { /* see load() */ }
}
