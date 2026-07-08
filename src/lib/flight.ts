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

/** Canonical form for storage/display: "ua 1523" → "UA1523". */
export function formatFlightNumber(input: string): string {
  return input.trim().replace(/\s+/g, "").toUpperCase();
}
