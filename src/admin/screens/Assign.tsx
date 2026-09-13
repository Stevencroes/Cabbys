// Assign — the manual override, for when the pool does not clear.
//
// The driver portal is built around drivers claiming their own work:
// open_rides shows the pool, claim_ride() is atomic, first tap wins.
// That covers almost everything and leaves one gap — the ride nobody
// takes. A 5am airport run on a public holiday sits in the pool until it
// stops being a scheduling problem and becomes a phone call. This screen
// is the end of that phone call.
//
// Two panes rather than a picker on the ride row, because the decision
// is a comparison in both directions: which of these rides is most
// urgent, and which of these drivers can actually take it. A dropdown
// hides the second half of that.
//
// The whole screen is built on one rule from the house style — never
// show a control the database will refuse:
//
//  · only unassigned rides are listed, because admin_assign_ride takes
//    `driver_id is null` rides only;
//  · only APPROVED drivers are listed, because it refuses the rest —
//    and the count of the ones left out is shown, with why, so a missing
//    name is answered on this screen rather than in the Supabase
//    dashboard;
//  · two things the database WILL allow but an operator would regret
//    are warned about rather than blocked: a driver with no car on
//    record, and a driver already booked at that hour.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { jobDateShort, jobTime, shortAirport } from "../../driver/JobCard";
import { identifiable, vehicleLabel, type DriverProfile } from "../../driver/lib/driver";
import { awgToUsd, usd } from "../../lib/quote";
import {
  assignRide, clashesFor, loadAllDrivers, loadUpcomingRides, needsDriver,
  type AdminRide,
} from "../lib/admin";

interface Note {
  tone: "ok" | "bad";
  title: string;
  body: string;
}

export default function Assign() {
  const [params, setParams] = useSearchParams();
  const [rides, setRides] = useState<AdminRide[] | null>(null);
  const [ridesFailed, setRidesFailed] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverProfile[] | null>(null);
  const [driversFailed, setDriversFailed] = useState<string | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note | null>(null);

  // The chosen ride lives in the URL, not in state. The Rides screen
  // links straight here with ?ride=… — "put a driver on THIS one" is the
  // move an operator makes from the board, and it should not land them
  // on a list they have to search for the ride they were just looking at.
  const rideId = params.get("ride");
  const pick = useCallback(
    (id: string | null) => {
      if (id) params.set("ride", id); else params.delete("ride");
      setParams(params, { replace: true });
    },
    [params, setParams],
  );

  const refresh = useCallback(async () => {
    const [r, d] = await Promise.all([loadUpcomingRides(), loadAllDrivers()]);
    setRidesFailed(r.error);
    setRides(r.error ? null : r.rides);
    setDriversFailed(d.error);
    setDrivers(d.error ? null : d.drivers);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const open = useMemo(() => (rides ?? []).filter(needsDriver), [rides]);
  const ride = open.find((r) => r.id === rideId) ?? null;
  const approved = useMemo(
    () => (drivers ?? []).filter((d) => d.status === "approved"),
    [drivers],
  );
  const notApproved = (drivers?.length ?? 0) - approved.length;
  const driver = approved.find((d) => d.id === driverId) ?? null;

  // Warnings, not blocks. Both are things admin_assign_ride will do
  // happily and an operator would rather know about first.
  const clashes = driver && ride ? clashesFor(driver.id, ride.scheduledAt, rides ?? []) : [];
  const blind = driver ? !identifiable(driver) : false;

  async function commit() {
    if (!ride || !driver) return;
    setBusy(true);
    const res = await assignRide(ride.id, driver.id);
    setBusy(false);

    if (!res.ok) {
      setNote({ tone: "bad", title: "Not assigned", body: res.detail });
      // Re-read either way: "already_taken" means a driver claimed it
      // from the pool while this screen was open, and the list in front
      // of the operator is now wrong.
      void refresh();
      return;
    }

    const who = res.stamped.name || driver.fullName || "That driver";
    const car = [res.stamped.vehicle, res.stamped.plate].filter(Boolean).join(" · ");
    setNote({
      tone: "ok",
      title: "Assigned",
      // What was STAMPED, not what was intended. The five driver_*
      // columns on the ride are what the guest reads in My Trips, and
      // for most of this project's life nothing wrote them — a ride with
      // a driver and no car is a guest at arrivals with nothing to look
      // for. Saying it back is how that stays fixed.
      body: car
        ? `${who} is on the ${jobTime(ride.scheduledAt)} — the guest will see ${car}.`
        : `${who} is on the ${jobTime(ride.scheduledAt)}, but they have no car on record, so the guest's booking shows nothing to look for at the kerb. Ask them to fill it in under Profile in the driver portal.`,
    });
    pick(null);
    setDriverId(null);
    void refresh();
  }

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <div className="adm-head">
          <div>
            <div className="kick">Assign</div>
            <h1 className="big">Somebody has to <em>drive it.</em></h1>
            <p className="sub">
              Only rides nobody has claimed, and only drivers who are approved to take
              them. Pick one of each.
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

        <div className="adm-split">
          {/* ── the rides nobody is driving ── */}
          <section className="adm-pane" aria-label="Rides with no driver">
            <h2>
              Waiting on a driver
              {rides !== null && <span className="n">{open.length}</span>}
            </h2>
            {rides === null ? (
              ridesFailed ? (
                <div className="adm-empty" role="alert">
                  <div className="es">Can't read the rides.</div>
                  <p className="et">
                    Bookings aren't being blocked — this board just can't see them. Run
                    docs/admin-schema.sql, then try again.
                  </p>
                  <p className="et mono">{ridesFailed}</p>
                  <button type="button" className="adm-btn" onClick={() => void refresh()}>Try again</button>
                </div>
              ) : (
                <div className="adm-empty"><p className="et">Reading the board.</p></div>
              )
            ) : open.length === 0 ? (
              <div className="adm-empty">
                <div className="es">Every ride has a driver.</div>
                <p className="et">Nothing here needs a hand right now.</p>
              </div>
            ) : (
              <div className="plist">
                {open.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`adm-pick${r.id === rideId ? " on" : ""}`}
                    aria-pressed={r.id === rideId}
                    onClick={() => { setNote(null); pick(r.id === rideId ? null : r.id); }}
                  >
                    <span className="ptop">
                      <span className="pwhen">{r.scheduledAt ? jobTime(r.scheduledAt) : "No time"}</span>
                      <span className="pday">{jobDateShort(r.scheduledAt) || "No date set"}</span>
                      {r.fareAwg != null && <span className="pfare">{usd(awgToUsd(r.fareAwg))}</span>}
                    </span>
                    <span className="proute">
                      {shortAirport(r.pickup) || "—"} → {shortAirport(r.dropoff) || "—"}
                    </span>
                    <span className="pmeta">
                      {[r.guestName, r.vehicle, r.bookingRef].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ── the drivers who could take it ── */}
          <section className="adm-pane" aria-label="Drivers">
            <h2>
              Approved drivers
              {drivers !== null && <span className="n">{approved.length}</span>}
            </h2>
            {drivers === null ? (
              driversFailed ? (
                <div className="adm-empty" role="alert">
                  <div className="es">Can't read the drivers.</div>
                  <p className="et">
                    Your drivers are fine — this board just can't see them. Run
                    docs/admin-schema.sql, then try again.
                  </p>
                  <p className="et mono">{driversFailed}</p>
                  <button type="button" className="adm-btn" onClick={() => void refresh()}>Try again</button>
                </div>
              ) : (
                <div className="adm-empty"><p className="et">Reading the driver list.</p></div>
              )
            ) : approved.length === 0 ? (
              <div className="adm-empty">
                <div className="es">Nobody is approved.</div>
                <p className="et">
                  {notApproved > 0
                    ? `${notApproved} driver${notApproved === 1 ? " is" : "s are"} waiting or on hold. Approve somebody on the Drivers screen first — the database refuses a ride handed to a driver who isn't approved.`
                    : "There are no drivers on this project yet."}
                </p>
              </div>
            ) : (
              <>
                <div className="plist">
                  {approved.map((d) => {
                    const car = vehicleLabel(d);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`adm-pick${d.id === driverId ? " on" : ""}`}
                        aria-pressed={d.id === driverId}
                        onClick={() => { setNote(null); setDriverId(d.id === driverId ? null : d.id); }}
                      >
                        <span className="pdrv">
                          {/* A face, for the same reason the Drivers table
                              carries one: two Ana C.s on a list are told
                              apart faster by a photo than by a plate. */}
                          {d.photoUrl
                            ? <img src={d.photoUrl} alt="" className="ph" width={32} height={32} />
                            : <span className="ph" aria-hidden="true">
                                {(d.fullName || "·").trim().charAt(0).toUpperCase()}
                              </span>}
                          <span className="pi">
                            <span className="pn">{d.fullName || "No name on record"}</span>
                            <span className="pc">
                              {[car, d.plate].filter(Boolean).join(" · ") || "No car on record"}
                            </span>
                          </span>
                        </span>
                        {!identifiable(d) && (
                          <span className="pgap">Guests can't spot them</span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {/* A name that isn't in the list is a question this
                    screen has to answer, or it gets answered in the
                    Supabase dashboard. */}
                {notApproved > 0 && (
                  <div className="adm-do">
                    <p className="sub" style={{ margin: 0 }}>
                      {notApproved} other driver{notApproved === 1 ? " isn't" : "s aren't"} listed — they're
                      waiting or on hold, and the database refuses a ride handed to them.
                    </p>
                  </div>
                )}

                <div className="adm-do">
                  <div className="dk">About to happen</div>
                  <p>{summary(ride, driver)}</p>
                  {ride && driver && blind && (
                    <p className="warn">
                      {driver.fullName || "This driver"} has no complete car on record, so this
                      booking will show the guest nothing to look for. You can still assign it.
                    </p>
                  )}
                  {ride && driver && clashes.length > 0 && (
                    <p className="warn">
                      They're already on the {clashes.map((c) => jobTime(c.scheduledAt)).join(" and the ")} the
                      same day. You can still assign it.
                    </p>
                  )}
                  <button
                    type="button"
                    className="adm-btn go"
                    disabled={!ride || !driver || busy}
                    onClick={() => void commit()}
                  >
                    {busy ? "Assigning…" : "Assign this ride"}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** What the button is about to do, in one sentence — and what is still
    missing when it can't do anything yet. */
function summary(ride: AdminRide | null, driver: DriverProfile | null): string {
  if (!ride && !driver) return "Pick a ride on the left and a driver on the right.";
  if (!ride) return "Pick the ride this driver should take.";
  if (!driver) return "Pick the driver for this ride.";
  const when = ride.scheduledAt
    ? `${jobDateShort(ride.scheduledAt)} at ${jobTime(ride.scheduledAt)}`
    : "an undated booking";
  return `${driver.fullName || "This driver"} takes ${shortAirport(ride.pickup)} → ${shortAirport(ride.dropoff)}, ${when}. Their name, number, car and plate get stamped onto the booking, which is what the guest sees.`;
}
