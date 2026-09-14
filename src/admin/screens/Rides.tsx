// Ride requests — every booking from today on, as one table.
//
// One question outranks every other here: WHICH RIDE HAS NOBODY DRIVING
// IT. A booking with no driver is the only row that will not resolve
// itself — an assigned ride runs, a cancelled one is over, and an
// unassigned one sits quietly getting closer to its pickup time until a
// guest is standing at arrivals. So it is the default filter, it wears
// the one alert accent on the screen, and the driver cell says "Nobody"
// rather than leaving an empty space that reads like a column that
// failed to load.
//
// SEVEN COLUMNS, NOT TEN. The brief asked for ride id, time, passenger,
// pickup, destination, vehicle, driver, price, status and an action, and
// ten columns is the thing it also asked not to build: a row that wide
// is read by tracking a finger across it. So the two ends of the route
// share one cell — it is one fact, "where this ride goes" — the booking
// reference sits under the passenger who would quote it, and the party,
// the flight and the payment are on the ride's own page. Nothing was
// dropped; it moved one click away, which is what this board is for.
//
// A ROW OPENS THE RIDE. It does not expand. An operator comparing thirty
// rides wants thirty rows the same height, and a row that grows to show
// you its contents is the row that makes the other twenty-nine move.
//
// The money is the GUEST's fare, converted the way the passenger site
// converts it. Not the driver's payout, which is the figure the driver
// portal leads with — an operator reconciling a booking against Stripe
// wants what was charged, and putting a driver's cut under the same
// heading is how this project once advertised a ƒ89.50 job as "$90".
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { jobDateShort, jobTime, shortAirport } from "../../driver/JobCard";
import { awgToUsd, usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import { isClosed, isLive, needsDriver, type AdminRide } from "../lib/admin";
import { Chip, Empty, Head, Search, Skeleton, Unreadable, rideState } from "../ui";

type Filter = "unassigned" | "assigned" | "road" | "done" | "off" | "all";

/**
 * The six the brief asked for, in this board's own words.
 *
 * "Pending / Accepted / On the way" are the guest-facing vocabulary; on
 * a dispatch board the same three rows are "needs a driver / assigned /
 * on the road", which is what an operator would say out loud. The
 * filters and the status chips use one vocabulary between them, because
 * a filter whose name does not appear in the column it filters is a
 * filter you have to translate.
 */
const FILTERS: { key: Filter; label: string; keep: (r: AdminRide) => boolean }[] = [
  { key: "unassigned", label: "Needs a driver", keep: needsDriver },
  { key: "assigned", label: "Assigned", keep: (r) => r.status === "driver_assigned" },
  { key: "road", label: "On the road", keep: isLive },
  { key: "done", label: "Completed", keep: (r) => r.status === "completed" },
  { key: "off", label: "Cancelled", keep: (r) => r.status === "cancelled" },
  { key: "all", label: "All", keep: () => true },
];

/**
 * What the search box looks at.
 *
 * Deliberately not everything. A box that matches any word on the row
 * returns the whole board for "airport", which on an island with one
 * airport is every ride. These five are what an operator actually has
 * in their hand when they search: a name, a number, a reference from an
 * email, a driver, or a place.
 */
function matches(r: AdminRide, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [r.guestName, r.guestPhone, r.bookingRef, r.driverName, r.pickup, r.dropoff, r.flightNumber]
    .some((v) => (v ?? "").toLowerCase().includes(needle));
}

export default function Rides() {
  const navigate = useNavigate();
  const { rides, ridesError, loading, refresh } = useBoard();
  // Opens on the rows that need a human. An operator arriving at this
  // board is almost never asking "show me everything".
  const [filter, setFilter] = useState<Filter>("unassigned");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => FILTERS.reduce<Record<Filter, number>>((acc, f) => {
      acc[f.key] = rides.filter(f.keep).length;
      return acc;
    }, { unassigned: 0, assigned: 0, road: 0, done: 0, off: 0, all: 0 }),
    [rides],
  );

  const shown = useMemo(
    () => rides.filter(FILTERS.find((f) => f.key === filter)!.keep).filter((r) => matches(r, query)),
    [rides, filter, query],
  );

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <Head
          kick="Ride requests"
          title={<>Every booking, <em>today on.</em></>}
          lead="Figures are what the guest was charged. Open a ride to see the rest of it, and to do anything about it."
          action={
            <Search
              label="Search rides"
              placeholder="Name, number, reference, driver, place"
              value={query}
              onChange={setQuery}
            />
          }
        />

        {/* Three answers, two of which look identical in a naive list:
            nothing loaded yet, a table that could not be read, and a
            genuinely quiet day. */}
        {ridesError ? (
          <Unreadable
            what="rides"
            detail={ridesError}
            reassure="Bookings aren't being blocked — this board just can't see them."
            onRetry={() => void refresh()}
          />
        ) : loading ? (
          <Skeleton rows={5} />
        ) : rides.length === 0 ? (
          <Empty
            line="Nothing booked from today on."
            hint="New bookings land here the moment they're made."
          />
        ) : (
          <>
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

            {shown.length === 0 ? (
              // The board is full; this filter is simply empty. On the
              // default filter that is the best news on the screen, so it
              // says so rather than looking like a failure.
              <Empty
                line={
                  query.trim()
                    ? "Nothing matches that."
                    : filter === "unassigned" ? "Every ride has a driver." : "Nothing under this filter."
                }
                hint={
                  query.trim()
                    ? `No ride under "${filter === "all" ? "any filter" : FILTERS.find((f) => f.key === filter)!.label}" matches "${query.trim()}".`
                    : filter === "unassigned"
                    ? `All ${rides.length} booking${rides.length === 1 ? "" : "s"} from today on are covered.`
                    : "Try another filter — the board itself isn't empty."
                }
              />
            ) : (
              <div className="adm-tablewrap">
                <div className="adm-scroll">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th scope="col">When</th>
                        <th scope="col">Passenger</th>
                        <th scope="col">Route</th>
                        <th scope="col" className="adm-drop">Vehicle</th>
                        <th scope="col">Driver</th>
                        <th scope="col" className="right adm-drop">Price</th>
                        <th scope="col">Status</th>
                        <th scope="col" className="right">{/* the one action */}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => {
                        const state = rideState(r);
                        const open = needsDriver(r);
                        return (
                          <tr
                            key={r.id}
                            className={`${open ? "wants " : ""}adm-open`}
                            onClick={() => navigate(`/admin/rides/${r.id}`)}
                          >
                            <td data-h="When" className="nowrap">
                              <span className="adm-two">
                                <span className="a num">{r.scheduledAt ? jobTime(r.scheduledAt) : "No time"}</span>
                                {/* A ride with no date is broken, and hiding
                                    it from the one screen that can fix it is
                                    how it stays broken. */}
                                <span className="b">{jobDateShort(r.scheduledAt) || "No date set"}</span>
                              </span>
                            </td>
                            <td data-h="Passenger">
                              <span className="adm-two">
                                {/* The real link, so the row is reachable by
                                    keyboard as well as by pointer — a <tr>
                                    with an onClick and nothing focusable in
                                    it is a row only a mouse can open. */}
                                <Link className="a adm-rowlink" to={`/admin/rides/${r.id}`}>
                                  {r.guestName || "No name given"}
                                </Link>
                                <span className="b">{r.bookingRef || r.guestPhone || "No reference"}</span>
                              </span>
                            </td>
                            <td data-h="Route">
                              <span className="adm-two">
                                <span className="a">
                                  {shortAirport(r.pickup) || "—"} → {shortAirport(r.dropoff) || "—"}
                                </span>
                                <span className="b">{r.flightNumber || "—"}</span>
                              </span>
                            </td>
                            <td data-h="Vehicle" className="adm-drop">{r.vehicle || "—"}</td>
                            <td data-h="Driver">
                              {r.driverId ? (
                                <span className="adm-two">
                                  <span className="a">{r.driverName || "Assigned, no name stamped"}</span>
                                  <span className="b">
                                    {/* What the GUEST sees in My Trips. A ride
                                        with a driver but no car stamped on it
                                        is the exact bug claim_ride was fixed
                                        for, and this is where it shows up
                                        before somebody is at a kerb. */}
                                    {r.driverPlate || r.driverVehicle
                                      ? [r.driverVehicle, r.driverPlate].filter(Boolean).join(" · ")
                                      : "No car shown to the guest"}
                                  </span>
                                </span>
                              ) : (
                                <span className="adm-two">
                                  <span className="a q">Nobody</span>
                                  <span className="b">{isClosed(r) ? "and nobody did" : "not claimed yet"}</span>
                                </span>
                              )}
                            </td>
                            <td data-h="Price" className="right adm-drop num">
                              {r.fareAwg != null ? usd(awgToUsd(r.fareAwg)) : "—"}
                            </td>
                            <td data-h="Status" className="nowrap">
                              <Chip tone={state.tone}>{state.label}</Chip>
                            </td>
                            <td className="right">
                              {/* One action, and only where the database
                                  would accept it. admin_assign_ride refuses
                                  a closed ride, and a control that exists to
                                  be refused teaches an operator that buttons
                                  mean nothing. */}
                              {open ? (
                                <Link className="adm-btn go" to={`/admin/rides/${r.id}`}>Put a driver on</Link>
                              ) : isClosed(r) && !r.driverId ? (
                                <span className="adm-why">
                                  Nobody drove this — it was {r.status === "cancelled" ? "called off" : "closed"}.
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
