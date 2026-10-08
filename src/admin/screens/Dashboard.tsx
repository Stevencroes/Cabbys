// The dashboard — the state of Cabby's in about five seconds.
//
// Four questions, in this order, and the order is the design:
//
//   1. what needs attention   — and NOTHING if nothing does
//   2. what is happening now  — and nothing if nothing is
//   3. what is happening next
//   4. everything else, which is on another screen
//
// SECTIONS THAT HAVE NOTHING TO SAY ARE NOT RENDERED. Not rendered
// empty, not rendered with a reassuring tick — absent. A quiet morning
// should look quiet: an operator who sees the same six panels every day,
// four of them permanently blank, stops reading any of them, and the
// morning something IS wrong the alert lands in furniture. That is the
// single most load-bearing decision on this screen.
//
// THERE IS NO MAP HERE, and that is not an omission. A live operations
// map means driver positions, and this project has none: pickup_lat and
// pickup_lng carry a spot the GUEST sent once from the kerb, which is a
// different thing entirely, and no driver screen reports a location at
// all. A map of today's PICKUPS would have been
// honest and would also have been decoration — it answers "where is the
// island" rather than "where is the car". The route map lives on the
// ride's own page, where it answers a question somebody is asking.
//
// The revenue figure counts COMPLETED rides only, and says so under
// itself. A revenue number that counts tonight's bookings is the number
// that makes a company feel richer than it is.
//
// THE CARDS AND CHARTS (October 2026, at the owner's direction: a card
// grid with graphs, after a light analytics dashboard he pointed at).
// The old figure strip became four tiles and two donuts — today and the
// fleet, at a glance — and the history charts sit BELOW the four
// questions above, never between them: a chart is how the week went,
// and "what needs you" is still the first list on the screen when there
// is anything in it. Every figure is drawn from a read the board already
// makes (the upcoming rides, the drivers, and the same four-month
// history Earnings reads); src/admin/lib/stats.ts does the arithmetic
// and says what each one deliberately is NOT.
//
// The absent-when-empty rule above is for the two ALERT lists, and it
// stays theirs. The charts are instruments with a fixed place in a grid,
// so a quiet one says "nothing dated today" in its own card rather than
// vanishing — a grid that closes up around a missing card moves every
// other card under the operator's pointer, which is the reason the rail
// does not reflow either. And a chart whose read FAILED says that, in
// its own card, while the rest of the board stays up: a missing history
// is not a reason to hide who is waiting at arrivals.
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { jobTime, relativeWhen, shortAirport } from "../../driver/JobCard";
import {
  addDays, arubaDayOf, dayOfMonth, formatDateShort, monthShort, todayInAruba, weekdayLong, weekdayShort,
} from "../../lib/datetime";
import { usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import {
  HISTORY_DAYS, HISTORY_ROW_LIMIT, isClosed, isLive, loadRideHistory, mergeRides, needsDriver,
  type AdminRide, type RideList,
} from "../lib/admin";
import { total } from "../lib/ledger";
import {
  aheadByDay, coveredFrom, dailyRides, fleetMix, todayMix, trailing, weeklyMoney,
} from "../lib/stats";
import AttentionList from "../AttentionList";
import { Card, Columns, Donut, Icons, Line, MiniTable, Ring, Tile, countTick, usdTick } from "../charts";
import { Chip, Head, Skeleton, Unreadable, rideState } from "../ui";

/** How much of what is coming is worth putting on the front page. Past
    a dozen the list stops being "what is next" and starts being the
    schedule, which has its own screen and a day picker. */
const NEXT_UP = 8;

/** Twelve weeks: a quarter, which is long enough to see a season turn
    and short enough to sit well inside the four months history reads. */
const WEEKS = 12;
/** A month of days for the line — the shape of a month, a day apiece. */
const DAYS = 30;

/** "6 Oct" — a tick, short enough for twelve of them across a card. */
const dayTick = (iso: string) => `${dayOfMonth(iso)} ${monthShort(iso)}`;

export default function Dashboard() {
  const { rides, ridesError, loading, refresh, attention, drivers, driversError } = useBoard();
  // The history read is this screen's own, like Earnings' — see the note
  // in BoardContext on why the shared board does not carry it. Null is
  // "not back yet"; a RideList with an error is "could not look".
  const [history, setHistory] = useState<RideList | null>(null);
  const [asked, setAsked] = useState(0);
  const retryHistory = useCallback(() => { setHistory(null); setAsked((n) => n + 1); }, []);

  useEffect(() => {
    let live = true;
    void loadRideHistory().then((r) => { if (live) setHistory(r); });
    return () => { live = false; };
  }, [asked]);

  const today = todayInAruba();
  const todays = rides.filter((r) => arubaDayOf(r.scheduledAt) === today);
  const live = rides.filter(isLive);
  const open = rides.filter(needsDriver);
  const money = total(todays);
  const mix = todayMix(rides, today);
  const fleet = fleetMix(drivers, rides);
  const week = aheadByDay(rides, today, 7);

  // Everything still to happen, soonest first — today's remainder and
  // then tomorrow's, because at 9pm "what is next" is tomorrow morning.
  const ahead = rides
    .filter((r) => !isClosed(r) && !isLive(r) && r.scheduledAt)
    .slice(0, NEXT_UP);

  // The history-drawn figures. `from` is where the read can be trusted
  // from — the requested window, or later if the read hit its row cap.
  const pastReady = history && !history.error;
  const all = pastReady ? mergeRides(rides, history.rides) : [];
  const from = pastReady ? coveredFrom(history.rides, HISTORY_ROW_LIMIT, addDays(today, -HISTORY_DAYS)) : today;
  const weeks = pastReady ? weeklyMoney(all, today, WEEKS, from) : [];
  const days = pastReady ? dailyRides(all, today, DAYS, from) : [];
  const trend = pastReady ? trailing(all, today, 7, from) : null;
  const pastFail = history?.error
    ? { what: "ride history", detail: history.error, onRetry: retryHistory }
    : null;

  if (ridesError) {
    return (
      <Frame>
        <Head kick="Dashboard" title={<>Cabby<em>'s</em> today.</>} />
        <Unreadable
          what="rides"
          detail={ridesError}
          reassure="Bookings aren't being blocked — this board just can't see them."
          onRetry={() => void refresh()}
        />
      </Frame>
    );
  }

  return (
    <Frame>
      <Head
        kick={`${weekdayLong(today)} · Aruba time`}
        title={<>Cabby<em>'s</em> today.</>}
        lead={
          loading
            ? undefined
            : todays.length === 0
            ? "Nothing on the road today. Bookings land on this screen the moment they are made."
            : undefined
        }
      />

      {loading ? (
        <Skeleton rows={5} />
      ) : (
        <div className="adm-dash">
          {/* the readings */}
          <div className="adm-tiles span-12">
            <Tile
              label="Rides today"
              value={String(todays.length)}
              icon={Icons.car}
              note={`${mix.driven} driven · ${mix.all - mix.driven - mix.cancelled} still to go`}
            />
            <Tile
              label="Need a driver"
              value={String(open.length)}
              icon={Icons.nobody}
              alarm={open.length > 0}
              note={open.length > 0 ? "nobody is driving these" : "every booked ride has a driver"}
            />
            <Tile label="Earned today" value={usd(money.grossUsd)} icon={Icons.money} note="completed rides only" />
            <Tile
              label="Earned, last 7 days"
              value={trend ? usd(trend.current.grossUsd) : ""}
              icon={Icons.trend}
              wait={!history}
              fail={pastFail ? "Couldn't read the history — see below" : null}
              // Withheld, not guessed, when the read did not reach the
              // whole week before: half a week would always look worse.
              delta={trend?.comparable ? { change: trend.change, against: "the 7 before" } : null}
              note={`${trend?.current.rides ?? 0} rides, to yesterday`}
            />
          </div>

          {/* 1 — what needs a person. Absent when nothing does. */}
          {attention.length > 0 && (
            <Card
              title="Needs you"
              className="span-12"
              aside={
                attention.length > 4
                  ? <Link className="adm-more" to="/admin/support">All {attention.length} →</Link>
                  : undefined
              }
            >
              <AttentionList items={attention.slice(0, 4)} />
            </Card>
          )}

          {/* 2 — what is happening now. Absent when nothing is. */}
          {live.length > 0 && (
            <Card title="On the road now" className="span-12">
              <div className="adm-list">
                {live.map((r) => <Row key={r.id} ride={r} />)}
              </div>
            </Card>
          )}

          {/* how today and the fleet are made up, at a glance */}
          <Card
            title="Today, by state"
            className="span-4"
            empty={mix.all === 0 ? { line: "Nothing dated today.", hint: "A booking for today lands here the moment it is made." } : null}
          >
            <Donut
              label={`Today's ${mix.all} rides by state`}
              total={mix.all}
              totalLabel={mix.all === 1 ? "ride" : "rides"}
              slices={[
                { key: "driven", label: "Driven", value: mix.driven, tone: "c1" },
                { key: "live", label: "On the road", value: mix.live, tone: "c2" },
                { key: "booked", label: "Booked", value: mix.booked, tone: "c3" },
                { key: "open", label: "Need a driver", value: mix.open, tone: "c4" },
                { key: "cancelled", label: "Cancelled", value: mix.cancelled, tone: "other" },
              ]}
            />
          </Card>

          <Card
            title="The fleet"
            className="span-4"
            fail={driversError ? { what: "drivers", detail: driversError, onRetry: () => void refresh() } : null}
            empty={drivers.length === 0 ? { line: "No drivers on the books yet.", hint: "A driver appears here the moment they apply." } : null}
          >
            <Donut
              label={`${drivers.length} drivers by status`}
              total={drivers.length}
              totalLabel={drivers.length === 1 ? "driver" : "drivers"}
              slices={[
                { key: "approved", label: "Approved", value: fleet.approved, tone: "c1" },
                { key: "pending", label: "Waiting for review", value: fleet.pending, tone: "c3" },
                { key: "suspended", label: "On hold", value: fleet.suspended, tone: "c4" },
              ]}
            />
          </Card>

          <div className="adm-rings span-4">
            <Card
              title="Driven today"
              empty={mix.all - mix.cancelled === 0 ? { line: "Nothing to drive today." } : null}
            >
              <Ring
                value={mix.driven}
                of={mix.all - mix.cancelled}
                figure={`${mix.driven} of ${mix.all - mix.cancelled}`}
                note="cancellations aside"
              />
            </Card>
            <Card
              title="On duty now"
              fail={driversError ? { what: "drivers", detail: driversError } : null}
              empty={fleet.approved === 0 && !driversError ? { line: "No approved drivers yet." } : null}
            >
              <Ring
                value={fleet.onDuty}
                of={fleet.approved}
                tone="c2"
                figure={`${fleet.onDuty} of ${fleet.approved}`}
                note="approved, online or driving"
              />
            </Card>
          </div>

          {/* 3 — what is next. The one list that is always here, because
              "nothing is booked" is itself the answer an operator came for. */}
          <Card
            title="Coming up"
            className="span-7"
            aside={<Link className="adm-more" to="/admin/schedule">The whole schedule →</Link>}
            empty={ahead.length === 0
              ? { line: "Nothing else booked.", hint: "Every ride from today on is either finished, cancelled or already under way." }
              : null}
          >
            <div className="adm-list">
              {ahead.map((r) => <Row key={r.id} ride={r} />)}
            </div>
          </Card>

          <div className="adm-stack span-5">
            <Card
              title="The next seven days"
              sub="Rides still to drive, by whether anyone is driving them"
              empty={week.every((d) => d.covered + d.open === 0) ? { line: "Nothing booked for the week ahead." } : null}
              table={() => (
                <MiniTable
                  head={["Day", "With a driver", "Need a driver"]}
                  rows={week.map((d) => [formatDateShort(d.day), d.covered, d.open])}
                />
              )}
            >
              <Columns
                height={180}
                integer
                format={countTick}
                columns={week.map((d, i) => ({
                  key: d.day,
                  tick: i === 0 ? "Today" : weekdayShort(d.day),
                  label: formatDateShort(d.day),
                  segments: [
                    { name: "with a driver", value: d.covered, tone: "c1" as const },
                    { name: "need a driver", value: d.open, tone: "c4" as const },
                  ],
                }))}
                describe={(c) => `${c.label}: ${c.segments[0].value} with a driver, ${c.segments[1].value} needing one`}
              />
              <Legend items={[["c1", "With a driver"], ["c4", "Need a driver"]]} />
            </Card>

            <Card
              title="Rides per day"
              sub={`The last ${DAYS} days, to yesterday · cancellations aside`}
              wait={!history}
              minHeight={240}
              fail={pastFail}
              empty={pastReady && days.every((d) => d.rides === 0) ? { line: `No rides in the last ${DAYS} days.` } : null}
              table={() => (
                <MiniTable head={["Day", "Rides"]} rows={days.map((d) => [formatDateShort(d.day), d.rides])} />
              )}
            >
              <Line
                height={240}
                integer
                format={countTick}
                label={`Rides per day over the last ${days.length} days`}
                points={days.map((d) => ({ key: d.day, tick: dayTick(d.day), label: formatDateShort(d.day), value: d.rides }))}
              />
            </Card>
          </div>

          {/* 4 — how the weeks went. Below everything that wants a person. */}
          <Card
            title="Earned per week"
            sub="Completed rides, Monday to Sunday — the current week is still filling"
            className="span-12"
            wait={!history}
            minHeight={240}
            fail={pastFail}
            empty={pastReady && weeks.every((w) => w.grossUsd === 0) ? { line: `Nothing driven in the last ${WEEKS} weeks.` } : null}
            table={() => (
              <MiniTable
                head={["Week of", "Rides", "Earned"]}
                rows={weeks.map((w) => [`${formatDateShort(w.week)}${w.partial ? " (so far)" : ""}`, w.rides, usd(w.grossUsd)])}
              />
            )}
          >
            <Columns
              height={240}
              format={usdTick}
              columns={weeks.map((w) => ({
                key: w.week,
                tick: dayTick(w.week),
                label: `Week of ${formatDateShort(w.week)}`,
                partial: w.partial,
                segments: [{ name: `from ${w.rides} ride${w.rides === 1 ? "" : "s"}`, value: w.grossUsd, tone: "c1" as const }],
              }))}
              describe={(c) => `${c.label}: ${usd(c.segments[0].value)} ${c.segments[0].name}${c.partial ? ", so far" : ""}`}
            />
            {weeks.length < WEEKS && (
              <p className="adm-fine">
                Starts {formatDateShort(weeks[0]?.week ?? from)}: the history read reached its row limit, and a
                week it only half read would look like a slow one.
              </p>
            )}
          </Card>

        </div>
      )}
    </Frame>
  );
}

/** The key for a chart with two series. Mirrors the mark: a block for
    a column. Text in ink, the colour on the swatch beside it. */
function Legend({ items }: { items: [string, string][] }) {
  return (
    <ul className="adm-keys">
      {items.map(([tone, label]) => (
        <li key={tone}><i className={`adm-sw t-${tone}`} aria-hidden="true" />{label}</li>
      ))}
    </ul>
  );
}

/**
 * One ride on a chronological list: when, who, where from and to, what
 * car, which driver, and its state.
 *
 * The same row shape on the dashboard and on the schedule, because they
 * are the same list read over two different spans. A second row
 * component would have drifted, and the two screens would have started
 * disagreeing about what a ride looks like.
 */
export function Row({ ride: r, showDay }: { ride: AdminRide; showDay?: boolean }) {
  const state = rideState(r);
  return (
    <Link className={`adm-row${needsDriver(r) ? " wants" : ""}`} to={`/admin/rides/${r.id}`}>
      <span className="adm-rtime">
        {r.scheduledAt ? jobTime(r.scheduledAt) : "—"}
        <small>{showDay ? (arubaDayOf(r.scheduledAt) || "no date") : relativeWhen(r.scheduledAt)}</small>
      </span>
      <span className="adm-rmain">
        <span className="a">{r.guestName || "No name given"}</span>
        <span className="b">{shortAirport(r.pickup) || "—"} → {shortAirport(r.dropoff) || "—"}</span>
      </span>
      <span className="adm-rmain adm-rsub">
        <span className="a">
          {r.driverName || (r.driverId ? "Assigned, no name stamped" : "Nobody driving it")}
        </span>
        {/* The car the GUEST was told to look for, when there is one —
            not the class they booked, which is what the booking asked
            for rather than what is coming. The class stands in only
            while nobody is driving it yet. */}
        <span className="b">
          {r.driverId
            ? [r.driverVehicle, r.driverPlate].filter(Boolean).join(" · ") || "No car shown to the guest"
            : r.vehicle || "Vehicle not recorded"}
        </span>
      </span>
      <span className="adm-rend">
        <Chip tone={state.tone}>{state.label}</Chip>
      </span>
    </Link>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="adm-view"><div className="adm-pad">{children}</div></div>;
}
