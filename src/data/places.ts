// ─────────────────────────────────────────────────────────────────────
// Cabby's place catalog — ONE source of truth for the whole booking UI.
//
// km is SIGNED position along the island's coastal road axis:
//   positive = northwest of the airport · negative = southeast.
// (Unsigned distance would make Palm Beach (+14) and Savaneta (−10) look
// one kilometre apart and price a 40-minute cross-island run as a
// neighbourhood hop.)
//
// `fare` is the fixed one-way airport fare in USD. It is intentionally
// LEFT NULL here: fares are read at runtime from the Supabase pricing
// engine (pricing_routes / pricing_zones), which is the live rate card.
// When the engine has no row for a place, the km model in lib/quote.ts
// prices it. Fill `fare` only if you want a hard static override.
//
// `mf`/`md` are floor fare (USD) / floor duration (min) for spots reached
// by detour (Arikok, Natural Pool…): near the axis numerically, far by
// road. Values marked PROVISIONAL need confirming against the rate card.
// ─────────────────────────────────────────────────────────────────────

export const GROUPS = [
  "Airport & port",
  "Hotels & resorts",
  "Beaches",
  "Sights & tours",
  "Restaurants & bars",
  "Shopping",
  "Towns & areas",
] as const;
export type PlaceGroup = (typeof GROUPS)[number];

export const AREA_NAMES = [
  "Oranjestad", "Eagle Beach", "Druif Beach", "Palm Beach", "Noord",
  "Malmok", "Paradera", "Santa Cruz", "Savaneta", "San Nicolas",
] as const;
export type AreaName = (typeof AREA_NAMES)[number];

export interface Area {
  name: AreaName;
  km: number;      // signed axis position
  min: number;     // typical airport drive, minutes
  lat: number;     // centre — for the "use my location" snap
  lon: number;
}

// Area centres (geographic; used for defaults and location snapping)
export const AREAS: Area[] = [
  { name: "Oranjestad",  km:  5,  min: 12, lat: 12.519, lon: -70.037 },
  { name: "Druif Beach", km:  7,  min: 14, lat: 12.545, lon: -70.045 },
  { name: "Eagle Beach", km:  8,  min: 15, lat: 12.552, lon: -70.049 },
  { name: "Palm Beach",  km: 13,  min: 18, lat: 12.578, lon: -70.043 },
  { name: "Noord",       km: 14,  min: 20, lat: 12.578, lon: -70.027 },
  { name: "Malmok",      km: 17,  min: 22, lat: 12.595, lon: -70.052 },
  { name: "Paradera",    km:  2,  min: 15, lat: 12.505, lon: -69.995 },
  { name: "Santa Cruz",  km: -2,  min: 20, lat: 12.505, lon: -69.960 },
  { name: "Savaneta",    km: -10, min: 20, lat: 12.454, lon: -69.941 },
  { name: "San Nicolas", km: -17, min: 28, lat: 12.435, lon: -69.906 },
];

export function areaByName(name: string): Area | undefined {
  return AREAS.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
}

/**
 * Snap a coordinate to the pricing area it sits in.
 *
 * Lives here rather than in lib/geo because the areas do, and because two
 * different callers need it for the same reason: "use my location" turns a
 * GPS fix into a pickup, and a typed address turns a geocoder's answer into
 * a fare. Both are the same question — which of the ten does this belong
 * to — and the answer must not depend on which one asked.
 *
 * Squared degrees, not haversine: at this latitude, over an island 30 km
 * long, the ranking is identical and the cheaper sum is easier to trust.
 */
export function nearestArea(lat: number, lon: number): Area {
  let best = AREAS[0];
  let bestD = Infinity;
  for (const a of AREAS) {
    const d = (a.lat - lat) ** 2 + (a.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/**
 * Where a coordinate sits on the fare axis, and how far into the drive.
 *
 * `km` is not a distance and cannot be computed from one — Santa Cruz is
 * 5.9 km from the airport and sits at −2, Palm Beach is 9.0 km away and
 * sits at +13, because the axis encodes the road and the direction, not the
 * crow. It is a scale DEFINED by the eleven points below, so a new address
 * is placed relative to them rather than measured against anything.
 *
 * Inverse-distance weighting over the three nearest, squared: an address on
 * top of an area centre gets that area's numbers exactly — so the common
 * case prices as it always has — and one off-centre slides smoothly toward
 * whichever neighbours it is actually between.
 *
 * The honest limit: past the outermost anchor the answer stops moving, so a
 * villa beyond Malmok prices as Malmok rather than as the +20 the catalog
 * gives California Lighthouse. Under-reaching at the tips is the safe
 * direction to be wrong in, and adding anchors up there is how to fix it.
 */
/** The shortest drive anyone is quoted, in minutes. */
const MIN_DRIVE = 5;

const ANCHORS: { lat: number; lon: number; km: number; min: number }[] = [
  ...AREAS.map((a) => ({ lat: a.lat, lon: a.lon, km: a.km, min: a.min })),
  // the origin of the scale; it is not an area
  { lat: 12.5014, lon: -70.0152, km: 0, min: 0 },
];

/** Rough local metres. Fine over one 30 km island, and only ever used to
    rank and weight — never reported as a distance. */
/** Flat-earth metres, good to a fraction of a percent over an island this
    size — and exported because placePins.ts checks a geocoded pin against
    the area it is supposed to be in using the same yardstick. */
export function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const y = (aLat - bLat) * 110570;
  const x = (aLon - bLon) * 108680 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(x, y);
}

export function axisAt(lat: number, lon: number): { km: number; min: number } {
  const near = ANCHORS
    .map((a) => ({ a, d: metresBetween(lat, lon, a.lat, a.lon) }))
    .sort((p, q) => p.d - q.d)
    .slice(0, 3);
  // standing on one of them — take it, and skip the division by zero
  if (near[0].d < 60) return { km: near[0].a.km, min: near[0].a.min };
  let wk = 0, wm = 0, w = 0;
  for (const { a, d } of near) {
    const weight = 1 / (d * d);
    wk += a.km * weight;
    wm += a.min * weight;
    w += weight;
  }
  return {
    km: Math.round((wk / w) * 10) / 10,
    // The airport anchor's 0 is the origin of the SCALE, not a journey, and
    // it drags anything near the terminal toward a one-minute transfer. No
    // ride on this island is shorter than five minutes door to door.
    min: Math.max(MIN_DRIVE, Math.round(wm / w)),
  };
}

export const AIRPORT_ID = "airport";

export interface Place {
  id: string;
  name: string;          // matches pricing_locations rows where one exists
  group: PlaceGroup;
  area: AreaName | "Airport";
  km: number;            // signed; inherits area km where not set explicitly
  min?: number;          // airport drive time override, minutes
  fare?: number | null;  // static USD override — normally null (engine prices)
  mf?: number;           // floor fare, USD (detour spots)
  md?: number;           // floor duration, minutes
  meta?: string;
  /**
   * What to call it in a one-line field.
   *
   * `name` is the canonical string: it matches pricing_locations rows and it
   * is what the driver's job sheet says, so it cannot be shortened. But a
   * booking card cell is about 26 characters wide, and "Queen Beatrix
   * Internati…" hides the one word — Airport — that identifies it. Set this
   * only where the truncation would cost the meaning; the full name still
   * shows in the dropdown and everywhere with room for it.
   */
  short?: string;
}

const A = Object.fromEntries(AREAS.map((a) => [a.name, a])) as Record<AreaName, Area>;
const p = (
  id: string, name: string, group: PlaceGroup, area: AreaName,
  extra: Partial<Place> = {},
): Place => ({ id, name, group, area, km: A[area].km, min: A[area].min, fare: null, meta: area, ...extra });

export const PLACES: Place[] = [
  // ── Airport & port ──
  { id: AIRPORT_ID, name: "Queen Beatrix International Airport", short: "Queen Beatrix Airport", group: "Airport & port", area: "Airport", km: 0, min: 0, fare: null, meta: "AUA · Oranjestad" },
  p("cruise-terminal", "Cruise Terminal, Oranjestad", "Airport & port", "Oranjestad", { km: 4.5, min: 11, short: "Cruise Terminal" }),

  // ── Hotels & resorts ──
  p("ritz", "The Ritz-Carlton Aruba", "Hotels & resorts", "Palm Beach", { km: 14.5, min: 19 }),
  p("hyatt", "Hyatt Regency Aruba", "Hotels & resorts", "Palm Beach"),
  p("marriott", "Aruba Marriott Resort", "Hotels & resorts", "Palm Beach", { km: 14, min: 19 }),
  p("hilton", "Hilton Aruba", "Hotels & resorts", "Palm Beach"),
  p("barcelo", "Barceló Aruba", "Hotels & resorts", "Palm Beach"),
  p("riu-palace-aruba", "RIU Palace Aruba", "Hotels & resorts", "Palm Beach"),
  p("riu-palace-antillas", "RIU Palace Antillas", "Hotels & resorts", "Palm Beach"),
  p("holiday-inn", "Holiday Inn Resort Aruba", "Hotels & resorts", "Palm Beach"),
  p("playa-linda", "Playa Linda Beach Resort", "Hotels & resorts", "Palm Beach"),
  p("the-mill", "The Mill Resort", "Hotels & resorts", "Palm Beach"),
  p("brickell-bay", "Brickell Bay Beach Club", "Hotels & resorts", "Palm Beach"),
  p("courtyard", "Courtyard by Marriott Aruba", "Hotels & resorts", "Palm Beach", { short: "Courtyard Aruba" }),
  p("embassy-suites", "Embassy Suites Aruba", "Hotels & resorts", "Palm Beach"),
  p("divi", "Divi Aruba All Inclusive", "Hotels & resorts", "Druif Beach"),
  p("manchebo", "Manchebo Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("bucuti", "Bucuti & Tara Beach Resort", "Hotels & resorts", "Eagle Beach", { short: "Bucuti & Tara" }),
  p("la-cabana", "La Cabana Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("costa-linda", "Costa Linda Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("casa-del-mar", "Casa del Mar Beach Resort", "Hotels & resorts", "Eagle Beach", { short: "Casa del Mar" }),
  p("eagle-aruba", "Eagle Aruba Resort", "Hotels & resorts", "Eagle Beach"),
  p("aruba-beach-club", "Aruba Beach Club", "Hotels & resorts", "Eagle Beach"),
  p("tierra-del-sol", "Tierra del Sol Resort", "Hotels & resorts", "Malmok", { km: 19, min: 24 }),
  p("caribbean-palm-village", "Caribbean Palm Village Resort", "Hotels & resorts", "Noord", { short: "Caribbean Palm Village" }),
  p("renaissance", "Renaissance Aruba", "Hotels & resorts", "Oranjestad"),

  // ── Beaches ──
  p("eagle-beach", "Eagle Beach", "Beaches", "Eagle Beach"),
  p("palm-beach", "Palm Beach", "Beaches", "Palm Beach"),
  p("arashi-beach", "Arashi Beach", "Beaches", "Malmok", { km: 19, min: 25 }),
  p("boca-catalina", "Boca Catalina", "Beaches", "Malmok", { km: 18, min: 24 }),
  p("malmok-beach", "Malmok Beach", "Beaches", "Malmok"),
  p("flamingo-beach", "Flamingo Beach (Renaissance Island)", "Beaches", "Oranjestad", { short: "Flamingo Beach", meta: "Private island · via Renaissance dock" }),
  p("mangel-halto", "Mangel Halto", "Beaches", "Savaneta"),
  p("baby-beach", "Baby Beach", "Beaches", "San Nicolas", { km: -20, min: 35 }),

  // ── Sights & tours ──
  p("california-lighthouse", "California Lighthouse", "Sights & tours", "Malmok", { km: 20, min: 26 }),
  p("alto-vista-chapel", "Alto Vista Chapel", "Sights & tours", "Noord", { km: 16, min: 24, md: 24 }),
  p("casibari", "Casibari Rock Formations", "Sights & tours", "Paradera", { md: 20, short: "Casibari Rocks" }),
  p("ayo-rocks", "Ayo Rock Formations", "Sights & tours", "Santa Cruz", { md: 22 }),
  // PROVISIONAL floors — confirm mf against the rate card before go-live
  p("arikok", "Arikok National Park", "Sights & tours", "Santa Cruz", { km: -6, min: 30, mf: 55, md: 30 }),
  p("natural-pool", "Natural Pool (Conchi)", "Sights & tours", "Santa Cruz", { km: -6, min: 40, mf: 65, md: 40, meta: "4×4 access · Arikok" }),
  p("butterfly-farm", "Butterfly Farm", "Sights & tours", "Palm Beach"),
  p("philips-animal-garden", "Philip's Animal Garden", "Sights & tours", "Noord"),
  p("donkey-sanctuary", "Donkey Sanctuary Aruba", "Sights & tours", "Santa Cruz", { md: 22 }),

  // ── Restaurants & bars ──
  p("carte-blanche", "Carte Blanche", "Restaurants & bars", "Noord"),
  p("papiamento", "Papiamento Restaurant", "Restaurants & bars", "Noord"),
  p("gasparito", "Gasparito Restaurant", "Restaurants & bars", "Noord"),
  p("barefoot", "Barefoot Restaurant", "Restaurants & bars", "Oranjestad"),
  p("old-man-sea", "The Old Man & The Sea", "Restaurants & bars", "Savaneta"),
  p("yemanja", "Yemanja Woodfired Grill", "Restaurants & bars", "Oranjestad"),
  p("flying-fishbone", "Flying Fishbone", "Restaurants & bars", "Savaneta"),
  p("zeerovers", "Zeerovers", "Restaurants & bars", "Savaneta"),
  p("charlies-bar", "Charlie's Bar", "Restaurants & bars", "San Nicolas"),

  // ── Shopping ──
  p("palm-beach-plaza", "Palm Beach Plaza", "Shopping", "Palm Beach"),
  p("paseo-herencia", "Paseo Herencia", "Shopping", "Palm Beach"),
  p("village-mall", "The Village Mall", "Shopping", "Palm Beach"),
  p("renaissance-mall", "Renaissance Mall", "Shopping", "Oranjestad"),

  // ── Towns & areas ──
  p("oranjestad", "Oranjestad", "Towns & areas", "Oranjestad"),
  p("noord", "Noord", "Towns & areas", "Noord"),
  p("paradera", "Paradera", "Towns & areas", "Paradera"),
  p("santa-cruz", "Santa Cruz", "Towns & areas", "Santa Cruz"),
  p("savaneta", "Savaneta", "Towns & areas", "Savaneta"),
  p("san-nicolas", "San Nicolas", "Towns & areas", "San Nicolas"),
];

export const AIRPORT: Place = PLACES[0];

/** The shortcut list the mobile picker offers before anything is typed.
    Hand-picked, not measured: the airport and the cruise port are where
    arrivals start, and the three areas cover where most of the island's
    beds and restaurants are. Kept to five — a shortcut you can take in at
    a glance, not a directory to scroll. Replace it with real booking
    counts when there are enough of them to mean anything. */
export const COMMON_PICKUPS: Place[] = [
  AIRPORT_ID, "cruise-terminal", "palm-beach", "eagle-beach", "oranjestad",
].map((id) => PLACES.find((pl) => pl.id === id)).filter((pl): pl is Place => !!pl);

// ── selection type shared by the quote card + booking modal ──
// A selection is either a catalog place or a custom address anchored to an
// area (how fixed-price transfer firms handle villas — no geocoding needed).
export interface PlaceSel {
  id: string;
  name: string;          // display label (custom: the typed address)
  area: AreaName | "Airport";
  km: number;
  min?: number;
  mf?: number;
  md?: number;
  custom?: boolean;
  note?: string;         // free text for the driver (custom addresses)
  /** the field-width name, when the canonical one is too long to read in
      a single-line cell — display only, never sent anywhere */
  shortName?: string;
  /** where it actually is, when a geocoder said so — the map draws the
      real point instead of the area centre, and the driver gets a pin */
  lat?: number;
  lon?: number;
}

export function selFromPlace(place: Place): PlaceSel {
  return {
    id: place.id, name: place.name, shortName: place.short, area: place.area,
    km: place.km, min: place.min, mf: place.mf, md: place.md,
  };
}

/** What a one-line field should show for a selection. The canonical name
    everywhere else — this is the only place the two differ. */
export function displayName(sel: PlaceSel): string {
  return sel.shortName ?? sel.name;
}

/**
 * A geocoded address, priced.
 *
 * This is the whole reason the geocoder returns coordinates. A fixed-fare
 * transfer prices by area, and until now a typed address got its area from
 * a dropdown the traveller had to answer — which asks someone who has never
 * been to Aruba whether their villa is in Noord or Paradera, and prices the
 * ride on whichever they guessed. The coordinates already know. The menu
 * survives only for the case where there are no coordinates to ask.
 *
 * It stays `custom`, because it is still not a rate-card row: a geocoder's
 * spelling of a hotel must never be matched against pricing_locations,
 * which pairs names by loose substring. quote.ts honours that by asking the
 * rate card about the AREA below rather than about `name` — so a typed
 * address is priced by the card like everything else, without a single
 * character the traveller typed reaching the matcher.
 *
 * The AREA is still the nearest one, because that is what a driver is told
 * and what the ride record files it under. The FARE is not: it comes from
 * where the address actually is (axisAt), so a villa at the far end of Palm
 * Beach no longer prices as though it were in the middle of it. An address
 * sitting on an area centre gets that area's numbers unchanged.
 */
export function selFromGeo(
  g: { id: string; name: string; address: string; lat: number; lon: number },
): PlaceSel {
  const area = nearestArea(g.lat, g.lon);
  const axis = axisAt(g.lat, g.lon);
  return {
    id: g.id,
    name: g.name,
    area: area.name,
    km: axis.km,
    min: axis.min,
    custom: true,
    note: g.address,
    lat: g.lat,
    lon: g.lon,
  };
}

export function selFromCustom(label: string, area: Area, note = ""): PlaceSel {
  return {
    id: `custom:${area.name}`,
    name: label,
    area: area.name,
    km: area.km,
    min: area.min,
    custom: true,
    note,
  };
}

export function placeById(id: string): Place | undefined {
  return PLACES.find((pl) => pl.id === id);
}

export function findPlaceByName(name: string): Place | undefined {
  const n = name.trim().toLowerCase();
  return PLACES.find((pl) => pl.name.toLowerCase() === n);
}

export function placesByGroup(group: PlaceGroup): Place[] {
  return PLACES.filter((pl) => pl.group === group);
}

/** Type-to-filter across place name AND area. */
export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter(
    (pl) =>
      pl.name.toLowerCase().includes(q) ||
      pl.area.toLowerCase().includes(q) ||
      (pl.meta?.toLowerCase().includes(q) ?? false),
  );
}
