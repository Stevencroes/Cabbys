import { describe, it, expect } from "vitest";
import { VERIFIED_REVIEWS, verifiedOnly, whyNotShown, type Review } from "./reviews";

const NOW = Date.parse("2026-09-23T12:00:00Z");

const good = (over: Partial<Review> = {}): Review => ({
  text: "On time, and the car was spotless.",
  author: "M. de V.",
  rating: 5,
  platform: "Google",
  sourceUrl: "https://maps.app.goo.gl/abc123",
  date: "2026-09-01",
  ...over,
});

// The guard that matters most. Whatever is in the shipped list must pass,
// so a typo in a real review fails the build instead of silently removing
// it from the page — and nothing unsourced can be added without a link to
// the platform it supposedly came from.
describe("the shipped list", () => {
  it("contains nothing that would be dropped", () => {
    for (const r of VERIFIED_REVIEWS) expect(whyNotShown(r)).toBeNull();
  });

  // The claims that were removed. None of them may come back through the
  // data file, verified-looking or not.
  it("carries none of the invented claims", () => {
    const all = JSON.stringify(VERIFIED_REVIEWS);
    expect(all).not.toMatch(/Jessica/i);
    expect(all).not.toMatch(/made our trip in Aruba effortless/i);
  });
});

describe("what counts as verifiable", () => {
  it("accepts a complete entry", () => {
    expect(whyNotShown(good(), NOW)).toBeNull();
  });

  it("refuses an entry with nothing to click through to", () => {
    expect(whyNotShown(good({ sourceUrl: "" }), NOW)).toMatch(/URL/);
    expect(whyNotShown(good({ sourceUrl: "not a link" }), NOW)).toMatch(/URL/);
  });

  it("refuses plain http", () => {
    expect(whyNotShown(good({ sourceUrl: "http://g.page/cabbys" }), NOW)).toMatch(/https/);
  });

  // A link to a domain the platform does not own is not evidence of a
  // review on that platform — and a Tripadvisor review with a Google URL
  // is a data-entry mistake worth catching.
  it("refuses a link that is not on the named platform", () => {
    expect(whyNotShown(good({ platform: "Tripadvisor" }), NOW)).toMatch(/not on Tripadvisor/);
    expect(whyNotShown(good({ platform: "Trustpilot", sourceUrl: "https://trustpilot.example.com/r" }), NOW))
      .toMatch(/not on Trustpilot/);
    expect(whyNotShown(good({ sourceUrl: "https://notgoogle.com/r" }), NOW)).toMatch(/not on Google/);
  });

  it("accepts each platform on its own domains", () => {
    expect(whyNotShown(good({ sourceUrl: "https://www.google.com/maps/reviews/x" }), NOW)).toBeNull();
    expect(whyNotShown(good({ platform: "Tripadvisor", sourceUrl: "https://www.tripadvisor.co.uk/r" }), NOW)).toBeNull();
    expect(whyNotShown(good({ platform: "Trustpilot", sourceUrl: "https://nl.trustpilot.com/reviews/x" }), NOW)).toBeNull();
  });

  it("refuses a rating that is not a whole point from 1 to 5", () => {
    expect(whyNotShown(good({ rating: 0 as Review["rating"] }), NOW)).toMatch(/rating/);
    expect(whyNotShown(good({ rating: 6 as Review["rating"] }), NOW)).toMatch(/rating/);
    expect(whyNotShown(good({ rating: 4.5 as Review["rating"] }), NOW)).toMatch(/rating/);
  });

  it("refuses missing words or a missing author", () => {
    expect(whyNotShown(good({ text: "   " }), NOW)).toMatch(/text/);
    expect(whyNotShown(good({ author: "" }), NOW)).toMatch(/author/);
  });

  it("refuses a date that is malformed or has not happened yet", () => {
    expect(whyNotShown(good({ date: "01/09/2026" }), NOW)).toMatch(/YYYY-MM-DD/);
    expect(whyNotShown(good({ date: "2026-10-15" }), NOW)).toMatch(/future/);
  });
});

describe("the order they are shown in", () => {
  it("keeps only the verifiable ones, newest first", () => {
    const list = verifiedOnly([
      good({ date: "2026-06-01", sourceUrl: "https://g.page/a" }),
      good({ sourceUrl: "" }),
      good({ date: "2026-09-10", sourceUrl: "https://g.page/b" }),
    ], NOW);
    expect(list.map((r) => r.date)).toEqual(["2026-09-10", "2026-06-01"]);
  });
});
