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
