import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const eq2 = vi.fn(() => ({ maybeSingle }));
const eq1 = vi.fn(() => ({ eq: eq2 }));
// The bulk path ends at .in().in() rather than at .maybeSingle(), so the
// builder has to answer both shapes from one select().
const inMany = vi.fn();
const in2 = vi.fn((_c: string, _v: string[]) => inMany());
const in1 = vi.fn((_c: string, _v: string[]) => ({ in: in2 }));
const select = vi.fn(() => ({ eq: eq1, in: in1 }));
const from = vi.fn((_table: string) => ({ select }));
vi.mock("../supabase", () => ({ supabase: { from: (t: string) => from(t) } }));

import { supabaseFlights } from "./supabaseFlights";
import KL765 from "./__fixtures__/kl765.json";

beforeEach(() => {
  maybeSingle.mockReset(); inMany.mockReset();
  from.mockClear(); in1.mockClear(); in2.mockClear();
});

describe("reading the answer somebody else paid for", () => {
  it("reads the row and parses it with the tested reader", async () => {
    maybeSingle.mockResolvedValue({ data: { raw: KL765, ok: true }, error: null });
    const f = await supabaseFlights.lookup("KL765", "2026-09-17");
    expect(from).toHaveBeenCalledWith("flight_status");
    // the AMS→AUA leg, not the AUA→BON departure
    expect(f?.scheduled).toBe("2026-09-17T21:55:00.000Z");
    expect(f?.airline).toBe("KLM");
  });

  it("says nothing when nobody has asked yet", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await supabaseFlights.lookup("KL765", "2026-09-17")).toBeNull();
  });

  // Two different nothings. Both leave the screen with the guest's own
  // words, but only one of them is a fact about the world.
  it("keeps 'no such flight' apart from 'could not ask'", async () => {
    maybeSingle.mockResolvedValue({ data: { raw: null, ok: true }, error: null });
    expect(await supabaseFlights.lookup("XX999", "2026-09-17")).toBeNull();
    maybeSingle.mockResolvedValue({ data: { raw: null, ok: false }, error: null });
    expect(await supabaseFlights.lookup("KL765", "2026-09-17")).toBeNull();
  });

  // The state before docs/flight-schema.sql has been run. It must not be
  // reported as "this flight does not exist".
  it("throws when the table isn't there, rather than inventing an answer", async () => {
    maybeSingle.mockResolvedValue({
      data: null, error: { message: 'relation "public.flight_status" does not exist' },
    });
    await expect(supabaseFlights.lookup("KL765", "2026-09-17"))
      .rejects.toThrow(/flight_status/);
  });
});

describe("reading a whole morning in one round trip", () => {
  it("asks for the flights and the days it was given, once", async () => {
    inMany.mockResolvedValue({
      data: [
        { flight: "KL765", day: "2026-09-17", raw: KL765, ok: true },
        // The cross product hands back a pair nobody asked about. It is
        // dropped here rather than filtered in a query string long
        // enough for a proxy to refuse.
        { flight: "KL765", day: "2026-09-18", raw: KL765, ok: true },
      ],
      error: null,
    });
    const known = await supabaseFlights.lookupMany!([
      { flight: "KL765", day: "2026-09-17" },
      { flight: "AA123", day: "2026-09-17" },
    ]);
    expect(from).toHaveBeenCalledTimes(1);
    expect(in1).toHaveBeenCalledWith("flight", ["KL765", "AA123"]);
    expect(in2).toHaveBeenCalledWith("day", ["2026-09-17"]);
    expect([...known.keys()]).toEqual(["KL765|2026-09-17"]);
    expect(known.get("KL765|2026-09-17")?.airline).toBe("KLM");
  });

  // Same two nothings as the single read. A row that says "we could not
  // ask" and a row that says "no such flight" both leave the board
  // silent, and neither is an error.
  it("keeps 'no such flight' apart from 'could not ask', and both from an answer", async () => {
    inMany.mockResolvedValue({
      data: [
        { flight: "XX999", day: "2026-09-17", raw: null, ok: true },
        { flight: "KL765", day: "2026-09-17", raw: null, ok: false },
      ],
      error: null,
    });
    const known = await supabaseFlights.lookupMany!([
      { flight: "XX999", day: "2026-09-17" },
      { flight: "KL765", day: "2026-09-17" },
    ]);
    expect(known.get("XX999|2026-09-17")).toBeNull();
    expect(known.get("KL765|2026-09-17")).toBeNull();
  });

  // A key with no row is left OUT rather than set to null, so "nobody
  // has asked yet" and "asked, nothing" are one absence to the board.
  it("leaves a flight nobody has asked about out of the answer", async () => {
    inMany.mockResolvedValue({ data: [], error: null });
    const known = await supabaseFlights.lookupMany!([{ flight: "KL765", day: "2026-09-17" }]);
    expect(known.size).toBe(0);
  });

  // The state before docs/flight-schema.sql has been run. Reported as an
  // empty board, it would read as "no flight is late" — the exact fault
  // this codebase keeps naming.
  it("throws when the table isn't there, rather than reporting an all-clear", async () => {
    inMany.mockResolvedValue({
      data: null, error: { message: 'relation "public.flight_status" does not exist' },
    });
    await expect(supabaseFlights.lookupMany!([{ flight: "KL765", day: "2026-09-17" }]))
      .rejects.toThrow(/flight_status/);
  });

  it("does not go to the database for an empty board", async () => {
    const known = await supabaseFlights.lookupMany!([]);
    expect(known.size).toBe(0);
    expect(from).not.toHaveBeenCalled();
  });
});
