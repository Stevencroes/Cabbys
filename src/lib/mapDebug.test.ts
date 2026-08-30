import { describe, it, expect } from "vitest";
import { mapDebugOn, traceMap, mapTrace, onMapTrace, buildLine } from "./mapDebug";

describe("the on-page debug channel", () => {
  it("stays off unless the URL asks for it", () => {
    // jsdom's default location carries no query
    expect(mapDebugOn()).toBe(false);
  });
});

describe("traceMap", () => {
  it("keeps an ordered, capped log that listeners hear about", () => {
    const seen: number[] = [];
    const off = onMapTrace(() => seen.push(mapTrace().length));
    traceMap("one");
    traceMap("two");
    const log = mapTrace();
    expect(log[log.length - 2]).toMatch(/one$/);
    expect(log[log.length - 1]).toMatch(/two$/);
    expect(seen.length).toBeGreaterThanOrEqual(2);
    off();
  });
});

describe("buildLine", () => {
  it("carries whatever caller-specific line it is given", () => {
    expect(buildLine("Google key NONE")).toContain("Google key NONE");
    expect(buildLine("Google key NONE")).toMatch(/^build /);
  });
});
