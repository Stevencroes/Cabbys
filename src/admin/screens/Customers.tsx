// Customers — kept extremely simple, because this is a transfer
// service and not a CRM.
//
// Five columns, and they are the five the brief asks for: who, how to
// reach them, what is coming, how many rides, and when they last
// travelled. There is no segment, no lifetime-value score, no tag and
// no pipeline, and there should not be: the operator's question about a
// guest is "what did they book and what is coming", and both are rides.
//
// EVERY PERSON ON THIS SCREEN IS DERIVED. There is no customers table in
// this project — a guest is an auth account plus three text columns on
// the booking they made — so this list is those columns, grouped. How
// they are grouped, and what that costs, is written down in
// src/admin/lib/customers.ts; the short version is that an account is
// trusted over an email, an email over a phone number, and a name last.
//
// The window is the same two reads the rest of the board uses: today
// and ahead, plus four months back. A guest who last travelled a year
// ago is not on this screen, and the count under the heading says so
// rather than letting "3 rides" be read as "ever".
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jobDateShort, jobTime, shortAirport } from "../../driver/JobCard";
import { usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import { HISTORY_DAYS, loadRideHistory, mergeRides, type AdminRide } from "../lib/admin";
import { customersFrom, matchesCustomer } from "../lib/customers";
import { Empty, Head, Search, Skeleton, Unreadable } from "../ui";

export default function Customers() {
  const board = useBoard();
  const [past, setPast] = useState<AdminRide[] | null>(null);
  const [pastError, setPastError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let live = true;
    void loadRideHistory().then(({ rides, error }) => {
      if (!live) return;
      setPastError(error);
      setPast(error ? null : rides);
    });
    return () => { live = false; };
  }, []);

  const people = useMemo(
    () => customersFrom(mergeRides(board.rides, past ?? [])),
    [board.rides, past],
  );
  const shown = useMemo(() => people.filter((c) => matchesCustomer(c, query)), [people, query]);

  const failed = board.ridesError ?? pastError;

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <Head
          kick="Customers"
          title={<>Who <em>rides.</em></>}
          lead={`Built from bookings — there is no separate customer record in this system. Everyone who has travelled or is booked in the last ${HISTORY_DAYS} days.`}
          action={<Search label="Search customers" placeholder="Name, email, number" value={query} onChange={setQuery} />}
        />

        {failed ? (
          <Unreadable
            what="rides"
            detail={failed}
            reassure="Your guests are fine — this board just can't see their bookings, and everyone on this screen is derived from those."
            onRetry={() => void board.refresh()}
          />
        ) : board.loading || past === null ? (
          <Skeleton rows={5} />
        ) : shown.length === 0 ? (
          <Empty
            line={query.trim() ? "Nobody matches that." : "Nobody has booked yet."}
            hint={query.trim()
              ? `No name, address or number contains "${query.trim()}".`
              : "A guest appears here the moment they make their first booking."}
          />
        ) : (
          <div className="adm-tablewrap">
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col" className="adm-drop">Contact</th>
                    <th scope="col">Next ride</th>
                    <th scope="col" className="right">Rides</th>
                    <th scope="col" className="adm-drop">Last ride</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.key}>
                      <td data-h="Name">
                        <span className="adm-two">
                          <Link className="a adm-rowlink" to={`/admin/customers/${encodeURIComponent(c.key)}`}>
                            {c.name || "No name given"}
                          </Link>
                          {/* A row held together by a phone number rather
                              than an account is a guess, and the operator
                              should know which kind of row they are
                              reading before they merge two people in their
                              head. */}
                          <span className="b">
                            {c.keyKind === "account" ? "Has an account"
                              : c.keyKind === "email" ? "Matched by email"
                              : c.keyKind === "phone" ? "Matched by number"
                              : "Matched by name only"}
                          </span>
                        </span>
                      </td>
                      <td data-h="Contact" className="adm-drop">
                        <span className="adm-two">
                          <span className="a">{c.phone || <span className="q">No number</span>}</span>
                          <span className="b">{c.email || "No address"}</span>
                        </span>
                      </td>
                      <td data-h="Next ride">
                        {c.next ? (
                          <span className="adm-two">
                            <span className="a">{jobDateShort(c.next.scheduledAt)} · {jobTime(c.next.scheduledAt)}</span>
                            <span className="b">{shortAirport(c.next.pickup)} → {shortAirport(c.next.dropoff)}</span>
                          </span>
                        ) : (
                          <span className="q">Nothing booked</span>
                        )}
                      </td>
                      <td data-h="Rides" className="right">
                        <span className="adm-two">
                          <span className="a num">{c.completed}</span>
                          {/* Bookings and rides are not the same number,
                              and a guest who booked five and cancelled
                              four did not ride five times. */}
                          <span className="b">{c.cancelled > 0 ? `${c.cancelled} cancelled` : `${c.bookings} booked`}</span>
                        </span>
                      </td>
                      <td data-h="Last ride" className="adm-drop">
                        {c.last ? (
                          <span className="adm-two">
                            <span className="a">{jobDateShort(c.last.scheduledAt)}</span>
                            <span className="b">{usd(c.spendUsd)} in total</span>
                          </span>
                        ) : (
                          <span className="q">Never travelled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
