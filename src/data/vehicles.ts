export type Vehicle = {
  id: string;
  name: string;
  pax: number;
  bags: number;
  mult: number;
  note: string;
  desc: string;
};

// Fleet names follow the "Jet-Set / Golden Hour" register — named like
// companions, not categories. Ids stay stable: they key the pricing engine
// multipliers and the rides rows the driver dashboard reads.
export const VEHICLES: Vehicle[] = [
  { id: "sedan",   name: "The Saloon",  pax: 3, bags: 3, mult: 1.0,  note: "",            desc: "Mercedes E-Class or similar" },
  { id: "premium", name: "The Grand",   pax: 3, bags: 3, mult: 1.38, note: "Most chosen", desc: "Mercedes S-Class or similar" },
  { id: "suv",     name: "The Scout",   pax: 6, bags: 5, mult: 1.6,  note: "",            desc: "Cadillac Escalade or similar" },
  { id: "van",     name: "The Voyager", pax: 7, bags: 8, mult: 2.05, note: "",            desc: "Mercedes V-Class or similar" },
];

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
