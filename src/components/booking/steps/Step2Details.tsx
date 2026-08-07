// Step 2 — YOUR DETAILS. Review · name · email · WhatsApp · Stripe.
// The review has a "Change something" row; step 2 is never a dead end.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useBooking } from "../../../booking/BookingContext";
import { VEHICLES } from "../../../data/vehicles";
import { quote, usd, usdToAwg } from "../../../lib/quote";
import type { Pricing } from "../../../lib/pricing";
import { driverWaitsFrom, collectAt } from "../../../lib/derivedTime";
import { formatDateTime, formatTime, ARUBA_TZ_LABEL } from "../../../lib/datetime";
import { AIRPORT_ID } from "../../../data/places";
import { generateBookingRef } from "../../../lib/bookingRef";
import { formatFlightNumber } from "../../../lib/flight";
import { normalizePhone, isValidPhone, isValidEmail } from "../../../lib/contact";
import { createRide } from "../../../lib/rides";
import { getStripe } from "../../../lib/stripe";
import type { ConfirmedBooking } from "../../../booking/types";
import FieldError from "../FieldError";
import type { StepProblem } from "./Step1Ride";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export type PayPhase = "review" | "creating" | "payment" | "paying";

interface Step2Props {
  pricing: Pricing | null;
  problem: StepProblem | null;
  registerValidator: (fn: () => StepProblem | null) => void;
  phase: PayPhase;
  setPhase: (p: PayPhase) => void;
  onConfirmed?: (b: ConfirmedBooking) => void;
  error: string | null;
  setError: (e: string | null) => void;
  needsAuth: boolean;
  setNeedsAuth: (b: boolean) => void;
  /** invoked by the step foot's primary button */
  registerConfirm: (fn: () => Promise<void>) => void;
  /** the total + primary action, rendered flat under the contact fields */
  foot: React.ReactNode;
}

export function effectivePickupTime(state: ReturnType<typeof useBooking>["state"]): string {
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  if (fromAirport && state.flightLanding) return driverWaitsFrom(state.flightLanding);
  if (toAirport && state.depTime) return collectAt(state.depTime, state.destUS);
  return state.pickupTime;
}

export default function Step2Details({
  pricing, problem, registerValidator, phase, setPhase, onConfirmed,
  error, setError, needsAuth, setNeedsAuth, registerConfirm, foot,
}: Step2Props) {
  const { state, setField, goTo } = useBooking();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const payMountRef = useRef<HTMLDivElement | null>(null);
  const rideRef = useRef<{ id: string; bookingRef: string | null } | null>(null);
  const [, force] = useState(0);
  void force;

  const vehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  const airportTrip = fromAirport || toAirport;
  const time = effectivePickupTime(state);

  const q = state.from && state.to
    ? quote({ from: state.from, to: state.to, vehicle, isReturn: state.journey === "return", pricing })
    : null;
  const totalUsd = q?.totalUsd ?? 0;

  const validate = useMemo(() => () => {
    if (state.contactName.trim().length < 2)
      return { field: "name", message: airportTrip ? "A name lets the driver hold the right sign." : "A name lets the driver greet you.", focus: () => nameRef.current?.focus() };
    if (!isValidEmail(state.contactEmail))
      return { field: "email", message: "We need an email to send your confirmation.", focus: () => emailRef.current?.focus() };
    if (!isValidPhone(state.contactPhone))
      return { field: "phone", message: "A WhatsApp number lets your driver reach you on the day.", focus: () => phoneRef.current?.focus() };
    return null;
  }, [state.contactName, state.contactEmail, state.contactPhone, airportTrip]);
  useEffect(() => registerValidator(validate), [validate, registerValidator]);

  const err = (f: string) => (problem?.field === f ? problem.message : undefined);
  const errId = (f: string) => (problem?.field === f ? `err-${f}` : undefined);

  async function ensureRide(): Promise<boolean> {
    if (rideRef.current) return true;
    const noteParts = [
      state.from?.custom ? `Pickup address: ${state.from.name}${state.from.note ? ` (${state.from.note})` : ""} · area ${state.from.area}` : "",
      state.to?.custom ? `Drop-off address: ${state.to.name}${state.to.note ? ` (${state.to.note})` : ""} · area ${state.to.area}` : "",
      state.seats > 0 ? `Child seats: ${state.seats}${state.seatAges ? ` (ages ${state.seatAges})` : ""}` : "",
      state.journey === "return" ? `Return: ${formatDateTime(state.returnDate, state.returnTime)}${fromAirport ? ` (flight departs — collect ${formatTime(collectAt(state.returnTime, state.returnDestUS))})` : ""}` : "",
      fromAirport && state.flightLanding ? `Flight lands ${formatTime(state.flightLanding)} AST` : "",
      toAirport && state.depTime ? `Flight departs ${formatTime(state.depTime)} AST (${state.destUS ? "US pre-clearance" : "international"})` : "",
      state.notes.trim(),
    ].filter(Boolean);

    const draft = {
      from: state.from?.name ?? "",
      to: state.to?.name ?? "",
      date: state.date,
      time,
      passengers: state.pax,
      luggage: state.bags,
      vehicle: state.vehicle,
      fareBase: usdToAwg(q?.oneWayUsd ?? 0),
      fareTotal: usdToAwg(totalUsd),
      addonKeys: [] as string[],
      bookingRef: generateBookingRef(),
      contactName: state.contactName.trim(),
      contactPhone: normalizePhone(state.contactPhone),
      contactEmail: state.contactEmail.trim(),
      flightNumber: state.flightNumber ? formatFlightNumber(state.flightNumber) : "",
      notes: noteParts.join(" · "),
      childSeats: state.seats,
      returnDate: state.journey === "return" ? state.returnDate : "",
      returnTime: state.journey === "return" ? state.returnTime : "",
    };
    const { ride, error: createErr, needsAuth: wall } = await createRide(draft);
    if (!ride) {
      setError(createErr);
      setNeedsAuth(wall);
      return false;
    }
    rideRef.current = ride;
    return true;
  }

  function confirmedPayload(paid: boolean): ConfirmedBooking {
    return {
      rideId: rideRef.current?.id ?? "",
      bookingRef: rideRef.current?.bookingRef ?? null,
      from: state.from?.name ?? "",
      to: state.to?.name ?? "",
      date: state.date,
      time,
      vehicle: state.vehicle,
      total: totalUsd, // USD — the only currency in the UI
      paid,
      flightNumber: state.flightNumber ? formatFlightNumber(state.flightNumber) : undefined,
      contactName: state.contactName || undefined,
    };
  }

  async function startCardFlow(): Promise<boolean> {
    const res = await fetch("/api/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rideId: rideRef.current!.id }),
    });
    if (!res.ok) return false;
    const { clientSecret } = (await res.json()) as { clientSecret?: string };
    const stripe = await getStripe();
    if (!clientSecret || !stripe) return false;
    stripeRef.current = stripe;
    elementsRef.current = stripe.elements({
      clientSecret,
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#C6452C",
          colorBackground: "#E9DEC4",
          colorText: "#2B1F19",
          colorDanger: "#9B3221",
          fontFamily: "Jost, sans-serif",
          borderRadius: "0px",
        },
      },
    });
    setPhase("payment");
    requestAnimationFrame(() => {
      if (payMountRef.current && elementsRef.current) {
        elementsRef.current.create("payment", { layout: "tabs" }).mount(payMountRef.current);
      }
    });
    return true;
  }

  // the total bar's primary action
  useEffect(() => {
    registerConfirm(async () => {
      if (phase === "payment" || phase === "paying") {
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
        return;
      }
      setError(null);
      setNeedsAuth(false);
      setPhase("creating");
      try {
        const ok = await ensureRide();
        if (!ok) { setPhase("review"); return; }
        if (STRIPE_KEY) {
          const mounted = await startCardFlow();
          if (!mounted) onConfirmed?.(confirmedPayload(false)); // degrade to reserve — never dead-end
        } else {
          onConfirmed?.(confirmedPayload(false));
        }
      } catch {
        if (rideRef.current) onConfirmed?.(confirmedPayload(false));
        else { setError("Something went wrong. Please try again."); setPhase("review"); }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, state, pricing, totalUsd]);

  const partyLabel = `${state.pax} guest${state.pax === 1 ? "" : "s"} · ${state.bags} bag${state.bags === 1 ? "" : "s"}${state.seats ? ` · ${state.seats} child seat${state.seats > 1 ? "s" : ""}` : ""}`;
  // never a bare 07/08 — the weekday and month name travel with every date
  const whenLabel = [
    formatDateTime(state.date, time),
    state.journey === "return"
      ? `returns ${formatDateTime(state.returnDate, state.returnTime)}`
      : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="panel">
      <div className="phead">
        <div className="pkick">Step 02 · Your details</div>
        <h2>Confirm and <em>you're set.</em></h2>
      </div>

      <div className="pcols">
      <div className="pcol">
      <div className="review">
        <div className="rrow"><span className="rl">Route</span><span className="rv">{state.from?.name} → {state.to?.name}</span></div>
        <div className="rrow"><span className="rl">Journey</span><span className="rv">{state.journey === "return" ? "Return" : "One way"}</span></div>
        <div className="rrow">
          <span className="rl">When</span>
          <span className="rv">{whenLabel} <span className="rv-zone">{ARUBA_TZ_LABEL}</span></span>
        </div>
        {state.flightNumber && <div className="rrow"><span className="rl">Flight</span><span className="rv">{formatFlightNumber(state.flightNumber)} — tracked</span></div>}
        <div className="rrow"><span className="rl">Party</span><span className="rv">{partyLabel}</span></div>
        <div className="rrow"><span className="rl">Car</span><span className="rv">{vehicle.name}</span></div>
        <div className="rrow total"><span className="rl">Total, all in</span><span className="rv">{usd(totalUsd)}</span></div>
        <div className="rrow change">
          <button type="button" onClick={() => goTo(1)}>← Change something</button>
        </div>
      </div>
      </div>

      <div className="pcol">
      <div className="fld">
        <label htmlFor="b-name">{airportTrip ? "Name for the driver's sign" : "Name for the driver"}</label>
        <input id="b-name" ref={nameRef} type="text" autoComplete="name" placeholder="Who are we meeting?" value={state.contactName}
          aria-invalid={!!err("name") || undefined} aria-describedby={errId("name")}
          onChange={(e) => setField("contactName", e.target.value)} />
        <FieldError id="err-name" message={err("name")} />
      </div>
      <div className="frow">
        <div className="fld">
          <label htmlFor="b-email">Email</label>
          <input id="b-email" ref={emailRef} type="email" inputMode="email" autoComplete="email" placeholder="For your confirmation" value={state.contactEmail}
            aria-invalid={!!err("email") || undefined} aria-describedby={errId("email")}
            onChange={(e) => setField("contactEmail", e.target.value)} />
          <FieldError id="err-email" message={err("email")} />
        </div>
        <div className="fld">
          <label htmlFor="b-phone">WhatsApp / phone</label>
          <input id="b-phone" ref={phoneRef} type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 555 000 0000" value={state.contactPhone}
            aria-invalid={!!err("phone") || undefined} aria-describedby={errId("phone")}
            onChange={(e) => setField("contactPhone", e.target.value)} />
          <FieldError id="err-phone" message={err("phone")} />
        </div>
      </div>

      {(phase === "payment" || phase === "paying") && (
        <div className="fld">
          <label>Payment</label>
          <div ref={payMountRef} />
        </div>
      )}

      {error && (
        <div className="pay-error" role="alert">
          {error}
          {needsAuth && <div style={{ marginTop: 12 }}>Sign in from the top of the page, then try again — or message us on WhatsApp and we'll book it by hand.</div>}
        </div>
      )}
      {foot}

      <div className="secure">
        {STRIPE_KEY
          ? "Secured by Stripe · charged in US dollars · free cancellation up to 24h before pickup"
          : "No charge today — the fixed fare is settled with your driver, in US dollars. Free cancellation up to 24h before pickup."}
      </div>
      </div>
      </div>
    </div>
  );
}
