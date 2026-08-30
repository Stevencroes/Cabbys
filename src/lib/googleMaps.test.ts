import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { reportGoogleMapsFailure } from "./googleMaps";

/**
 * The maps fail soft by design, which means the console is the only place
 * the reason survives. These lock the reasons that matter, because the two
 * everyone hits — a key that never made it into the build, and one that
 * did but is no longer accepted — look identical on screen.
 */
describe("reportGoogleMapsFailure", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => { warn = vi.spyOn(console, "warn").mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it("names the build step when there is no key", async () => {
    // googleMapsEnabled is read once at import, and a developer's
    // .env.local would otherwise decide which branch this test exercises
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "");
    const fresh = await import("./googleMaps");
    fresh.reportGoogleMapsFailure("directions");
    expect(warn.mock.calls[0][0]).toMatch(/inlines it at build time/i);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("names all three APIs when a key is rejected, since one key covers them", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fresh = await import("./googleMaps");
    fresh.reportGoogleMapsFailure("directions", 403);
    expect(warn.mock.calls[0][0]).toMatch(/Maps JavaScript API.*Maps Static API.*Routes API/i);
    vi.resetModules();
  });

  it("says the same reason only once", () => {
    reportGoogleMapsFailure("gl", 401);
    reportGoogleMapsFailure("gl", 401);
    reportGoogleMapsFailure("gl", 401);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes("gl "))).toHaveLength(1);
  });

  it("keeps separate reasons separate", () => {
    reportGoogleMapsFailure("static image", 403);
    reportGoogleMapsFailure("static image", 429);
    expect(warn.mock.calls).toHaveLength(2);
  });
});

describe("the failure channel", () => {
  it("keeps the first reason, not the knock-ons that follow it", async () => {
    // the recorded reason is module state and lives for one page load, so
    // a test about the *first* one needs a module nobody has failed in yet
    vi.resetModules();
    const fresh = await import("./googleMaps");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const seen: string[] = [];
    const off = fresh.onMapFailure((r) => seen.push(r));
    // a failing map reports through several call sites in a row
    fresh.reportGoogleMapsFailure("gl", 403);
    fresh.reportGoogleMapsFailure("static image", 500);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^gl: /);
    expect(fresh.lastMapFailure()).toBe(seen[0]);
    off();
    warn.mockRestore();
    vi.resetModules();
  });
});

/**
 * A refused or restricted key does not throw anywhere in the normal call
 * path — Google renders a grey "for development purposes only" map instead
 * and calls a global function IF one exists. Missing this wiring means a
 * broken key looks, from this app's point of view, exactly like a key that
 * works: nothing here would ever hear about it.
 */
vi.mock("@googlemaps/js-api-loader", () => ({
  setOptions: vi.fn(),
  importLibrary: vi.fn(async () => ({})),
}));

type WithAuthFailure = { gm_authFailure?: () => void };
const win = window as unknown as WithAuthFailure;

describe("loadGoogleMaps", () => {
  beforeEach(() => { delete win.gm_authFailure; });

  it("wires window.gm_authFailure to the shared failure channel", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fresh = await import("./googleMaps");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    void fresh.loadGoogleMaps();
    expect(typeof win.gm_authFailure).toBe("function");
    win.gm_authFailure?.();
    expect(fresh.lastMapFailure()).toMatch(/^gl: /);
    warn.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Found by running the real Google runtime against a bad key: the map
  // "loads" and paints Google's own white "Oops! Something went wrong"
  // card over the panel. Nothing throws, nothing rejects. Without a
  // subscriber to hand over to the sketch, that card is what a customer
  // sees whenever an API is left un-enabled — strictly worse than this
  // app's own drawn fallback.
  it("tells subscribers when Google refuses the key", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fresh = await import("./googleMaps");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let heard = 0;
    const off = fresh.onGoogleAuthFailure(() => { heard++; });
    void fresh.loadGoogleMaps();
    win.gm_authFailure?.();
    expect(heard).toBe(1);
    off();
    warn.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("replays the refusal to a subscriber that arrived late", async () => {
    // gm_authFailure can fire before a component has mounted to hear it,
    // and a fallback that depends on having been listening at the right
    // moment is a fallback that sometimes does not happen.
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fresh = await import("./googleMaps");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    void fresh.loadGoogleMaps();
    win.gm_authFailure?.();
    let heard = 0;
    const off = fresh.onGoogleAuthFailure(() => { heard++; });
    expect(heard).toBe(1);
    off();
    warn.mockRestore();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("loads the script once and reuses the same promise on a second mount", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_GOOGLE_PLACES_KEY", "test-key");
    const fresh = await import("./googleMaps");
    const loaderMod = await import("@googlemaps/js-api-loader");
    // resetModules clears the module registry, not this mock's call log —
    // an earlier test's call would otherwise be counted as this test's
    vi.mocked(loaderMod.importLibrary).mockClear();
    const first = fresh.loadGoogleMaps();
    const second = fresh.loadGoogleMaps();
    expect(first).toBe(second);
    expect(loaderMod.importLibrary).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
