// The five documents, and what became of each one.
//
// Mounted in two places and written once, because they are the same
// screen asked at two moments:
//
//   · DriverGuard's blocked gate, which is where it matters most. A
//     driver waiting on approval never reaches the shell — the gate is a
//     route guard, not hidden UI — so until this existed, the portal told
//     an applicant "We're checking your licence and vehicle details" and
//     gave them no way on earth to send us a licence. The sentence was
//     about a process that lived entirely on WhatsApp.
//   · the Profile screen, for a driver who is already approved. Insurance
//     lapses and licences expire, and the answer to "they need to re-send
//     their cover note" cannot be suspending them so the gate reappears.
//
// The list is DRIVER_DOCUMENTS and nothing here knows what is in it. Five
// today, six the day Aruba asks for a sixth — see src/driver/lib/
// documents.ts, which is the file the owner edits.
//
// One rule from the house style shows up twice below and is worth naming:
// a failed read is never drawn as an empty list. "You have sent nothing"
// and "we could not look" are the same blank screen otherwise, and the
// first makes a driver upload five documents they already sent.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  DRIVER_DOCUMENTS, documentStates, outstandingDocuments,
  type DocumentRecord, type DocumentState,
} from "./lib/documents";
import { loadDriverDocuments, uploadDriverDocument } from "./lib/driver";

interface DocumentsProps {
  /** the AUTH id — the same id every policy and RPC in this project
      keys on, and what driver_documents.driver_user_id holds */
  uid: string;
  /** the gate is a decision screen and says less; the profile screen has
      room for the reasons we ask for each one */
  compact?: boolean;
  /** told when a document lands, so a caller holding a count can re-read
      it rather than sitting over a stale one */
  onChanged?: () => void;
}

/** What the chip says, and which of the two functional colours it may
    wear. --signal is live/ok only and --alert is wrong only, so the
    middle state — sent, nobody has looked yet — wears neither. */
const STATE_LABEL: Record<DocumentState["state"], string> = {
  missing: "Not sent",
  uploaded: "With Cabby's",
  accepted: "Accepted",
  rejected: "Sent back",
};

/** "your licence and your permit", not a comma splice. Same shape as
    listGaps in DriverShell — the two lists read in the same voice. */
function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export default function Documents({ uid, compact, onChanged }: DocumentsProps) {
  const [records, setRecords] = useState<DocumentRecord[] | null>(null);
  /** non-null when the TABLE could not be read — never the same thing as
      an empty list, see the note at the top */
  const [failed, setFailed] = useState<string | null>(null);
  /** which slug is uploading right now, so only its own row goes busy */
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const live = useRef(true);

  const refresh = useCallback(async () => {
    const { documents, error } = await loadDriverDocuments(uid);
    if (!live.current) return;
    setFailed(error);
    setRecords(error ? null : documents);
  }, [uid]);

  useEffect(() => {
    live.current = true;
    void refresh();
    return () => { live.current = false; };
  }, [refresh]);

  async function send(slug: string, file: File | undefined) {
    if (!file) return;
    setBusy(slug);
    setProblem(null);
    setSent(null);
    const res = await uploadDriverDocument(slug, file);
    if (!live.current) return;
    setBusy(null);
    if (!res.ok) { setProblem(res.detail); return; }
    setSent(slug);
    await refresh();
    onChanged?.();
  }

  // Read in this order, because two of these are the same blank list:
  // nothing read yet, a table that could not be read, and a driver who
  // has sent nothing.
  if (records === null) {
    return (
      <div className="drv-docs">
        <Head />
        {failed ? (
          <div className="drv-refused" role="alert">
            <div className="rk">Can't read your documents</div>
            <p>
              Your uploads are fine — this screen just can't list them. Don't send
              them again yet; check your signal, or message us if it keeps happening.
            </p>
            <p className="why">{failed}</p>
            <button type="button" className="drv-cta ghost" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <p className="dq">Reading your documents.</p>
        )}
      </div>
    );
  }

  const states = documentStates(records);
  const outstanding = outstandingDocuments(records);
  const waiting = states.filter((d) => d.state === "uploaded").length;

  return (
    <div className="drv-docs">
      <Head />

      {/* The one line at the top that answers "am I finished?". Named
          pieces, not a bare count: "three outstanding" is a number, and
          "your insurance and your permit" is an instruction. */}
      <p className="dq">
        {outstanding.length > 0
          ? `Still to send: ${listOf(outstanding)}.`
          : waiting > 0
            ? `All sent. ${waiting === 1 ? "One is" : `${waiting} are`} with us to check — nothing else for you to do.`
            : "Everything's in and checked."}
      </p>

      <ul className="dlist">
        {states.map((d) => (
          <DocumentRow
            key={d.spec.slug}
            doc={d}
            compact={compact}
            busy={busy === d.spec.slug}
            justSent={sent === d.spec.slug}
            disabled={busy !== null}
            onFile={(f) => void send(d.spec.slug, f)}
          />
        ))}
      </ul>

      {problem && (
        <div className="drv-refused" role="alert">
          <div className="rk">That didn't go through</div>
          <p>{problem}</p>
        </div>
      )}

      <p className="dnote">
        PDF only, up to 8MB each. Your phone's camera can save a photo as a PDF
        from the share menu. Only Cabby's sees these — they're kept apart from
        your photo and your car, which are the only things a guest is shown.
      </p>
    </div>
  );
}

function Head() {
  return (
    <div className="dhead">
      <span className="dk">Your documents</span>
      <span className="dn">{DRIVER_DOCUMENTS.length} asked for</span>
    </div>
  );
}

interface RowProps {
  doc: DocumentState;
  compact?: boolean;
  busy: boolean;
  justSent: boolean;
  /** one upload at a time: two at once on island mobile data is two
      slow uploads and a driver who cannot tell which is which */
  disabled: boolean;
  onFile: (file: File | undefined) => void;
}

function DocumentRow({ doc, compact, busy, justSent, disabled, onFile }: RowProps) {
  const pick = useRef<HTMLInputElement>(null);
  const { spec, state, record } = doc;
  const inputId = `doc-${spec.slug}`;

  return (
    <li className={`drow ${state}`}>
      <div className="dtop">
        <span className="dl">{spec.label}</span>
        <span className={`dchip ${state}`}>{STATE_LABEL[state]}</span>
      </div>

      {!compact && <p className="dw">{spec.why}</p>}

      {/* The sentence is the whole value of a rejection. A document sent
          back with no reason leaves a driver told to fix something and
          not told what — the database refuses a rejection without one
          (docs/onboarding-schema.sql §5), so this is always here when
          the state is. */}
      {state === "rejected" && (
        <p className="dr" role="alert">
          {record?.reason || "Cabby's sent this back. Message us and we'll say what's needed."}
        </p>
      )}

      {justSent && state === "uploaded" && (
        <p className="dok" role="status">Sent. We'll look at it and let you know.</p>
      )}

      <input
        ref={pick}
        id={inputId}
        type="file"
        accept="application/pdf"
        className="sr-only"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
      />
      {/* Never a control that does nothing: an accepted document has no
          button, because re-sending one we have already cleared would
          reset it to unchecked and put the driver back in the queue. If
          it genuinely needs replacing — a licence renewed — that is a
          message to Cabby's, who send it back and reopen the upload. */}
      {state !== "accepted" && (
        <button
          type="button"
          className={`drv-cta ${state === "rejected" ? "green" : "ghost"} dsend`}
          onClick={() => pick.current?.click()}
          disabled={disabled}
        >
          {busy ? "Sending…" : state === "missing" ? "Send PDF" : "Send a new one"}
        </button>
      )}
    </li>
  );
}
