import { useEffect, useState } from "react";
import { useAuth } from "../booking/useAuth";
import { useBookingOptional } from "../booking/BookingContext";
import { supabase } from "../lib/supabase";
import { cancelRide } from "../lib/rides";
import { refFromRideId } from "../lib/bookingRef";
import { cancellationInfo, scheduledDate } from "../lib/policy";
import { whatsappEnabled, whatsappLink } from "../lib/whatsapp";
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
  const d = pickupDate(ride);
  if (ride.scheduled_date) {
    const parts = [ride.scheduled_date];
    if (ride.scheduled_time) parts.push(ride.scheduled_time);
    return parts.join(" · ");
  }
  if (d) {
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }
  return "—";
}

function isUpcoming(ride: Ride): boolean {
  const c = canonicalStatus(ride.status);
  if (c === "completed" || c === "cancelled" || c === "canceled") return false;
  const d = pickupDate(ride);
  if (!d) return true; // undated but active — keep it in front of the traveler
  return d.getTime() > Date.now() - 6 * 3_600_000; // grace window after pickup
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
  onBookReturn,
}: {
  ride: Ride;
  onCancelled: (id: string) => void;
  onBookReturn?: (ride: Ride) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const c = canonicalStatus(ride.status);
  const cancelled = c === "cancelled" || c === "canceled";
  const completed = c === "completed";
  const upcoming = isUpcoming(ride);
  const fare = `$${Number(ride.fare_total ?? ride.price ?? 0).toFixed(2)}`;
  const vehicle = [ride.vehicle_class, ride.vehicle_type].filter(Boolean).join(" · ");
  const bookingRef = ride.booking_ref ?? refFromRideId(ride.id);
  const policy = cancellationInfo(pickupDate(ride));
  const canCancel = upcoming && !cancelled && !completed && c !== "en_route";
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
        {completed && onBookReturn && (
          <button className="btn-ghost" type="button" onClick={() => onBookReturn(ride)}>
            Book return
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

export default function MyTrips() {
  const { user, loading: authLoading } = useAuth();
  const { openAuth } = useAuthModal();
  const booking = useBookingOptional();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("rides")
      .select("*")
      .eq("passenger_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRides((data as Ride[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  // Live status: driver assignment / en-route flips arrive without a refresh.
  useEffect(() => {
    if (!user) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = (supabase as { channel?: typeof supabase.channel }).channel?.(`rides-${user.id}`) ?? null;
      channel
        ?.on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "rides", filter: `passenger_id=eq.${user.id}` },
          (payload: { new: Ride }) => {
            setRides((rs) => rs.map((r) => (r.id === payload.new.id ? { ...r, ...payload.new } : r)));
          },
        )
        .subscribe();
    } catch { /* realtime not enabled — page still works on refresh */ }
    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [user]);

  function handleCancelled(id: string) {
    setRides((rs) => rs.map((r) => (r.id === id ? { ...r, status: "cancelled" } : r)));
  }

  function handleBookReturn(ride: Ride) {
    if (!booking) return;
    booking.reset();
    booking.setField("from", ride.dropoff_location);
    booking.setField("to", ride.pickup_location);
    booking.open(0);
  }

  const upcoming = rides.filter(isUpcoming);
  const past = rides.filter((r) => !isUpcoming(r));

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="tp-main">
        <div className="wrap tp-wrap">
          <h1 className="tp-title">My trips</h1>
          <p className="tp-sub">Your transfers with Cabby's Aruba.</p>

          {authLoading && <p className="tp-quiet">Loading…</p>}

          {!authLoading && !user && (
            <div className="tp-empty">
              <p>Sign in to view your transfers.</p>
              <button type="button" className="tp-link" onClick={openAuth}>Sign in</button>
            </div>
          )}

          {!authLoading && user && loading && (
            <div className="tp-skeletons" aria-hidden="true">
              <div className="tp-skeleton" /><div className="tp-skeleton" />
            </div>
          )}

          {!authLoading && user && !loading && error && (
            <div className="tp-empty">
              <p>Unable to load trips.</p>
              <button type="button" className="tp-link" onClick={() => window.location.reload()}>Try again</button>
            </div>
          )}

          {!authLoading && user && !loading && !error && rides.length === 0 && (
            <div className="tp-empty">
              <p>No trips yet — where are you landing?</p>
              {booking && (
                <button type="button" className="tp-link" onClick={() => booking.open(0)}>
                  Book your first transfer
                </button>
              )}
            </div>
          )}

          {!authLoading && user && !loading && !error && upcoming.length > 0 && (
            <section className="tp-section">
              <h2 className="tp-section-h">Upcoming</h2>
              <div className="tp-list">
                {upcoming.map((ride) => (
                  <TripCard key={ride.id} ride={ride} onCancelled={handleCancelled} />
                ))}
              </div>
            </section>
          )}

          {!authLoading && user && !loading && !error && past.length > 0 && (
            <section className="tp-section">
              <h2 className="tp-section-h">Past</h2>
              <div className="tp-list">
                {past.map((ride) => (
                  <TripCard
                    key={ride.id}
                    ride={ride}
                    onCancelled={handleCancelled}
                    onBookReturn={booking ? handleBookReturn : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
