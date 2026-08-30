import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * What comes back from Google's Places Text Search (New) and what a row
 * can show are not the same shape. These lock the transforms in between —
 * each one already burned once, in the Mapbox version this replaced.
 */
describe("geocode", () => {
  const place = (p: Record<string, unknown>) => ({
    id: "place.1", types: ["point_of_interest"],
    location: { latitude: 12.58, longitude: -70.04 },
    ...p,
  });
  async function withPlaces(places: unknown[], query = "manche") {
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({ places }) }));
    vi.stubGlobal("fetch", fetchMock);
    const fresh = await import("./places");
    const ans = await fresh.geocode(query);
    return { out: ans.results, ans, fetchMock };
  }
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

  it("reads the name and address Google actually returns", async () => {
    const { out } = await withPlaces([place({
      id: "ChIJ-address9", types: ["street_address"],
      displayName: { text: "Sasakiweg 34" },
      formattedAddress: "Sasakiweg 34, Oranjestad, Aruba",
    })]);
    expect(out[0].name).toBe("Sasakiweg 34");
    expect(out[0].kind).toBe("address");
  });

  it("does not spend the second line repeating the first", async () => {
    // formattedAddress leads with the name already shown in bold above it
    const { out } = await withPlaces([place({
      displayName: { text: "Manchebo Beach Resort" },
      formattedAddress: "Manchebo Beach Resort, J.E. Irausquin Blvd 55, Oranjestad, Aruba",
    })]);
    expect(out[0].name).toBe("Manchebo Beach Resort");
    expect(out[0].address).toBe("J.E. Irausquin Blvd 55, Oranjestad");
  });

  it("falls back to the island when the name is the whole address", async () => {
    const { out } = await withPlaces([place({
      types: ["locality"], displayName: { text: "Tanki Leendert" },
      formattedAddress: "Tanki Leendert, Aruba",
    })]);
    expect(out[0].address).toBe("Aruba");
    expect(out[0].kind).toBe("place");
  });

  it("drops a result it could not price", async () => {
    // No location means no area, and no area means no fare. A row we
    // cannot price is worse than one we never showed.
    const { out } = await withPlaces([
      place({ id: "a", displayName: { text: "With coords" } }),
      place({ id: "b", displayName: { text: "No coords" }, location: undefined }),
    ]);
    expect(out.map((s) => s.name)).toEqual(["With coords"]);
  });

  it("asks Aruba only, and pays for no more than a row can show", async () => {
    const { fetchMock } = await withPlaces([]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.headers).toMatchObject({ "X-Goog-Api-Key": "test-key" });
    // field-masked, so a request never bills for a field no row displays
    expect(init.headers).toMatchObject({
      "X-Goog-FieldMask": expect.stringContaining("places.location"),
    });
    const body = JSON.parse(init.body as string);
    expect(body.regionCode).toBe("AW");
    expect(body.locationRestriction.rectangle.low.latitude).toBeCloseTo(12.40);
    expect(body.textQuery).toContain(query_text());
    function query_text() { return "manche"; }
  });

  // Four very different failures used to produce one identical outcome: the
  // panel quietly offering to guess an area. Nobody could tell a rejected
  // key from a street Google has never heard of, which is why "it doesn't
  // work" had no next step.
  it("says which kind of nothing it got", async () => {
    const { ans } = await withPlaces([]);
    expect(ans.status).toBe("empty");

    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })));
    const denied = await (await import("./places")).geocode("manche");
    expect(denied.status).toBe("http");
    expect(denied.httpStatus).toBe(403);

    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("boom"); }));
    const dead = await (await import("./places")).geocode("manche");
    expect(dead.status).toBe("network");

    // and the one that needs a rebuild rather than a fix
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "");
    const off = await (await import("./places")).geocode("manche");
    expect(off.status).toBe("off");
    expect(off.results).toEqual([]);
  });

  it("tells a traveller the way forward and a maintainer the cause", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fresh = await import("./places");

    // no flag: what to do next, and nothing about keys or codes
    const plain = fresh.geoStatusLine("http", 403);
    expect(plain).toMatch(/type your address and pick an area/i);
    expect(plain).not.toMatch(/key|403/i);

    // ?mapdebug=1 — the flag the maps already use — names the cause
    const url = new URL(window.location.href);
    url.search = "?mapdebug=1";
    history.replaceState({}, "", url);
    expect(fresh.geoStatusLine("http", 403)).toMatch(/allow list|billing/i);
    expect(fresh.geoStatusLine("http", 400)).toMatch(/Places API \(New\)/i);
    expect(fresh.geoStatusLine("off")).toMatch(/BUILD time/i);
    // a search that ran and found nothing is not a failure
    expect(fresh.geoStatusLine("empty")).toMatch(/Every address in Aruba/i);
    history.replaceState({}, "", "/");
  });
});

describe("cleanPlacesKey", () => {
  it("survives the ways a key arrives from a dashboard field", async () => {
    const { cleanPlacesKey } = await import("./places");
    expect(cleanPlacesKey("  AIzaAbc  ")).toBe("AIzaAbc");
    expect(cleanPlacesKey("AIzaAbc\n")).toBe("AIzaAbc");
    expect(cleanPlacesKey('"AIzaAbc"')).toBe("AIzaAbc");
  });

  it("treats a missing or blank value as no key", async () => {
    const { cleanPlacesKey } = await import("./places");
    expect(cleanPlacesKey(undefined)).toBe("");
    expect(cleanPlacesKey("")).toBe("");
    expect(cleanPlacesKey("   ")).toBe("");
  });
});
