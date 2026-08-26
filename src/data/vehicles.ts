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

// The four categories, carrying the four cars this fleet actually runs.
// A tier is a CATEGORY, not a car: drivers arrive in their own vehicles, so
// `desc` names a representative one and says "or similar" because it means it.
//
//   Executive Sedan   Mercedes E-Class     3 guests   $40
//   Luxury SUV        Lincoln Nautilus     4          $55
//   Premium Van       Ford Transit         7          $64
//   Luxury Sprinter   Mercedes Sprinter   12          $82
//
// The first rung was briefly filed as "Executive Van, 1-6, Mercedes V-Class".
// The photograph settles it: fleet/sedan.png is a four-door Mercedes saloon,
// not an MPV, so the tier is a sedan and seats three. Trusting the picture
// over the label is the rule that has caught every one of these.
//
// Multipliers are the same four numbers this site has always used, ordered by
// size, so a route quoting $40 / $55 / $64 / $82 still does. Ordering by
// capacity is load-bearing: priced the other way the smaller car would be the
// dearer one, and the auto-fit would never choose it.
//
// Ids key the multipliers and the rides rows the driver dashboard reads. Rows
// written before this keep their old strings, which those screens render as
// plain text.
export const VEHICLES: Vehicle[] = [
  { id: "sedan",    name: "Executive Sedan", pax: 3,  bags: 3,  mult: 1.0,  note: "",            desc: "Mercedes E-Class or similar",  photo: "/fleet/sedan.png" },
  { id: "suv",      name: "Luxury SUV",      pax: 4,  bags: 5,  mult: 1.38, note: "Most chosen", desc: "Lincoln Nautilus or similar",  photo: "/fleet/suv.png" },
  { id: "transit",  name: "Premium Van",     pax: 7,  bags: 8,  mult: 1.6,  note: "",            desc: "Ford Transit or similar",      photo: "/fleet/transit.png" },
  { id: "sprinter", name: "Luxury Sprinter", pax: 12, bags: 12, mult: 2.05, note: "",            desc: "Mercedes Sprinter or similar", photo: "/fleet/sprinter.png" },
];

/** The largest party and load the fleet can take — what the guest and bag
    steppers are allowed to reach. Derived, so adding a bigger vehicle raises
    the ceiling by itself instead of leaving a number behind in a component. */
export const MAX_PAX = Math.max(...VEHICLES.map((v) => v.pax));
export const MAX_BAGS = Math.max(...VEHICLES.map((v) => v.bags));

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
