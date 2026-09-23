// ── My Trips ─────────────────────────────────────────────────────────────
//
// A category chooser at the top — Upcoming, Past, Cancelled, and Needs
// review when there is any — and one category's trips below it. Every trip
// appears exactly once, in the place src/lib/tripStatus.ts decides from
// the backend row and the clock, and the counts are counts of that same
// decision. Nothing here decides status for itself.
//
// Needs review used to be a section ABOVE the tabs, uncapped, on the
// theory that a problem should never sit in a tab where it can be left
// unopened. In practice it did the opposite of its job: an account with a
// pile of trips nobody closed opened on that pile, and the category
// chooser ended up screens below it — the page read as one endless list
// of bookings with no way to pick what to look at. It is a category now,
// listed FIRST and only when it has anything in it, with its count in the
// alert colour: visible at the top of the page without flooding it, and
// still never folded into Past.
//
// The page also has to be honest about how fresh it is. Statuses change
// while it is open — a driver taps "on my way" — and the live channel can
// drop, or the phone can go offline in an arrivals hall. When the list may
// be out of date, the page says so and says as of when, rather than
// presenting a stale "Driver assigned" as the present.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../booking/useAuth";
import { useBookingOptional } from "../booking/BookingContext";
import { useStartBooking } from "../booking/useStartBooking";
import { supabase } from "../lib/supabase";
import { claimGuestRides } from "../lib/claimRides";
import { tripState, type TripState } from "../lib/tripStatus";
import { formatTime, nowInAruba } from "../lib/datetime";
import { findPlaceByName, selFromPlace } from "../data/places";
import TripCard, { type Ride } from "../components/trips/TripCard";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";

type Tab = "review" | "upcoming" | "past" | "cancelled";

const BASE_TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
];
const REVIEW_TAB = { key: "review" as Tab, label: "Needs review" };

const EMPTY: Record<Tab, { h: string; p: string }> = {
  review: { h: "Nothing needs review.", p: "Every trip on your account is closed off properly." },
  upcoming: { h: "No upcoming trips.", p: "When you book a transfer, it will be here with your driver's details." },
  past: { h: "No completed trips yet.", p: "Finished rides are kept here, with a summary of each." },
  cancelled: { h: "No cancelled trips.", p: "Anything you cancel is kept here, with what happened to the payment." },
};

/** How many trips a category shows first, and how many each "Show more"
    adds. Stepped rather than all-at-once: expanding a long history in one
    go put the whole account on screen, which is the endless list the
    category chooser exists to prevent. */
const SHELF_PAGE = 5;
const SHELF_STEP = 10;

/**
 * The clock the whole page reads.
 *
 * One value per render, shared by every card and every tab count, so a
 * trip crossing the review threshold cannot be "upcoming" in the count and
 * "needs review" on its card. Ticks each minute so a page left open
 * catches that crossing without a reload.
 */
function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

function clockOf(ms: number): string {
  return formatTime(nowInAruba(ms));
}

type Entry = { ride: Ride; state: TripState };

const pickupMs = (e: Entry) => (e.state.pickupAt ? Date.parse(e.state.pickupAt) : NaN);
/** Soonest first, undated last — the next car is the one that matters. */
const soonest = (a: Entry, b: Entry) => (pickupMs(a) || Infinity) - (pickupMs(b) || Infinity);
/** Most recent first, for everything already behind the guest. */
const latest = (a: Entry, b: Entry) => (pickupMs(b) || 0) - (pickupMs(a) || 0);

function Skeletons() {
  return (
    <div className="tp-skeletons" role="status" aria-label="Loading your trips">
      {[0, 1].map((i) => (
        <div key={i} className="tp-skeleton" aria-hidden="true">
          <span className="sk sk-pill" /><span className="sk sk-title" />
          <span className="sk sk-line" /><span className="sk sk-line short" />
        </div>
      ))}
    </div>
  );
}

export default function MyTrips() {
  // `account`, never `user`. Booking as a guest mints an ANONYMOUS Supabase
  // user persisted in localStorage, so every guest booking from one browser
  // shares one id — showing those would show every test booking that
  // browser ever made, to nobody in particular.
  const { account, loading: authLoading } = useAuth();
  const { openAuth } = useAuthModal();
  const booking = useBookingOptional();
  const startBooking = useStartBooking();
  const [params, setParams] = useSearchParams();
  const now = useMinuteClock();
  const online = useOnline();

  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  // null until the live channel reports; false once it has failed.
  const [live, setLive] = useState<boolean | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [limit, setLimit] = useState(SHELF_PAGE);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!account) return;
    let alive = true;
    setLoading(true);
    setError(null);
    // Claim first, read second, so a guest booking made under this address
    // arrives in the same pass instead of on the next refresh.
    void claimGuestRides()
      .then(({ claimed: n }) => { if (alive) setClaimed(n); })
      .catch(() => { /* claiming is a bonus; the read below still runs */ })
      .then(() =>
        supabase
          .from("rides")
          .select("*")
          .eq("passenger_id", account.id)
          .order("created_at", { ascending: false }),
      )
      .then((res) => {
        if (!alive || !res) return;
        // A failed read is reported as a failure — never as "no trips",
        // which is the house fault this codebase keeps naming. Whatever was
        // already on screen stays there, marked as not refreshed.
        if (res.error) setError(res.error.message || "The request failed.");
        else { setRides((res.data as Ride[]) ?? []); setSyncedAt(Date.now()); }
        setLoading(false);
      }, () => {
        if (!alive) return;
        setError("The request failed.");
        setLoading(false);
      });
    return () => { alive = false; };
  }, [account, reloadKey]);

  // Back online after being offline: fetch again rather than leave the
  // guest looking at statuses from before the gap.
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) { wasOffline.current = true; return; }
    if (wasOffline.current) { wasOffline.current = false; reload(); }
  }, [online, reload]);

  // Live status: a driver's "on my way" arrives without a refresh.
  useEffect(() => {
    if (!account) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = (supabase as { channel?: typeof supabase.channel }).channel?.(`rides-${account.id}`) ?? null;
      channel
        ?.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rides", filter: `passenger_id=eq.${account.id}` },
          (payload: { new: Ride }) => {
            setRides((rs) => rs.map((r) => (r.id === payload.new.id ? { ...r, ...payload.new } : r)));
            setSyncedAt(Date.now());
          },
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") setLive(true);
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive(false);
        });
    } catch {
      setLive(false);
    }
    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [account]);

  function handleCancelled(id: string) {
    // Only called after cancelRide confirmed the row changed, so this
    // mirrors the database rather than hoping it agrees.
    setRides((rs) => rs.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
  }

  function handleBookAgain(ride: Ride) {
    if (!booking) return;
    booking.reset();
    const a = findPlaceByName(ride.pickup_location);
    const b = findPlaceByName(ride.dropoff_location);
    booking.open({ from: a ? selFromPlace(a) : undefined, to: b ? selFromPlace(b) : undefined });
  }

  const groups = useMemo(() => {
    const all: Entry[] = rides.map((ride) => ({ ride, state: tripState(ride, now) }));
    const by = (p: TripState["placement"]) => all.filter((e) => e.state.placement === p);
    return {
      upcoming: by("upcoming").sort(soonest),
      past: by("past").sort(latest),
      cancelled: by("cancelled").sort(latest),
      review: by("review").sort(latest),
    };
  }, [rides, now]);

  // Needs review is offered only while it has something in it — an empty
  // alert category would be a permanent red herring at the top of the page.
  const tabs = groups.review.length > 0 ? [REVIEW_TAB, ...BASE_TABS] : BASE_TABS;
  const raw = params.get("show");
  const chosen: Tab | null = tabs.some((t) => t.key === raw) ? (raw as Tab) : null;
  // Upcoming when there is anything ahead; otherwise Past.
  const active: Tab = chosen ?? (groups.upcoming.length > 0 ? "upcoming" : "past");
  const shelf = groups[active];
  const visible = shelf.slice(0, limit);
  const remaining = shelf.length - visible.length;

  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ review: null, upcoming: null, past: null, cancelled: null });
  function choose(t: Tab, focus = false) {
    setParams({ show: t });
    setLimit(SHELF_PAGE); // a newly chosen category always opens short
    if (focus) tabRefs.current[t]?.focus();
  }
  // The keyboard pattern a screen-reader user expects from a tablist:
  // arrows move between tabs, Home/End jump to the ends.
  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    const i = tabs.findIndex((t) => t.key === active);
    const go = (j: number) => { e.preventDefault(); choose(tabs[(j + tabs.length) % tabs.length].key, true); };
    if (e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(tabs.length - 1);
  }

  const hasData = syncedAt !== null;
  const bookButton = booking && (
    <button type="button" className="btn-ghost tp-primary" onClick={() => startBooking()}>Book a transfer</button>
  );
  const cardProps = { now, onCancelled: handleCancelled, onBookAgain: booking ? handleBookAgain : undefined };

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="tp-main">
        <div className="wrap tp-wrap">
          <h1 className="tp-title">Your trips</h1>
          <p className="tp-sub">Every ride, kept in one place.</p>

          {claimed > 0 && (
            <p className="tp-claimed" role="status">
              {claimed === 1 ? "One booking you made as a guest" : `${claimed} bookings you made as a guest`}
              {" "}now sits on this account.
            </p>
          )}

          {/* How fresh this is, whenever it might not be. */}
          {account && hasData && !online && (
            <div className="tp-conn" role="status">
              You&rsquo;re offline. Showing your trips as of {clockOf(syncedAt!)} Aruba time — statuses may have changed since.
            </div>
          )}
          {account && hasData && online && error && (
            <div className="tp-conn" role="alert">
              Couldn&rsquo;t refresh your trips. Showing them as of {clockOf(syncedAt!)} Aruba time.
              <button type="button" className="tp-text" onClick={reload} disabled={loading}>{loading ? "Retrying…" : "Retry"}</button>
            </div>
          )}
          {account && hasData && online && !error && live === false && (
            <div className="tp-conn" role="status">
              Live updates are paused. Last updated {clockOf(syncedAt!)} Aruba time.
              <button type="button" className="tp-text" onClick={reload} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
            </div>
          )}

          {authLoading && <Skeletons />}

          {!authLoading && !account && (
            <div className="tp-empty">
              <p className="tp-empty-h">Sign in to see your transfers.</p>
              <p>
                Booked as a guest? Your confirmation is in your inbox, and your driver has your number.
                Create an account with the same email and we&rsquo;ll put the trip here.
              </p>
              <button type="button" className="btn-ghost tp-primary" onClick={openAuth}>Sign in</button>
            </div>
          )}

          {!authLoading && account && loading && !hasData && <Skeletons />}

          {!authLoading && account && !loading && error && !hasData && (
            <div className="tp-empty" role="alert">
              <p className="tp-empty-h">We couldn&rsquo;t load your trips.</p>
              <p>{online ? "Something went wrong on our side or the connection dropped." : "You're offline."} Your bookings are safe.</p>
              <button type="button" className="btn-ghost tp-primary" onClick={reload}>Retry</button>
            </div>
          )}

          {!authLoading && account && hasData && rides.length === 0 && (
            <div className="tp-empty">
              <p className="tp-empty-h">No trips yet.</p>
              <p>Book a transfer and it will be here, with your driver&rsquo;s details on the day.</p>
              {bookButton}
            </div>
          )}

          {!authLoading && account && hasData && rides.length > 0 && (
            <>
              <div className="tp-tabs" role="tablist" aria-label="Trips" data-n={tabs.length}>
                {tabs.map((t) => {
                  const on = active === t.key;
                  const n = groups[t.key].length;
                  return (
                    <button
                      key={t.key}
                      ref={(el) => { tabRefs.current[t.key] = el; }}
                      type="button"
                      role="tab"
                      id={`tp-tab-${t.key}`}
                      aria-selected={on}
                      aria-controls="tp-panel"
                      tabIndex={on ? 0 : -1}
                      className={`tp-tab t-${t.key}${on ? " on" : ""}`}
                      onClick={() => choose(t.key)}
                      onKeyDown={onTabKey}
                    >
                      {t.label}
                      <span className="tp-tab-n" aria-hidden="true">{n}</span>
                      <span className="sr-only">, {n} {n === 1 ? "trip" : "trips"}</span>
                    </button>
                  );
                })}
              </div>

              <section id="tp-panel" role="tabpanel" aria-labelledby={`tp-tab-${active}`} className="tp-section">
                {active === "review" && shelf.length > 0 && (
                  <p className="tp-sec-note">
                    {shelf.length === 1 ? "This trip wasn't" : "These trips weren't"} closed off properly.
                    {" "}{shelf.length === 1 ? "It stays" : "They stay"} here, not in Past, until it&rsquo;s sorted.
                  </p>
                )}
                {shelf.length === 0 ? (
                  <div className="tp-empty">
                    <p className="tp-empty-h">{EMPTY[active].h}</p>
                    <p>{EMPTY[active].p}</p>
                    {bookButton}
                  </div>
                ) : (
                  <>
                    <div className="tp-list">
                      {visible.map((e) => <TripCard key={e.ride.id} ride={e.ride} {...cardProps} />)}
                    </div>
                    {shelf.length > SHELF_PAGE && (
                      <div className="tp-more-row">
                        {/* Where you are in a long list, so "Show more" is a
                            choice with a known size rather than a slot machine. */}
                        <p className="tp-shown" role="status">Showing {visible.length} of {shelf.length}</p>
                        {remaining > 0 ? (
                          <button type="button" className="tp-more" onClick={() => setLimit((l) => l + SHELF_STEP)}>
                            Show {Math.min(SHELF_STEP, remaining)} more
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                        ) : (
                          <button type="button" className="tp-more open" onClick={() => setLimit(SHELF_PAGE)}>
                            Show fewer
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M6 9l6 6 6-6" />
                            </svg>
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
