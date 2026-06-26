import { useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useAuth } from "../../../booking/useAuth";
import { useFare } from "../../../booking/useFare";
import { buildRidePayload } from "../../../lib/bookingPayload";
import { supabase } from "../../../lib/supabase";
import { formatMoney } from "../../../lib/currency";

export interface ConfirmedBooking {
  rideId: string;
  from: string;
  to: string;
  date: string;
  time: string;
  vehicle: string | null;
  total: number;
  currency: "AWG" | "USD" | "EUR";
}

interface StepPaymentProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export default function StepPayment({ onConfirmed }: StepPaymentProps) {
  const { state } = useBooking();
  const { user } = useAuth();
  const { base, total, loading } = useFare();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!user) {
      setError("Please sign in before confirming your booking.");
      return;
    }
    setBusy(true);
    setError(null);

    const payloadState = {
      journey: state.journey,
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      passengers: state.passengers,
      luggage: state.luggage,
      vehicle: state.vehicle,
      fareBase: base,
      fareTotal: total,
      addonKeys: [] as string[],
    };

    const { withCoords, core } = buildRidePayload(payloadState, user.id);

    let { data, error: err } = await supabase
      .from("rides")
      .insert(withCoords)
      .select()
      .single();

    if (err) {
      ({ data, error: err } = await supabase
        .from("rides")
        .insert(core)
        .select()
        .single());
    }

    if (err || !data) {
      setError(err?.message ?? "Something went wrong. Please try again.");
      setBusy(false);
      return;
    }

    onConfirmed?.({
      rideId: data.id,
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      vehicle: state.vehicle,
      total,
      currency: state.currency,
    });

    setBusy(false);
  }

  const dateLabel = state.date
    ? new Date(state.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div>
      <div className="step-eyebrow">Payment</div>
      <h2 className="step-title">Confirm your ride.</h2>
      <p className="step-desc">
        Review your booking below and confirm. Your card will not be charged today.
      </p>

      {/* Booking summary */}
      <div className="pay-summary">
        <div className="ps-row">
          <span className="ps-l">Route</span>
          <span className="ps-r">{state.from || "—"} → {state.to || "—"}</span>
        </div>
        <div className="ps-row">
          <span className="ps-l">Date</span>
          <span className="ps-r">{dateLabel}{state.time ? ` · ${state.time}` : ""}</span>
        </div>
        <div className="ps-row">
          <span className="ps-l">Passengers</span>
          <span className="ps-r">{state.passengers}</span>
        </div>
        <div className="ps-row ps-total">
          <span className="ps-l">Total fare</span>
          <span className="ps-r ps-amount">
            {loading ? "…" : formatMoney(total, state.currency)}
          </span>
        </div>
      </div>

      {/* Stripe placeholder or reserve-now card */}
      {STRIPE_KEY ? (
        <div className="pay-card">
          <div className="pay-label">Card details</div>
          <div className="pay-input-row" style={{ color: "var(--silver-dim)", fontSize: "13px" }}>
            Stripe payment element loads here (Task 15)
          </div>
        </div>
      ) : (
        <div className="pay-card">
          <div className="pay-reserve-badge">Reserve now, pay on the day</div>
          <p className="pay-secure">
            No charge today. Your driver will confirm your booking and collect payment on the day of your transfer. Fixed fare — the price you see is the price you pay.
          </p>
        </div>
      )}

      {error && (
        <div className="pay-error" role="alert">
          {error}
        </div>
      )}

      {!user && (
        <div className="pay-error" role="alert">
          Please sign in before confirming your booking.
        </div>
      )}

      <button
        className="btn-primary pay-confirm"
        onClick={handleConfirm}
        disabled={busy || loading || !user}
        style={{ marginTop: "28px", width: "100%", justifyContent: "center" }}
      >
        {busy ? "Confirming…" : <>Confirm <span className="arr">→</span></>}
      </button>
    </div>
  );
}
