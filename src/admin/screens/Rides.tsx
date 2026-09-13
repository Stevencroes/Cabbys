// Rides — today and everything ahead of it.
//
// One question outranks every other on this screen: WHICH RIDE HAS
// NOBODY DRIVING IT. A booking with no driver is the only row here that
// will not resolve itself — an assigned ride runs, a cancelled one is
// over, and an unassigned one sits quietly getting closer to its pickup
// time until a guest is standing at arrivals. So it is the default
// filter, it wears the one alert accent on the screen, and the driver
// cell says "Nobody" rather than leaving an empty space that reads like
// a column that failed to load.
//
// The money is the GUEST's fare, converted the way the passenger site
// converts it (src/pages/MyTrips.tsx does the same division by
// AWG_PER_USD). Not the driver's payout, which is the figure the driver
// portal leads with — an operator reconciling a booking against Stripe
// wants what was charged, and putting a driver's cut under the same
// heading is how this project once advertised a ƒ89.50 job as "$90".
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jobDateShort, jobTime, shortAirport, statusChip } from "../../driver/JobCard";
import { awgToUsd, usd } from "../../lib/quote";
import { loadUpcomingRides, needsDriver, type AdminRide } from "../lib/admin";

type Filter = "unassigned" | "driven" | "closed" | "all";

const FILTERS: { key: Filter; label: string; keep: (r: AdminRide) => boolean }[] = [
  { key: "unassigned", label: "Needs a driver", keep: needsDriver },
  {
    key: "driven",
    label: "With a driver",
    keep: (r) => r.driverId !== null && r.status !== "cancelled" && r.status !== "completed",
  },
  { key: "closed", label: "Done or called off", keep: (r) => r.status === "cancelled" || r.status === "completed" },
  { key: "all", label: "Everything", keep: () => true },
];

export default function Rides() {
  const navigate = useNavigate();
  const [rides, setRides] = useState<AdminRide[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Opens on the rows that need a human. An operator arriving at this
  // board is almost never asking "show me everything".
  const [filter, setFilter] = useState<Filter>("unassigned");

  const refresh = useCallback(async () => {
    const { rides: rows, error } = await loadUpcomingRides();
    setFailed(error);
    setRides(error ? null : rows);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => {
    const all = rides ?? [];
    return FILTERS.reduce<Record<Filter, number>>((acc, f) => {
      acc[f.key] = all.filter(f.keep).length;
      return acc;
    }, { unassigned: 0, driven: 0, closed: 0, all: 0 });
  }, [rides]);

  const shown = useMemo(
    () => (rides ?? []).filter(FILTERS.find((f) => f.key === filter)!.keep),
    [rides, filter],
  );

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <div className="adm-head">
          <div>
            <div className="kick">Rides · today and ahead</div>
            <h1 className="big">The <em>board.</em></h1>
            <p className="sub">
              Every booking from today on. Figures are what the guest was charged.
            </p>
          </div>
          {rides !== null && (
            <div className="adm-seg" role="group" aria-label="Filter the board">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? "on" : ""}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}<b>{counts[f.key]}</b>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Three answers, two of which look identical in a naive list:
            nothing loaded yet, a table that could not be read, and a
            genuinely quiet day. */}
        {rides === null ? (
          failed ? (
            // Not "no rides" — the table could not be read. Bookings are
            // still arriving; this board just can't see them, and an
            // operator who reads that as a quiet day will not go looking.
            <div className="adm-empty" role="alert">
              <div className="es">Can't read the rides.</div>
              <p className="et">
                Bookings aren't being blocked — this board just can't see them. The most
                likely reason is that docs/admin-schema.sql hasn't been run on this
                project, so there's no policy admitting an admin to this table.
              </p>
              <p className="et mono">{failed}</p>
              <button type="button" className="adm-btn" onClick={() => void refresh()}>Try again</button>
            </div>
          ) : (
            <div className="adm-empty"><p className="et">Reading the board.</p></div>
          )
        ) : rides.length === 0 ? (
          <div className="adm-empty">
            <div className="es">Nothing booked from today on.</div>
            <p className="et">New bookings land here the moment they're made.</p>
          </div>
        ) : shown.length === 0 ? (
          // The board is full; this filter is simply empty. On the
          // default filter that is the best news on the screen, so it
          // says so rather than looking like a failure.
          <div className="adm-empty">
            <div className="es">
              {filter === "unassigned" ? "Every ride has a driver." : "Nothing under this filter."}
            </div>
            <p className="et">
              {filter === "unassigned"
                ? `All ${rides.length} booking${rides.length === 1 ? "" : "s"} from today on are covered.`
                : "Try another filter — the board itself isn't empty."}
            </p>
          </div>
        ) : (
          <div className="adm-tablewrap">
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Status</th>
                    <th scope="col">Route</th>
                    <th scope="col" className="adm-drop">Guest</th>
                    <th scope="col" className="right adm-drop">Fare</th>
                    <th scope="col">Driver</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const chip = statusChip(r.status);
                    const open = needsDriver(r);
                    return (
                      <tr key={r.id} className={open ? "wants" : ""}>
                        <td data-h="When" className="nowrap">
                          <span className="adm-two">
                            <span className="a num">{r.scheduledAt ? jobTime(r.scheduledAt) : "No time"}</span>
                            {/* A ride with no date is broken, and hiding
                                it from the one screen that can fix it is
                                how it stays broken. */}
                            <span className="b">{jobDateShort(r.scheduledAt) || "No date set"}</span>
                          </span>
                        </td>
                        <td data-h="Status" className="nowrap">
                          <span className={`adm-chip ${chip.tone}`}>{chip.label}</span>
                        </td>
                        <td data-h="Route">
                          <span className="adm-two">
                            <span className="a">
                              {shortAirport(r.pickup) || "—"} → {shortAirport(r.dropoff) || "—"}
                            </span>
                            <span className="b">
                              {[r.vehicle, r.bookingRef, r.flightNumber].filter(Boolean).join(" · ") || "—"}
                            </span>
                          </span>
                        </td>
                        <td data-h="Guest" className="adm-drop">
                          <span className="adm-two">
                            <span className="a">{r.guestName || "No name given"}</span>
                            <span className="b">{r.guestPhone || "No number"}</span>
                          </span>
                        </td>
                        <td data-h="Fare" className="right adm-drop num">
                          {r.fareAwg != null ? usd(awgToUsd(r.fareAwg)) : "—"}
                        </td>
                        <td data-h="Driver">
                          {r.driverId ? (
                            <span className="adm-two">
                              <span className="a">{r.driverName || "Assigned, no name stamped"}</span>
                              <span className="b">
                                {/* What the GUEST sees in My Trips. A
                                    ride with a driver but no car stamped
                                    on it is the exact bug claim_ride was
                                    fixed for, and this is where it shows
                                    up before somebody is at a kerb. */}
                                {r.driverPlate || r.driverVehicle
                                  ? [r.driverVehicle, r.driverPlate].filter(Boolean).join(" · ")
                                  : "No car shown to the guest"}
                              </span>
                            </span>
                          ) : open ? (
                            <div className="adm-acts">
                              <button
                                type="button"
                                className="adm-btn go"
                                onClick={() => navigate(`/admin/assign?ride=${encodeURIComponent(r.id)}`)}
                              >
                                Put a driver on
                              </button>
                            </div>
                          ) : (
                            // Cancelled or completed with nobody on it.
                            // Never offer the control — admin_assign_ride
                            // refuses a closed ride, and a button that
                            // exists to be refused is a worse answer than
                            // the sentence explaining why it isn't there.
                            <span className="adm-why">
                              Nobody drove this — it was {r.status === "cancelled" ? "called off" : "closed"}.
                            </span>
                          )}
                        </td>
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
