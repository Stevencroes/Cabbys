import { describe, it, expect } from "vitest";
import {
  DRIVER_DOCUMENTS, DOC_MAX_BYTES, acceptedCount, documentPath, documentStates,
  documentsComplete, outstandingDocuments, type DocumentRecord,
} from "./documents";

const rec = (over: Partial<DocumentRecord> & { slug: string }): DocumentRecord => ({
  path: `d1/${over.slug}.pdf`,
  status: "uploaded",
  reason: null,
  uploadedAt: "2026-09-01T12:00:00.000Z",
  reviewedAt: null,
  ...over,
});

const all = (status: DocumentRecord["status"]) =>
  DRIVER_DOCUMENTS.map((s) => rec({ slug: s.slug, status }));

describe("the documents Cabby's asks for", () => {
  // The list is the feature. If anything in the portal branched on a
  // particular document, the owner could not add Aruba's next
  // requirement without a code change in two portals.
  it("is the standard commercial set, and every entry carries a reason", () => {
    const slugs = DRIVER_DOCUMENTS.map((d) => d.slug);
    expect(slugs).toEqual([
      "drivers-licence",
      "id-or-passport",
      "vehicle-registration",
      "vehicle-insurance",
      "transport-permit",
    ]);
    for (const d of DRIVER_DOCUMENTS) {
      expect(d.label.trim()).not.toBe("");
      // five demands with no reasons attached is a form, not an ask
      expect(d.why.trim()).not.toBe("");
    }
  });

  // A slug is a filename and a row key. Renaming one orphans every
  // document already uploaded under it — the driver is asked again for a
  // licence they sent last week — so the shape is pinned here as well as
  // in the RPC that refuses anything else.
  it("keeps every slug to the shape the database will accept", () => {
    for (const d of DRIVER_DOCUMENTS) {
      expect(d.slug).toMatch(/^[a-z][a-z0-9-]{0,39}$/);
    }
    expect(new Set(DRIVER_DOCUMENTS.map((d) => d.slug)).size).toBe(DRIVER_DOCUMENTS.length);
  });

  it("names the object the way the RPC recomposes it", () => {
    // save_driver_document refuses any path that is not exactly this, so
    // a second opinion about the filename is a refused upload, not a
    // misfiled one
    expect(documentPath("abc-123", "vehicle-insurance")).toBe("abc-123/vehicle-insurance.pdf");
  });
});

describe("what has arrived against what was asked for", () => {
  // "Missing" is the absence of a row, not a fourth stored status — see
  // docs/onboarding-schema.sql §3. A table that carried a row per
  // required document would need migrating every time this list changed.
  it("treats a document with no row as missing", () => {
    const states = documentStates([]);
    expect(states).toHaveLength(DRIVER_DOCUMENTS.length);
    expect(states.every((s) => s.state === "missing")).toBe(true);
    expect(states.every((s) => s.record === null)).toBe(true);
  });

  // Driven by the ASK, not by the rows. A document the owner has stopped
  // asking for stops being rendered without anybody touching the
  // database — which is the whole reason the list lives in TypeScript.
  it("ignores a row for something nobody asks for any more", () => {
    const states = documentStates([rec({ slug: "medical-certificate", status: "accepted" })]);
    expect(states.map((s) => s.spec.slug)).toEqual(DRIVER_DOCUMENTS.map((d) => d.slug));
    expect(acceptedCount([rec({ slug: "medical-certificate", status: "accepted" })])).toBe(0);
  });

  // A driver whose insurance was sent back has, as far as the
  // application is concerned, not sent it. A checklist that ticked it
  // off because a file exists would lie about whether they can start.
  it("counts a rejected document as still outstanding", () => {
    const records = all("accepted").map((r, i) =>
      i === 0 ? { ...r, status: "rejected" as const, reason: "Cut off at the bottom." } : r);
    expect(outstandingDocuments(records)).toEqual([DRIVER_DOCUMENTS[0].label]);
    expect(documentsComplete(records)).toBe(false);
  });

  // The opposite case, and it matters as much: nobody has looked at it
  // yet and there is nothing the driver can do about that. Listing it
  // would be nagging them about our own queue.
  it("does not nag about a document that is simply waiting to be read", () => {
    expect(outstandingDocuments(all("uploaded"))).toEqual([]);
  });

  // The operator's question is stricter than the driver's. A document
  // sitting unlooked-at is not outstanding for the driver and is very
  // much outstanding for whoever has to decide.
  it("is only complete when every ask has actually been accepted", () => {
    expect(documentsComplete(all("uploaded"))).toBe(false);
    expect(documentsComplete(all("accepted"))).toBe(true);
    expect(acceptedCount(all("accepted"))).toBe(DRIVER_DOCUMENTS.length);
  });

  it("names what is outstanding in the order the driver will be asked", () => {
    const records = [rec({ slug: "id-or-passport", status: "accepted" })];
    expect(outstandingDocuments(records)).toEqual(
      DRIVER_DOCUMENTS.filter((d) => d.slug !== "id-or-passport").map((d) => d.label),
    );
  });
});

describe("the size cap", () => {
  // Mirrors PHOTO_MAX_BYTES's shape, and the same number is set on the
  // bucket in docs/onboarding-schema.sql §1 — a limit that only exists
  // in the browser is a limit that exists until somebody opens devtools.
  it("is 8MB, the same figure the bucket enforces", () => {
    expect(DOC_MAX_BYTES).toBe(8 * 1024 * 1024);
    expect(DOC_MAX_BYTES).toBe(8388608);
  });
});
