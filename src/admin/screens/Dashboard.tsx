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
// map means driver positions, and this project has none: rides carry
// pickup_lat/pickup_lng that nothing has ever written, and no driver
// screen reports a location. A map of today's PICKUPS would have been
// honest and would also have been decoration — it answers "where is the
// island" rather than "where is the car". The route map lives on the
// ride's own page, where it answers a question somebody is asking.
//
// The revenue figure counts COMPLETED rides only, and says so under
// itself. A revenue number that counts tonight's bookings is the number
// that makes a company feel richer than it is.
import { Link } from "react-router-dom";
import { jobTime, relativeWhen, shortAirport } from "../../driver/JobCard";
import { arubaDayOf, todayInAruba, weekdayLong } from "../../lib/datetime";
import { usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import { isClosed, isLive, needsDriver, type AdminRide } from "../lib/admin";
import { total } from "../lib/ledger";
import AttentionList from "../AttentionList";
import { Chip, Empty, Figures, Head, Section, Skeleton, Unreadable, rideState } from "../ui";

/** How much of what is coming is worth putting on the front page. Past
    a dozen the list stops being "what is next" and starts being the
    schedule, which has its own screen and a day picker. */
const NEXT_UP = 8;

export default function Dashboard() {
  const { rides, ridesError, loading, refresh, attention } = useBoard();

  const today = todayInAruba();
  const todays = rides.filter((r) => arubaDayOf(r.scheduledAt) === today);
  const live = rides.filter(isLive);
  const open = rides.filter(needsDriver);
  const money = total(todays);

  // Everything still to happen, soonest first — today's remainder and
  // then tomorrow's, because at 9pm "what is next" is tomorrow morning.
  const ahead = rides
    .filter((r) => !isClosed(r) && !isLive(r) && r.scheduledAt)
    .slice(0, NEXT_UP);

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
        <>
          <Figures
            items={[
              { label: "Rides today", value: String(todays.length) },
              { label: "On the road", value: String(live.length) },
              {
                label: "Need a driver",
                value: String(open.length),
                alarm: open.length > 0,
                note: open.length > 0 ? "nobody is driving these" : undefined,
              },
              {
                label: "Earned today",
                value: usd(money.grossUsd),
                note: "completed rides only",
              },
            ]}
          />

          {/* 1 — what needs a person. Absent when nothing does. */}
          {attention.length > 0 && (
            <Section
              title="Needs you"
              aside={
                attention.length > 4
                  ? <Link className="adm-more" to="/admin/support">All {attention.length} →</Link>
                  : undefined
              }
            >
              <AttentionList items={attention.slice(0, 4)} />
            </Section>
          )}

          {/* 2 — what is happening now. Absent when nothing is. */}
          {live.length > 0 && (
            <Section title="On the road now">
              <div className="adm-list">
                {live.map((r) => <Row key={r.id} ride={r} />)}
              </div>
            </Section>
          )}

          {/* 3 — what is next. The one section that is always here,
              because "nothing is booked" is itself the answer an
              operator came for. */}
          <Section
            title="Coming up"
            aside={<Link className="adm-more" to="/admin/schedule">The whole schedule →</Link>}
          >
            {ahead.length === 0 ? (
              <Empty
                line="Nothing else booked."
                hint="Every ride from today on is either finished, cancelled or already under way."
              />
            ) : (
              <div className="adm-list">
                {ahead.map((r) => <Row key={r.id} ride={r} />)}
              </div>
            )}
          </Section>
        </>
      )}
    </Frame>
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
