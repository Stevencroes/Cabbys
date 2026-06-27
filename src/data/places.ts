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

export const PLACES: Place[] = [
  { id: "airport", name: "Queen Beatrix International Airport", category: "airport", zone: "AIRPORT", meta: "AUA · Oranjestad" },

  { id: "renaissance", name: "Renaissance Aruba", category: "hotels", zone: "A", meta: "Oranjestad" },
  { id: "manchebo", name: "Manchebo Beach Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "hilton", name: "Hilton Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "hyatt", name: "Hyatt Regency Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "marriott", name: "Aruba Marriott Resort", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "ritz", name: "The Ritz-Carlton Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },

  { id: "eagle-beach", name: "Eagle Beach", category: "beaches", zone: "A", meta: "Low-rise coast" },
  { id: "palm-beach", name: "Palm Beach", category: "beaches", zone: "A", meta: "High-rise coast" },
  { id: "baby-beach", name: "Baby Beach", category: "beaches", zone: "C", meta: "San Nicolas" },

  { id: "carte-blanche", name: "Carte Blanche", category: "dining", zone: "A", meta: "Chef's table · Noord" },
  { id: "papiamento", name: "Papiamento Restaurant", category: "dining", zone: "A", meta: "Garden dining · Noord" },

  { id: "california-lighthouse", name: "California Lighthouse", category: "sights", zone: "A", meta: "West coast" },
  { id: "oranjestad", name: "Oranjestad", category: "sights", zone: "A", meta: "Capital · shopping" },
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
