// One driver's paperwork, as the operator deciding about them reads it.
//
// This is what the Drivers board was missing. docs/admin-schema.sql
// replaced "approve a driver by typing an UPDATE" with a button, and a
// button is only an improvement if there is something to look at before
// pressing it. The row already says whether they have a car and a plate;
// it said nothing about whether anybody had ever seen their licence,
// because nobody ever had — that check lived on WhatsApp.
//
// Three things here are deliberate and worth not undoing:
//
//  · A DOCUMENT IS NEVER LINKED DIRECTLY. driver-docs is a private
//    bucket; what View produces is a signature good for one minute
//    (DOCUMENT_LINK_SECONDS). The link is rendered rather than opened
//    for the operator, because a window.open() after an await is a
//    window a popup blocker eats — and a View button that silently does
//    nothing is worse than one more tap.
//  · SENDING A DOCUMENT BACK REQUIRES A SENTENCE. The database refuses a
//    rejection with no reason, so the confirm here is disabled without
//    one and says why. The driver reads that sentence and it is the only
//    thing standing between them and doing it wrong again.
//  · NOTHING HERE APPROVES ANYBODY. Accepting the last document says so
//    and points at the row above; drivers.status is changed by the
//    Approve button and by nothing else. Two ways to approve a driver is
//    two answers to "can this person claim a ride".
import { useState } from "react";
import {
  DRIVER_DOCUMENTS, documentStates, documentsComplete,
  type DocumentRecord, type DocumentState,
} from "../driver/lib/documents";
import { DOCUMENT_LINK_SECONDS, reviewDocument, signedDocumentUrl } from "./lib/admin";
import { arubaDayOf, formatDateShort } from "../lib/datetime";

interface DriverDocsProps {
  /** the driver's AUTH id — what driver_documents is keyed on */
  driverUserId: string;
  driverName: string;
  /** already read by the board in one query, not fetched again per row */
  records: DocumentRecord[];
  /** the whole table could not be read. Passed down rather than
      discovered here, because "this driver has sent nothing" and "we
      couldn't look" are the same empty array and an operator acting on
      the first when it is really the second asks five drivers to re-send
      documents they already sent. */
  unreadable: string | null;
  /** re-read the board, so a decision is reflected in the count on the
      row rather than sitting in this panel's own head */
  onReviewed: () => void;
}

const STATE_LABEL: Record<DocumentState["state"], string> = {
  missing: "Not sent",
  uploaded: "Needs a look",
  accepted: "Accepted",
  rejected: "Sent back",
};

export default function DriverDocs({
  driverUserId, driverName, records, unreadable, onReviewed,
}: DriverDocsProps) {
  /** which document is being rejected, and the sentence so far */
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /** a signed link per slug, once the operator has asked for it */
  const [links, setLinks] = useState<Record<string, string>>({});

  if (unreadable) {
    return (
      <div className="adm-docs">
        <p className="dbad" role="alert">
          Their documents can't be read — this is not the same as them having sent
          none, so don't ask them to re-send anything yet. The likeliest reason is
          that docs/onboarding-schema.sql hasn't been run on this project.
        </p>
        <p className="dbad mono">{unreadable}</p>
      </div>
    );
  }

  const states = documentStates(records);
  const who = driverName || "This driver";

  async function view(slug: string, path: string) {
    setBusy(slug);
    setProblem(null);
    const res = await signedDocumentUrl(path);
    setBusy(null);
    if (!res.ok) { setProblem(res.detail); return; }
    setLinks((l) => ({ ...l, [slug]: res.url }));
  }

  async function decide(
    slug: string,
    status: "accepted" | "rejected",
    seenAt: string | null,
  ) {
    setBusy(slug);
    setProblem(null);
    const res = await reviewDocument(driverUserId, slug, status, status === "rejected" ? reason : null, seenAt);
    setBusy(null);
    if (!res.ok) {
      setProblem(res.detail);
      // The driver replaced the file while this was open. Re-reading is
      // the only honest response: the decision was about a document that
      // is no longer there.
      if (/uploaded a new copy/.test(res.detail)) onReviewed();
      return;
    }
    setRejecting(null);
    setReason("");
    // The link was minted for the copy that has just been decided about,
    // and it expires anyway. Dropping it stops an operator re-opening a
    // stale one after a re-upload.
    setLinks((l) => { const n = { ...l }; delete n[slug]; return n; });
    onReviewed();
  }

  return (
    <div className="adm-docs">
      <div className="dhead">
        <span className="dk">Documents</span>
        {/* The count, and what it does NOT mean. Said here because this
            is the screen where somebody would otherwise assume that five
            green ticks is the approval. */}
        <span className="dn">
          {documentsComplete(records)
            ? `All ${DRIVER_DOCUMENTS.length} accepted — ${who} still has to be approved on the row above.`
            : `${states.filter((d) => d.state === "accepted").length} of ${DRIVER_DOCUMENTS.length} accepted`}
        </span>
      </div>

      <ul className="dlist">
        {states.map(({ spec, state, record }) => {
          const slug = spec.slug;
          const working = busy === slug;
          const link = links[slug];
          return (
            <li key={slug} className={`drow ${state}`}>
              <div className="dl">
                <span className="dt">{spec.label}</span>
                <span className={`adm-chip ${chipOf(state)}`}>{STATE_LABEL[state]}</span>
                {record?.uploadedAt && (
                  <span className="dwhen">Sent {formatDateShort(arubaDayOf(record.uploadedAt)) || "—"}</span>
                )}
              </div>

              {state === "rejected" && record?.reason && (
                <p className="dreason">Sent back: {record.reason}</p>
              )}

              {/* Never a control the database would refuse. A document
                  that was never sent has nothing to open and nothing to
                  decide about — the row says so instead of offering
                  three buttons that would all come back "no_document". */}
              {state === "missing" ? (
                <p className="dnone">Nothing sent yet. {who} uploads this from their own profile.</p>
              ) : (
                <div className="adm-acts">
                  {link ? (
                    <a className="adm-btn" href={link} target="_blank" rel="noreferrer">
                      Open ↗
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="adm-btn"
                      disabled={working}
                      onClick={() => void view(slug, record!.path)}
                    >
                      {working ? "…" : "View"}
                    </button>
                  )}
                  {state !== "accepted" && (
                    <button
                      type="button"
                      className="adm-btn go"
                      disabled={working}
                      onClick={() => void decide(slug, "accepted", record?.uploadedAt ?? null)}
                    >
                      Accept
                    </button>
                  )}
                  {state !== "rejected" && (
                    <button
                      type="button"
                      className="adm-btn stop"
                      disabled={working}
                      onClick={() => { setRejecting(slug); setReason(""); setProblem(null); }}
                    >
                      Send back
                    </button>
                  )}
                </div>
              )}

              {link && (
                <p className="dexpiry">
                  That link is only good for {DOCUMENT_LINK_SECONDS} seconds and is for you,
                  not for forwarding. Tap View again if it's stopped working.
                </p>
              )}

              {/* The reason is the whole point of a rejection. Written
                  under the document it is about, so the operator can see
                  what they are describing while they describe it. */}
              {rejecting === slug && (
                <div className="dback">
                  <label htmlFor={`why-${slug}`}>
                    What's wrong with it? {who.split(" ")[0]} reads this and has to be able
                    to fix it from it.
                  </label>
                  <textarea
                    id={`why-${slug}`}
                    rows={2}
                    value={reason}
                    autoFocus
                    placeholder="The bottom of the page is cut off — we need the expiry date."
                    onChange={(e) => setReason(e.target.value)}
                  />
                  <div className="adm-acts">
                    <button
                      type="button"
                      className="adm-btn stop"
                      disabled={working || !reason.trim()}
                      onClick={() => void decide(slug, "rejected", record?.uploadedAt ?? null)}
                    >
                      {working ? "…" : "Send it back"}
                    </button>
                    <button
                      type="button"
                      className="adm-btn"
                      disabled={working}
                      onClick={() => { setRejecting(null); setReason(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                  {!reason.trim() && (
                    <p className="dwhy">
                      A document sent back with no reason leaves a driver told to fix
                      something and not told what. The database refuses one.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {problem && <p className="dbad" role="alert">{problem}</p>}
    </div>
  );
}

/** The board's chip vocabulary, borrowed rather than re-invented so a
    document's state reads the same way a driver's does. --signal is ok
    and --alert is wrong; "needs a look" is neither and wears the plain
    pending chip. */
function chipOf(state: DocumentState["state"]): string {
  if (state === "accepted") return "approved";
  if (state === "rejected") return "suspended";
  return "pending";
}
