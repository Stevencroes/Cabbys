// ── Where the ride actually goes ─────────────────────────────────────
// A selection points at a real place when it can, and at the centre of its
// area when it cannot.
//
// The catalog's sixty places carry no coordinates of their own, so two Palm
// Beach hotels still share a pin — honest enough for a route overview of a
// 30 km island, and wrong for turn-by-turn, which is why nothing here
// claims to be navigation. A GEOCODED address is different: it arrived with
// coordinates, and drawing it at the middle of Oranjestad instead of where
// it is makes the map disagree with the address above it. Somebody who
// typed their street and got a pin a kilometre away has no reason to trust
// the number underneath.
//
// The fare is a separate question and does NOT come from here: it is a
// fixed price for the area, by design — see quote.ts.
import { AREAS, type PlaceSel } from "../data/places";
import { MAPBOX_TOKEN, mapboxEnabled, reportMapboxFailure } from "./mapbox";

export interface Coord {
  lat: number;
  lon: number;
}

/** Queen Beatrix International. Its own point — it is not in AREAS. */
export const AIRPORT_COORD: Coord = { lat: 12.5014, lon: -70.0152 };

const BY_AREA = new Map(AREAS.map((a) => [a.name, { lat: a.lat, lon: a.lon }]));

export function coordOf(sel: PlaceSel | null | undefined): Coord | null {
  if (!sel) return null;
  // Its own point, when it has one. Geocoded addresses carry lat/lon; this
  // is the whole reason they are asked for and kept.
  if (typeof sel.lat === "number" && typeof sel.lon === "number") {
    return { lat: sel.lat, lon: sel.lon };
  }
  if (sel.area === "Airport") return AIRPORT_COORD;
  return BY_AREA.get(sel.area) ?? null;
}

export interface RouteLine {
  /** Mapbox-encoded polyline, ready to drop into a static map path. */
  polyline: string;
  km: number;
  minutes: number;
}

/**
 * The driving line between two points. Returns null whenever it cannot
 * answer — no token, same area, network refused — and every caller treats
 * null as "draw the fallback", never as an error worth showing anyone.
 */
export async function drivingRoute(
  from: Coord, to: Coord, signal?: AbortSignal,
): Promise<RouteLine | null> {
  if (!mapboxEnabled) return null;
  const pair = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/driving/${pair}` +
    `?access_token=${MAPBOX_TOKEN}&overview=simplified&geometries=polyline`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      reportMapboxFailure("directions", res.status);
      return null;
    }
    const data = (await res.json()) as {
      routes?: { geometry?: string; distance?: number; duration?: number }[];
    };
    const r = data.routes?.[0];
    if (!r?.geometry) return null;
    return {
      polyline: r.geometry,
      km: Math.round((r.distance ?? 0) / 100) / 10,
      minutes: Math.round((r.duration ?? 0) / 60),
    };
  } catch (err) {
    // an aborted request is the component doing its job, not a failure
    if (!signal?.aborted) reportMapboxFailure("directions", undefined, err);
    return null;
  }
}

interface StaticMapOptions {
  width: number;
  height: number;
  /** device pixel ratio; Mapbox only offers 1x and 2x */
  retina?: boolean;
}

const SILVER = "b9c6d4";
const INK = "f2f5f8";

/**
 * A dark static map with the route drawn on it.
 *
 * `attribution=false&logo=false` is only permitted because the component
 * renders its own "© Mapbox · © OpenStreetMap" line. Do not remove that
 * caption without also removing these two parameters — the attribution is
 * a term of the licence, not decoration.
 */
export function staticMapUrl(
  from: Coord, to: Coord, line: RouteLine | null, opts: StaticMapOptions,
): string | null {
  if (!mapboxEnabled) return null;
  const overlays: string[] = [];
  if (line) overlays.push(`path-4+${SILVER}-0.95(${encodeURIComponent(line.polyline)})`);
  overlays.push(`pin-s+${INK}(${from.lon},${from.lat})`);
  overlays.push(`pin-s+${SILVER}(${to.lon},${to.lat})`);
  const size = `${Math.round(opts.width)}x${Math.round(opts.height)}${opts.retina ? "@2x" : ""}`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/` +
    `${overlays.join(",")}/auto/${size}` +
    `?access_token=${MAPBOX_TOKEN}&padding=44&attribution=false&logo=false`
  );
}

// ── the no-token fallback ────────────────────────────────────────────
// A schematic Aruba, drawn from its coastline, so the card still shows
// where the ride goes before anyone buys a map subscription. Labelled as
// a sketch on screen, because that is what it is.

/** Simplified coastline, leeward side first, NW tip round to SE point. */
const COASTLINE: [number, number][] = [
  [-70.058, 12.615], [-70.055, 12.598], [-70.048, 12.583], [-70.045, 12.566],
  [-70.052, 12.552], [-70.046, 12.539], [-70.038, 12.526], [-70.030, 12.514],
  [-70.015, 12.501], [-69.995, 12.487], [-69.972, 12.470], [-69.941, 12.454],
  [-69.920, 12.441], [-69.898, 12.428], [-69.869, 12.412], [-69.874, 12.428],
  [-69.883, 12.443], [-69.905, 12.462], [-69.928, 12.481], [-69.952, 12.500],
  [-69.972, 12.518], [-69.990, 12.538], [-70.008, 12.558], [-70.026, 12.578],
  [-70.042, 12.598], [-70.052, 12.610],
];

const BOUNDS = { minLon: -70.075, maxLon: -69.855, minLat: 12.398, maxLat: 12.628 };

export interface Projected {
  x: number;
  y: number;
}

/** lon/lat → viewBox units, y flipped because SVG counts downward. */
export function project(c: Coord, w: number, h: number, pad = 10): Projected {
  const { minLon, maxLon, minLat, maxLat } = BOUNDS;
  const iw = w - pad * 2;
  const ih = h - pad * 2;
  return {
    x: pad + ((c.lon - minLon) / (maxLon - minLon)) * iw,
    y: pad + (1 - (c.lat - minLat) / (maxLat - minLat)) * ih,
  };
}

export function islandPath(w: number, h: number, pad = 10): string {
  const pts = COASTLINE.map(([lon, lat]) => project({ lat, lon }, w, h, pad));
  return `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z`;
}
