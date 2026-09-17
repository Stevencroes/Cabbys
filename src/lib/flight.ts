// Flight helpers — Cabby's meets flights, not clocks.

/** True when either end of the trip is the airport (AUA). */
export function isAirportTransfer(from: string, to: string): boolean {
  const isAirport = (s: string) => s.toLowerCase().includes("airport");
  return isAirport(from) || isAirport(to);
}

/** Loose IATA shape: "AA123", "ua 1523", "KL765a". */
export function isValidFlightNumber(input: string): boolean {
  return /^[A-Za-z]{1,3}\s?\d{1,4}[A-Za-z]?$/.test(input.trim());
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
  const parts = /^([A-Z]{1,3})0*(\d{1,4})([A-Z]?)$/.exec(flat);
  return parts ? `${parts[1]}${parts[2]}${parts[3]}` : flat;
}
