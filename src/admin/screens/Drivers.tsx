// Drivers — the directory, and nothing more than a directory.
//
// This screen used to carry everything: the approve and hold buttons,
// the confirmation, and a five-document review panel that opened inside
// the table. All of that still exists and none of it was rebuilt — it
// moved onto the driver's own page, which is where the brief this board
// was rebuilt against puts it, and where it belongs for a reason the old
// layout kept demonstrating: a panel that opens inside a table moves
// every row under it, so the operator's eye loses the person they were
// deciding about at the exact moment they decide.
//
// What is left is the five things you scan a list of drivers FOR: who
// they are, whether they can work, what they are doing right now, what
// they drive, and how they are rated. Everything else is one click away.
//
// Two rules from the house style are still load-bearing here:
//
//  · A table that could not be read is never reported as a table with
//    nobody in it. "drivers: read as admin" is an additive RLS policy
//    from docs/admin-schema.sql; on a project where that file has not
//    been run the select succeeds and returns zero rows, and an operator
//    told "no drivers yet" would go and re-create people who are
//    already there.
//  · Waiting sorts first. It is the only row on this screen with a
//    deadline on it: a driver who applied yesterday is sitting outside
//    the portal looking at "Application received" until somebody acts.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { vehicleLabel, type DriverProfile, type DriverStatus } from "../../driver/lib/driver";
import { acceptedCount, DRIVER_DOCUMENTS } from "../../driver/lib/documents";
import { jobTime, shortAirport } from "../../driver/JobCard";
import { useBoard } from "../BoardContext";
import { currentRide } from "../lib/attention";
import { isLive, type AdminRide } from "../lib/admin";
import { Chip, Empty, Head, Search, Skeleton, Unreadable, type Tone } from "../ui";

const ORDER: Record<DriverStatus, number> = { pending: 0, approved: 1, suspended: 2 };

/**
 * What a driver is doing, in one phrase, never by colour alone.
 *
 * The brief asks for Available / On Ride / Offline / Unavailable. Three
 * of those four are real here. `drivers.is_online` is the only
 * availability flag this database has, so "offline" and "unavailable"
 * are the same fact — a driver who is not on duty — and the fourth state
 * is filled by the one that IS distinct and matters more: a driver on
 * hold, who cannot take work at all. Inventing a separate "unavailable"
 * flag would have meant a control writing a column nothing reads.
 */
function availability(d: DriverProfile, ride: AdminRide | null): { tone: Tone; label: string; note: string } {
  if (d.status === "suspended") return { tone: "alert", label: "On hold", note: "can't take new work" };
  if (d.status === "pending") return { tone: "warn", label: "Waiting", note: "not approved yet" };
  if (ride && isLive(ride)) return { tone: "aboard", label: "On a ride", note: `${shortAirport(ride.pickup)} → ${shortAirport(ride.dropoff)}` };
  if (ride) return { tone: "next", label: "Next up", note: `${jobTime(ride.scheduledAt)} · ${shortAirport(ride.pickup)}` };
  if (d.isOnline) return { tone: "live", label: "Available", note: "on duty, nothing booked" };
  return { tone: "", label: "Off duty", note: "not taking work right now" };
}

export default function Drivers() {
  const navigate = useNavigate();
  const { drivers, driversError, docs, docsError, rides, loading, refresh } = useBoard();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...drivers]
      .sort((a, b) => ORDER[a.status] - ORDER[b.status])
      .filter((d) => !q || [d.fullName, d.phone, d.plate, vehicleLabel(d)].some((v) => (v ?? "").toLowerCase().includes(q)));
  }, [drivers, query]);

  const waiting = drivers.filter((d) => d.status === "pending").length;

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <Head
          kick="Drivers"
          title={<>Who can <em>drive.</em></>}
          lead={
            loading
              ? undefined
              : `${drivers.length} driver${drivers.length === 1 ? "" : "s"}${waiting > 0 ? ` · ${waiting} waiting on approval` : ""}. Open one for their car, their paperwork, their work and their money.`
          }
          action={
            <Search label="Search drivers" placeholder="Name, number, plate" value={query} onChange={setQuery} />
          }
        />

        {driversError ? (
          <Unreadable
            what="drivers"
            detail={driversError}
            reassure="Your drivers are fine — this board just can't see them."
            onRetry={() => void refresh()}
          />
        ) : loading ? (
          <Skeleton rows={4} />
        ) : drivers.length === 0 ? (
          <Empty
            line="No drivers yet."
            hint="A driver appears here as soon as they have a row in the drivers table. They sign in at /drive with the account Cabby's set up for them."
          />
        ) : shown.length === 0 ? (
          <Empty line="Nobody matches that." hint={`No driver's name, number or plate contains "${query.trim()}".`} />
        ) : (
          <div className="adm-tablewrap">
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Driver</th>
                    <th scope="col">Right now</th>
                    <th scope="col" className="adm-drop">Car</th>
                    <th scope="col" className="adm-drop">Papers</th>
                    <th scope="col" className="right adm-drop">Trips</th>
                    <th scope="col" className="right">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => {
                    const ride = currentRide(d.id, rides);
                    const av = availability(d, ride);
                    const car = vehicleLabel(d);
                    const papers = docs.get(d.id) ?? [];
                    const accepted = acceptedCount(papers);
                    return (
                      <tr
                        key={d.id || d.fullName}
                        className="adm-open"
                        onClick={() => d.id && navigate(`/admin/drivers/${d.id}`)}
                      >
                        <td data-h="Driver">
                          <div className="adm-person">
                            {d.photoUrl
                              ? <img src={d.photoUrl} alt="" />
                              : <span className="ph gap" aria-hidden="true">{(d.fullName || "·").trim().charAt(0).toUpperCase()}</span>}
                            <span className="adm-two">
                              {d.id ? (
                                <Link className="a adm-rowlink" to={`/admin/drivers/${d.id}`}>
                                  {d.fullName || "No name on record"}
                                </Link>
                              ) : (
                                <span className="a">{d.fullName || "No name on record"}</span>
                              )}
                              <span className="b">
                                {/* A drivers row with no user_id is a record
                                    of a person, not an account: every write
                                    path in this project keys on the auth id,
                                    so nothing here can act on them. */}
                                {d.id ? (d.phone || "No phone") : "No account linked — they have to sign up"}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td data-h="Right now">
                          <span className="adm-two">
                            <span className="a"><Chip tone={av.tone}>{av.label}</Chip></span>
                            <span className="b">{av.note}</span>
                          </span>
                        </td>
                        <td data-h="Car" className="adm-drop">
                          <span className="adm-two">
                            <span className="a">{car || <span className="q">No car on record</span>}</span>
                            <span className="b">{d.plate ? <span className="adm-plate">{d.plate}</span> : "No plate"}</span>
                          </span>
                        </td>
                        <td data-h="Papers" className="adm-drop nowrap">
                          {/* A count that could not be read shows as a
                              sentence rather than as zero — an operator
                              reading "0 of 5" over an unreadable table
                              would go and chase five documents that are
                              already on file. */}
                          {docsError ? (
                            <span className="b">Can't read them</span>
                          ) : (
                            <span className={`adm-meter${accepted === DRIVER_DOCUMENTS.length ? " full" : ""}`}>
                              <i><b style={{ width: `${(accepted / DRIVER_DOCUMENTS.length) * 100}%` }} /></i>
                              {accepted} of {DRIVER_DOCUMENTS.length}
                            </span>
                          )}
                        </td>
                        <td data-h="Trips" className="right adm-drop num">{d.tripsCount}</td>
                        <td data-h="Rating" className="right num">{d.rating != null ? d.rating.toFixed(1) : "—"}</td>
                      </tr>
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
