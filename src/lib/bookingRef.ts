// Human bookings deserve human references — "CB-7KM4Q", not a UUID.
// Alphabet omits 0/O, 1/I/L so the code survives a phone call.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 5;

function randomIndices(count: number): number[] {
  const out: number[] = [];
  const cryptoObj = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(count);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < count; i++) out.push(buf[i] % ALPHABET.length);
  } else {
    for (let i = 0; i < count; i++) out.push(Math.floor(Math.random() * ALPHABET.length));
  }
  return out;
}

export function generateBookingRef(): string {
  const code = randomIndices(LENGTH).map((i) => ALPHABET[i]).join("");
  return `CB-${code}`;
}

/** Stable short ref derived from a ride id — fallback for rows without booking_ref. */
export function refFromRideId(rideId: string): string {
  const clean = rideId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  let code = "";
  for (let i = 0; i < clean.length && code.length < LENGTH; i++) {
    const ch = clean[i];
    if (ALPHABET.includes(ch)) code += ch;
  }
  while (code.length < LENGTH) code += ALPHABET[(rideId.length * 7 + code.length) % ALPHABET.length];
  return `CB-${code}`;
}
