import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../booking/useAuth";
import { useBookingOptional } from "../booking/BookingContext";
import { supabase } from "../lib/supabase";
import { cancelRide } from "../lib/rides";
import { claimGuestRides } from "../lib/claimRides";
import { refFromRideId } from "../lib/bookingRef";
import { cancellationInfo, scheduledDate } from "../lib/policy";
import { whatsappEnabled, whatsappLink } from "../lib/whatsapp";
import { usd, AWG_PER_USD } from "../lib/quote";
import { formatDateTime, ARUBA_OFFSET_MINUTES } from "../lib/datetime";
import { findPlaceByName, selFromPlace } from "../data/places";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";

interface Ride {
  id: string;
  pickup_location: string;
  dropoff_location: string;
  scheduled_date?: string;
  scheduled_time?: string;
  scheduled_at?: string;
  vehicle_type?: string;
  vehicle_class?: string;
  fare_total?: number | string;
  price?: number | string;
  status?: string;
  created_at?: string;
  booking_ref?: string;
  flight_number?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_vehicle?: string;
  driver_plate?: string;
}

// The journey a ride moves through — synonyms collapse onto these stations.
const STATUS_FLOW = ["pending", "confirmed", "driver_assigned", "en_route", "completed"] as const;
const STATUS_LABELS: Record<(typeof STATUS_FLOW)[number], string> = {
  pending: "Requested",
  confirmed: "Confirmed",
  driver_assigned: "Driver assigned",
  en_route: "On the way",
  completed: "Completed",
};

function canonicalStatus(status: string | undefined): string {
  const s = (status ?? "pending").toLowerCase();
  if (s === "pending_payment" || s === "requested") return "pending";
  if (s === "paid" || s === "accepted") return "confirmed";
  if (s === "assigned") return "driver_assigned";
  if (s === "arrived" || s === "on_board" || s === "in_progress") return "en_route";
  return s;
}

function statusIndex(status: string | undefined): number {
  return STATUS_FLOW.indexOf(canonicalStatus(status) as (typeof STATUS_FLOW)[number]);
}

function statusLabel(status: string | undefined): string {
  const c = canonicalStatus(status);
  if (c === "cancelled" || c === "canceled") return "Cancelled";
  const i = statusIndex(status);
  if (i >= 0) return STATUS_LABELS[STATUS_FLOW[i]];
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function pickupDate(ride: Ride): Date | null {
  if (ride.scheduled_date) return scheduledDate(ride.scheduled_date, ride.scheduled_time ?? "");
  if (ride.scheduled_at) {
    const d = new Date(ride.scheduled_at);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatTripDate(ride: Ride): string {
  // same unambiguous shape as the booking flow — never a bare 08/01
  if (ride.scheduled_date) {
    return formatDateTime(ride.scheduled_date, ride.scheduled_time ?? "");
  }
  const d = pickupDate(ride);
  if (d) {
    const iso = new Date(d.getTime() + ARUBA_OFFSET_MINUTES * 60_000).toISOString();
    return formatDateTime(iso.slice(0, 10), iso.slice(11, 16));
  }
  return "—";
}

// Three shelves: what's ahead, what you called off, what already happened.
type Bucket = "upcoming" | "cancelled" | "past";

function bucketOf(ride: Ride): Bucket {
  const c = canonicalStatus(ride.status);
  if (c === "cancelled" || c === "canceled") return "cancelled";
  if (c === "completed") return "past";
  const d = pickupDate(ride);
  if (!d) return "upcoming"; // undated but active — keep it in front of the traveler
  return d.getTime() > Date.now() - 6 * 3_600_000 ? "upcoming" : "past"; // grace after pickup
}

function isUpcoming(ride: Ride): boolean {
  return bucketOf(ride) === "upcoming";
}


/** Sort key — undated rides sort last. */
function whenMs(ride: Ride): number {
  return pickupDate(ride)?.getTime() ?? 0;
}

function TripTimeline({ status }: { status: string | undefined }) {
  const idx = Math.max(0, statusIndex(status));
  return (
    <div className="tp-timeline" aria-label={`Status: ${statusLabel(status)}`}>
      {STATUS_FLOW.map((s, i) => (
        <div key={s} className={`tp-tl-step${i < idx ? " done" : ""}${i === idx ? " now" : ""}`}>
          {i > 0 && <span className="tp-tl-bar" />}
          <span className="tp-tl-node" />
          <span className="tp-tl-lbl">{STATUS_LABELS[s]}</span>
        </div>
      ))}
    </div>
  );
}

function TripCard({
  ride,
  onCancelled,
  onRebook,
}: {
  ride: Ride;
  onCancelled: (id: string) => void;
  /** reverse=true books the way home; false repeats the same route */
  onRebook?: (ride: Ride, reverse: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = canonicalStatus(ride.status);
  const cancelled = c === "cancelled" || c === "canceled";
  const completed = c === "completed";
  const upcoming = isUpcoming(ride);
  // rides rows store florin for the driver dashboard; guests see USD only
  const fare = usd(Number(ride.fare_total ?? ride.price ?? 0) / AWG_PER_USD);
  const vehicle = [ride.vehicle_class, ride.vehicle_type].filter(Boolean).join(" · ");
  const bookingRef = ride.booking_ref ?? refFromRideId(ride.id);
  const policy = cancellationInfo(pickupDate(ride));
  const canCancel = upcoming && !cancelled && !completed && c !== "en_route";
  // Filing is by date once a trip stops being terminal, which is right — the
  // ride is behind you either way. What was missing is the reason: a trip
  // still tagged "Driver assigned" sitting under Past looks like a filter bug
  // until the card admits nobody ever closed it off.
  const unclosed = !upcoming && !cancelled && !completed;
  const waHref = whatsappLink(`Hi Cabby's — about booking ${bookingRef}.`);

  async function handleCancel() {
    setBusy(true);
    setError(null);
    const err = await cancelRide(ride.id);
    if (err) {
      setError("Couldn't cancel just now — try again or message us on WhatsApp.");
      setBusy(false);
      return;
    }
    onCancelled(ride.id);
  }

  return (
    <article className={`tp-card${cancelled ? " cancelled" : ""}`}>
      <header className="tp-head">
        <span className="tp-ref">{bookingRef}</span>
        <span className={`tp-status s-${cancelled ? "cancelled" : c}`}>{statusLabel(ride.status)}</span>
      </header>

      <div className="tp-route">
        <div className="rr-stop"><span className="ring" /><span>{ride.pickup_location}</span></div>
        <div className="rr-line" />
        <div className="rr-stop"><span className="rdiamond" /><span>{ride.dropoff_location}</span></div>
      </div>

      <div className="tp-meta">
        <span>{formatTripDate(ride)}</span>
        {vehicle && <span>{vehicle}</span>}
        {ride.flight_number && <span>Flight {ride.flight_number}</span>}
        <span className="tp-fare">{fare}</span>
      </div>

      {upcoming && !cancelled && <TripTimeline status={ride.status} />}

      {unclosed && (
        <p className="tp-unclosed">
          The pickup time has gone by and this was never marked complete.
          Message us if that isn't right.
        </p>
      )}

      {ride.driver_name && !cancelled && (
        <div className="tp-driver">
          <div className="tp-driver-ava" aria-hidden="true">{ride.driver_name.charAt(0)}</div>
          <div className="tp-driver-info">
            <b>{ride.driver_name}</b>
            <span>{[ride.driver_vehicle, ride.driver_plate].filter(Boolean).join(" · ") || "Your driver"}</span>
          </div>
          {ride.driver_phone && (
            <a
              className="btn-ghost tp-driver-wa"
              href={`https://wa.me/${ride.driver_phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          )}
        </div>
      )}

      {error && <div className="pay-error" role="alert" style={{ marginTop: "12px" }}>{error}</div>}

      <footer className="tp-actions">
        {onRebook && (completed || cancelled) && (
          <button
            className="btn-ghost"
            type="button"
            onClick={() => onRebook(ride, completed)}
          >
            {cancelled ? "Book again" : "Book return"}
          </button>
        )}
        {upcoming && !cancelled && waHref && whatsappEnabled && (
          <a className="btn-ghost" href={waHref} target="_blank" rel="noreferrer">WhatsApp us</a>
        )}
        {canCancel && !confirming && (
          <button className="tp-cancel-link" type="button" onClick={() => setConfirming(true)}>
            Cancel trip
          </button>
        )}
        {canCancel && confirming && (
          <span className="tp-cancel-confirm">
            {policy.free ? "Free to cancel." : "Inside 24 h — a fee may apply."}
            <button className="tp-cancel-link danger" type="button" disabled={busy} onClick={handleCancel}>
              {busy ? "Cancelling…" : "Yes, cancel"}
            </button>
            <button className="tp-cancel-link" type="button" onClick={() => setConfirming(false)}>
              Keep trip
            </button>
          </span>
        )}
      </footer>
    </article>
  );
}

const FILTERS: { key: Bucket; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "cancelled", label: "Cancelled" },
  { key: "past", label: "Past" },
];

/** How many trips a shelf shows before it asks to be opened. */
const SHELF_PAGE = 5;

const EMPTY_COPY: Record<Bucket, string> = {
  upcoming: "Nothing on the calendar. The island is waiting.",
  cancelled: "Nothing cancelled — long may it last.",
  past: "No finished trips yet.",
};

export default function MyTrips() {
  // `account`, never `user`. Booking as a guest mints an ANONYMOUS Supabase
  // user and Supabase persists it in localStorage, so every guest booking
  // made from one browser shares one id — which is why this page looked
  // like it was full of seed data: it was showing every test booking that
  // browser had ever made, to nobody in particular.
  const { account, loading: authLoading } = useAuth();
  const { openAuth } = useAuthModal();
  const booking = useBookingOptional();
  const [params, setParams] = useSearchParams();
  // Only one shelf can be open at a time, so switching shelves collapses
  // the previous one without needing an effect to reset it.
  const [openShelf, setOpenShelf] = useState<Bucket | null>(null);
  const raw = params.get("show");
  // null = "no explicit choice yet"; the render picks a sensible shelf.
  const filter: Bucket | null = FILTERS.some((f) => f.key === raw) ? (raw as Bucket) : null;
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // How many guest bookings this visit pulled onto the account, so the page
  // can account for trips that were not here the last time they looked.
  const [claimed, setClaimed] = useState(0);

  useEffect(() => {
    if (!account) return;
    let live = true;
    setLoading(true);
    // Claim first, read second. Anything booked as a guest under this
    // address becomes theirs before the list is fetched, so it arrives in
    // one pass rather than appearing on the next refresh.
    void claimGuestRides()
      .then(({ claimed: n }) => { if (live) setClaimed(n); })
      .then(() =>
        supabase
          .from("rides")
          .select("*")
          .eq("passenger_id", account.id)
          .order("created_at", { ascending: false })
          .then(({ data, error: err }) => {
            if (!live) return;
            if (err) setError(err.message);
            else setRides((data as Ride[]) ?? []);
            setLoading(false);
          }),
      );
    return () => { live = false; };
  }, [account]);

  // Live status: driver assignment / en-route flips arrive without a refresh.
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
          },
        )
        .subscribe();
    } catch { /* realtime not enabled — page still works on refresh */ }
    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [account]);

  function handleCancelled(id: string) {
    setRides((rs) => rs.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
  }

  function handleRebook(ride: Ride, reverse: boolean) {
    if (!booking) return;
    booking.reset();
    // a completed trip rebooks the way home; a cancelled one repeats itself
    const a = findPlaceByName(reverse ? ride.dropoff_location : ride.pickup_location);
    const b = findPlaceByName(reverse ? ride.pickup_location : ride.dropoff_location);
    booking.open({
      from: a ? selFromPlace(a) : undefined,
      to: b ? selFromPlace(b) : undefined,
    });
  }

  // Upcoming reads soonest-first (the next car is the one you care about);
  // the two backward-looking shelves read most-recent-first.
  const allGroups: { key: Bucket; label: string; rides: Ride[] }[] = [
    {
      key: "upcoming",
      label: "Upcoming",
      rides: rides.filter((r) => bucketOf(r) === "upcoming").sort((a, b) => whenMs(a) - whenMs(b)),
    },
    {
      key: "cancelled",
      label: "Cancelled",
      rides: rides.filter((r) => bucketOf(r) === "cancelled").sort((a, b) => whenMs(b) - whenMs(a)),
    },
    {
      key: "past",
      label: "Past",
      rides: rides.filter((r) => bucketOf(r) === "past").sort((a, b) => whenMs(b) - whenMs(a)),
    },
  ];
  const ready = !authLoading && account && !loading && !error;
  // One shelf at a time — the page never stacks all three at once.
  // With no explicit choice, open on the first shelf that has something,
  // preferring what's ahead of you.
  const fallback: Bucket =
    (["upcoming", "past", "cancelled"] as Bucket[]).find(
      (k) => allGroups.find((g) => g.key === k)!.rides.length > 0,
    ) ?? "upcoming";
  const active: Bucket = filter ?? fallback;
  const group = allGroups.find((g) => g.key === active)!;
  const expanded = openShelf === active;
  const visible = expanded ? group.rides : group.rides.slice(0, SHELF_PAGE);
  const hidden = group.rides.length - visible.length;

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="tp-main">
        <div className="wrap tp-wrap">
          <h1 className="tp-title">Your trips</h1>
          <p className="tp-sub">Every arrival, kept on file.</p>

          {claimed > 0 && (
            <p className="tp-claimed" role="status">
              {claimed === 1 ? "One booking you made as a guest" : `${claimed} bookings you made as a guest`}
              {" "}now sits on this account.
            </p>
          )}

          {authLoading && <p className="tp-quiet">Loading…</p>}

          {!authLoading && !account && (
            <div className="tp-empty">
              <p>Sign in to see your transfers.</p>
              <p className="tp-quiet" style={{ marginTop: 8 }}>
                Booked as a guest? Your confirmation is in your inbox, and your driver
                has your number. Create an account with the same email and we'll put
                the trip here.
              </p>
              <button type="button" className="tp-link" onClick={openAuth}>Sign in</button>
            </div>
          )}

          {!authLoading && account && loading && (
            <div className="tp-skeletons" aria-hidden="true">
              <div className="tp-skeleton" /><div className="tp-skeleton" />
            </div>
          )}

          {!authLoading && account && !loading && error && (
            <div className="tp-empty">
              <p>Unable to load trips.</p>
              <button type="button" className="tp-link" onClick={() => window.location.reload()}>Try again</button>
            </div>
          )}

          {!authLoading && account && !loading && !error && rides.length === 0 && (
            <div className="tp-empty">
              <p>No trips yet. The island is waiting.</p>
              {booking && (
                <button type="button" className="tp-link" onClick={() => booking.open()}>
                  Book a transfer
                </button>
              )}
            </div>
          )}

          {ready && rides.length > 0 && (
            <>
              {/* the picker is the heading — one shelf shows at a time */}
              <div className="tp-tabs" role="group" aria-label="Which trips to show">
                {FILTERS.map((f) => {
                  const count = allGroups.find((g) => g.key === f.key)!.rides.length;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      className={`tp-tab${active === f.key ? " on" : ""}`}
                      aria-pressed={active === f.key}
                      onClick={() => {
                        setParams({ show: f.key });
                        setOpenShelf(null); // a new shelf always opens folded
                      }}
                    >
                      {f.label}
                      <span className="tp-tab-n">{count}</span>
                    </button>
                  );
                })}
              </div>

              <section className="tp-section" aria-label={`${group.label} trips`}>
                {group.rides.length === 0 ? (
                  <div className="tp-empty">
                    <p>{EMPTY_COPY[active]}</p>
                    {booking && active === "upcoming" && (
                      <button type="button" className="tp-link" onClick={() => booking.open()}>
                        Book a transfer
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="tp-list">
                      {visible.map((ride) => (
                        <TripCard
                          key={ride.id}
                          ride={ride}
                          onCancelled={handleCancelled}
                          // rebooking makes sense once a trip is behind you —
                          // whether it ran or you called it off
                          onRebook={booking && active !== "upcoming" ? handleRebook : undefined}
                        />
                      ))}
                    </div>

                    {/* a long history stays folded away until asked for */}
                    {(hidden > 0 || expanded) && (
                      <button
                        type="button"
                        className={`tp-more${expanded ? " open" : ""}`}
                        aria-expanded={expanded}
                        onClick={() => setOpenShelf(expanded ? null : active)}
                      >
                        {expanded ? "Show less" : `${hidden} more`}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                          strokeLinejoin="round" aria-hidden="true">
                          <path d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
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
