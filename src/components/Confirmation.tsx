import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import StripedSun from "./StripedSun";
import { useBooking } from "../booking/BookingContext";
import { formatMoney } from "../lib/currency";
import { refFromRideId } from "../lib/bookingRef";
import { downloadIcs } from "../lib/ics";
import { whatsappEnabled, whatsappLink } from "../lib/whatsapp";
import { VEHICLES } from "../data/vehicles";
import type { ConfirmedBooking } from "../booking/types";

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

  const bookingRef = booking.bookingRef ?? refFromRideId(booking.rideId);
  const vehicleName = VEHICLES.find((v) => v.id === booking.vehicle)?.name ?? booking.vehicle;
  const dateLabel = booking.date
    ? new Date(booking.date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  const waHref = whatsappLink(
    `Hi Cabby's — booking ${bookingRef} (${booking.from} → ${booking.to}, ${booking.date} ${booking.time}).`,
  );

  function handleCalendar() {
    if (!booking) return;
    downloadIcs(
      {
        title: `Cabby's transfer — ${booking.from} → ${booking.to}`,
        description: `Booking ${bookingRef}. ${booking.flightNumber ? `Flight ${booking.flightNumber}. ` : ""}Your driver meets you with a name board.`,
        location: booking.from,
        date: booking.date,
        time: booking.time || "12:00",
        durationMinutes: 60,
        uid: `${booking.rideId}@cabbys.aw`,
      },
      `cabbys-${bookingRef}.ics`,
    );
  }

  function handleDone() {
    reset();
    close();
    onDone?.();
  }

  return (
    <div className={`conf-screen${visible ? " conf-visible" : ""}`} aria-modal="true" role="dialog">
      {/* Full-screen midnight backdrop */}
      <div className="conf-backdrop" />

      <div className="conf-scroll">
        {/* The striped sun — the arrival moment */}
        <div className="conf-icon">
          <StripedSun variant="confirm" />
        </div>

        <h2 className="conf-title">Your car is confirmed.</h2>
        <p className="conf-sub">
          {booking.contactName ? `${booking.contactName.split(" ")[0]}, your` : "Your"} car is
          set{booking.paid ? " — the fare is authorized and only charged once your driver is assigned" : ""}.
          {booking.flightNumber ? " Your driver tracks the flight — no need to rush the exit." : ""}
        </p>

        {/* Ticket */}
        <div className="conf-card">
          <div className="conf-ref">
            <span className="conf-ref-label">Arrival · Confirmed</span>
            <span className="conf-ref-id">{bookingRef}</span>
          </div>

          <div className="conf-divider" />

          <div className="conf-rail">
            <div className="rr-stop"><span className="ring" /><span>{booking.from}</span></div>
            <div className="rr-line" />
            <div className="rr-stop"><span className="rdiamond" /><span>{booking.to}</span></div>
          </div>

          <div className="conf-row">
            <span className="conf-rl">When</span>
            <span className="conf-rr">{dateLabel}{booking.time ? ` · ${booking.time}` : ""}</span>
          </div>
          {booking.flightNumber && (
            <div className="conf-row">
              <span className="conf-rl">Flight</span>
              <span className="conf-rr">{booking.flightNumber} — tracked; if it's late, we wait</span>
            </div>
          )}
          {vehicleName && (
            <div className="conf-row">
              <span className="conf-rl">Vehicle</span>
              <span className="conf-rr">{vehicleName}</span>
            </div>
          )}
          <div className="conf-row conf-total-row">
            <span className="conf-rl">{booking.paid ? "Total · authorized" : "Total · pay on the day"}</span>
            <span className="conf-rr conf-total">{formatMoney(booking.total, "USD")}</span>
          </div>
        </div>

        {/* What happens next */}
        <div className="conf-next">
          <div className="cn-step done">
            <span className="cn-node" />
            <div><b>Reserved</b><span>Your route and fare are locked in.</span></div>
          </div>
          <div className="cn-step">
            <span className="cn-node" />
            <div><b>Driver assigned</b><span>Name, photo and plate — sent before pickup.</span></div>
          </div>
          <div className="cn-step">
            <span className="cn-node" />
            <div><b>Meet your driver</b><span>Name board at arrivals · 60 min wait included.</span></div>
          </div>
        </div>

        <div className="conf-actions">
          <button className="btn-ghost" type="button" onClick={handleCalendar}>
            Add to calendar
          </button>
          {whatsappEnabled && waHref && (
            <a className="btn-ghost" href={waHref} target="_blank" rel="noreferrer">
              WhatsApp us
            </a>
          )}
          <Link className="btn-ghost" to="/trips" onClick={handleDone}>
            My trips
          </Link>
        </div>

        <button className="conf-done btn-primary" onClick={handleDone}>
          Done <span className="arr">→</span>
        </button>
      </div>
    </div>
  );
}
