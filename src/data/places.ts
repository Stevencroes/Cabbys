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
}

const A = Object.fromEntries(AREAS.map((a) => [a.name, a])) as Record<AreaName, Area>;
const p = (
  id: string, name: string, group: PlaceGroup, area: AreaName,
  extra: Partial<Place> = {},
): Place => ({ id, name, group, area, km: A[area].km, min: A[area].min, fare: null, meta: area, ...extra });

export const PLACES: Place[] = [
  // ── Airport & port ──
  { id: AIRPORT_ID, name: "Queen Beatrix International Airport", group: "Airport & port", area: "Airport", km: 0, min: 0, fare: null, meta: "AUA · Oranjestad" },
  p("cruise-terminal", "Cruise Terminal, Oranjestad", "Airport & port", "Oranjestad", { km: 4.5, min: 11 }),

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
  p("courtyard", "Courtyard by Marriott Aruba", "Hotels & resorts", "Palm Beach"),
  p("embassy-suites", "Embassy Suites Aruba", "Hotels & resorts", "Palm Beach"),
  p("divi", "Divi Aruba All Inclusive", "Hotels & resorts", "Druif Beach"),
  p("manchebo", "Manchebo Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("bucuti", "Bucuti & Tara Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("la-cabana", "La Cabana Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("costa-linda", "Costa Linda Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("casa-del-mar", "Casa del Mar Beach Resort", "Hotels & resorts", "Eagle Beach"),
  p("eagle-aruba", "Eagle Aruba Resort", "Hotels & resorts", "Eagle Beach"),
  p("aruba-beach-club", "Aruba Beach Club", "Hotels & resorts", "Eagle Beach"),
  p("tierra-del-sol", "Tierra del Sol Resort", "Hotels & resorts", "Malmok", { km: 19, min: 24 }),
  p("caribbean-palm-village", "Caribbean Palm Village Resort", "Hotels & resorts", "Noord"),
  p("renaissance", "Renaissance Aruba", "Hotels & resorts", "Oranjestad"),

  // ── Beaches ──
  p("eagle-beach", "Eagle Beach", "Beaches", "Eagle Beach"),
  p("palm-beach", "Palm Beach", "Beaches", "Palm Beach"),
  p("arashi-beach", "Arashi Beach", "Beaches", "Malmok", { km: 19, min: 25 }),
  p("boca-catalina", "Boca Catalina", "Beaches", "Malmok", { km: 18, min: 24 }),
  p("malmok-beach", "Malmok Beach", "Beaches", "Malmok"),
  p("flamingo-beach", "Flamingo Beach (Renaissance Island)", "Beaches", "Oranjestad", { meta: "Private island · via Renaissance dock" }),
  p("mangel-halto", "Mangel Halto", "Beaches", "Savaneta"),
  p("baby-beach", "Baby Beach", "Beaches", "San Nicolas", { km: -20, min: 35 }),

  // ── Sights & tours ──
  p("california-lighthouse", "California Lighthouse", "Sights & tours", "Malmok", { km: 20, min: 26 }),
  p("alto-vista-chapel", "Alto Vista Chapel", "Sights & tours", "Noord", { km: 16, min: 24, md: 24 }),
  p("casibari", "Casibari Rock Formations", "Sights & tours", "Paradera", { md: 20 }),
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
}

export function selFromPlace(place: Place): PlaceSel {
  return { id: place.id, name: place.name, area: place.area, km: place.km, min: place.min, mf: place.mf, md: place.md };
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
