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

/** Bumped whenever the files in public/fleet change. A browser keeps an
    image by its URL, and the files keep their names (the README asks for
    exactly these), so after the left-facing set replaced the right-facing
    one, returning visitors got the new card framing drawn around their
    cached OLD photos — cars facing right, cropped on the right, so the
    crop took their fronts. A new query string is a new image to them. */
const PHOTO_V = "?v=2";

// The four categories, carrying the four cars this fleet actually runs.
// A tier is a CATEGORY, not a car: drivers arrive in their own vehicles, so
// `desc` names a representative one and says "or similar" because it means it.
//
//   Sedan           Mercedes E-Class     3 guests   $40
//   SUV             Lincoln Nautilus     4          $55
//   Passenger Van   Ford Transit         7          $64
//   Sprinter        Mercedes Sprinter   12          $82
//
// The names are the plain kind of car, as the owner named them. They were
// "Executive Sedan", "Luxury SUV", "Premium Van" and "Luxury Sprinter" until
// October 2026. "Passenger Van" keeps its qualifier where the others lost
// theirs: a bare "Van" reads as a delivery van, not the seven-seater.
//
// The first rung was briefly filed as "Executive Van, 1-6, Mercedes V-Class".
// The photograph settles it: fleet/sedan.webp is a four-door Mercedes saloon,
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
// plain text. A `name` is display only: no row, price or lookup is keyed on
// it (rides store the id in vehicle_class / vehicle_type), so renaming one
// orphans nothing. api/booking-alerts.ts keeps its own copy, VEHICLE_NAMES,
// which src/server/bookingAlerts.test.ts holds equal to this list.
export const VEHICLES: Vehicle[] = [
  { id: "sedan",    name: "Sedan",         pax: 3,  bags: 3,  mult: 1.0,  note: "",            desc: "Mercedes E-Class or similar",  photo: `/fleet/sedan.webp${PHOTO_V}` },
  { id: "suv",      name: "SUV",           pax: 4,  bags: 5,  mult: 1.38, note: "Most chosen", desc: "Lincoln Nautilus or similar",  photo: `/fleet/suv.webp${PHOTO_V}` },
  { id: "transit",  name: "Passenger Van", pax: 7,  bags: 8,  mult: 1.6,  note: "",            desc: "Ford Transit or similar",      photo: `/fleet/transit.webp${PHOTO_V}` },
  { id: "sprinter", name: "Sprinter",      pax: 12, bags: 12, mult: 2.05, note: "",            desc: "Mercedes Sprinter or similar", photo: `/fleet/sprinter.webp${PHOTO_V}` },
];

/** The largest party and load the fleet can take — what the guest and bag
    steppers are allowed to reach. Derived, so adding a bigger vehicle raises
    the ceiling by itself instead of leaving a number behind in a component. */
export const MAX_PAX = Math.max(...VEHICLES.map((v) => v.pax));
export const MAX_BAGS = Math.max(...VEHICLES.map((v) => v.bags));

export function fitsParty(v: Vehicle, passengers: number, luggage: number): boolean {
  return passengers <= v.pax && luggage <= v.bags;
}
