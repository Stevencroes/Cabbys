export type Vehicle = {
  id: string;
  name: string;
  pax: number;
  bags: number;
  mult: number;
  note: string;
  desc: string;
  /** class label on the fleet card bar */
  classLabel: string;
  /** cut-out photo of the car, served from /public/fleet */
  photo: string;
};

// Fleet named like companions, not categories. Ids stay stable: they key
// the pricing multipliers and the rides rows the driver dashboard reads.
export const VEHICLES: Vehicle[] = [
  { id: "sedan",   name: "The Saloon",  pax: 3, bags: 2, mult: 1.0,  note: "",            desc: "Mercedes E-Class or similar", classLabel: "Executive sedan", photo: "/fleet/sedan.png" },
  { id: "premium", name: "The Grand",   pax: 3, bags: 3, mult: 1.38, note: "Most chosen", desc: "Mercedes S-Class or similar", classLabel: "First class",      photo: "/fleet/premium.png" },
  { id: "suv",     name: "The Scout",   pax: 6, bags: 5, mult: 1.6,  note: "",            desc: "Cadillac Escalade or similar", classLabel: "Luxury SUV",      photo: "/fleet/suv.png" },
  { id: "van",     name: "The Voyager", pax: 7, bags: 8, mult: 2.05, note: "",            desc: "Mercedes V-Class or similar", classLabel: "Luxury van",      photo: "/fleet/van.png" },
];

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
