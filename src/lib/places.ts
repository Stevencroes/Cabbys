// ── Address search: Google Places (New) ─────────────────────────────────
// This used to be Mapbox's job, moved here because its Aruba ADDRESS data
// was thin: real house numbers and side streets kept coming back empty,
// which is what sent the search to "type it, pick your area" for addresses
// that plainly exist. Google's data is the industry's best for exactly
// this territory, which is why the reference site this booking card was
// modelled on (blacklane.com) says "powered by Google" at the bottom of
// its own dropdown.
//
// The MAP itself — the interactive route, its static fallback, the
// driving line — moved to Google too, in lib/googleMaps.ts + lib/route.ts,
// for the same reason: a visitor who cannot get a real map at all is a
// harder problem than one whose map is merely a different brand. This
// file's GOOGLE_PLACES_KEY is the one key both now share; lib/mapbox.ts,
// which used to own the token and the search, no longer exists.
//
// The shape here is deliberately provider-agnostic: GeoSuggestion,
// GeoStatus, GeoAnswer, geocode(), geoStatusLine(). PlaceCombobox does not
// know or care which provider answered, and swapping again later is a
// file, not a rewrite — which is exactly what just happened to the map.
import { mapDebugOn } from "./mapDebug";

/** What kind of thing Google matched, so a row can carry the right mark. */
export type GeoKind = "poi" | "address" | "place";

export interface GeoSuggestion {
  id: string;
  /** the short name — "Manchebo Beach Resort", "Sasakiweg 34" */
  name: string;
  /** the full line, minus the country — what the row reads underneath */
  address: string;
  kind: GeoKind;
  lat: number;
  lon: number;
}

/**
 * Why an address search came back with nothing.
 *
 * A key that never made it into the build, a key Google refuses, a network
 * that never answered, and a street Google genuinely does not know all
 * produced one identical outcome: the panel quietly offering to guess an
 * area instead. That is unfixable from the outside, because there was
 * nothing to tell the four apart. The search says which one now.
 */
export type GeoStatus = "ok" | "off" | "empty" | "http" | "network";

export interface GeoAnswer {
  results: GeoSuggestion[];
  status: GeoStatus;
  /** the HTTP code, when status is "http" */
  httpStatus?: number;
}

/**
 * The key, cleaned up on the way in — same reasoning as cleanToken() in
 * mapbox.ts: a key pasted through a dashboard field carries whatever
 * whitespace or quoting came with it into the bundle, and a key with a
 * trailing newline fails identically to no key at all.
 */
export function cleanPlacesKey(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/^["']|["']$/g, "").trim();
}

export const GOOGLE_PLACES_KEY = cleanPlacesKey(import.meta.env.VITE_GOOGLE_PLACES_KEY);
export const placesSearchEnabled = GOOGLE_PLACES_KEY.length > 0;

// A hard restriction, not a bias: nothing off a 30 km island is ever the
// right answer here, so Text Search is told the rectangle rather than
// merely nudged toward it.
const ARUBA_RECT = {
  low: { latitude: 12.40, longitude: -70.10 },
  high: { latitude: 12.65, longitude: -69.85 },
};

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
}

/** Google's several dozen place types, reduced to the three a row can
    draw. Ordered so a house counts as an address before it counts as a
    "premise", and a hotel or resort reads as a destination rather than a
    generic point. */
function kindOf(types: string[] | undefined): GeoKind {
  if (!types?.length) return "place";
  if (types.some((t) => t === "street_address" || t === "premise" || t === "subpremise")) return "address";
  if (types.some((t) => t === "locality" || t === "sublocality" || t === "neighborhood" || t === "administrative_area_level_1")) return "place";
  return "poi";
}

/**
 * Everything Aruba has an address for.
 *
 * The catalog holds the sixty-odd places most rides start or end at, and it
 * always will be sixty-odd — nobody is going to type every villa on the
 * island into a TypeScript file. This is the rest of the island. Results
 * come back with coordinates, which is what lets a typed address price
 * honestly — see selFromGeo in data/places.ts, which snaps it to the
 * pricing area it actually sits in rather than asking the traveller to
 * guess one from a menu.
 *
 * Text Search (New) rather than Autocomplete + Place Details: one request
 * returns a name, an address AND coordinates together, matching the shape
 * PlaceCombobox already expects from a single call. Autocomplete is the
 * cheaper pattern at real volume — its predictions carry no coordinates,
 * so committing one needs a second Place Details call — but it is also a
 * second network round trip and a second failure mode to diagnose, and this
 * app has never made two calls to answer one keystroke. Revisit if the
 * request volume ever makes the price difference worth the complexity.
 */
export async function geocode(query: string, signal?: AbortSignal): Promise<GeoAnswer> {
  const q = query.trim();
  if (!placesSearchEnabled) return { results: [], status: "off" };
  if (!q) return { results: [], status: "empty" };
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_KEY,
        // Field-masked to the Basic-tier fields Text Search needs to answer
        // this — id, name, address, location, type — because Places (New)
        // bills by which fields a request asks for, and asking for more
        // than a result row can show is a cost with nothing to show for it.
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.location,places.types",
      },
      body: JSON.stringify({
        textQuery: `${q}, Aruba`,
        languageCode: "en",
        regionCode: "AW",
        locationRestriction: { rectangle: ARUBA_RECT },
      }),
    });
    if (!res.ok) {
      return { results: [], status: "http", httpStatus: res.status };
    }
    const data = (await res.json()) as { places?: GooglePlace[] };
    const results = (data.places ?? []).flatMap((pl): GeoSuggestion[] => {
      const lat = pl.location?.latitude;
      const lon = pl.location?.longitude;
      const name = pl.displayName?.text;
      // Without coordinates there is no area, and without an area there is
      // no fare. A row we cannot price is worse than one we never showed.
      if (lat === undefined || lon === undefined || !name) return [];
      // formattedAddress leads with the name already shown in bold above
      // it — "Sasakiweg 34, Oranjestad, Aruba" under a row titled
      // "Sasakiweg 34" spends the second line repeating the first. Keep
      // the part that adds something; where nothing is left, the island
      // will do.
      const full = (pl.formattedAddress ?? "").replace(/,?\s*Aruba$/i, "").trim();
      const rest = full.toLowerCase().startsWith(name.toLowerCase())
        ? full.slice(name.length).replace(/^[,\s]+/, "")
        : full;
      const address = rest || "Aruba";
      return [{ id: `gp-${pl.id ?? name}`, name, address, kind: kindOf(pl.types), lat, lon }];
    });
    return { results, status: results.length ? "ok" : "empty" };
  } catch (err) {
    // an aborted request is the next keystroke, not a failure
    if ((err as { name?: string })?.name !== "AbortError") {
      // eslint-disable-next-line no-console
      console.warn("[places] address search failed", err);
    }
    return { results: [], status: "network" };
  }
}

/** What to say about a search that found nothing, in one line. The second
    half only appears under ?mapdebug=1 — a traveller needs the way
    forward, whoever is fixing it needs the cause. Shares the flag the maps
    already use: this and a broken map tile are the same kind of question. */
export function geoStatusLine(status: GeoStatus, httpStatus?: number): string {
  if (status === "ok" || status === "empty") return "Every address in Aruba · Google";
  const plain = "Address search is offline — type your address and pick an area";
  if (!mapDebugOn()) return plain;
  const why =
    status === "off"
      ? "no VITE_GOOGLE_PLACES_KEY in this build — Vite inlines it at BUILD time, so setting it on the host does nothing until the site is rebuilt"
      : status === "network"
      ? "the request never completed — network, or a blocked host"
      : httpStatus === 400
      ? "400: the request was malformed, or \"Places API (New)\" is not enabled on this project"
      : httpStatus === 403
      ? "403: the key is restricted and this domain is not on its allow list, or billing is not enabled"
      : httpStatus === 429
      ? "429: rate limited or over quota"
      : `HTTP ${httpStatus ?? "?"}`;
  return `${plain} · ${why}`;
}
