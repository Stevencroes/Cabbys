import { useEffect, useState } from "react";
import { useBooking } from "../booking/BookingContext";
import { formatMoney } from "../lib/currency";
import type { ConfirmedBooking } from "./booking/steps/StepPayment";

interface ConfirmationProps {
  booking: ConfirmedBooking | null;
  /** Called after reset+close — lets App.tsx clear local confirmed state */
  onDone?: () => void;
}

export default function Confirmation({ booking, onDone }: ConfirmationProps) {
  const { reset, close } = useBooking();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (booking) {
      // Small tick to trigger CSS transition
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    } else {
      setVisible(false);
    }
  }, [booking]);

  if (!booking) return null;

  const dateLabel = booking.date
    ? new Date(booking.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  function handleDone() {
    reset();
    close();
    onDone?.();
  }

  return (
    <div className={`conf-screen${visible ? " conf-visible" : ""}`} aria-modal="true" role="dialog">
      {/* Full-screen midnight backdrop */}
      <div className="conf-backdrop" />

      {/* Animated check ring */}
      <div className="conf-icon">
        <svg
          className="conf-ring"
          width="96"
          height="96"
          viewBox="0 0 96 96"
          fill="none"
          aria-hidden="true"
        >
          <circle
            className="conf-ring-track"
            cx="48"
            cy="48"
            r="40"
            stroke="var(--silver)"
            strokeOpacity="0.15"
            strokeWidth="3"
          />
          <circle
            className="conf-ring-fill"
            cx="48"
            cy="48"
            r="40"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="251.2"
            strokeDashoffset="251.2"
          />
          <path
            className="conf-check"
            d="M30 49l13 13 23-24"
            stroke="var(--accent)"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="conf-title">Booking confirmed.</h2>
      <p className="conf-sub">Your ride is reserved. We will see you on the day.</p>

      {/* Glass card */}
      <div className="conf-card">
        <div className="conf-ref">
          <span className="conf-ref-label">Booking reference</span>
          <span className="conf-ref-id">{booking.rideId.toUpperCase()}</span>
        </div>

        <div className="conf-divider" />

        <div className="conf-row">
          <span className="conf-rl">Route</span>
          <span className="conf-rr">{booking.from} → {booking.to}</span>
        </div>
        <div className="conf-row">
          <span className="conf-rl">Date</span>
          <span className="conf-rr">{dateLabel}{booking.time ? ` · ${booking.time}` : ""}</span>
        </div>
        {booking.vehicle && (
          <div className="conf-row">
            <span className="conf-rl">Vehicle</span>
            <span className="conf-rr" style={{ textTransform: "capitalize" }}>{booking.vehicle}</span>
          </div>
        )}
        <div className="conf-row conf-total-row">
          <span className="conf-rl">Total fare</span>
          <span className="conf-rr conf-total">{formatMoney(booking.total, booking.currency)}</span>
        </div>
      </div>

      <button className="conf-done btn-primary" onClick={handleDone}>
        Done <span className="arr">→</span>
      </button>
    </div>
  );
}
