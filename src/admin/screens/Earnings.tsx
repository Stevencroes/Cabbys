// Earnings — what the company took, and what it owes.
//
// ONE CHART, and only because it answers a question the numbers do not:
// which days were busy. Fourteen bars, no axis, no gridline, no legend.
// A chart that needs a legend is answering a question nobody asked, and
// a dashboard of six charts is the thing the brief this board was
// rebuilt against says not to build in as many words.
//
// COMPLETED WORK ONLY, and the screen says so under every total. A
// revenue figure that counts tonight's bookings is the figure that makes
// a company feel richer than it is — so what is booked and not yet
// earned is shown too, separately, under its own heading, and never
// added in.
//
// THE ARITHMETIC IS NOT DONE HERE. src/admin/lib/ledger.ts does it,
// through the same driverPayoutUsd() and COMMISSION_RATE the DRIVER's
// own Earnings screen uses. If this screen computed a payout its own way
// — rounding at a different point, bucketing by a different date — the
// two would disagree about what a driver is owed, and the driver's is
// the one they would believe.
//
// There is no refunds line, because there are no refunds: this project
// has no server-side Stripe path that refunds or voids anything. A
// cancelled booking with money still against it is named on the
// attention list, which is a job somebody can do, rather than totalled
// into a figure nobody can trust.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jobDateShort, jobTime, shortAirport } from "../../driver/JobCard";
import {
  addDays, formatDateShort, monthDays, todayInAruba, weekDays, weekdayShort,
} from "../../lib/datetime";
import { usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import { HISTORY_DAYS, loadRideHistory, mergeRides, type AdminRide } from "../lib/admin";
import { booked, byDay, COMMISSION_LABEL, lines, total, totalOver } from "../lib/ledger";
import { Empty, Figures, Head, Section, Skeleton, Unreadable } from "../ui";

type Span = "today" | "week" | "month";

const SPANS: { key: Span; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

/** A fortnight of bars is enough to see a shape and short enough to read
    a day at a time. A quarter would have needed an axis. */
const BARS = 14;

/** How many transactions a screen lists before it is a database export
    rather than a page. */
const ROWS = 40;

export default function Earnings() {
  const board = useBoard();
  const [past, setPast] = useState<AdminRide[] | null>(null);
  const [pastError, setPastError] = useState<string | null>(null);
  const [span, setSpan] = useState<Span>("week");
  /** one bar opened, or null for the whole span */
  const [day, setDay] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadRideHistory().then(({ rides, error }) => {
      if (!live) return;
      setPastError(error);
      setPast(error ? null : rides);
    });
    return () => { live = false; };
  }, []);

  const today = todayInAruba();
  // Today's completed rides live in the UPCOMING read (scheduled_date
  // >= today), and everything before today in the history read. Both,
  // therefore, or the current day's money would be missing from the one
  // figure most likely to be checked.
  const all = useMemo(() => mergeRides(board.rides, past ?? []), [board.rides, past]);
  const days = useMemo(() => byDay(all), [all]);

  const spanDays = span === "today" ? [today] : span === "month" ? monthDays(today) : weekDays(today);
  const shownDays = day ? [day] : spanDays;
  const money = totalOver(shownDays, days);
  const ahead = useMemo(() => booked(board.rides), [board.rides]);

  /** the fortnight the chart draws, ending today */
  const bars = useMemo(
    () => Array.from({ length: BARS }, (_, i) => addDays(today, i - (BARS - 1))),
    [today],
  );
  const peak = Math.max(...bars.map((d) => total(days.get(d) ?? []).grossUsd), 1);

  const rows = useMemo(
    () => lines(shownDays.flatMap((d) => days.get(d) ?? [])).slice(0, ROWS),
    [shownDays, days],
  );

  const failed = board.ridesError ?? pastError;

  if (failed) {
    return (
      <Frame>
        <Head kick="Earnings" title={<>What Cabby's <em>took.</em></>} />
        <Unreadable
          what="rides"
          detail={failed}
          reassure="Money isn't missing — these figures are summed from the rides table, and this board can't read it. A zero here would be a wrong answer rather than an empty one."
          onRetry={() => void board.refresh()}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <Head
        kick="Earnings"
        title={<>What Cabby's <em>took.</em></>}
        lead={`Completed rides only. Cabby's keeps ${COMMISSION_LABEL} of every fare; the rest is the driver's, on the same arithmetic their own screen shows them.`}
        action={
          <div className="adm-seg" role="group" aria-label="Period">
            {SPANS.map((s) => (
              <button
                key={s.key}
                type="button"
                className={span === s.key ? "on" : ""}
                aria-pressed={span === s.key}
                onClick={() => { setSpan(s.key); setDay(null); }}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      />

      {board.loading || past === null ? (
        <Skeleton rows={5} />
      ) : (
        <>
          <Figures
            items={[
              { label: day ? "That day" : SPANS.find((s) => s.key === span)!.label, value: usd(money.grossUsd), note: `${money.rides} ride${money.rides === 1 ? "" : "s"} driven` },
              { label: "Driver payouts", value: usd(money.payoutUsd), note: "owed out of it" },
              { label: "Cabby's", value: usd(money.feeUsd), note: `${COMMISSION_LABEL} commission` },
              { label: "Booked ahead", value: usd(ahead.usd), note: `${ahead.rides} not yet driven — not counted above` },
            ]}
          />

          <Section
            title="The last fortnight"
            aside={
              day
                ? <button type="button" className="adm-quiet" onClick={() => setDay(null)}>Show the whole period</button>
                : <span>Tap a day to open it</span>
            }
          >
            <div className="adm-bars" role="group" aria-label="Revenue by day">
              {bars.map((d) => {
                const t = total(days.get(d) ?? []);
                return (
                  <button
                    key={d}
                    type="button"
                    className={`adm-bar${day === d ? " on" : ""}`}
                    aria-pressed={day === d}
                    // The figure in words, because a bar height is not
                    // readable by anything but an eye.
                    aria-label={`${formatDateShort(d)}: ${usd(t.grossUsd)} over ${t.rides} rides`}
                    onClick={() => setDay(day === d ? null : d)}
                  >
                    <i style={{ height: `${Math.max(2, (t.grossUsd / peak) * 100)}%` }} />
                  </button>
                );
              })}
            </div>
            <div className="adm-barx" aria-hidden="true">
              {bars.map((d) => <span key={d}>{weekdayShort(d).slice(0, 1)}</span>)}
            </div>
          </Section>

          <Section
            title={day ? `Rides on ${formatDateShort(day)}` : "Rides in this period"}
            aside={<span>{rows.length === ROWS ? `first ${ROWS}` : `${rows.length} shown`}</span>}
          >
            {rows.length === 0 ? (
              <Empty
                line={day ? "Nothing was driven that day." : "Nothing driven in this period yet."}
                hint={
                  span === "today"
                    ? "Today's figure fills in as rides are completed, so a quiet morning is a quiet morning rather than a broken query."
                    : `The board reads ${HISTORY_DAYS} days back. Anything older than that is not on this screen.`
                }
              />
            ) : (
              <div className="adm-tablewrap">
                <div className="adm-scroll">
                  <table className="adm-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Ride</th>
                        <th scope="col" className="adm-drop">Customer</th>
                        <th scope="col" className="right">Charged</th>
                        <th scope="col" className="right adm-drop">Driver</th>
                        <th scope="col" className="right">Cabby's</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((l) => (
                        <tr key={l.ride.id}>
                          <td data-h="Date" className="nowrap">
                            <span className="adm-two">
                              <span className="a">{jobDateShort(l.ride.completedAt ?? l.ride.scheduledAt) || "—"}</span>
                              <span className="b">{jobTime(l.ride.completedAt ?? l.ride.scheduledAt)}</span>
                            </span>
                          </td>
                          <td data-h="Ride">
                            <span className="adm-two">
                              <Link className="a adm-rowlink" to={`/admin/rides/${l.ride.id}`}>
                                {shortAirport(l.ride.pickup)} → {shortAirport(l.ride.dropoff)}
                              </Link>
                              <span className="b">{l.ride.driverName || "No driver stamped"}</span>
                            </span>
                          </td>
                          <td data-h="Customer" className="adm-drop">{l.ride.guestName || <span className="q">No name</span>}</td>
                          <td data-h="Charged" className="right num">{usd(l.grossUsd)}</td>
                          <td data-h="Driver" className="right adm-drop num">{usd(l.payoutUsd)}</td>
                          <td data-h="Cabby's" className="right num">{usd(l.feeUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {/* Said once, at the bottom, rather than as a "status" column
                that would only ever read "paid". */}
            <p className="adm-fine">
              Every line here is a completed ride. Whether the card behind it actually cleared is
              Stripe's answer, not this board's — it holds only what the webhook last wrote.
            </p>
          </Section>
        </>
      )}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="adm-view"><div className="adm-pad">{children}</div></div>;
}
