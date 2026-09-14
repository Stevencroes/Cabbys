// One driver, all of them at once — and this is the screen the Drivers
// table was emptied into.
//
// Everything the brief asks a driver profile to hold is here: who they
// are, how to reach them, their paperwork, the car they drive, the work
// they have, how they are performing, what they have earned, and
// whether they can work at all. None of it is on the directory, because
// a directory carrying nine facts per person is a directory nobody
// scans.
//
// NOTHING HERE WAS REBUILT. The document review is DriverDocs, the same
// component another session wrote against docs/onboarding-schema.sql —
// signed one-minute links, a rejection that the database refuses without
// a sentence, and nothing in it that approves anybody. It is mounted
// here instead of inside a table row, which is the only change: a
// decision about a person should not push the person off the screen.
//
// Approve and Put on hold moved with it, unchanged in behaviour and in
// the rule they keep — a control the database would refuse is not shown
// disabled, it is absent, with the reason in its place. Approve does not
// appear on an approved driver; nothing at all appears on a drivers row
// with no auth account behind it, because every write path in this
// project keys on the auth id and there is nothing there to key on.
//
// The money is this driver's PAYOUT, in USD — what Cabby's owes them,
// not what the guests were charged. It is computed with the same
// driverPayoutUsd() the driver's own Earnings screen uses, so the two
// screens cannot disagree about a figure the driver checks.
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import DriverDocs from "../DriverDocs";
import { jobDateShort, jobTime, shortAirport } from "../../driver/JobCard";
import {
  identifiable, vehicleLabel,
  type DriverProfile as Driver, type DriverStatus,
} from "../../driver/lib/driver";
import { acceptedCount, DRIVER_DOCUMENTS } from "../../driver/lib/documents";
import { usd } from "../../lib/quote";
import { todayInAruba, weekDays } from "../../lib/datetime";
import { useBoard } from "../BoardContext";
import { isClosed, loadRideHistory, setDriverStatus, type AdminRide } from "../lib/admin";
import { byDay, total, totalOver } from "../lib/ledger";
import { Back, Banner, Chip, Empty, Fact, Figures, Head, Section, Skeleton, Unreadable, rideState, type Note } from "../ui";

const STATUS_LABEL: Record<DriverStatus, string> = {
  pending: "Waiting on approval",
  approved: "Approved",
  suspended: "On hold",
};

export default function DriverProfileScreen() {
  const { id = "" } = useParams();
  const board = useBoard();
  const driver = board.drivers.find((d) => d.id === id) ?? null;

  /** their finished work, for the money and the history. Loaded here and
      not in the board's working set: four months of rides behind every
      navigation would have been paid for by seven screens that never
      look at it. */
  const [past, setPast] = useState<AdminRide[] | null>(null);
  const [pastError, setPastError] = useState<string | null>(null);
  const [ask, setAsk] = useState<DriverStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  useEffect(() => {
    let live = true;
    void loadRideHistory().then(({ rides, error }) => {
      if (!live) return;
      setPastError(error);
      setPast(error ? null : rides);
    });
    return () => { live = false; };
  }, []);

  const commit = useCallback(async (next: DriverStatus) => {
    if (!driver) return;
    setBusy(true);
    const res = await setDriverStatus(driver.id, next);
    setBusy(false);
    setAsk(null);

    if (!res.ok) {
      // The database's own reason, not "something went wrong". Every one
      // of them names a different next move.
      setNote({ tone: "bad", title: "That didn't go through", body: res.detail });
      return;
    }

    const who = driver.fullName || "That driver";
    if (next === "approved") {
      setNote({
        tone: "ok",
        title: "Approved",
        body: identifiable(driver)
          ? `${who} can take jobs now. They'll see it the next time they open the portal, or when they tap "Check if I'm approved".`
          // The fault this project spent a session fixing, caught one
          // step earlier: claim_ride stamps whatever the drivers row
          // holds onto the ride, and if it holds nothing the guest's
          // booking shows no car and somebody watches an empty kerb.
          : `${who} can take jobs now — but there's no complete car on record, so any ride they take will show the guest no plate and no face to look for. They fill that in under Profile in the driver portal.`,
      });
    } else if (next === "suspended") {
      setNote({
        tone: "ok",
        title: "On hold",
        body: res.heldRides > 0
          // Suspending deliberately does NOT strip their work — a ride
          // silently unassigned at 5am is a guest waiting for a car
          // nobody is driving. But the consequence has to be said, or it
          // is invisible until the guest calls.
          ? `${who} can't take new jobs. They still hold ${res.heldRides} ride${res.heldRides === 1 ? "" : "s"} that stay${res.heldRides === 1 ? "s" : ""} assigned to them — those don't come back on their own. Take one off them from its own page if somebody else should drive it.`
          : `${who} can't take jobs, and holds none right now. Nothing else changed.`,
      });
    } else {
      setNote({ tone: "ok", title: "Back to waiting", body: `${who} is pending again and can't take jobs until approved.` });
    }
    void board.refresh();
  }, [driver, board]);

  if (board.driversError) {
    return (
      <Frame>
        <Back to="/admin/drivers">All drivers</Back>
        <Unreadable
          what="drivers"
          detail={board.driversError}
          reassure="Your drivers are fine — this board just can't see them."
          onRetry={() => void board.refresh()}
        />
      </Frame>
    );
  }

  if (board.loading) return <Frame><Skeleton rows={4} /></Frame>;

  if (!driver) {
    return (
      <Frame>
        <Back to="/admin/drivers">All drivers</Back>
        <Head kick="Driver" title={<>No driver at <em>this link.</em></>}
          lead="There's no driver with that account id. They may have been removed, or the link is out of date." />
      </Frame>
    );
  }

  const car = vehicleLabel(driver);
  const gaps = missing(driver, car);
  const papers = board.docs.get(driver.id) ?? [];
  const accepted = acceptedCount(papers);

  const mine = board.rides.filter((r) => r.driverId === driver.id);
  const ahead = mine.filter((r) => !isClosed(r));
  const theirPast = (past ?? []).filter((r) => r.driverId === driver.id);
  const days = byDay(theirPast);
  const thisWeek = totalOver(weekDays(todayInAruba()), days);
  const allTime = total(theirPast);

  return (
    <Frame>
      <Back to="/admin/drivers">All drivers</Back>
      <Head
        kick="Driver"
        title={<>{driver.fullName || <em>No name on record</em>}</>}
        lead={[car || "No car on record", driver.plate, driver.phone].filter(Boolean).join(" · ")}
        action={<Chip tone={driver.status === "approved" ? "live" : driver.status === "suspended" ? "alert" : "warn"}>
          {STATUS_LABEL[driver.status]}
        </Chip>}
      />

      {note && <Banner note={note} onDismiss={() => setNote(null)} />}

      <Figures
        items={[
          { label: "Trips", value: String(driver.tripsCount) },
          { label: "Rating", value: driver.rating != null ? driver.rating.toFixed(1) : "—" },
          // $0 and "we couldn't look" are different answers, and only one
          // of them means a driver is owed nothing. Printing the first
          // over an unreadable table is how somebody gets told they
          // earned nothing in a week they worked.
          {
            label: "Owed this week",
            value: pastError ? "—" : past === null ? "…" : usd(thisWeek.payoutUsd),
            note: pastError ? "their history couldn't be read" : past === null ? "reading their history" : `${thisWeek.rides} completed`,
          },
          {
            label: "Papers accepted",
            value: board.docsError ? "—" : `${accepted} of ${DRIVER_DOCUMENTS.length}`,
            alarm: !board.docsError && accepted < DRIVER_DOCUMENTS.length,
            note: board.docsError ? "couldn't be read" : undefined,
          },
        ]}
      />

      <div className="adm-detail">
        <div>
          <Section title="Who they are">
            <div className="adm-idcard">
              {driver.photoUrl
                ? <img className="adm-face" src={driver.photoUrl} alt="" width={72} height={72} />
                : <span className="adm-face gap" aria-hidden="true">{(driver.fullName || "·").trim().charAt(0).toUpperCase()}</span>}
              <div className="adm-idfacts">
                <Fact k="Name">{driver.fullName || <span className="q">Nothing on record — the guest sees this on every ride they take</span>}</Fact>
                <Fact k="Phone">
                  {driver.phone
                    ? <a href={`tel:${driver.phone}`}>{driver.phone}</a>
                    : <span className="q">No number — this is the one field they can change themselves</span>}
                </Fact>
                <Fact k="Account">
                  {driver.id
                    ? <span className="mono">{driver.id}</span>
                    : <span className="q">No account linked. Nothing on this board can act on them until they sign up.</span>}
                </Fact>
              </div>
            </div>
            {gaps.length > 0 && (
              <p className="adm-fine warn">
                A guest at the kerb has nothing to go on: this driver has no {gaps.join(", no ")} on
                record. Every ride they take is stamped with what is there.
              </p>
            )}
          </Section>

          <Section title="The car they bring">
            <Fact k="Vehicle">{car || <span className="q">Nothing on record</span>}</Fact>
            <Fact k="Plate">{driver.plate ? <span className="adm-plate">{driver.plate}</span> : <span className="q">No plate</span>}</Fact>
            <Fact k="Capacity">
              {driver.seats || driver.bags
                ? [driver.seats ? `${driver.seats} seats` : null, driver.bags ? `${driver.bags} bags` : null].filter(Boolean).join(" · ")
                : <span className="q">Not recorded</span>}
            </Fact>
            <Fact k="Year">{driver.year ?? <span className="q">Not recorded</span>}</Fact>
            {/* There is no vehicles table in this project: a car is six
                columns on this driver, and it belongs to them. Saying so
                here is cheaper than a fleet screen that implies
                otherwise. */}
            <p className="adm-fine">
              A car in this system belongs to its driver — one each, set by them under Profile in the
              driver portal, and stamped onto every ride they take.
            </p>
          </Section>

          <Section title="Paperwork">
            <DriverDocs
              driverUserId={driver.id}
              driverName={driver.fullName}
              records={papers}
              unreadable={board.docsError}
              onReviewed={() => void board.refresh()}
            />
          </Section>

          <Section title="Their work" aside={<span>{ahead.length} ahead · {theirPast.length} in the last four months</span>}>
            {ahead.length === 0 && theirPast.length === 0 ? (
              <Empty
                line="Nothing on their roster."
                hint={pastError
                  ? "And their history couldn't be read, so this is not the same as them never having driven."
                  : "They haven't taken any work from today on, and nothing in the last four months."}
              />
            ) : (
              <div className="adm-list">
                {[...ahead, ...theirPast.slice(0, 10)].map((r) => {
                  const st = rideState(r);
                  return (
                    <Link className={`adm-row${isClosed(r) ? " past" : ""}`} key={r.id} to={`/admin/rides/${r.id}`}>
                      <span className="adm-rtime">
                        {r.scheduledAt ? jobTime(r.scheduledAt) : "—"}
                        <small>{jobDateShort(r.scheduledAt) || "no date"}</small>
                      </span>
                      <span className="adm-rmain">
                        <span className="a">{shortAirport(r.pickup)} → {shortAirport(r.dropoff)}</span>
                        <span className="b">{r.guestName || "No name given"}</span>
                      </span>
                      <span className="adm-rmain adm-rsub adm-drop">
                        <span className="b">{r.vehicle || "—"}</span>
                      </span>
                      <span className="adm-rmain adm-rsub adm-drop" />
                      <span className="adm-rend"><Chip tone={st.tone}>{st.label}</Chip></span>
                    </Link>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div className="adm-aside">
          <Section title="Can they work?">
            {/* Never a control the database would refuse. Approving an
                approved driver is a no-op that still writes a row and
                still reports success, which is worse than not offering
                it: it teaches an operator that the button means nothing. */}
            {!driver.id ? (
              <p className="adm-fine">
                This row has no auth account behind it, so nothing here can change it.
                admin_set_driver_status matches on user_id, and there is none —
                they have to sign up at /drive before they can be approved.
              </p>
            ) : ask ? (
              <div className={`adm-ask${ask === "suspended" ? " bad" : ""}`}>
                <div className="ck">
                  {ask === "approved"
                    ? (driver.status === "suspended" ? "Let them drive again?" : "Approve this driver?")
                    : "Stop them taking jobs?"}
                </div>
                <p>{question(driver, ask, gaps)}</p>
                {/* The paperwork, said at the moment of the decision. It
                    does not block anything: the operator may have seen
                    the licence on WhatsApp last year, and a board that
                    refused to approve until five PDFs existed would stop
                    Cabby's taking on a driver it already trusts. */}
                {ask === "approved" && !board.docsError && accepted < DRIVER_DOCUMENTS.length && (
                  <p className="adm-fine">
                    You've accepted {accepted} of their {DRIVER_DOCUMENTS.length} documents. Approving
                    doesn't wait for the rest — have a look at Paperwork first if that matters here.
                  </p>
                )}
                <div className="adm-acts start">
                  <button
                    type="button"
                    className={`adm-btn ${ask === "suspended" ? "stop" : "go"}`}
                    disabled={busy}
                    onClick={() => void commit(ask)}
                  >
                    {busy ? "…" : ask === "approved" ? "Yes, approve" : "Yes, put on hold"}
                  </button>
                  <button type="button" className="adm-btn" disabled={busy} onClick={() => setAsk(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="adm-acts start">
                {driver.status !== "approved" && (
                  <button type="button" className="adm-btn go" onClick={() => { setNote(null); setAsk("approved"); }}>
                    {driver.status === "suspended" ? "Reinstate" : "Approve"}
                  </button>
                )}
                {driver.status !== "suspended" && (
                  <button type="button" className="adm-btn stop" onClick={() => { setNote(null); setAsk("suspended"); }}>
                    Put on hold
                  </button>
                )}
              </div>
            )}
          </Section>

          <Section title="Availability">
            <Fact k="On duty">
              {driver.isOnline ? "Yes — they have the portal switched on" : "No — they are not taking work right now"}
            </Fact>
            {/* Said plainly rather than implied by a switch nobody here
                can flip: is_online is the driver's own toggle, and this
                board has no write path to it. */}
            <p className="adm-fine">
              Drivers set this themselves in their own portal. Nothing on this board changes it —
              putting somebody on hold is the operator's control, and it is above.
            </p>
          </Section>

          <Section title="What they've earned">
            {pastError ? (
              <p className="adm-fine" role="alert">
                Their finished work couldn't be read, so these figures would be wrong rather than
                zero. {pastError}
              </p>
            ) : past === null ? (
              <p className="adm-fine">Reading their history.</p>
            ) : (
              <>
                <Fact k="This week">{usd(thisWeek.payoutUsd)} <span className="q">over {thisWeek.rides} ride{thisWeek.rides === 1 ? "" : "s"}</span></Fact>
                <Fact k="Last four months">{usd(allTime.payoutUsd)} <span className="q">over {allTime.rides} ride{allTime.rides === 1 ? "" : "s"}</span></Fact>
                <Fact k="Guests paid">{usd(allTime.grossUsd)} <span className="q">the difference is Cabby's commission</span></Fact>
                <p className="adm-fine">
                  This is the same arithmetic the driver sees on their own Earnings screen, from the
                  same function — so the two cannot disagree about what they are owed.
                </p>
              </>
            )}
          </Section>
        </div>
      </div>
    </Frame>
  );
}

/**
 * What a guest at a kerb would not be able to see.
 *
 * NOT missingIdentity() from the driver library, and that is the one
 * thing worth knowing about this function: that list is written in the
 * second person — "your car", "a photo of yourself" — because it is
 * read by the driver on their own profile, where it is an instruction.
 * Printed on the operator's screen it becomes "this driver is missing
 * your car", which is somewhere between confusing and comic. Same four
 * checks, same order, said about somebody rather than to them.
 */
function missing(d: Driver, car: string): string[] {
  if (identifiable(d)) return [];
  return [
    d.fullName.trim() ? null : "a name",
    car ? null : "a car",
    d.plate?.trim() ? null : "a plate",
    d.photoUrl?.trim() ? null : "a photo",
  ].filter((v): v is string => Boolean(v));
}

/** The sentence above the two buttons. It is the whole value of the
    confirmation, so it says what will happen rather than "are you sure". */
function question(d: Driver, next: DriverStatus, gaps: string[]): string {
  const who = d.fullName || "This driver";
  if (next === "suspended") {
    return `${who} will stop being offered work immediately, and claim_ride will refuse them. Rides they already hold stay theirs — take those off them from each ride's own page if they need moving.`;
  }
  if (gaps.length > 0) {
    return `${who} will be able to claim jobs straight away. They're still missing ${gaps.join(", ")} — every ride they take is stamped with what's on their record, so their guests would have nothing to look for at the kerb. Approving is fine; they need to fill that in under Profile before they drive.`;
  }
  return `${who} will be able to claim jobs straight away, and every ride they take will be stamped with their car and plate.`;
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="adm-view"><div className="adm-pad">{children}</div></div>;
}
