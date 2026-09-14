// What Cabby's asks a driver for before they carry anybody.
//
// THIS LIST IS THE FEATURE. Everything else about documents — the driver's
// checklist, the outstanding band, the operator's review panel — renders
// whatever is in the array below and knows nothing else about it. Aruba's
// requirements change, an insurer starts asking for something, the owner
// edits this file and both portals follow. There is no branch anywhere
// that says "if it's the licence, then…".
//
// Which is also why the database does not hold the list. docs/
// onboarding-schema.sql constrains the SHAPE of a slug and not its
// membership, so adding a sixth document here is an edit, not a
// migration. The table records what arrived; this records what was asked
// for; "still outstanding" is the difference between the two.
//
// A slug is a filename. It is `<auth uid>/<slug>.pdf` in the private
// driver-docs bucket and it is the row's key, so CHANGING ONE ORPHANS
// EVERY DOCUMENT ALREADY UPLOADED UNDER IT — the driver would be asked
// for a licence they sent last week. Add and remove freely; rename only
// with that in mind.
//
// No Supabase import here on purpose. driver.ts is "the portal's only
// conversation with Supabase" and stays that; this file is the list and
// the arithmetic over it, which is what makes both testable without a
// database and reusable from the admin board.

/** One thing Cabby's has to see before a driver carries anybody. */
export interface DocumentSpec {
  /** the filename and the row key — see the warning above */
  slug: string;
  /** what a driver calls it, on a phone, at 6am */
  label: string;
  /** why we ask. One line, under the label, so the list is not five
      demands with no reasons attached. */
  why: string;
}

/**
 * The standard commercial set for a private transfer operator in Aruba.
 *
 * Ordered the way a driver can actually assemble them: the two they
 * already carry in their wallet, then the two that live in the glovebox,
 * then the one they have to go and find.
 */
export const DRIVER_DOCUMENTS: DocumentSpec[] = [
  {
    slug: "drivers-licence",
    label: "Driver's licence",
    why: "Both sides, in date. This is the one we're asked for first if we're ever stopped.",
  },
  {
    slug: "id-or-passport",
    label: "ID or passport",
    why: "The photo page. It has to be the same person as the licence.",
  },
  {
    slug: "vehicle-registration",
    label: "Vehicle registration",
    why: "The car you'll be driving, in your name or your company's.",
  },
  {
    slug: "vehicle-insurance",
    label: "Vehicle insurance",
    why: "Current cover, showing the plate and the expiry date. Passengers have to be covered.",
  },
  {
    slug: "transport-permit",
    label: "Public-transport permit",
    why: "Your taxi or tour permit. Carrying paying passengers without one is illegal in Aruba.",
  },
];

/** What a file may be, so a driver learns the limit before the upload
    rather than after it. Mirrors PHOTO_MAX_BYTES, and the same number is
    set on the bucket itself in docs/onboarding-schema.sql §1 — a limit
    that only exists in the browser is a limit that exists until somebody
    opens devtools. */
export const DOC_MAX_BYTES = 8 * 1024 * 1024;

/** Three words, and the absence of a row is the fourth state. See the
    note in docs/onboarding-schema.sql §3 — "missing" is not stored,
    because storing it would make the list above a migration. */
export type DocumentStatus = "uploaded" | "accepted" | "rejected";

/** One document a driver has actually sent, as the table holds it. */
export interface DocumentRecord {
  slug: string;
  path: string;
  status: DocumentStatus;
  /** why it was sent back. Never null on a rejection — the database
      refuses one without it. */
  reason: string | null;
  uploadedAt: string | null;
  reviewedAt: string | null;
}

/** A document as a screen has to draw it: the ask, and what became of
    it. `state` collapses "no row" into the same union as the three
    stored words, so nothing downstream has to handle a null record. */
export interface DocumentState {
  spec: DocumentSpec;
  state: "missing" | DocumentStatus;
  record: DocumentRecord | null;
}

/**
 * The five asks, married to whatever has arrived.
 *
 * Driven by DRIVER_DOCUMENTS and not by the rows, which is the whole
 * point: a document the owner has stopped asking for simply stops being
 * rendered, and one they start asking for appears as outstanding without
 * anybody touching the database.
 */
export function documentStates(records: DocumentRecord[]): DocumentState[] {
  const bySlug = new Map(records.map((r) => [r.slug, r]));
  return DRIVER_DOCUMENTS.map((spec) => {
    const record = bySlug.get(spec.slug) ?? null;
    return { spec, state: record ? record.status : "missing", record };
  });
}

/**
 * What is still outstanding, in the words the driver has to act on.
 *
 * The sibling of missingIdentity() in driver.ts, and deliberately the
 * same shape — a string[] of named pieces, so one band can list either
 * without knowing which it is holding. missingIdentity answers "can a
 * guest spot you at the kerb"; this answers "is your application
 * finished". They are asked in different places and never at once.
 *
 * A REJECTED document counts as outstanding. It has to: a driver whose
 * insurance was sent back has, from the application's point of view, not
 * sent it — and a checklist that ticked it off because a file exists
 * would be a checklist that lies about whether they can start work.
 *
 * An UPLOADED one does not. Nobody has looked at it yet, and there is
 * nothing the driver can do about that; listing it would be nagging them
 * about our own queue.
 */
export function outstandingDocuments(records: DocumentRecord[]): string[] {
  return documentStates(records)
    .filter((d) => d.state === "missing" || d.state === "rejected")
    .map((d) => d.spec.label);
}

/** How many of the asks have been accepted. The count the operator's
    board compares against DRIVER_DOCUMENTS.length — the database returns
    a bare count because it does not know the list. */
export function acceptedCount(records: DocumentRecord[]): number {
  return documentStates(records).filter((d) => d.state === "accepted").length;
}

/**
 * Is the paperwork complete?
 *
 * Every ask accepted, which is stricter than "nothing outstanding" —
 * a document sitting unlooked-at is not outstanding for the driver and
 * is very much outstanding for the operator. This is the operator's
 * question, so it is the operator's definition.
 *
 * It decides nothing. Nobody is approved by this returning true; it
 * puts a sentence next to a row on the Drivers board and the operator
 * still presses the button. See docs/onboarding-schema.sql, top.
 */
export function documentsComplete(records: DocumentRecord[]): boolean {
  return acceptedCount(records) === DRIVER_DOCUMENTS.length;
}

/** The storage object a slug names. One definition, because the RPC
    checks the browser's arithmetic against its own — a mismatch is
    refused as `bad_path` rather than filing a row that points at the
    wrong file. */
export function documentPath(uid: string, slug: string): string {
  return `${uid}/${slug}.pdf`;
}
