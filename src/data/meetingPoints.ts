// Where, exactly, to stand.
//
// An address gets a driver to a property. It does not tell them which of a
// resort's four entrances the guest is standing at, or that the airport's
// transfer bay is not where the taxi rank is. That last hundred metres is
// where transfers actually go wrong, and it is knowledge Cabby's has and
// the booking never asks for — so it belongs here, keyed by the place ids
// data/places.ts already defines, rather than being typed into a note by
// a guest who has never been.
//
// ─────────────────────────────────────────────────────────────────────
// THE ENTRIES BELOW ARE SAFE DEFAULTS, NOT SURVEYED FACT.
//
// "Main lobby entrance" is true of essentially every resort and is worth
// saying. "Arrivals — Exit 3" would be worth far more and is NOT written
// here, because nobody has confirmed which exit Cabby's cars actually
// use, and a confidently wrong bay number is worse than no bay number:
// the driver stops believing the field. Replace these with the real ones
// as they are confirmed — one line each, no schema change, no deploy
// beyond this file.
// ─────────────────────────────────────────────────────────────────────
import { AIRPORT_ID, findPlaceByName, type PlaceGroup } from "./places";

export interface MeetingPoint {
  /** where to wait, in three or four words — "Main lobby entrance" */
  at: string;
  /** how to get to it, when the property makes that non-obvious */
  how?: string;
}

/**
 * Per-property, where Cabby's knows better than the default.
 * Keyed by the ids in data/places.ts — the same ids the rest of the app
 * already prices and maps by, so there is one catalog, not two.
 */
const BY_PLACE: Record<string, MeetingPoint> = {
  [AIRPORT_ID]: {
    at: "Arrivals — transfer pickup area",
    how: "Meet the guest inside arrivals. Wait in the designated private-transfer bay, not the taxi rank.",
  },
  "cruise-terminal": {
    at: "Terminal forecourt",
    how: "Cars wait on the road side of the terminal building, past the taxi line.",
  },
};

/**
 * What to say when the property has no entry of its own. A default that
 * is true nearly everywhere beats a blank: "main lobby entrance" is
 * where a chauffeur waits at a resort, and saying so is what stops a
 * driver circling a property looking for a beach gate.
 */
const BY_GROUP: Partial<Record<PlaceGroup, MeetingPoint>> = {
  "Hotels & resorts": { at: "Main lobby entrance" },
  "Airport & port": { at: "Main terminal entrance" },
  Beaches: { at: "Main beach entrance / car park" },
  Shopping: { at: "Main entrance" },
};

/**
 * The meeting point for a pickup, by the name stored on the ride.
 *
 * Null for anything not in the catalog — a villa, a typed address. That
 * is honest: Cabby's has no standing knowledge of a private address, and
 * inventing "main entrance" for a house would be filling a field rather
 * than answering a question.
 */
export function meetingPointFor(placeName: string): MeetingPoint | null {
  const place = findPlaceByName(placeName);
  if (!place) return null;
  return BY_PLACE[place.id] ?? BY_GROUP[place.group] ?? null;
}
