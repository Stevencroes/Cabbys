// Confirmation — the v3 tag. Cocoa header bar, perforated tear line,
// hard offset shadow. USD only.
import { useEffect, useState } from "react";
import { CONFIRM_WINDOW_MINUTES } from "../lib/policy";
import { useNavigate } from "react-router-dom";
import { useBooking } from "../booking/BookingContext";
import { usd } from "../lib/quote";
import { formatDate, formatTime, ARUBA_TZ_LABEL } from "../lib/datetime";
import { refFromRideId } from "../lib/bookingRef";
import { downloadIcs } from "../lib/ics";
import { whatsappEnabled, whatsappLink } from "../lib/whatsapp";
import { VEHICLES } from "../data/vehicles";
import type { ConfirmedBooking } from "../booking/types";

interface ConfirmationProps {
  booking: ConfirmedBooking | null;
  onDone?: () => void;
}

export default function Confirmation({ booking, onDone }: ConfirmationProps) {
  const { reset, close } = useBooking();
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (booking) {
      const t = setTimeout(() => setVisible(true), 20);
      return () => clearTimeout(t);
    }
    setVisible(false);
  }, [booking]);

  if (!booking) return null;

  const bookingRef = booking.bookingRef ?? refFromRideId(booking.rideId);
  const vehicleName = VEHICLES.find((v) => v.id === booking.vehicle)?.name ?? booking.vehicle;
  const dateLabel = formatDate(booking.date) || "—";
  const waHref = whatsappLink(`Hi Cabby's — booking ${bookingRef} (${booking.from} → ${booking.to}, ${booking.date} ${booking.time}).`);

  function handleCalendar() {
    if (!booking) return;
    downloadIcs(
      {
        title: `Cabby's transfer — ${booking.from} → ${booking.to}`,
        description: `Booking ${bookingRef}. ${booking.flightNumber ? `Flight ${booking.flightNumber}. ` : ""}Your driver waits inside arrivals with your name.`,
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
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Booking confirmed"
      style={{
        position: "fixed", inset: 0, zIndex: "var(--z-modal)" as unknown as number,
        background: "var(--ground)", overflowY: "auto",
        opacity: visible ? 1 : 0, transition: "opacity .5s var(--ease)",
      }}
    >
      <div className="conf">
        <div className="tag">
          <div className="tag-top">
            <span className="tk">Arrival · confirmed</span>
            <span className="tr">{bookingRef}</span>
          </div>
          <div className="tag-body">
            <h2>Your car is<br /><em>confirmed.</em></h2>
            <div className="tgrid">
              {booking.contactName && (
                <div><div className="tl">Guest</div><div className="tv">{booking.contactName}</div></div>
              )}
              <div><div className="tl">Route</div><div className="tv">{booking.from} → {booking.to}</div></div>
              <div><div className="tl">When</div><div className="tv">{dateLabel}</div></div>
              <div><div className="tl">Pickup</div><div className="tv">{formatTime(booking.time) || "—"}<span className="tv-zone">{ARUBA_TZ_LABEL}</span></div></div>
              <div><div className="tl">Car</div><div className="tv">{vehicleName}</div></div>
              <div>
                <div className="tl">{booking.paid ? "Paid" : "Fare, all in"}</div>
                <div className="tv" style={{ color: "var(--ink)" }}>{usd(booking.total)}</div>
              </div>
              {booking.flightNumber && (
                <div><div className="tl">Flight</div><div className="tv">{booking.flightNumber} — tracked</div></div>
              )}
            </div>
            <div className="perf">
              <div className="tgrid">
                <div><div className="tl">Met at</div><div className="tv">Arrivals hall, AUA</div></div>
                <div><div className="tl">Driver details</div><div className="tv">Sent 12h before</div></div>
              </div>
            </div>
          </div>
        </div>

        {/* what happens next, and when. TODO: confirm timing with client —
            the window is CONFIRM_WINDOW_MINUTES in src/lib/policy.ts */}
        <p className="conf-note">
          <b>We'll confirm on WhatsApp within {CONFIRM_WINDOW_MINUTES} minutes.</b>{" "}
          A copy is on its way to your email.
          {booking.flightNumber ? " We're watching your flight — if it moves, we move with it." : ""} Nothing else to do.
        </p>

        <div className="conf-acts">
          <button type="button" className="prim" onClick={handleDone}>Done</button>
          <button type="button" className="gh" onClick={handleCalendar}>Add to calendar</button>
          {whatsappEnabled && waHref && (
            <a className="gh" href={waHref} target="_blank" rel="noreferrer">WhatsApp us</a>
          )}
          <button type="button" className="gh" onClick={() => { handleDone(); navigate("/trips"); }}>My trips</button>
        </div>
      </div>
    </div>
  );
}
