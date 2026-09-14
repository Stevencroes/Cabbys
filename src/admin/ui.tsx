// The pieces every screen on this board is built out of.
//
// Eight screens were going to grow eight headers, eight empty states and
// eight ways of saying "this table could not be read", and the third of
// those is the one that matters: the difference between "nothing here"
// and "I couldn't look" is the house rule this portal exists to keep,
// and a rule restated eight times is a rule that drifts.
//
// Nothing here is a card by default. The brief this board was rebuilt
// against is explicit that spacing, type and hierarchy do the work, so
// the primitives below are a rule, a label and some air — the only
// boxed things in the file are the two that genuinely are objects on a
// surface (a figure strip and a panel), and they are used sparingly.
import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { needsDriver, type AdminRide } from "./lib/admin";

/* ── the page ────────────────────────────────────────────────────────── */

/**
 * Every screen opens the same way: what this is, what it says, and at
 * most ONE primary action. One, because a screen with three equal
 * buttons at the top has no primary action — it has a toolbar, and an
 * operator reads a toolbar by elimination.
 */
export function Head({ kick, title, lead, action }: {
  kick: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="adm-head">
      <div className="adm-headt">
        <div className="kick">{kick}</div>
        <h1 className="big">{title}</h1>
        {lead && <p className="sub">{lead}</p>}
      </div>
      {action && <div className="adm-heada">{action}</div>}
    </div>
  );
}

/** A rule with a name on it. The only section divider on this board —
    a heading inside a box would make every group look like a card. */
export function Section({ title, aside, children }: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="adm-sect">
      <div className="adm-secth">
        <h2>{title}</h2>
        {aside && <div className="adm-sectx">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/* ── the three answers ───────────────────────────────────────────────── */

/**
 * A table that could not be read, said in the words of whoever has to
 * fix it — which is never the operator reading this screen.
 *
 * `what` names the thing, so the sentence is about drivers or about
 * rides rather than about "data". The database's own message is printed
 * underneath because the fix is in Supabase, and a migration that has
 * not been run looks exactly like a permission that was revoked until
 * you read the line.
 */
export function Unreadable({ what, detail, onRetry, reassure }: {
  what: string;
  detail: string;
  onRetry?: () => void;
  reassure: string;
}) {
  return (
    <div className="adm-empty" role="alert">
      <div className="es">Can't read the {what}.</div>
      <p className="et">
        {reassure} The most likely reason is that docs/admin-schema.sql hasn't been
        run on this project, so there's no policy admitting an admin to this table.
      </p>
      <p className="et mono">{detail}</p>
      {onRetry && (
        <button type="button" className="adm-btn" onClick={onRetry}>Try again</button>
      )}
    </div>
  );
}

/** Nothing here, and that is the truth rather than a failure. Never
    blank: an empty state says what would put something in it. */
export function Empty({ line, hint, children }: { line: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="adm-empty">
      <div className="es">{line}</div>
      {hint && <p className="et">{hint}</p>}
      {children}
    </div>
  );
}

/**
 * Waiting, with the shape of what is coming.
 *
 * Rows rather than a spinner, because the board is a list and a list
 * that arrives into the space its skeleton held does not jump. Rows
 * are inert and hidden from the accessibility tree — a screen reader
 * gets the status line, not four fake rides.
 */
export function Skeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="adm-skel">
      <p className="adm-skelsay" role="status">Reading the board.</p>
      {Array.from({ length: rows }, (_, i) => (
        <div className="adm-skelrow" key={i} aria-hidden="true">
          <span style={{ width: "14%" }} /><span style={{ width: "34%" }} />
          <span style={{ width: "22%" }} /><span style={{ width: "12%" }} />
        </div>
      ))}
    </div>
  );
}

/* ── state, never by colour alone ────────────────────────────────────── */

export type Tone = "" | "next" | "live" | "aboard" | "alert" | "done" | "warn";

/**
 * A ride's state in the operator's vocabulary.
 *
 * NOT src/driver/JobCard.tsx's statusChip, and the difference is the
 * point rather than a duplication. That function answers a driver's
 * question — an unclaimed ride is "Open", because it is open TO THEM.
 * On a dispatch board the same row is "Needs a driver", which is the
 * only thing on this screen with a deadline attached. The two
 * vocabularies are allowed to differ for the same reason AdminRide and
 * OpenJob are different shapes; what they may never do is disagree
 * about a ride's actual status, and both read the same column.
 *
 * Every chip carries its word. Colour is a second signal and never the
 * only one — one of the two functional colours in this system is the
 * only thing marking a problem, and an operator who cannot separate
 * teal from clay still has to be able to read the board at 5am.
 */
export function rideState(r: AdminRide): { tone: Tone; label: string } {
  if (r.status === "cancelled") return { tone: "alert", label: "Cancelled" };
  if (r.status === "completed") return { tone: "done", label: "Completed" };
  if (needsDriver(r)) return { tone: "warn", label: "Needs a driver" };
  switch (r.status) {
    case "driver_assigned": return { tone: "", label: "Assigned" };
    case "en_route":        return { tone: "live", label: "On the way" };
    case "arrived":         return { tone: "next", label: "At pickup" };
    case "in_progress":     return { tone: "aboard", label: "Aboard" };
    case "pending_payment": return { tone: "warn", label: "Awaiting payment" };
    case "pending":         return { tone: "warn", label: "Requested" };
    default:                return { tone: "", label: "Confirmed" };
  }
}

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`adm-chip ${tone}`}>{children}</span>;
}

/* ── figures, and they are small on purpose ──────────────────────────── */

export interface Figure {
  label: string;
  value: string;
  /** the one line under a figure that says what it is NOT. Used where a
      number would otherwise be read as something it isn't — "today's
      revenue" that counts only completed work, for instance. */
  note?: string;
  /** a figure that is a problem when it is not zero */
  alarm?: boolean;
}

/**
 * The compact row at the top of a screen. A strip divided by hairlines,
 * not four cards: a card implies something you can open, and these are
 * readings.
 */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <div className="adm-figs">
      {items.map((f) => (
        <div className={`adm-fig${f.alarm ? " alarm" : ""}`} key={f.label}>
          <div className="k">{f.label}</div>
          <div className="v">{f.value}</div>
          {f.note && <div className="n">{f.note}</div>}
        </div>
      ))}
    </div>
  );
}

/* ── small parts ─────────────────────────────────────────────────────── */

/** A key and its value, for detail panels. The label is never the only
    thing carrying meaning — a missing value says so in words. */
export function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="adm-fact">
      <span className="fk">{k}</span>
      <span className="fv">{children}</span>
    </div>
  );
}

/** The way back, which every detail view needs and no list does. */
export function Back({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className="adm-back" to={to}>
      <span aria-hidden="true">←</span> {children}
    </Link>
  );
}

/** One search box, one meaning. Never two on a screen. */
export function Search({ value, onChange, label, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  placeholder: string;
}) {
  return (
    <label className="adm-search">
      <span className="sr">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** What happened after a write landed, in words rather than by a colour
    change. Both tones say it out loud. */
export interface Note {
  tone: "ok" | "bad";
  title: string;
  body: string;
}

export function Banner({ note, onDismiss }: { note: Note; onDismiss: () => void }) {
  return (
    <div
      className={`adm-note ${note.tone === "ok" ? "ok" : "bad"}`}
      role={note.tone === "ok" ? "status" : "alert"}
    >
      <div className="nb">
        <div className="nk">{note.title}</div>
        <p>{note.body}</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss">✕</button>
    </div>
  );
}
