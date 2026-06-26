export type Vehicle = {
  id: string;
  name: string;
  pax: number;
  bags: number;
  mult: number;
  note: string;
  desc: string;
};

export const VEHICLES: Vehicle[] = [
  { id: "sedan",   name: "Executive Sedan", pax: 3, bags: 3, mult: 1.0,  note: "",            desc: "Mercedes E-Class or similar" },
  { id: "premium", name: "Premium Sedan",   pax: 3, bags: 3, mult: 1.38, note: "Most chosen", desc: "Mercedes S-Class or similar" },
  { id: "suv",     name: "Luxury SUV",      pax: 6, bags: 5, mult: 1.6,  note: "",            desc: "Cadillac Escalade or similar" },
  { id: "van",     name: "Private Van",     pax: 7, bags: 8, mult: 2.05, note: "",            desc: "Mercedes V-Class or similar" },
];

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
