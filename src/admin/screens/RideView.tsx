// One ride, and everything an operator can do about it.
//
// The board's most important detail screen, because it is the one
// opened when something has gone wrong. Everything on it is arranged
// around that: the state of the ride first, then the two people
// involved and how to reach them, then the small set of things that can
// actually be done — and never all of them at once.
//
// THE ACTIONS ARE CONTEXTUAL, AND THAT IS THE WHOLE DESIGN. A control
// the database would refuse is not shown greyed out; it is absent, with
// the reason in its place. So:
//
//   nobody driving it   → the driver picker, and nothing else
//   assigned, not gone  → take it off this driver · cancel
//   already on a road   → cancel, with a sentence about what that means
//                         for a guest who is standing somewhere
//   completed           → nothing. Un-earning a driven ride rewrites the
//                         driver's own Earnings screen under them.
//   cancelled           → nothing, plus whether money is still held
//
// THE MAP IS DRAWN FROM THE PLACE NAMES, and says so. There is still no
// live location anywhere in this project: rides.pickup_lat/pickup_lng now
// have a writer, but it is a guest marking where they are standing at
// pickup — a point, once, not a moving car (see the header of
// src/driver/screens/RideDetail.tsx) — so this shows the ROUTE, pickup
// to destination, which is a real answer to "where is this ride going"
// rather than a guess at "where is the car". It reuses RouteMap, the
// same component the booking flow draws a quote with, rather than
// growing a second map: one map means one fallback, one attribution and
// one set of failure words.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import RouteMap from "../../components/booking/RouteMap";
import { jobDate, jobTime, relativeWhen } from "../../driver/JobCard";
import { findPlaceByName, selFromCustom, selFromPlace, AREAS, type PlaceSel } from "../../data/places";
import { formatFlightNumber } from "../../lib/flight";
import { normalizePhone } from "../../lib/contact";
import { awgToUsd, usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import AssignPanel from "../AssignPanel";
import RideFlight from "../RideFlight";
import {
  cancelRide, isClosed, isLive, loadAdminRide, moneyStillOutstanding, needsDriver,
  unassignRide, type AdminRide,
} from "../lib/admin";
import { Back, Banner, Chip, Fact, Head, Section, Skeleton, Unreadable, rideState, type Note } from "../ui";

/**
 * The walk a ride takes, as a position rather than as a progress bar.
 *
 * Seven steps were asked for — requested, accepted, driver assigned, on
 * the way, arrived, picked up, completed — and this is six, because in
 * THIS database "accepted" and "driver assigned" are the same event.
 * claim_ride() and admin_assign_ride() both write status
 * 'driver_assigned' and stamp assigned_at; there is no separate accept.
 * Drawing two steps over one moment would have left a dot that could
 * never light on its own, which is worse than an honest six.
 *
 * `at` is the column the database actually stamped. A step with no time
 * against it is a step not reached — never a time that was lost.
 */
interface Step {
  key: string;
  label: string;
  at: (r: AdminRide) => string | null;
  reached: (r: AdminRide) => boolean;
}

const RANK: Record<string, number> = {
  pending: 0, pending_payment: 0, confirmed: 1,
  driver_assigned: 2, en_route: 3, arrived: 4, in_progress: 5, completed: 6,
};

const STEPS: Step[] = [
  { key: "requested", label: "Requested",      at: (r) => r.createdAt,   reached: () => true },
  { key: "confirmed", label: "Confirmed",      at: () => null,           reached: (r) => (RANK[r.status] ?? 0) >= 1 },
  { key: "assigned",  label: "Driver assigned", at: (r) => r.assignedAt, reached: (r) => (RANK[r.status] ?? 0) >= 2 },
  { key: "en_route",  label: "On the way",     at: () => null,           reached: (r) => (RANK[r.status] ?? 0) >= 3 },
  { key: "arrived",   label: "Arrived",        at: (r) => r.arrivedAt,   reached: (r) => (RANK[r.status] ?? 0) >= 4 },
  { key: "aboard",    label: "Guest aboard",   at: (r) => r.startedAt,   reached: (r) => (RANK[r.status] ?? 0) >= 5 },
  { key: "completed", label: "Completed",      at: (r) => r.completedAt, reached: (r) => r.status === "completed" },
];

/** The three words api/stripe-webhook.ts writes into payment_status,
    in the operator's language. Anything else is printed as it came, so
    a new word from Stripe is visible rather than swallowed. */
const PAYMENT_WORDS: Record<string, string> = {
  authorized: "Authorised — held on the card, not taken",
  paid: "Paid — the card has been charged",
  failed: "Failed — the card did not go through",
};

/** How release_ride, admin_unassign_ride and admin_cancel_ride mark the
    notes column they share with the guest's own booking details. */
const HANDBACK = "Returned to pool:";
const CALLED_OFF = "Cancelled by Cabby's:";

/**
 * Three writers, one column, and only one of them is the guest.
 *
 * Step3Details writes the booking's own details into rides.notes;
 * release_ride and the two admin functions append to the same column.
 * Attributing "Car won't start" to a guest is worse than not showing
 * it, so the three are split apart and headed separately — the same
 * treatment src/driver/screens/RideDetail.tsx gives the same column.
 */
function splitNotes(notes: string | null) {
  const guest: string[] = [];
  const handbacks: string[] = [];
  const cancels: string[] = [];
  for (const line of (notes ?? "").split(" · ").map((s) => s.trim()).filter(Boolean)) {
    if (line.startsWith(HANDBACK)) handbacks.push(line.slice(HANDBACK.length).trim());
    else if (line.startsWith(CALLED_OFF)) cancels.push(line.slice(CALLED_OFF.length).trim());
    else guest.push(line);
  }
  return { guest, handbacks, cancels };
}

/**
 * A place name turned into something the map can draw.
 *
 * The catalog first, which knows where its places are. A name the
 * catalog does not hold — a villa, a typed address — still gets a point
 * through its area, because a map of the right end of the island beats
 * no map at all, and RouteMap labels the result a sketch either way.
 */
function selFor(name: string): PlaceSel | null {
  if (!name) return null;
  const place = findPlaceByName(name);
  if (place) return selFromPlace(place);
  // A custom pickup carries its area in the booking's own words often
  // enough to be worth a look before giving up on the map entirely.
  const area = AREAS.find((a) => name.toLowerCase().includes(a.name.toLowerCase()));
  return area ? selFromCustom(name, area) : null;
}

export default function RideView() {
  const { id = "" } = useParams();
  const board = useBoard();
  /** the board's own copy, when it has one — the fast path, and it is
      already fresh because every write refreshes the board */
  const fromBoard = board.rides.find((r) => r.id === id) ?? null;
  /** and the direct read, for a ride older than the board's window: a
      completed ride reached from Earnings or a customer's history is not
      in "today and ahead" and would otherwise 404 on its own page */
  const [fetched, setFetched] = useState<AdminRide | null | "missing">(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  /** which destructive thing is being confirmed, and its reason so far */
  const [ask, setAsk] = useState<"unassign" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => {
    const { ride: r, error } = await loadAdminRide(id);
    setFetchError(error);
    setFetched(error ? null : r ?? "missing");
  }, [id]);

  useEffect(() => {
    // Only when the board does not already hold it. The common case —
    // clicking a row on the requests list — costs no round trip at all.
    if (fromBoard) { setFetched(null); setFetchError(null); return; }
    if (board.loading) return;
    void pull();
  }, [fromBoard, board.loading, pull]);

  const ride = fromBoard ?? (fetched && fetched !== "missing" ? fetched : null);

  const refresh = useCallback(async () => {
    await board.refresh();
    if (!fromBoard) await pull();
  }, [board, fromBoard, pull]);

  const driver = useMemo(
    () => (ride?.driverId ? board.drivers.find((d) => d.id === ride.driverId) ?? null : null),
    [ride, board.drivers],
  );

  if (!ride) {
    if (board.ridesError && !fetchError) {
      return (
        <Screenframe>
          <Unreadable
            what="rides"
            detail={board.ridesError}
            reassure="Bookings aren't being blocked — this board just can't see them."
            onRetry={() => void refresh()}
          />
        </Screenframe>
      );
    }
    if (fetchError) {
      return (
        <Screenframe>
          <Unreadable
            what="ride"
            detail={fetchError}
            reassure="The booking is fine — this board just can't read it."
            onRetry={() => void pull()}
          />
        </Screenframe>
      );
    }
    if (fetched === "missing") {
      return (
        <Screenframe>
          <Back to="/admin/rides">All ride requests</Back>
          <Head kick="Ride" title={<>Nothing at <em>this link.</em></>}
            lead="This booking isn't there any more. It may have been deleted, or the link is out of date." />
        </Screenframe>
      );
    }
    return <Screenframe><Skeleton rows={3} /></Screenframe>;
  }

  const state = rideState(ride);
  const notes = splitNotes(ride.notes);
  const money = moneyStillOutstanding(ride.paymentStatus);
  const from = selFor(ride.pickup);
  const to = selFor(ride.dropoff);
  const guestPhone = ride.guestPhone ? normalizePhone(ride.guestPhone) : null;
  const driverPhone = ride.driverPhone ? normalizePhone(ride.driverPhone) : null;

  /** What a refusal reads as, wherever it came from — the database's own
      reason, never "something went wrong". Each one names a next move. */
  function refused(detail: string) {
    setNote({ tone: "bad", title: "That didn't go through", body: detail });
    setAsk(null);
    // Re-read either way: half of these refusals mean the ride changed
    // under the operator, and the screen in front of them is now wrong.
    void refresh();
  }

  function landed(title: string, body: string) {
    setNote({ tone: "ok", title, body });
    setAsk(null);
    setReason("");
    void refresh();
  }

  // The two writes are kept apart rather than folded into one call with a
  // branch on the result. They return different shapes for different
  // reasons — a cancellation hands back the payment state because
  // somebody has to go and settle it in Stripe — and a union picked apart
  // afterwards is how that sentence would eventually get dropped.
  async function commitCancel() {
    if (!ride) return;
    setBusy(true);
    const res = await cancelRide(ride.id, reason);
    setBusy(false);
    if (!res.ok) { refused(res.detail); return; }
    const held = moneyStillOutstanding(res.paymentStatus);
    landed(
      "Cancelled",
      // Two facts, both of which somebody has to act on, and neither of
      // which this app can do for them.
      [
        res.driverName ? `${res.driverName} has lost this job — tell them.` : "Nobody was on it.",
        held ?? "There's no payment recorded against this booking, so there's nothing to release.",
      ].join(" "),
    );
  }

  async function commitUnassign() {
    if (!ride) return;
    setBusy(true);
    const res = await unassignRide(ride.id, reason);
    setBusy(false);
    if (!res.ok) { refused(res.detail); return; }
    landed(
      "Taken off",
      `${res.driverName || "The driver"} is off this ride and it's back in the pool for anybody approved to take it. Tell them — a roster that changes without a word is how a driver stops trusting it.`,
    );
  }

  return (
    <Screenframe>
      <Back to="/admin/rides">All ride requests</Back>
      <Head
        kick={`Ride · ${ride.bookingRef || ride.id.slice(0, 8)}`}
        title={shortRoute(ride)}
        lead={
          ride.scheduledAt
            ? `${jobDate(ride.scheduledAt)} · ${jobTime(ride.scheduledAt)} · ${relativeWhen(ride.scheduledAt)}`
            : "This booking has no date on it, which is why no driver can see it in the pool."
        }
        action={<Chip tone={state.tone}>{state.label}</Chip>}
      />

      {note && <Banner note={note} onDismiss={() => setNote(null)} />}

      <div className="adm-detail">
        <div>
          <Section title="The booking">
            <Fact k="Passenger">{ride.guestName || <span className="q">No name given</span>}</Fact>
            <Fact k="Reach them">
              {guestPhone ? (
                <span className="adm-reach">
                  <a href={`tel:${guestPhone}`}>{ride.guestPhone}</a>
                  <a href={`https://wa.me/${guestPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                  {ride.guestEmail && <a href={`mailto:${ride.guestEmail}`}>{ride.guestEmail}</a>}
                </span>
              ) : ride.guestEmail ? (
                <a href={`mailto:${ride.guestEmail}`}>{ride.guestEmail}</a>
              ) : (
                <span className="q">No number and no address on this booking</span>
              )}
            </Fact>
            <Fact k="Pickup">{ride.pickup || <span className="q">—</span>}</Fact>
            <Fact k="Destination">{ride.dropoff || <span className="q">—</span>}</Fact>
            <Fact k="Scheduled">
              {ride.scheduledAt
                ? `${jobDate(ride.scheduledAt)} · ${jobTime(ride.scheduledAt)}`
                : <span className="q">Nothing set</span>}
            </Fact>
            <Fact k="Vehicle">{ride.vehicle || <span className="q">Not recorded</span>}</Fact>
            <Fact k="Party">
              {[
                ride.passengers != null ? `${ride.passengers} guest${ride.passengers === 1 ? "" : "s"}` : null,
                ride.luggage ? `${ride.luggage} bag${ride.luggage === 1 ? "" : "s"}` : null,
                ride.childSeats ? `${ride.childSeats} child seat${ride.childSeats === 1 ? "" : "s"}` : null,
              ].filter(Boolean).join(" · ") || <span className="q">Not recorded</span>}
            </Fact>
            {ride.flightNumber && (
              <Fact k="Flight">
                {/* What the guest typed, kept where it was — it is the
                    only thing on this screen that shows a typo, and a
                    typo is the likeliest reason the line below is
                    absent. */}
                {formatFlightNumber(ride.flightNumber)}
                <RideFlight ride={ride} />
              </Fact>
            )}
            <Fact k="Price">
              {/* What the GUEST was charged, which is the figure this
                  board is reconciled against. Never the driver's cut —
                  that is the driver portal's number, and putting the two
                  under one heading is how a ƒ89.50 job was once
                  advertised as "$90". */}
              {ride.fareAwg != null
                ? <>{usd(awgToUsd(ride.fareAwg))} <span className="q">charged to the guest</span></>
                : <span className="q">No fare recorded</span>}
            </Fact>
            <Fact k="Payment">
              {/* Stripe's own word, said as a sentence. "authorized"
                  printed bare is a state an operator has to remember the
                  meaning of, and the meaning is the part that decides
                  whether they owe somebody money. */}
              {ride.paymentStatus
                ? <>{PAYMENT_WORDS[ride.paymentStatus] ?? ride.paymentStatus}{money ? <div className="adm-fine">{money}</div> : null}</>
                : <span className="q">Nothing recorded — this booking predates card payment, or it was never authorised.</span>}
            </Fact>
          </Section>

          {(from || to) && (
            <Section
              title="The route"
              aside={<span>Drawn from the two place names. There is no live position for a Cabby's car.</span>}
            >
              <RouteMap from={from} to={to} height={230} />
            </Section>
          )}

          {notes.guest.length > 0 && (
            <Section title="What the guest told us">
              <ul className="adm-notes">
                {notes.guest.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </Section>
          )}

          {(notes.handbacks.length > 0 || notes.cancels.length > 0) && (
            <Section title="What happened to it">
              <ul className="adm-notes">
                {notes.handbacks.map((line, i) => <li key={`h${i}`}><b>Handed back:</b> {line}</li>)}
                {notes.cancels.map((line, i) => <li key={`c${i}`}><b>Called off:</b> {line}</li>)}
              </ul>
            </Section>
          )}
        </div>

        <div className="adm-aside">
          <Section title="Where it has got to">
            <ol className="adm-time">
              {STEPS.map((s) => {
                const reached = s.reached(ride);
                const at = s.at(ride);
                const current = reached && !STEPS[STEPS.indexOf(s) + 1]?.reached(ride);
                const cls = ride.status === "cancelled" && current ? "off" : current ? "at" : reached ? "done" : "";
                return (
                  <li key={s.key} className={cls}>
                    <span className="dot" aria-hidden="true" />
                    <span className="lb">{s.label}</span>
                    {at && <span className="tm">{jobDate(at)} · {jobTime(at)}</span>}
                    {/* Said in a word, never by the ring alone. */}
                    {current && ride.status !== "cancelled" && <span className="tm">Where it is now</span>}
                  </li>
                );
              })}
              {ride.status === "cancelled" && (
                <li className="off">
                  <span className="dot" aria-hidden="true" />
                  <span className="lb">Cancelled</span>
                  <span className="tm">This booking will not run</span>
                </li>
              )}
            </ol>
          </Section>

          <Section title="Driver">
            {ride.driverId ? (
              <>
                <Fact k="On this ride">{ride.driverName || <span className="q">Assigned, but no name was stamped</span>}</Fact>
                <Fact k="Car the guest sees">
                  {ride.driverVehicle || ride.driverPlate
                    ? [ride.driverVehicle, ride.driverPlate].filter(Boolean).join(" · ")
                    : <span className="q">Nothing — this guest has no car to look for at the kerb.</span>}
                </Fact>
                {driver && (
                  <Fact k="Their status">
                    {driver.status === "approved" ? (driver.isOnline ? "Approved · on duty" : "Approved · off duty") :
                     driver.status === "suspended" ? "On hold — they can't take new work, but they still hold this one" :
                     "Waiting on approval"}
                  </Fact>
                )}
                <Fact k="Reach them">
                  {driverPhone ? (
                    <span className="adm-reach">
                      <a href={`tel:${driverPhone}`}>{ride.driverPhone}</a>
                      <a href={`https://wa.me/${driverPhone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                    </span>
                  ) : (
                    <span className="q">No number stamped on this ride</span>
                  )}
                </Fact>
              </>
            ) : (
              <p className="adm-fine">
                {isClosed(ride)
                  ? `Nobody drove this — it was ${ride.status === "cancelled" ? "called off" : "closed"} without a driver.`
                  : "Nobody is driving this yet."}
              </p>
            )}
          </Section>

          {/* ── the only place on this screen with buttons ── */}
          {needsDriver(ride) && (
            <Section title="Put somebody on it">
              <AssignPanel
                ride={ride}
                drivers={board.drivers}
                driversError={board.driversError}
                rides={board.rides}
                onAssigned={(body) => { setNote({ tone: "ok", title: "Assigned", body }); void refresh(); }}
                onRefused={(detail) => { setNote({ tone: "bad", title: "Not assigned", body: detail }); void refresh(); }}
              />
            </Section>
          )}

          {!isClosed(ride) && (
            <Section title="Change it">
              {ask ? (
                <div className={`adm-ask${ask === "cancel" ? " bad" : ""}`}>
                  <div className="ck">
                    {ask === "cancel" ? "Call this booking off?" : `Take this ride off ${ride.driverName || "the driver"}?`}
                  </div>
                  <p>
                    {ask === "cancel"
                      ? `${ride.guestName || "The guest"} will see this booking as cancelled. ${isLive(ride) ? "The driver is already on the road, so call them before you do this. " : ""}${money ?? "No money is recorded against it."}`
                      : "The ride goes back into the pool for any approved driver, and the car currently stamped on it comes off — so the guest stops being told to look for it. Tell the driver: a roster that changes without a word is how a driver stops trusting it."}
                  </p>
                  <label className="adm-reason">
                    <span>
                      {ask === "cancel"
                        ? "Why it's being called off. The database refuses this without one, and it's what whoever reads this booking next has instead of the phone call."
                        : "Why it's moving. The next driver to see this ride reads it."}
                    </span>
                    <textarea
                      rows={2}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={ask === "cancel" ? "Guest cancelled by WhatsApp" : "Driver's car won't start"}
                    />
                  </label>
                  <div className="adm-acts">
                    <button
                      type="button"
                      className={`adm-btn ${ask === "cancel" ? "stop" : "go"}`}
                      disabled={busy || !reason.trim()}
                      onClick={() => void (ask === "cancel" ? commitCancel() : commitUnassign())}
                    >
                      {busy ? "…" : ask === "cancel" ? "Yes, cancel it" : "Yes, take it off"}
                    </button>
                    <button type="button" className="adm-btn" disabled={busy}
                      onClick={() => { setAsk(null); setReason(""); }}>
                      Keep it as it is
                    </button>
                  </div>
                  {!reason.trim() && (
                    <p className="adm-fine">Say why first — the database refuses this without a reason.</p>
                  )}
                </div>
              ) : (
                <div className="adm-acts start">
                  {/* Only offered where admin_unassign_ride would accept
                      it. Once a driver is en route, who is driving this
                      is a question being answered on a road. */}
                  {ride.status === "driver_assigned" && (
                    <button type="button" className="adm-btn" onClick={() => setAsk("unassign")}>
                      Take it off this driver
                    </button>
                  )}
                  <button type="button" className="adm-btn stop" onClick={() => setAsk("cancel")}>
                    Cancel this booking
                  </button>
                  {isLive(ride) && (
                    <p className="adm-fine">
                      This ride is under way, so it can't be moved to another driver from here — that is
                      a phone call. It can still be called off.
                    </p>
                  )}
                </div>
              )}
              {/* There is no refund button, and there cannot be one: this
                  project has no server-side Stripe path that refunds or
                  voids anything, and the browser will never hold the
                  secret key. Saying so beats a button that fails. */}
              <p className="adm-fine">
                Money is settled in Stripe, not here. Nothing on this board can refund a charge or
                release a hold.
              </p>
            </Section>
          )}

          {isClosed(ride) && (
            <Section title="Change it">
              <p className="adm-fine">
                {ride.status === "completed"
                  ? "This ride has been driven. Nothing here can undo that — it is the driver's own earnings figure, and rewriting it under them is how a driver stops trusting the number."
                  : "This booking is cancelled and nothing here will act on it again."}
                {money ? ` ${money}` : ""}
              </p>
            </Section>
          )}
        </div>
      </div>
    </Screenframe>
  );
}

/** "Airport → Ritz-Carlton" — the headline form, short enough to be a
    title. The exact names are spelled out in the facts below it. */
function shortRoute(r: AdminRide): string {
  const trim = (s: string) => (s.length > 26 ? `${s.slice(0, 24)}…` : s || "—");
  return `${trim(r.pickup)} → ${trim(r.dropoff)}`;
}

function Screenframe({ children }: { children: React.ReactNode }) {
  return <div className="adm-view"><div className="adm-pad">{children}</div></div>;
}
