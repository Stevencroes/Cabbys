export type Vehicle = {
  id: string;
  name: string;
  pax: number;
  bags: number;
  mult: number;
  note: string;
  desc: string;
  /** cut-out photo of the car, served from /public/fleet */
  photo: string;
};

// Named the way §11 names them: tier plus body style, so the label tells a
// traveller what turns up. Two come straight from the mockup's home page —
// Luxury SUV at 1-4 and Premium Van at 1-7 match these cars exactly. Its
// other two, Executive Van (1-6) and Luxury Sprinter (1-12), describe
// vehicles this fleet does not run, so the sedans take the same grammar
// rather than a van's name. `name` now carries the class outright; the
// separate classLabel it used to sit beside said the same thing twice.
//
// Ids stay stable: they key the pricing multipliers and the rides rows the
// driver dashboard reads.
//
// `desc` names the car in public/fleet/<id>.png. The row shows the words and
// the picture together now, so a mismatch between them is not a detail — keep
// the two in step when either changes.
//
// `pax` is seats minus the driver, counted off the actual car — not the tier
// it is sold as. The SUV advertised 6 while the fleet still ran an Escalade;
// it is a Nautilus, a five-seater, so it takes four. Parties of five and six
// fall to the van, which is the only vehicle here that can carry them.
export const VEHICLES: Vehicle[] = [
  { id: "sedan",   name: "Executive Sedan", pax: 3, bags: 2, mult: 1.0,  note: "",            desc: "Ford Fusion or similar",     photo: "/fleet/sedan.png" },
  { id: "premium", name: "Luxury Sedan",    pax: 3, bags: 3, mult: 1.38, note: "Most chosen", desc: "Mercedes S-Class or similar", photo: "/fleet/premium.png" },
  { id: "suv",     name: "Luxury SUV",      pax: 4, bags: 5, mult: 1.6,  note: "",            desc: "Lincoln Nautilus or similar", photo: "/fleet/suv.png" },
  { id: "van",     name: "Premium Van",     pax: 7, bags: 8, mult: 2.05, note: "",            desc: "Ford Transit or similar",     photo: "/fleet/van.png" },
];

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
