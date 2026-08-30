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
import { GOOGLE_MAPS_KEY, googleMapsEnabled, reportGoogleMapsFailure, DARK_MAP_STYLE } from "./googleMaps";

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
  /** An encoded polyline at precision 5 — Google's Routes API and the old
      Mapbox Directions API both speak the same "Encoded Polyline Algorithm
      Format", so decodePolyline() in LiveMap.tsx never had to change. */
  polyline: string;
  km: number;
  minutes: number;
}

/**
 * The driving line between two points. Returns null whenever it cannot
 * answer — no key, same area, network refused — and every caller treats
 * null as "draw the fallback", never as an error worth showing anyone.
 *
 * Routes API rather than the older Directions API: Directions is a
 * "legacy" Maps Platform web service that Google's own docs say to call
 * server-side (its responses carry no CORS header, so a browser fetch to
 * it is refused before Google even sees the request); Routes API is part
 * of the same client-callable family as Places API (New), which this app
 * already calls directly from the browser for address search.
 */
export async function drivingRoute(
  from: Coord, to: Coord, signal?: AbortSignal,
): Promise<RouteLine | null> {
  if (!googleMapsEnabled) return null;
  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_KEY,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: from.lat, longitude: from.lon } } },
        destination: { location: { latLng: { latitude: to.lat, longitude: to.lon } } },
        travelMode: "DRIVE",
      }),
    });
    if (!res.ok) {
      reportGoogleMapsFailure("directions", res.status);
      return null;
    }
    const data = (await res.json()) as {
      routes?: { polyline?: { encodedPolyline?: string }; distanceMeters?: number; duration?: string }[];
    };
    const r = data.routes?.[0];
    const polyline = r?.polyline?.encodedPolyline;
    if (!polyline) return null;
    // duration comes back as a string like "812s", not a number of seconds
    const seconds = r?.duration ? Number.parseInt(r.duration, 10) || 0 : 0;
    return {
      polyline,
      km: Math.round((r?.distanceMeters ?? 0) / 100) / 10,
      minutes: Math.round(seconds / 60),
    };
  } catch (err) {
    // an aborted request is the component doing its job, not a failure
    if (!signal?.aborted) reportGoogleMapsFailure("directions", undefined, err);
    return null;
  }
}

interface StaticMapOptions {
  width: number;
  height: number;
  /** device pixel ratio; Google's Static Maps API only offers 1x and 2x */
  retina?: boolean;
}

const SILVER = "b9c6d4";
const INK = "f2f5f8";

/** DARK_MAP_STYLE, translated into Static Maps API's flatter `style=`
    query-param shape — one rule, one param, so the interactive map and its
    static fallback are driven by the same colour choices instead of two
    copies that can drift apart. */
function staticStyleParams(): string[] {
  return DARK_MAP_STYLE.map((rule) => {
    const parts = [`feature:${rule.featureType ?? "all"}`, `element:${rule.elementType ?? "all"}`];
    for (const s of rule.stylers ?? []) {
      if ("color" in s && s.color) parts.push(`color:0x${String(s.color).replace(/^#/, "")}`);
      if ("visibility" in s && s.visibility) parts.push(`visibility:${s.visibility}`);
    }
    return parts.join("|");
  });
}

/**
 * A dark static map with the route drawn on it.
 *
 * With a path or markers present, Google infers the viewport itself — the
 * same "auto"-fit behaviour the old Mapbox URL asked for explicitly, so
 * this never has to compute its own centre or zoom.
 *
 * Unlike Mapbox, the Static Maps API has no parameter that removes
 * Google's own watermark — there is nothing to suppress here, and nothing
 * for the component's caption to stand in for.
 */
export function staticMapUrl(
  from: Coord, to: Coord, line: RouteLine | null, opts: StaticMapOptions,
): string | null {
  if (!googleMapsEnabled) return null;
  const params = new URLSearchParams();
  params.set("size", `${Math.round(opts.width)}x${Math.round(opts.height)}`);
  if (opts.retina) params.set("scale", "2");
  params.set("maptype", "roadmap");
  for (const s of staticStyleParams()) params.append("style", s);
  if (line) params.append("path", `color:0x${SILVER}f2|weight:4|enc:${line.polyline}`);
  params.append("markers", `size:small|color:0x${INK}|${from.lat},${from.lon}`);
  params.append("markers", `size:small|color:0x${SILVER}|${to.lat},${to.lon}`);
  params.set("key", GOOGLE_MAPS_KEY);
  return `https://maps.googleapis.com/maps/api/staticmap?${params.toString()}`;
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
