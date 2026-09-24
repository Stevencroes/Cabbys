import { describe, it, expect } from "vitest";
import { LEGAL, parseDoc, parseInline, bookingTermsReady, type LegalDoc } from "./legal";

const doc = (head: string, body = "## One\nText.") => `---\n${head}\n---\n${body}`;
const approved = "title: Terms of Service\nstatus: approved\nlastUpdated: 2026-10-01\napprovedBy: A. Lawyer, reviewed 30 Sep";

// The rule the whole feature rests on: nothing is published that has not
// been approved, dated and signed off by a named person.
describe("what gets published", () => {
  it("publishes a document that is approved, dated, attributed and has text", () => {
    const d = parseDoc("terms", doc(approved));
    expect(d.published).toBe(true);
    expect(d.whyNot).toBeNull();
  });

  it("refuses anything not marked approved", () => {
    expect(parseDoc("terms", doc(approved.replace("approved", "draft"))).whyNot).toMatch(/not marked approved/);
  });

  it("refuses an approved document with no date", () => {
    expect(parseDoc("terms", doc(approved.replace("2026-10-01", ""))).whyNot).toMatch(/lastUpdated/);
    expect(parseDoc("terms", doc(approved.replace("2026-10-01", "1 Oct 2026"))).whyNot).toMatch(/lastUpdated/);
  });

  it("refuses an approved document nobody has signed off", () => {
    expect(parseDoc("terms", doc(approved.replace(/approvedBy:.*/, "approvedBy:"))).whyNot).toMatch(/approvedBy/);
  });

  it("refuses an approved document with no text", () => {
    expect(parseDoc("terms", doc(approved, "")).whyNot).toMatch(/no text/);
  });

  // The files as shipped. Whatever state they are in, a published one must
  // carry its sign-off — so a document cannot reach the site by someone
  // flipping status alone.
  it("never publishes a shipped document without a date and a sign-off", () => {
    for (const d of Object.values(LEGAL)) {
      if (d.published) {
        expect(d.approvedBy.trim(), d.slug).not.toBe("");
        expect(d.lastUpdated, d.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe("checkout acceptance", () => {
  const mk = (published: boolean) => ({ published } as LegalDoc);
  it("asks for acceptance only when both the terms and the cancellation policy are published", () => {
    expect(bookingTermsReady({ terms: mk(true), cancellation: mk(true), privacy: mk(false) })).toBe(true);
    expect(bookingTermsReady({ terms: mk(true), cancellation: mk(false), privacy: mk(true) })).toBe(false);
    expect(bookingTermsReady({ terms: mk(false), cancellation: mk(true), privacy: mk(true) })).toBe(false);
  });
});

describe("the text", () => {
  it("turns ## headings into sections with stable, unique ids", () => {
    const d = parseDoc("terms", doc(approved, "Intro line.\n\n## 1. Bookings\nA.\n\n## Payment & Fees\nB.\n\n## 1. Bookings\nC."));
    expect(d.intro).toHaveLength(1);
    expect(d.sections.map((s) => s.id)).toEqual(["1-bookings", "payment-fees", "1-bookings-2"]);
    expect(d.sections[1].heading).toBe("Payment & Fees");
  });

  it("reads paragraphs, lists and sub-headings", () => {
    const d = parseDoc("terms", doc(approved, "## S\nLine one\nline two.\n\n- a\n- b\n\n1. first\n2. second\n\n### Sub\nEnd."));
    expect(d.sections[0].blocks.map((b) => b.kind)).toEqual(["p", "ul", "ol", "h3", "p"]);
    const p = d.sections[0].blocks[0];
    expect(p.kind === "p" && p.c[0]).toEqual({ t: "text", v: "Line one line two." });
  });

  it("renders bold, italic and safe links", () => {
    expect(parseInline("a **b** *c* [d](https://x.aw)")).toEqual([
      { t: "text", v: "a " }, { t: "b", c: [{ t: "text", v: "b" }] }, { t: "text", v: " " },
      { t: "i", c: [{ t: "text", v: "c" }] }, { t: "text", v: " " },
      { t: "a", href: "https://x.aw", c: [{ t: "text", v: "d" }] },
    ]);
  });

  // Pasted copy can change what the page says, never what it does.
  it("never makes a live link out of an unsafe destination", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ t: "text", v: "click" }, { t: "text", v: ")" }]);
    expect(parseInline("[x](data:text/html,hi)")).toEqual([{ t: "text", v: "x" }]);
  });

  it("keeps raw HTML as text rather than markup", () => {
    const d = parseDoc("terms", doc(approved, "## S\n<script>alert(1)</script>"));
    const p = d.sections[0].blocks[0];
    expect(p.kind === "p" && p.c).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
  });
});
