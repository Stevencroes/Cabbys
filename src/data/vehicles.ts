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

// §11's four categories, carrying the four cars this fleet actually runs.
// A tier is a CATEGORY, not a car: drivers turn up in their own vehicles, so
// `desc` names a representative one and says "or similar" because it means it.
//
//   Luxury SUV      Lincoln Nautilus     4 guests
//   Executive Van   Mercedes V-Class     6
//   Premium Van     Ford Transit         7
//   Luxury Sprinter Mercedes Sprinter   12
//
// There is no sedan tier. The fleet has no sedan in it — the two the site
// used to sell were left over from an older line-up, and a V-Class is a
// six-seat MPV whatever tier it is filed under. §11's own name for the 1-6
// rung is Executive Van, so that is what it is called here.
//
// The multipliers are the same four numbers as before, reassigned in order
// of size: nothing about the fare ladder moved, only which vehicle sits on
// each rung. A route that quoted $40 / $55 / $64 / $82 still does.
//
// Ordering by capacity is not cosmetic. Priced the other way — a six-seat
// V-Class below a four-seat SUV — the SUV would be both dearer and smaller,
// so the auto-fit would never once choose it.
//
// Ids key the pricing multipliers and the rides rows the driver dashboard
// reads. They changed with the fleet; rows written before this keep their old
// strings, which the driver screens render as plain text.
export const VEHICLES: Vehicle[] = [
  { id: "suv",      name: "Luxury SUV",      pax: 4,  bags: 5,  mult: 1.0,  note: "",            desc: "Lincoln Nautilus or similar",  photo: "/fleet/suv.png" },
  { id: "vclass",   name: "Executive Van",   pax: 6,  bags: 6,  mult: 1.38, note: "Most chosen", desc: "Mercedes V-Class or similar",  photo: "/fleet/vclass.png" },
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
