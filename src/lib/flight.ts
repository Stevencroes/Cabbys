// Flight helpers — Cabby's meets flights, not clocks.

/** True when either end of the trip is the airport (AUA). */
export function isAirportTransfer(from: string, to: string): boolean {
  const isAirport = (s: string) => s.toLowerCase().includes("airport");
  return isAirport(from) || isAirport(to);
}

/**
 * The two shapes a flight number can take, split into airline and number.
 *
 * An IATA airline designator is two characters and EITHER of them may be
 * a digit: B6 is JetBlue, 3M is Silver, 8T and 9K are real. "Two or
 * three letters" only looks like the rule because the codes everyone
 * pictures — KL, AA, UA — happen to obey it. The pattern that assumed it
 * read B61234 as airline "B" and flight "61234", failed its own
 * four-digit check, and so threw away every JetBlue arrival before it
 * ever reached the lookup. On an island JetBlue flies into daily, that
 * was most of the point of flight tracking.
 *
 * Deliberately two anchored patterns rather than one with an alternation
 * in the middle: docs/flight-schema.sql has to normalise to the SAME
 * string, because the scheduler writes the row under that key and the
 * browser reads it back by that key. A disagreement between the two
 * engines is not an error, it is a row nobody ever finds. Two patterns
 * whose first characters cannot both match leave nothing for a regex
 * engine to have an opinion about. Change one, change the other.
 */
const LETTER_CODE = /^([A-Z]{2,3})0*(\d{1,4}[A-Z]?)$/;
const DIGIT_CODE = /^([A-Z]\d|\d[A-Z])0*(\d{1,4}[A-Z]?)$/;

/** Loose IATA shape: "AA123", "ua 1523", "KL765a", "B6 1234", "3M4020". */
export function isValidFlightNumber(input: string): boolean {
  const flat = input.trim().replace(/\s+/g, "").toUpperCase();
  return LETTER_CODE.test(flat) || DIGIT_CODE.test(flat);
}

/**
 * Canonical form for storage, display and MATCHING: "ua 1523" → "UA1523".
 *
 * The leading zero is the part that matters and the part that is easy to
 * miss. A guest types KL0765 because that is what their boarding pass
 * says; AeroDataBox answers "KL 765"; a departure board writes KL765.
 * All three are one flight, and a comparison that keeps the padding
 * quietly decides they are three — which does not crash, it just never
 * finds the flight, on a screen whose whole job is finding it.
 */
export function formatFlightNumber(input: string): string {
  const flat = input.trim().replace(/\s+/g, "").toUpperCase();
  const parts = LETTER_CODE.exec(flat) ?? DIGIT_CODE.exec(flat);
  return parts ? `${parts[1]}${parts[2]}` : flat;
}
