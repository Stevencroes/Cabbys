import type { IconName } from "../components/Icon";

export type Category = "airport" | "hotels" | "beaches" | "dining" | "sights";

export interface Place {
  id: string;
  name: string; // matches pricing_locations where a row exists, so the fare engine resolves a zone/route
  category: Category;
  zone: string;
  meta?: string;
}

export interface CategoryDef {
  key: Category;
  label: string;
  icon: IconName;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "airport", label: "Airport", icon: "plane" },
  { key: "hotels", label: "Hotels", icon: "bed" },
  { key: "beaches", label: "Beaches", icon: "sun" },
  { key: "dining", label: "Dining", icon: "plate" },
  { key: "sights", label: "Sights", icon: "pin" },
];

// Curated Aruba quick-picks (sourced from the live Cabby's POI dataset).
// Live Mapbox geocoding handles anything not listed here; these are the fast taps.
export const PLACES: Place[] = [
  { id: "airport", name: "Queen Beatrix International Airport", category: "airport", zone: "AIRPORT", meta: "AUA · Oranjestad" },

  // ── Hotels & resorts ──
  { id: "ritz", name: "The Ritz-Carlton Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "hyatt", name: "Hyatt Regency Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "marriott", name: "Aruba Marriott Resort", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "hilton", name: "Hilton Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "barcelo", name: "Barceló Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "riu-palace-aruba", name: "RIU Palace Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "riu-palace-antillas", name: "RIU Palace Antillas", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "holiday-inn", name: "Holiday Inn Resort Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "playa-linda", name: "Playa Linda Beach Resort", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "the-mill", name: "The Mill Resort", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "brickell-bay", name: "Brickell Bay Beach Club", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "courtyard", name: "Courtyard by Marriott Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "embassy-suites", name: "Embassy Suites Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "divi", name: "Divi Aruba All Inclusive", category: "hotels", zone: "A", meta: "Druif Beach" },
  { id: "manchebo", name: "Manchebo Beach Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "la-cabana", name: "La Cabana Beach Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "costa-linda", name: "Costa Linda Beach Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "casa-del-mar", name: "Casa del Mar Beach Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "eagle-aruba", name: "Eagle Aruba Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "aruba-beach-club", name: "Aruba Beach Club", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "tierra-del-sol", name: "Tierra del Sol Resort", category: "hotels", zone: "A", meta: "Malmok" },
  { id: "caribbean-palm-village", name: "Caribbean Palm Village Resort", category: "hotels", zone: "A", meta: "Noord" },
  { id: "renaissance", name: "Renaissance Aruba", category: "hotels", zone: "B", meta: "Oranjestad" },

  // ── Beaches ──
  { id: "eagle-beach", name: "Eagle Beach", category: "beaches", zone: "A", meta: "Low-rise coast" },
  { id: "palm-beach", name: "Palm Beach", category: "beaches", zone: "A", meta: "High-rise coast" },
  { id: "arashi-beach", name: "Arashi Beach", category: "beaches", zone: "A", meta: "Northwest tip" },
  { id: "boca-catalina", name: "Boca Catalina", category: "beaches", zone: "A", meta: "Snorkel cove · Malmok" },
  { id: "malmok-beach", name: "Malmok Beach", category: "beaches", zone: "A", meta: "Malmok" },
  { id: "flamingo-beach", name: "Flamingo Beach (Renaissance Island)", category: "beaches", zone: "B", meta: "Private island" },
  { id: "mangel-halto", name: "Mangel Halto", category: "beaches", zone: "C", meta: "Savaneta" },
  { id: "baby-beach", name: "Baby Beach", category: "beaches", zone: "C", meta: "San Nicolas" },

  // ── Dining ──
  { id: "carte-blanche", name: "Carte Blanche", category: "dining", zone: "A", meta: "Chef's table · Noord" },
  { id: "papiamento", name: "Papiamento Restaurant", category: "dining", zone: "A", meta: "Garden dining · Noord" },
  { id: "gasparito", name: "Gasparito Restaurant", category: "dining", zone: "A", meta: "Noord" },
  { id: "barefoot", name: "Barefoot Restaurant", category: "dining", zone: "B", meta: "Beachfront · Oranjestad" },
  { id: "old-man-sea", name: "The Old Man & The Sea", category: "dining", zone: "B", meta: "Oranjestad" },
  { id: "yemanja", name: "Yemanja Woodfired Grill", category: "dining", zone: "B", meta: "Oranjestad" },

  // ── Sights & shopping ──
  { id: "oranjestad", name: "Oranjestad", category: "sights", zone: "B", meta: "Capital · shopping" },
  { id: "california-lighthouse", name: "California Lighthouse", category: "sights", zone: "A", meta: "Northwest point" },
  { id: "alto-vista-chapel", name: "Alto Vista Chapel", category: "sights", zone: "A", meta: "North coast" },
  { id: "casibari", name: "Casibari Rock Formations", category: "sights", zone: "B", meta: "Paradera" },
  { id: "arikok", name: "Arikok National Park", category: "sights", zone: "C", meta: "East · nature reserve" },
  { id: "butterfly-farm", name: "Butterfly Farm", category: "sights", zone: "A", meta: "Palm Beach" },
  { id: "philips-animal-garden", name: "Philip's Animal Garden", category: "sights", zone: "A", meta: "Noord" },
  { id: "palm-beach-plaza", name: "Palm Beach Plaza", category: "sights", zone: "A", meta: "Mall · Palm Beach" },
  { id: "paseo-herencia", name: "Paseo Herencia", category: "sights", zone: "A", meta: "Mall · Palm Beach" },
  { id: "village-mall", name: "The Village Mall", category: "sights", zone: "A", meta: "Mall · Palm Beach" },
  { id: "renaissance-mall", name: "Renaissance Mall", category: "sights", zone: "B", meta: "Mall · Oranjestad" },
];

export function placesByCategory(cat: Category): Place[] {
  return PLACES.filter((p) => p.category === cat);
}

export function findPlaceByName(name: string): Place | undefined {
  const n = name.trim().toLowerCase();
  return PLACES.find((p) => p.name.toLowerCase() === n);
}

export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.meta?.toLowerCase().includes(q) ?? false),
  );
}
