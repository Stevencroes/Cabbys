import { describe, it, expect, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const eq2 = vi.fn(() => ({ maybeSingle }));
const eq1 = vi.fn(() => ({ eq: eq2 }));
const select = vi.fn(() => ({ eq: eq1 }));
const from = vi.fn((_table: string) => ({ select }));
vi.mock("../supabase", () => ({ supabase: { from: (t: string) => from(t) } }));

import { supabaseFlights } from "./supabaseFlights";
import KL765 from "./__fixtures__/kl765.json";

beforeEach(() => { maybeSingle.mockReset(); from.mockClear(); });

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
