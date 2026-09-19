import { describe, it, expect } from "vitest";
import { isAirportTransfer, isValidFlightNumber, formatFlightNumber } from "./flight";

describe("flight helpers", () => {
  it("detects airport transfers on either end", () => {
    expect(isAirportTransfer("Queen Beatrix International Airport", "Palm Beach")).toBe(true);
    expect(isAirportTransfer("Eagle Beach", "Queen Beatrix International Airport")).toBe(true);
    expect(isAirportTransfer("Eagle Beach", "Palm Beach")).toBe(false);
  });

  it("accepts IATA-shaped flight numbers", () => {
    expect(isValidFlightNumber("AA1234")).toBe(true);
    expect(isValidFlightNumber("ua 152")).toBe(true);
    expect(isValidFlightNumber("KL765a")).toBe(true);
    expect(isValidFlightNumber("12345678")).toBe(false);
    expect(isValidFlightNumber("")).toBe(false);
  });

  it("canonicalizes for storage", () => {
    expect(formatFlightNumber("ua 1523")).toBe("UA1523");
  });

  // One flight, three spellings: the boarding pass pads it, AeroDataBox
  // spaces it, the departure board does neither. They have to collapse
  // onto one string or the lookup silently never matches.
  it("collapses the spellings of one flight number onto each other", () => {
    for (const typed of ["KL0765", "KL 765", "kl765", " KL0765 "]) {
      expect(formatFlightNumber(typed)).toBe("KL765");
    }
    expect(formatFlightNumber("AA0001")).toBe("AA1");
    expect(formatFlightNumber("KL765a")).toBe("KL765A");
  });

  it("leaves something it doesn't recognise alone rather than mangling it", () => {
    expect(formatFlightNumber("not a flight")).toBe("NOTAFLIGHT");
  });
});

// ── airline codes that contain a digit ───────────────────────────────
//
// B6 is JetBlue, which flies into Aruba daily. The old pattern allowed
// only letters in the code, so it read "B61234" as airline "B" and
// flight "61234", found five digits where it wanted four, and called a
// real flight number invalid. useFlight checks validity before it looks
// anything up, so the effect was not a wrong answer on screen — it was
// no flight line at all, for a large share of the arrivals this feature
// exists to track, with nothing anywhere saying why.
describe("airline codes with a digit in them", () => {
  it("accepts them in both orders", () => {
    expect(isValidFlightNumber("B61234")).toBe(true);   // JetBlue
    expect(isValidFlightNumber("B6 1234")).toBe(true);
    expect(isValidFlightNumber("3M4020")).toBe(true);   // Silver
    expect(isValidFlightNumber("9K201")).toBe(true);
    expect(isValidFlightNumber("g37716")).toBe(true);
  });

  it("splits the code off at two characters, not at the first letter", () => {
    expect(formatFlightNumber("B6 1234")).toBe("B61234");
    expect(formatFlightNumber("b60123")).toBe("B6123");
    expect(formatFlightNumber("3M0020")).toBe("3M20");
  });

  // The guard the digit codes must not cost us. A code is two characters
  // and at least one of them is a letter, so a run of digits is still
  // not a flight — "12345678" must not read as airline "12".
  it("still refuses what was never a flight number", () => {
    expect(isValidFlightNumber("12345678")).toBe(false);
    expect(isValidFlightNumber("1234")).toBe(false);
    expect(isValidFlightNumber("AB")).toBe(false);        // a code with no flight
    expect(isValidFlightNumber("AB12345")).toBe(false);   // five digits is not one
  });

  // "A123" is airline A1, flight 23 — not airline "A", which is what the
  // old pattern read and is a code that does not exist. A3 is Aegean and
  // A5 is real, so the two-character read is the right one.
  it("reads a single leading letter as half of a code, never as all of one", () => {
    expect(formatFlightNumber("A123")).toBe("A123");
    expect(formatFlightNumber("A1 0023")).toBe("A123");
  });

  // The two normalisers — this one and the one in docs/flight-schema.sql
  // — decide the same key from opposite ends: the scheduler writes the
  // row, the browser reads it back. Anything this returns for a valid
  // number must be a string the SQL returns too, so the shapes are
  // pinned here rather than left to a reader to assume.
  it("leaves an already-canonical number alone", () => {
    for (const n of ["KL765", "AA1234", "B61234", "3M20", "JBU1234"]) {
      expect(formatFlightNumber(n)).toBe(n);
    }
  });
});
