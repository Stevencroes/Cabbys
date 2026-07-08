import { useRef, useState } from "react";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useBooking } from "../../../booking/BookingContext";
import { useFare } from "../../../booking/useFare";
import { VEHICLES } from "../../../data/vehicles";
import { formatMoney } from "../../../lib/currency";
import { generateBookingRef } from "../../../lib/bookingRef";
import { formatFlightNumber } from "../../../lib/flight";
import { normalizePhone } from "../../../lib/contact";
import { cancellationInfo, scheduledDate } from "../../../lib/policy";
import { createRide } from "../../../lib/rides";
import { getStripe } from "../../../lib/stripe";
import type { ConfirmedBooking } from "../../../booking/types";
import AuthForm from "../../auth/AuthForm";

interface StepPayProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

type Phase = "review" | "creating" | "payment" | "paying";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export default function StepPay({ onConfirmed }: StepPayProps) {
  const { state, goTo } = useBooking();
  const { loading, fare, tax, total } = useFare();
  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);

  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const payMountRef = useRef<HTMLDivElement | null>(null);
  const rideRef = useRef<{ id: string; bookingRef: string | null } | null>(null);

  const selected = VEHICLES.find((v) => v.id === state.vehicle);
  const vehicleUplift = selected && selected.mult !== 1 ? fare.total * (selected.mult - 1) : 0;
  const pickup = scheduledDate(state.date, state.time);
  // "Now" bookings sit at (or just past) the current minute — cancellation
  // windows are meaningless there, dispatch speed is the promise instead.
  const asap = !pickup || Math.abs(pickup.getTime() - Date.now()) < 2 * 3_600_000;
  const policyLabel = asap
    ? "Your driver is dispatched as soon as you confirm."
    : cancellationInfo(pickup).label;
  const busy = phase === "creating" || phase === "paying";

  function confirmedPayload(paid: boolean): ConfirmedBooking {
    return {
      rideId: rideRef.current?.id ?? "",
      bookingRef: rideRef.current?.bookingRef ?? null,
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      vehicle: state.vehicle,
      total,
      paid,
      flightNumber: state.flightNumber ? formatFlightNumber(state.flightNumber) : undefined,
      contactName: state.contactName || undefined,
    };
  }

  async function ensureRide(): Promise<boolean> {
    if (rideRef.current) return true;
    const draft = {
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      passengers: state.passengers,
      luggage: state.luggage,
      vehicle: state.vehicle,
      fareBase: total - tax,
      fareTotal: total,
      addonKeys: [] as string[],
      bookingRef: generateBookingRef(),
      contactName: state.contactName.trim(),
      contactPhone: normalizePhone(state.contactPhone),
      contactEmail: state.contactEmail.trim(),
      flightNumber: state.flightNumber ? formatFlightNumber(state.flightNumber) : "",
      notes: state.notes.trim(),
    };
    const { ride, error: err, needsAuth: authWall } = await createRide(draft);
    if (!ride) {
      setError(err);
      setNeedsAuth(authWall);
      return false;
    }
    rideRef.current = ride;
    return true;
  }

  // Card path: ride row → server-priced intent → Payment Element.
  // Any failure after the ride exists degrades to "reserve now, settle on the day"
  // instead of dead-ending the booking.
  async function startCardFlow(): Promise<void> {
    const res = await fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId: rideRef.current!.id }),
    });
    if (!res.ok) {
      onConfirmed?.(confirmedPayload(false));
      return;
    }
    const { clientSecret } = (await res.json()) as { clientSecret?: string };
    const stripe = await getStripe();
    if (!clientSecret || !stripe) {
      onConfirmed?.(confirmedPayload(false));
      return;
    }
    stripeRef.current = stripe;
    elementsRef.current = stripe.elements({
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          colorPrimary: "#B4C3DC",
          colorBackground: "#142238",
          colorText: "#EEF2F8",
          colorDanger: "#F2A3A3",
          fontFamily: "Outfit, sans-serif",
          borderRadius: "12px",
        },
      },
    });
    setPhase("payment");
    // Mount on next tick — the container renders with the phase change.
    requestAnimationFrame(() => {
      if (payMountRef.current && elementsRef.current) {
        elementsRef.current.create("payment", { layout: "tabs" }).mount(payMountRef.current);
      }
    });
  }

  async function handleConfirm() {
    setError(null);
    setNeedsAuth(false);
    setPhase("creating");
    try {
      const ok = await ensureRide();
      if (!ok) {
        setPhase("review");
        return;
      }
      if (STRIPE_KEY) {
        await startCardFlow();
        if (phaseRefIsPayment()) return; // waiting for card entry
      } else {
        onConfirmed?.(confirmedPayload(false));
      }
    } catch {
      // Ride may exist — never lose the booking over a payment hiccup.
      if (rideRef.current) onConfirmed?.(confirmedPayload(false));
      else {
        setError("Something went wrong. Please try again.");
        setPhase("review");
      }
    }
  }

  // phase state isn't visible inside handleConfirm's closure after await
  function phaseRefIsPayment(): boolean {
    return !!elementsRef.current;
  }

  async function handlePay() {
    if (!stripeRef.current || !elementsRef.current) return;
    setPhase("paying");
    setError(null);
    const { error: payErr } = await stripeRef.current.confirmPayment({
      elements: elementsRef.current,
      confirmParams: { return_url: `${window.location.origin}/?paid=1` },
      redirect: "if_required",
    });
    if (payErr) {
      setError(payErr.message ?? "Payment didn't go through. Your card was not charged.");
      setPhase("payment");
      return;
    }
    onConfirmed?.(confirmedPayload(true));
  }

  return (
    <div className="pay2">
      <div className="step-eyebrow">Review &amp; confirm</div>
      <h2 className="step-title">One last look.</h2>
      <p className="step-desc">{policyLabel} {STRIPE_KEY ? "Your card is authorized now and only charged once your driver is assigned." : ""}</p>

      <div className="pay2-grid">
        {/* Left — the receipt */}
        <div className="pay2-receipt">
          <div className="pay2-route">
            <div className="rr-stop"><span className="ring" /><span>{state.from}</span></div>
            <div className="rr-line" />
            <div className="rr-stop"><span className="rdiamond" /><span>{state.to}</span></div>
          </div>

          <div className="pay2-meta">
            <button type="button" className="pay2-chip" onClick={() => goTo(0)}>
              {state.date} · {state.time}
            </button>
            <button type="button" className="pay2-chip" onClick={() => goTo(0)}>
              {state.passengers} guests · {state.luggage} bags
            </button>
            <button type="button" className="pay2-chip" onClick={() => goTo(1)}>
              {selected?.name ?? "Vehicle"}
            </button>
            {state.flightNumber && (
              <button type="button" className="pay2-chip" onClick={() => goTo(2)}>
                Flight {formatFlightNumber(state.flightNumber)}
              </button>
            )}
            <button type="button" className="pay2-chip" onClick={() => goTo(2)}>
              {state.contactName || "Lead passenger"}
            </button>
          </div>

          <div className="pay2-lines">
            {loading ? (
              <div className="qline"><span className="ql-l">Calculating fare…</span></div>
            ) : (
              <>
                {fare.lineItems.map((li, i) => (
                  <div className="qline" key={`${li.label}-${i}`}>
                    <span className="ql-l">{li.note ? `${li.label} · ${li.note}` : li.label}</span>
                    <span className="ql-r">{formatMoney(li.amount, "USD")}</span>
                  </div>
                ))}
                {vehicleUplift > 0 && selected && (
                  <div className="qline">
                    <span className="ql-l">{selected.name}</span>
                    <span className="ql-r">+{formatMoney(vehicleUplift, "USD")}</span>
                  </div>
                )}
                <div className="qline muted">
                  <span className="ql-l">Government &amp; facility tax (6%)</span>
                  <span className="ql-r">{formatMoney(tax, "USD")}</span>
                </div>
              </>
            )}
          </div>
          <div className="qtotal">
            <span className="qt-l">Total · fixed</span>
            <span className="qt-r">{loading ? "—" : formatMoney(total, "USD")}</span>
          </div>
        </div>

        {/* Right — payment */}
        <div className="pay2-side">
          {STRIPE_KEY ? (
            phase === "payment" || phase === "paying" ? (
              <div className="pay-card">
                <div className="pay-label">Payment</div>
                <div ref={payMountRef} />
              </div>
            ) : (
              <div className="pay-card">
                <div className="pay-label">Payment</div>
                <p className="pay-secure">
                  Pay by card, Apple Pay or Google Pay. Authorized today, charged when your
                  driver is assigned — cancel free up to 24 h before pickup and you pay nothing.
                </p>
              </div>
            )
          ) : (
            <div className="pay-card">
              <span className="pay-reserve-badge">Reserve now</span>
              <p className="pay-secure">
                No charge today. Your fare is fixed at{" "}
                <strong>{loading ? "—" : formatMoney(total, "USD")}</strong> and settled with
                your driver on the day — cash or card in the car.
              </p>
            </div>
          )}

          {error && (
            <div className="pay-error" role="alert">
              {error}
              {needsAuth && <div style={{ marginTop: "14px" }}><AuthForm heading="Sign in to finish your booking" compact /></div>}
            </div>
          )}

          {phase === "payment" || phase === "paying" ? (
            <button className="btn-primary pay-confirm" type="button" onClick={handlePay} disabled={busy}>
              {phase === "paying" ? "Processing…" : <>Pay {formatMoney(total, "USD")} <span className="arr">→</span></>}
            </button>
          ) : (
            <button className="btn-primary pay-confirm" type="button" onClick={handleConfirm} disabled={busy || loading}>
              {phase === "creating" ? "Confirming…" : (
                <>{STRIPE_KEY ? "Continue to payment" : "Confirm booking"} <span className="arr">→</span></>
              )}
            </button>
          )}

          <p className="pay2-fineprint">
            By confirming you agree to the fixed fare shown. {asap ? "Free cancellation any time before your driver is en route." : policyLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
