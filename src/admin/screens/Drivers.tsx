// Drivers — the screen that used to be a SQL prompt.
//
// The last section of docs/driver-schema.sql tells whoever runs Cabby's
// to approve their drivers by hand:
//
//     update public.drivers set status = 'approved' where user_id = '…';
//
// That is what this table replaces, and everything about it follows from
// that sentence. A hand-typed UPDATE shows you nothing before you run it
// and tells you nothing after: you cannot see whether the person you are
// about to approve has a car on record, you cannot see whether the one
// you are about to suspend is driving somebody to the airport in the
// morning, and a missing where clause approves everybody. Each of those
// is answered here, on the row, before the tap.
//
// Two rules from the house style are load-bearing on this screen:
//
//  · A control the database would refuse is never shown. Approve does
//    not appear on an approved driver and Suspend does not appear on a
//    suspended one — not disabled, absent, with the reason in its place.
//  · A table that could not be read is never reported as a table with
//    nobody in it. "drivers: read as admin" is an additive RLS policy
//    from docs/admin-schema.sql; on a project where that file has not
//    been run, the select succeeds and returns zero rows. An operator
//    told "no drivers yet" would go and re-create people who are
//    already there.
import { useCallback, useEffect, useState } from "react";
import {
  identifiable, vehicleLabel,
  type DriverProfile, type DriverStatus,
} from "../../driver/lib/driver";
import { loadAllDrivers, setDriverStatus } from "../lib/admin";

/** Waiting first. It is the only row on this screen with a deadline on
    it: a driver who applied yesterday is sitting outside the portal
    looking at "Application received" until somebody here acts. */
const ORDER: Record<DriverStatus, number> = { pending: 0, approved: 1, suspended: 2 };

const STATUS_LABEL: Record<DriverStatus, string> = {
  pending: "Waiting",
  approved: "Approved",
  suspended: "On hold",
};

/** What the row is being asked to confirm. */
interface Ask {
  driver: DriverProfile;
  next: DriverStatus;
}

/** What happened after it landed, in words. */
interface Note {
  tone: "ok" | "bad";
  title: string;
  body: string;
}

export default function Drivers() {
  const [drivers, setDrivers] = useState<DriverProfile[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  const refresh = useCallback(async () => {
    const { drivers: rows, error } = await loadAllDrivers();
    setFailed(error);
    setDrivers(error ? null : [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status]));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function commit(a: Ask) {
    setBusy(true);
    const res = await setDriverStatus(a.driver.id, a.next);
    setBusy(false);
    setAsk(null);

    if (!res.ok) {
      // The database's own reason, not "something went wrong". Every one
      // of them names a different next move.
      setNote({ tone: "bad", title: "That didn't go through", body: res.detail });
      return;
    }

    const who = a.driver.fullName || "That driver";
    if (a.next === "approved") {
      setNote({
        tone: "ok",
        title: "Approved",
        body: identifiable(a.driver)
          ? `${who} can take jobs now. They'll see it the next time they open the portal, or when they tap "Check if I'm approved".`
          // The fault this project spent a session fixing, caught one
          // step earlier. claim_ride() stamps whatever the drivers row
          // holds onto the ride; if it holds nothing, the guest's
          // booking shows no car and somebody stands at arrivals
          // watching an empty kerb.
          : `${who} can take jobs now — but there's no complete car on record, so any ride they take will show the guest no plate and no face to look for. They fill that in under Profile in the driver portal.`,
      });
    } else if (a.next === "suspended") {
      setNote({
        tone: "ok",
        title: "On hold",
        body: res.heldRides > 0
          // Suspending deliberately does NOT strip their work — a ride
          // silently unassigned at 5am is a guest waiting for a car
          // nobody is driving. But the consequence has to be said, or it
          // is invisible until the guest calls.
          ? `${who} can't take new jobs. They still hold ${res.heldRides} ride${res.heldRides === 1 ? "" : "s"} that stay${res.heldRides === 1 ? "s" : ""} assigned to them — those don't come back on their own. Check Rides if somebody else should drive them.`
          : `${who} can't take jobs, and holds none right now. Nothing else changed.`,
      });
    } else {
      setNote({ tone: "ok", title: "Back to waiting", body: `${who} is pending again and can't take jobs until approved.` });
    }
    void refresh();
  }

  const waiting = (drivers ?? []).filter((d) => d.status === "pending").length;

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <div className="adm-head">
          <div>
            <div className="kick">Drivers</div>
            <h1 className="big">Who can <em>drive.</em></h1>
            <p className="sub">
              {drivers === null
                ? "Approving a driver used to be a hand-typed SQL statement. This is that statement, with the row in front of you."
                : `${drivers.length} driver${drivers.length === 1 ? "" : "s"}${waiting > 0 ? ` · ${waiting} waiting on approval` : ""}`}
            </p>
          </div>
        </div>

        {note && (
          <div className={`adm-note ${note.tone === "ok" ? "ok" : "bad"}`} role={note.tone === "ok" ? "status" : "alert"}>
            <div className="nb">
              <div className="nk">{note.title}</div>
              <p>{note.body}</p>
            </div>
            <button type="button" onClick={() => setNote(null)} aria-label="Dismiss">✕</button>
          </div>
        )}

        {/* Read the three answers in order, because two of them look
            identical in a naive list: nothing loaded yet, a table that
            could not be read, and a table with nobody in it. */}
        {drivers === null ? (
          failed ? (
            // Not "no drivers" — the table could not be read at all. Said
            // plainly, with the database's own words, because the fix is
            // in Supabase and not on this screen.
            <div className="adm-empty" role="alert">
              <div className="es">Can't read the drivers.</div>
              <p className="et">
                Your drivers are fine — this board just can't see them. The most likely
                reason is that docs/admin-schema.sql hasn't been run on this project, so
                there's no policy admitting an admin to this table.
              </p>
              <p className="et mono">{failed}</p>
              <button type="button" className="adm-btn" onClick={() => void refresh()}>Try again</button>
            </div>
          ) : (
            <div className="adm-empty"><p className="et">Reading the driver list.</p></div>
          )
        ) : drivers.length === 0 ? (
          <div className="adm-empty">
            <div className="es">No drivers yet.</div>
            <p className="et">
              A driver appears here as soon as they have a row in the drivers table.
              They sign in at /drive with the account Cabby's set up for them.
            </p>
          </div>
        ) : (
          <div className="adm-tablewrap">
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Driver</th>
                    <th scope="col">Car</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="right adm-drop">Trips</th>
                    <th scope="col" className="right adm-drop">Rating</th>
                    <th scope="col" className="right">{/* actions */}</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => {
                    const car = vehicleLabel(d);
                    const asking = ask?.driver.id === d.id;
                    return (
                      <Row
                        key={d.id}
                        driver={d}
                        car={car}
                        asking={asking}
                        ask={asking ? ask : null}
                        busy={busy}
                        onAsk={(next) => { setNote(null); setAsk({ driver: d, next }); }}
                        onCancel={() => setAsk(null)}
                        onConfirm={(a) => void commit(a)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  driver: DriverProfile;
  car: string;
  asking: boolean;
  ask: Ask | null;
  busy: boolean;
  onAsk: (next: DriverStatus) => void;
  onCancel: () => void;
  onConfirm: (a: Ask) => void;
}

function Row({ driver: d, car, asking, ask, busy, onAsk, onCancel, onConfirm }: RowProps) {
  const initial = (d.fullName || "·").trim().charAt(0).toUpperCase();
  const gaps = missing(d, car);

  return (
    <>
      <tr className={asking ? "picked" : ""}>
        <td data-h="Driver">
          <div className="adm-person">
            {d.photoUrl
              ? <img src={d.photoUrl} alt="" />
              : <span className="ph gap" aria-hidden="true">{initial}</span>}
            <span className="adm-two">
              <span className="a">{d.fullName || "No name on record"}</span>
              <span className="b">{d.phone || "No phone"}</span>
            </span>
          </div>
        </td>
        <td data-h="Car">
          <span className="adm-two">
            <span className="a">{car || "—"}</span>
            <span className="b">{d.plate ? <span className="adm-plate">{d.plate}</span> : "No plate"}</span>
          </span>
        </td>
        <td data-h="Status" className="nowrap">
          <span className={`adm-chip ${d.status}`}>{STATUS_LABEL[d.status]}</span>
          {/* Only meaningful for a driver who is allowed to work — an
              "Online" flag under a suspended driver reads as a
              contradiction, and the database agrees with the chip. */}
          {d.status === "approved" && d.isOnline && (
            <span className="adm-two"><span className="b">On duty</span></span>
          )}
        </td>
        <td data-h="Trips" className="right adm-drop num">{d.tripsCount}</td>
        <td data-h="Rating" className="right adm-drop num">{d.rating != null ? d.rating.toFixed(1) : "—"}</td>
        <td className="right">
          {/* Never a control the database would refuse. Approving an
              approved driver is a no-op that still writes a row and
              still reports success, which is worse than not offering
              it: it teaches an operator that the button means nothing. */}
          {/* v2. Same rule, one step further back: a drivers row with no
              user_id is one NO write path in this project can address.
              admin_set_driver_status matches on user_id, claim_ride
              stamps auth.uid(), every policy keys on it — so a row
              without one is a record of a person, not an account. The
              board used to offer Approve on it anyway and the tap came
              back "no driver record for that account", which reads as a
              bug in the button rather than a gap in the row. */}
          {!d.id ? (
            <span className="adm-two">
              <span className="b">No account linked — they have to sign up before they can be approved</span>
            </span>
          ) : (
          <div className="adm-acts">
            {d.status !== "approved" && (
              <button type="button" className="adm-btn go" onClick={() => onAsk("approved")}>
                {d.status === "suspended" ? "Reinstate" : "Approve"}
              </button>
            )}
            {d.status !== "suspended" && (
              <button type="button" className="adm-btn stop" onClick={() => onAsk("suspended")}>
                Put on hold
              </button>
            )}
          </div>
          )}
        </td>
      </tr>

      {/* The question opens under the row it is about, rather than in a
          modal over it, so the operator can still read the driver they
          are deciding about while they decide. */}
      {asking && ask && (
        <tr className={`adm-confirm${ask.next === "suspended" ? " bad" : ""}`}>
          <td colSpan={6}>
            <div className="cbody">
              <div className="ct">
                <div className="ck">
                  {ask.next === "approved"
                    ? (d.status === "suspended" ? "Let them drive again?" : "Approve this driver?")
                    : "Stop them taking jobs?"}
                </div>
                <p>{question(d, ask.next, gaps)}</p>
              </div>
              <div className="cacts">
                <button
                  type="button"
                  className={`adm-btn ${ask.next === "suspended" ? "stop" : "go"}`}
                  disabled={busy}
                  onClick={() => onConfirm(ask)}
                >
                  {busy ? "…" : ask.next === "approved" ? "Yes, approve" : "Yes, put on hold"}
                </button>
                <button type="button" className="adm-btn" disabled={busy} onClick={onCancel}>
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * What a guest at a kerb would not be able to see.
 *
 * Reuses identifiable() from the driver portal rather than asking the
 * question again, so "can this driver be recognised" means one thing
 * across the whole company. Listing WHICH parts are missing is the
 * addition: the driver's own portal tells them to go and fix it, and an
 * operator answering "what do I need from you?" needs the list.
 */
function missing(d: DriverProfile, car: string): string[] {
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
function question(d: DriverProfile, next: DriverStatus, gaps: string[]): string {
  const who = d.fullName || "This driver";
  if (next === "suspended") {
    return `${who} will stop being offered work immediately, and claim_ride will refuse them. Rides they already hold stay theirs — put somebody else on those from the Rides screen if they need moving.`;
  }
  if (gaps.length > 0) {
    // Said before the approval, not after: an approved driver with no
    // plate on record is a booking that shows the guest nothing to look
    // for, and nobody finds that out until somebody is standing at
    // arrivals.
    return `${who} will be able to claim jobs straight away. They're still missing ${list(gaps)} — every ride they take is stamped with what's on their record, so their guests would have nothing to look for at the kerb. Approving is fine; they need to fill that in under Profile before they drive.`;
  }
  return `${who} will be able to claim jobs straight away, and every ride they take will be stamped with their car and plate.`;
}

/** "a plate and a photo" — an Oxford-less join, because these lists are
    never longer than four and a comma-only join reads as a fragment. */
function list(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
