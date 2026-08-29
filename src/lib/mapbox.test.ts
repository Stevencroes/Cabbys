import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanToken, mapDebugOn, reportMapboxFailure } from "./mapbox";

/**
 * The maps fail soft by design, which means the console is the only place
 * the reason survives. These lock the reasons that matter, because the two
 * everyone hits — a token that never made it into the build, and one that
 * did but is no longer accepted — look identical on screen.
 */
describe("reportMapboxFailure", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it("names the build step when there is no token", async () => {
    // mapboxEnabled is read once at import, and a developer's .env.local
    // would otherwise decide which branch this test exercises
    vi.resetModules();
    vi.stubEnv("VITE_MAPBOX_TOKEN", "");
    const fresh = await import("./mapbox");
    fresh.reportMapboxFailure("directions");
    expect(warn.mock.calls[0][0]).toMatch(/inlines it at build time/i);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("says the same reason only once", () => {
    reportMapboxFailure("gl", 401);
    reportMapboxFailure("gl", 401);
    reportMapboxFailure("gl", 401);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("gl "))).toHaveLength(1);
  });

  it("keeps separate reasons separate", () => {
    reportMapboxFailure("static image", 403);
    reportMapboxFailure("static image", 429);
    expect(warn.mock.calls).toHaveLength(2);
  });
});

describe("cleanToken", () => {
  it("survives the ways a token arrives from a dashboard field", () => {
    expect(cleanToken("  pk.abc  ")).toBe("pk.abc");
    expect(cleanToken("pk.abc\n")).toBe("pk.abc");
    expect(cleanToken('"pk.abc"')).toBe("pk.abc");
    expect(cleanToken("'pk.abc'")).toBe("pk.abc");
    expect(cleanToken(' "pk.abc" ')).toBe("pk.abc");
  });

  it("treats a missing or blank value as no token", () => {
    expect(cleanToken(undefined)).toBe("");
    expect(cleanToken("")).toBe("");
    expect(cleanToken("   ")).toBe("");
  });
});

describe("the on-page debug channel", () => {
  it("stays off unless the URL asks for it", () => {
    // jsdom's default location carries no query
    expect(mapDebugOn()).toBe(false);
  });

  it("keeps the first reason, not the knock-ons that follow it", async () => {
    // the recorded reason is module state and lives for one page load, so
    // a test about the *first* one needs a module nobody has failed in yet
    vi.resetModules();
    const fresh = await import("./mapbox");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: string[] = [];
    const off = fresh.onMapFailure((r) => seen.push(r));
    // a failing style reports through several call sites in a row
    fresh.reportMapboxFailure("gl", 403);
    fresh.reportMapboxFailure("static image", 500);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^gl: /);
    expect(fresh.lastMapFailure()).toBe(seen[0]);
    off();
    warn.mockRestore();
    vi.resetModules();
  });
});

/**
 * What comes back from Mapbox and what a row can show are not the same
 * shape. These lock the three transforms in between, because each one was a
 * visible defect in the panel before it existed.
 */
describe("geocode", () => {
  const feature = (f: Record<string, unknown>) => ({
    id: "poi.1", place_type: ["poi"], center: [-70.04, 12.58], ...f,
  });
  async function withFeatures(features: unknown[], query = "manche") {
    vi.resetModules();
    vi.stubEnv("VITE_MAPBOX_TOKEN", "pk.test");
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ features }) }));
    vi.stubGlobal("fetch", fetchMock);
    const fresh = await import("./mapbox");
    const out = await fresh.geocode(query);
    return { out, fetchMock };
  }
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("rejoins a house number with its street", async () => {
    // Mapbox splits them: text is the street, address is the number. On its
    // own, "34" is not a place anyone recognises.
    const { out } = await withFeatures([feature({
      id: "address.9", place_type: ["address"], text: "Sasakiweg", address: "34",
      place_name: "Sasakiweg 34, Oranjestad, Aruba",
    })]);
    expect(out[0].name).toBe("Sasakiweg 34");
    expect(out[0].kind).toBe("address");
  });

  it("does not spend the second line repeating the first", async () => {
    // place_name leads with the name already shown in bold above it
    const { out } = await withFeatures([feature({
      text: "Manchebo Beach Resort",
      place_name: "Manchebo Beach Resort, J.E. Irausquin Blvd 55, Oranjestad, Aruba",
    })]);
    expect(out[0].name).toBe("Manchebo Beach Resort");
    expect(out[0].address).toBe("J.E. Irausquin Blvd 55, Oranjestad");
  });

  it("falls back to the island when the name is the whole address", async () => {
    const { out } = await withFeatures([feature({
      place_type: ["place"], text: "Tanki Leendert", place_name: "Tanki Leendert, Aruba",
    })]);
    expect(out[0].address).toBe("Aruba");
  });

  it("drops a result it could not price", async () => {
    // No centre means no area, and no area means no fare. A row we cannot
    // price is worse than one we never showed.
    const { out } = await withFeatures([
      feature({ id: "poi.a", text: "With coords" }),
      feature({ id: "poi.b", text: "No coords", center: undefined }),
    ]);
    expect(out.map((s) => s.name)).toEqual(["With coords"]);
  });

  it("asks Aruba only, and says so in the request", async () => {
    const { fetchMock } = await withFeatures([]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("country=aw");
    expect(url).toContain("bbox=");
    expect(url).toContain("autocomplete=true");
  });
});
