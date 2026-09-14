// Putting a named driver on a named ride.
//
// This was a screen of its own — /admin/assign, two panes, pick a ride
// on the left and a driver on the right. It is a panel now, and it
// lives on the ride's own page, because the left-hand pane was always
// the weaker half of that screen: an operator arriving at it had just
// been looking at the ride they wanted to fill, and was made to find it
// again in a list. On the ride's page the ride is the page. The guest,
// the route, the money and the timeline are all still on screen while
// the choice is made, which the two-pane version could never show.
//
// Everything that made the old screen careful is carried over unchanged,
// because all of it came from the same rule — never show a control the
// database will refuse:
//
//  · only APPROVED drivers are offered, because admin_assign_ride
//    refuses the rest — and the number left out is stated, with why, so
//    a missing name is answered here rather than in the Supabase
//    dashboard;
//  · two things the database WILL allow and an operator would regret
//    are warned about rather than blocked: a driver with no car on
//    record, and a driver already booked at that hour. Both are
//    sometimes right. Neither should happen unnoticed.
//
// And the result says what was STAMPED, not what was intended. The five
// driver_* columns on the ride are what the guest reads in My Trips, and
// for most of this project's life nothing wrote them — a ride with a
// driver and no car is a guest at arrivals with nothing to look for.
import { useMemo, useState } from "react";
import { jobTime } from "../driver/JobCard";
import { identifiable, vehicleLabel, type DriverProfile } from "../driver/lib/driver";
import { assignRide, clashesFor, type AdminRide } from "./lib/admin";
import { Empty } from "./ui";

interface AssignPanelProps {
  ride: AdminRide;
  /** every driver the board holds — filtered to approved here, once */
  drivers: DriverProfile[];
  /** the drivers table could not be read. Not the same as having no
      drivers, and an operator told "nobody is approved" over an
      unreadable table would go and re-approve people who already are. */
  driversError: string | null;
  /** everything booked, for the clash check — a driver's other work */
  rides: AdminRide[];
  /** what happened, in the words the caller will show */
  onAssigned: (message: string) => void;
  onRefused: (detail: string) => void;
}

export default function AssignPanel({
  ride, drivers, driversError, rides, onAssigned, onRefused,
}: AssignPanelProps) {
  const [driverId, setDriverId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const approved = useMemo(() => drivers.filter((d) => d.status === "approved" && d.id), [drivers]);
  const notApproved = drivers.length - approved.length;
  const driver = approved.find((d) => d.id === driverId) ?? null;

  // Warnings, not blocks. Both are things admin_assign_ride does happily.
  const clashes = driver ? clashesFor(driver.id, ride.scheduledAt, rides) : [];
  const blind = driver ? !identifiable(driver) : false;

  async function commit() {
    if (!driver) return;
    setBusy(true);
    const res = await assignRide(ride.id, driver.id);
    setBusy(false);

    if (!res.ok) { onRefused(res.detail); return; }

    const who = res.stamped.name || driver.fullName || "That driver";
    const car = [res.stamped.vehicle, res.stamped.plate].filter(Boolean).join(" · ");
    setDriverId(null);
    onAssigned(
      car
        ? `${who} is on the ${jobTime(ride.scheduledAt)} — the guest will see ${car}.`
        : `${who} is on the ${jobTime(ride.scheduledAt)}, but they have no car on record, so the guest's booking shows nothing to look for at the kerb. Ask them to fill it in under Profile in the driver portal.`,
    );
  }

  if (driversError) {
    return (
      <p className="adm-why" role="alert">
        The drivers can't be read, so there's nobody to offer. Your drivers are fine —
        this board just can't see them. Run docs/admin-schema.sql, then reload.
      </p>
    );
  }

  if (approved.length === 0) {
    return (
      <Empty
        line="Nobody is approved to drive."
        hint={
          notApproved > 0
            ? `${notApproved} driver${notApproved === 1 ? " is" : "s are"} waiting or on hold. Approve somebody on the Drivers screen first — the database refuses a ride handed to a driver who isn't approved.`
            : "There are no drivers on this project yet."
        }
      />
    );
  }

  return (
    <div className="adm-assign">
      <div className="plist" role="group" aria-label="Approved drivers">
        {approved.map((d) => {
          const car = vehicleLabel(d);
          return (
            <button
              key={d.id}
              type="button"
              className={`adm-pick${d.id === driverId ? " on" : ""}`}
              aria-pressed={d.id === driverId}
              onClick={() => setDriverId(d.id === driverId ? null : d.id)}
            >
              <span className="pdrv">
                {/* A face, for the same reason the directory carries one:
                    two Ana C.s on a list are told apart faster by a photo
                    than by a plate. */}
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
              {!identifiable(d) && <span className="pgap">Guests can't spot them</span>}
            </button>
          );
        })}
      </div>

      {/* A name that isn't in the list is a question this panel has to
          answer, or it gets answered in the Supabase dashboard. */}
      {notApproved > 0 && (
        <p className="adm-fine">
          {notApproved} other driver{notApproved === 1 ? " isn't" : "s aren't"} listed — they're
          waiting or on hold, and the database refuses a ride handed to them.
        </p>
      )}

      <div className="adm-do">
        <div className="dk">About to happen</div>
        <p>
          {driver
            ? `${driver.fullName || "This driver"} takes this ride. Their name, number, car and plate get stamped onto the booking, which is what the guest sees.`
            : "Pick the driver for this ride."}
        </p>
        {driver && blind && (
          <p className="warn">
            {driver.fullName || "This driver"} has no complete car on record, so this booking
            will show the guest nothing to look for. You can still assign it.
          </p>
        )}
        {driver && clashes.length > 0 && (
          <p className="warn">
            They're already on the {clashes.map((c) => jobTime(c.scheduledAt)).join(" and the ")} the
            same day. You can still assign it.
          </p>
        )}
        <button
          type="button"
          className="adm-btn go"
          disabled={!driver || busy}
          onClick={() => void commit()}
        >
          {busy ? "Assigning…" : "Assign this ride"}
        </button>
      </div>
    </div>
  );
}
