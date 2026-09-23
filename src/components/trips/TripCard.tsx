// ── One trip, readable in a few seconds ──────────────────────────────────
//
// Read top to bottom, in the order a guest's questions arrive: is it on
// (status), when (date and time, with the timezone named), where from and
// to, in what, on which flight, with whom, is it paid, how much, and which
// booking is this. The order is the design — a guest glancing at this in
// an arrivals hall should never have to hunt for the one line they need.
//
// Everything that decides WHAT to show comes from src/lib/tripStatus.ts.
// This file decides only how it looks and what each action does, so the
// badge, the tab and the buttons can never disagree about what the trip is.
//
// Two rules carried in from the rest of the codebase, both load-bearing
// here:
//   · Never show a control the database will refuse. "Cancel" appears only
//     on statuses the RLS policy accepts; there is no self-serve change or
//     rating path, so neither is offered as if there were.
//   · Never state what is not recorded. No cancellation time (there is no
//     column), no payment the webhook did not write, no refund that
//     nothing in this project can perform.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cancelRide } from "../../lib/rides";
import {
  tripState, canCancel, showsDriver, canContactDriver, paymentState,
  vehicleName, formatUsd, STATUS_LABEL, JOURNEY, PAYMENT_LABEL, PAYMENT_DETAIL,
  TOTAL_LABEL, type TripRow, type TripStatus,
} from "../../lib/tripStatus";
import { cancellationInfo } from "../../lib/policy";
import { AWG_PER_USD } from "../../lib/quote";
import { formatDateTime, formatDate, formatTime, todayInAruba, nowInAruba } from "../../lib/datetime";
import { whatsappLink } from "../../lib/whatsapp";
import {
  askAboutBooking, askToChange, reportIssue, askAboutRefund, supportMailto,
  SUPPORT_EMAIL, type TripOutline,
} from "../../lib/support";
import { refFromRideId } from "../../lib/bookingRef";
import TripFlight from "../TripFlight";
import PickupPin from "../PickupPin";
import TripReceipt from "./TripReceipt";

export interface Ride extends TripRow {
  id: string;
  pickup_location: string;
  dropoff_location: string;
  booking_ref?: string;
  flight_number?: string;
  fare_total?: number | string;
  price?: number | string;
  created_at?: string;
  assigned_at?: string | null;
  arrived_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  passengers_count?: number | null;
  luggage_count?: number | null;
  driver_vehicle?: string | null;
  driver_plate?: string | null;
  driver_photo?: string | null;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_note?: string | null;
}

// ── small derived facts ─────────────────────────────────────────────────

/** Aruba wall clock for an instant — the only clock this screen speaks. */
function arubaParts(iso: string | null): { date: string; time: string } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return { date: todayInAruba(ms), time: nowInAruba(ms) };
}

function arubaLabel(iso: string | null | undefined): string | null {
  const p = arubaParts(iso ?? null);
  return p ? formatDateTime(p.date, p.time) : null;
}

/** "Ana Croes" → "AC". The fallback when there is no photo — never a logo. */
function initialsOf(name: string): string {
  return name.trim().split(/\s+/).map((w) => w.charAt(0)).join("").slice(0, 2).toUpperCase() || "?";
}

/**
 * The reason, when Cabby's cancelled it.
 *
 * admin_cancel_ride appends "Cancelled by Cabby's: <reason>" to notes (see
 * docs/admin-schema.sql). The guest's own cancellation writes no reason,
 * so absence is reported as absence — never as "you cancelled this",
 * which the row does not actually say.
 */
const CALLED_OFF = "Cancelled by Cabby's:";
function cancellationReason(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const at = notes.lastIndexOf(CALLED_OFF);
  if (at < 0) return null;
  const rest = notes.slice(at + CALLED_OFF.length).split(" · ")[0].trim();
  return rest || null;
}

function Fact({ k, children, className }: { k: string; children: ReactNode; className?: string }) {
  return (
    <div className={`tp-fact${className ? ` ${className}` : ""}`}>
      <dt>{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Progress along the journey. One label shown — the current one — so it
    fits a phone; the nodes either side say how far there is to go. */
function Progress({ status }: { status: TripStatus }) {
  const idx = Math.max(0, JOURNEY.indexOf(status));
  return (
    <ol className="tp-timeline" aria-label={`Progress: ${STATUS_LABEL[status]}, step ${idx + 1} of ${JOURNEY.length}`}>
      {JOURNEY.map((s, i) => (
        <li key={s} className={`tp-tl-step${i < idx ? " done" : ""}${i === idx ? " now" : ""}`} aria-hidden="true">
          {i > 0 && <span className="tp-tl-bar" />}
          <span className="tp-tl-node" />
          <span className="tp-tl-lbl">{STATUS_LABEL[s]}</span>
        </li>
      ))}
    </ol>
  );
}

// ── contact panel ───────────────────────────────────────────────────────

type ContactMode = "support" | "change" | "issue" | "refund" | "driver";

function ContactPanel({
  id, mode, ride, bookingRef, outline, onClose,
}: {
  id: string; mode: ContactMode; ride: Ride; bookingRef: string; outline: TripOutline; onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Focus arrives with the panel, so a keyboard or screen-reader user
  // lands on the choice they just asked for rather than having to find it.
  useEffect(() => { box.current?.focus(); }, [mode]);

  if (mode === "driver") {
    const digits = (ride.driver_phone ?? "").replace(/\D/g, "");
    return (
      <div id={id} ref={box} tabIndex={-1} className="tp-panel" role="group" aria-label="Contact your driver">
        <p className="tp-panel-h">Contact {ride.driver_name}</p>
        <div className="tp-panel-row">
          <a className="btn-ghost" href={`tel:+${digits}`}>Call</a>
          <a className="btn-ghost" href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer"
            aria-label={`WhatsApp ${ride.driver_name} (opens in a new tab)`}>WhatsApp</a>
        </div>
        <button type="button" className="tp-text" onClick={onClose}>Close</button>
      </div>
    );
  }

  const copy = {
    support: { h: "Contact Cabby's", subject: `Booking ${bookingRef}`, body: askAboutBooking(bookingRef) },
    change: { h: "Request a change", subject: `Change to booking ${bookingRef}`, body: askToChange(bookingRef, outline) },
    issue: { h: "Report an issue", subject: `Issue with booking ${bookingRef}`, body: reportIssue(bookingRef, outline) },
    refund: { h: "Ask about your refund", subject: `Refund for booking ${bookingRef}`, body: askAboutRefund(bookingRef) },
  }[mode];
  const wa = whatsappLink(copy.body);
  // Changes are handled by a person: there is no self-serve change path,
  // and a form that looked like one would be a promise this project
  // cannot keep. Saying so is kinder than a button that pretends.
  const note = mode === "change"
    ? "Changes are made by our team — tell us what you need and we'll confirm it."
    : mode === "refund"
    ? "Refunds are handled by our team rather than automatically. We'll reply with where yours stands."
    : null;

  return (
    <div id={id} ref={box} tabIndex={-1} className="tp-panel" role="group" aria-label={copy.h}>
      <p className="tp-panel-h">{copy.h}</p>
      {note && <p className="tp-panel-note">{note}</p>}
      <div className="tp-panel-row">
        <a className="btn-ghost" href={supportMailto(copy.subject, copy.body)}
          aria-label={`Email ${SUPPORT_EMAIL} about booking ${bookingRef}`}>Email us</a>
        {wa && (
          <a className="btn-ghost" href={wa} target="_blank" rel="noopener noreferrer"
            aria-label={`WhatsApp Cabby's about booking ${bookingRef} (opens in a new tab)`}>WhatsApp us</a>
        )}
      </div>
      <p className="tp-panel-note">{SUPPORT_EMAIL}</p>
      <button type="button" className="tp-text" onClick={onClose}>Close</button>
    </div>
  );
}

// ── the card ─────────────────────────────────────────────────────────────

export default function TripCard({
  ride, now, onCancelled, onBookAgain,
}: {
  ride: Ride;
  now: number;
  onCancelled: (id: string) => void;
  /** repeats the same route; absent where booking is not available */
  onBookAgain?: (ride: Ride) => void;
}) {
  const [panel, setPanel] = useState<null | "details" | "confirm" | ContactMode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState(false);
  const uid = useId();
  const ids = { status: `${uid}-s`, when: `${uid}-w`, panel: `${uid}-p` };

  const state = tripState(ride, now);
  const { status, placement, active, pickupAt } = state;
  const pay = paymentState(ride);
  const fare = Number(ride.fare_total ?? ride.price ?? 0) / AWG_PER_USD;
  const vehicle = vehicleName(ride);
  const bookingRef = ride.booking_ref ?? refFromRideId(ride.id);
  const when = arubaLabel(pickupAt);
  const parts = arubaParts(pickupAt);
  const outline: TripOutline = {
    from: ride.pickup_location, to: ride.dropoff_location,
    date: parts?.date ?? "", time: parts?.time ?? "",
  };
  const cancellable = canCancel(ride, state, now);
  const driverShown = showsDriver(ride, state);
  const driverReachable = canContactDriver(ride, state);
  const policy = cancellationInfo(pickupAt ? new Date(pickupAt) : null);

  const toggle = (p: NonNullable<typeof panel>) => {
    setError(null);
    setPanel((cur) => (cur === p ? null : p));
  };

  async function confirmCancel() {
    if (busy) return; // a second tap while the first is in flight does nothing
    setBusy(true);
    setError(null);
    const res = await cancelRide(ride.id);
    setBusy(false);
    if (!res.ok) { setError(res.detail); return; }
    setPanel(null);
    onCancelled(ride.id);
  }

  // What cancelling means for money, stated before the guest commits —
  // and only what is true. There is no refund path in this project, so
  // "you'll be refunded automatically" is never said.
  const moneyOnCancel =
    pay === "paid" ? `Your card was charged ${formatUsd(fare)}. Refunds aren't automatic — contact us after cancelling and we'll arrange it under our cancellation policy.`
    : pay === "pending" ? `There's a hold of ${formatUsd(fare)} on your card. Contact us after cancelling and we'll make sure it's released.`
    : "Nothing has been charged online, so there's nothing to refund.";

  const moneyOnCancelled =
    pay === "paid" ? "Your card was charged for this booking. Refunds are handled by our team — ask and we'll tell you where yours stands."
    : pay === "pending" ? "A hold was placed on your card. If it hasn't been released, contact us."
    : pay === "refunded" ? "This booking was refunded to your card."
    : "Nothing was charged online, so there's nothing to refund.";

  const reason = cancellationReason(ride.notes);
  const refundRelevant = placement === "cancelled" && (pay === "paid" || pay === "pending" || pay === "refunded");

  const events: [string, string | null | undefined][] = [
    ["Booked", ride.created_at],
    ["Driver assigned", ride.assigned_at],
    ["Driver arrived", ride.arrived_at],
    ["Passenger onboard", ride.started_at],
    ["Completed", ride.completed_at],
  ];
  const recorded = events.filter(([, at]) => arubaLabel(at));

  return (
    <article
      className={`tp-card p-${placement} s-${status}`}
      aria-labelledby={`${ids.status} ${ids.when}`}
      aria-busy={busy || undefined}
    >
      {/* 1 · status */}
      <p className="tp-head">
        <span id={ids.status} className={`tp-status s-${status}`}>{STATUS_LABEL[status]}</span>
      </p>

      {/* 2 · when — the timezone named, because most guests read this from
          somewhere that isn't Aruba, and a bare "2:35 PM" is their clock. */}
      <h3 id={ids.when} className="tp-when">
        {when ? (
          <>
            <time dateTime={pickupAt ?? undefined}>{when}</time>
            <span className="tp-tz">Aruba time</span>
          </>
        ) : (
          <span>Pickup time to be confirmed</span>
        )}
      </h3>

      {/* 3 · where */}
      <div className="tp-route">
        <div className="rr-stop"><span className="ring" aria-hidden="true" /><span><span className="sr-only">From: </span>{ride.pickup_location}</span></div>
        <div className="rr-line" aria-hidden="true" />
        <div className="rr-stop"><span className="rdiamond" aria-hidden="true" /><span><span className="sr-only">To: </span>{ride.dropoff_location}</span></div>
      </div>

      {state.reviewReason && <p className="tp-review">{state.reviewReason}</p>}

      {placement === "upcoming" && <Progress status={status} />}

      {/* 4–5 · vehicle, flight */}
      {(vehicle || ride.flight_number) && (
        <dl className="tp-facts">
          {vehicle && <Fact k="Vehicle">{vehicle}</Fact>}
          {ride.flight_number && <Fact k="Flight">{ride.flight_number}</Fact>}
        </dl>
      )}

      {/* The live flight line, for an arrival still ahead. Gated to
          upcoming because flight lookups are billed per call and a Past
          shelf would ask about planes that landed last month. */}
      {placement === "upcoming" && <TripFlight ride={ride} />}

      {/* 6 · driver and vehicle, while a driver is on the trip */}
      {driverShown && (
        <div className="tp-driver">
          {ride.driver_photo
            ? <img className="tp-driver-ava" src={ride.driver_photo} alt={`Photo of ${ride.driver_name}, your driver`} />
            : <span className="tp-driver-ava tp-initials" aria-hidden="true">{initialsOf(ride.driver_name!)}</span>}
          <div className="tp-driver-info">
            <span className="tp-driver-k">Your driver</span>
            <b>{ride.driver_name}</b>
            {ride.driver_vehicle && <span>{ride.driver_vehicle}</span>}
            {/* The plate on its own line: a plate read out of the middle of
                a sentence is a plate nobody checks at the kerb. */}
            {ride.driver_plate && <span className="tp-plate"><span className="sr-only">Plate number: </span>{ride.driver_plate}</span>}
          </div>
        </div>
      )}

      {placement === "upcoming" && <PickupPin ride={ride} />}

      {/* 7–9 · payment, total, reference */}
      <dl className="tp-facts tp-money">
        <Fact k="Payment">
          <span className={`tp-pay pay-${pay}`}>{PAYMENT_LABEL[pay]}</span>
          <span className="tp-pay-d">{PAYMENT_DETAIL[pay]}</span>
        </Fact>
        {fare > 0 && <Fact k={TOTAL_LABEL[pay]} className="tp-total">{formatUsd(fare)}</Fact>}
        <Fact k="Booking reference" className="tp-reffact">{bookingRef}</Fact>
      </dl>

      {/* ── expandable detail ── */}
      {panel === "details" && (
        <div id={ids.panel} className="tp-panel" role="group" aria-label={placement === "cancelled" ? "Cancellation details" : "Trip details"}>
          {placement === "cancelled" ? (
            <>
              <p className="tp-panel-h">Cancellation details</p>
              <p className="tp-panel-note">{reason ? `Cancelled by Cabby's — ${reason}` : "Cancelled. No reason was recorded."}</p>
              <p className="tp-panel-note">{moneyOnCancelled}</p>
              <p className="tp-panel-note">A cancelled booking can't be reopened — book again and we'll take it from there.</p>
            </>
          ) : (
            <>
              <p className="tp-panel-h">{active ? "Live status" : "Trip details"}</p>
              {recorded.length > 0 ? (
                <ul className="tp-events">
                  {recorded.map(([label, at]) => (
                    <li key={label}><span>{label}</span><time dateTime={at ?? undefined}>{arubaLabel(at)}</time></li>
                  ))}
                </ul>
              ) : (
                <p className="tp-panel-note">Nothing recorded on this trip yet.</p>
              )}
              {(ride.passengers_count || ride.luggage_count) ? (
                <p className="tp-panel-note">
                  {[ride.passengers_count && `${ride.passengers_count} ${ride.passengers_count === 1 ? "passenger" : "passengers"}`,
                    ride.luggage_count && `${ride.luggage_count} ${ride.luggage_count === 1 ? "bag" : "bags"}`]
                    .filter(Boolean).join(" · ")}
                </p>
              ) : null}
              <p className="tp-panel-note">Times are Aruba time.</p>
            </>
          )}
        </div>
      )}

      {panel === "confirm" && (
        <div id={ids.panel} className="tp-panel tp-confirm" role="alertdialog" aria-labelledby={`${ids.panel}-h`}
          aria-describedby={`${ids.panel}-d`}>
          <p id={`${ids.panel}-h`} className="tp-panel-h">Cancel this booking?</p>
          <div id={`${ids.panel}-d`}>
            <p className="tp-panel-note">
              {policy.free
                ? "You're more than 24 hours from pickup, so cancelling is free."
                : "You're inside 24 hours of pickup — under our cancellation policy a fee may apply."}
            </p>
            <p className="tp-panel-note">{moneyOnCancel}</p>
          </div>
          <div className="tp-panel-row">
            <button type="button" className="btn-ghost tp-danger" onClick={() => void confirmCancel()} disabled={busy}>
              {busy ? "Cancelling…" : "Yes, cancel booking"}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setPanel(null)} disabled={busy} autoFocus>
              Keep booking
            </button>
          </div>
        </div>
      )}

      {(panel === "support" || panel === "change" || panel === "issue" || panel === "refund" || panel === "driver") && (
        <ContactPanel id={ids.panel} mode={panel} ride={ride} bookingRef={bookingRef} outline={outline}
          onClose={() => setPanel(null)} />
      )}

      {error && <div className="pay-error tp-error" role="alert">{error}</div>}

      {/* ── actions, by status ── */}
      <div className="tp-actions" role="group" aria-label={`Actions for booking ${bookingRef}`}>
        {placement === "review" && (
          <>
            <button type="button" className="btn-ghost tp-primary" aria-expanded={panel === "issue"} aria-controls={ids.panel}
              onClick={() => toggle("issue")}>Report an issue</button>
            <button type="button" className="btn-ghost" aria-expanded={panel === "support"} aria-controls={ids.panel}
              onClick={() => toggle("support")}>Contact support</button>
          </>
        )}

        {placement === "upcoming" && active && (
          <>
            <button type="button" className="btn-ghost tp-primary" aria-expanded={panel === "details"} aria-controls={ids.panel}
              onClick={() => toggle("details")}>Track status</button>
            {driverReachable && (
              <button type="button" className="btn-ghost" aria-expanded={panel === "driver"} aria-controls={ids.panel}
                onClick={() => toggle("driver")}>Contact driver</button>
            )}
            <button type="button" className="btn-ghost" aria-expanded={panel === "support"} aria-controls={ids.panel}
              onClick={() => toggle("support")}>Contact support</button>
          </>
        )}

        {placement === "upcoming" && !active && (
          <>
            <button type="button" className="btn-ghost" aria-expanded={panel === "details"} aria-controls={ids.panel}
              onClick={() => toggle("details")}>View details</button>
            <button type="button" className="btn-ghost" aria-expanded={panel === "change"} aria-controls={ids.panel}
              onClick={() => toggle("change")}>Request a change</button>
            <button type="button" className="btn-ghost" aria-expanded={panel === "support"} aria-controls={ids.panel}
              onClick={() => toggle("support")}>Contact support</button>
            {cancellable && (
              <button type="button" className="btn-ghost tp-danger" aria-expanded={panel === "confirm"} aria-controls={ids.panel}
                onClick={() => toggle("confirm")} disabled={busy}>Cancel booking</button>
            )}
          </>
        )}

        {status === "completed" && (
          <>
            {onBookAgain && (
              <button type="button" className="btn-ghost tp-primary" onClick={() => onBookAgain(ride)}>Book this route again</button>
            )}
            <button type="button" className="btn-ghost" onClick={() => setReceipt(true)}>
              {pay === "paid" ? "View receipt" : "Trip summary"}
            </button>
            <button type="button" className="btn-ghost" aria-expanded={panel === "issue"} aria-controls={ids.panel}
              onClick={() => toggle("issue")}>Report an issue</button>
          </>
        )}

        {status === "no_show" && (
          <>
            <button type="button" className="btn-ghost tp-primary" aria-expanded={panel === "issue"} aria-controls={ids.panel}
              onClick={() => toggle("issue")}>Report an issue</button>
            {onBookAgain && <button type="button" className="btn-ghost" onClick={() => onBookAgain(ride)}>Book again</button>}
          </>
        )}

        {placement === "cancelled" && (
          <>
            <button type="button" className="btn-ghost" aria-expanded={panel === "details"} aria-controls={ids.panel}
              onClick={() => toggle("details")}>Cancellation details</button>
            {onBookAgain && <button type="button" className="btn-ghost tp-primary" onClick={() => onBookAgain(ride)}>Book again</button>}
            {refundRelevant && (
              <button type="button" className="btn-ghost" aria-expanded={panel === "refund"} aria-controls={ids.panel}
                onClick={() => toggle("refund")}>{pay === "refunded" ? "Refund details" : "Ask about your refund"}</button>
            )}
          </>
        )}
      </div>

      {receipt && (
        <TripReceipt
          onClose={() => setReceipt(false)}
          isReceipt={pay === "paid"}
          bookingRef={bookingRef}
          when={when}
          from={ride.pickup_location}
          to={ride.dropoff_location}
          vehicle={vehicle}
          driver={ride.driver_name ?? null}
          payment={PAYMENT_LABEL[pay]}
          totalLabel={TOTAL_LABEL[pay]}
          total={fare > 0 ? formatUsd(fare) : null}
          issued={`${formatDate(todayInAruba(now))} · ${formatTime(nowInAruba(now))}`}
        />
      )}
    </article>
  );
}
