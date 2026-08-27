// Steps 2–4 — YOUR DETAILS · REVIEW · PAYMENT.
//
// One component, three screens. They share a ride draft, a Stripe elements
// instance and a confirm handler, and splitting them into three files would
// mean lifting all of that into the overlay — so what changes here is only
// what is RENDERED, chosen by state.step. The payment path itself is
// untouched: the same ensureRide → create-payment-intent → confirmPayment
// calls fire, just from step 4 instead of from the bottom of a long form.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Stripe, StripeElements } from "@stripe/stripe-js";
import { useBooking } from "../../../booking/BookingContext";
import { useAuth } from "../../../booking/useAuth";
import { fullNameOf, phoneOf } from "../../../lib/displayName";
import { VEHICLES } from "../../../data/vehicles";
import { quote, usd, usdToAwg } from "../../../lib/quote";
import type { Pricing } from "../../../lib/pricing";
import { collectAt } from "../../../lib/derivedTime";
import { formatDateTime, formatTime, ARUBA_TZ_LABEL } from "../../../lib/datetime";
import { AIRPORT_ID } from "../../../data/places";
import { generateBookingRef } from "../../../lib/bookingRef";
import { formatFlightNumber } from "../../../lib/flight";
import { normalizePhone, isValidPhone, isValidEmail } from "../../../lib/contact";
import { createRide } from "../../../lib/rides";
import { getStripe } from "../../../lib/stripe";
import type { ConfirmedBooking } from "../../../booking/types";
import LiveMap from "../LiveMap";
import FieldError from "../FieldError";
import { effectivePickupTime, type StepProblem } from "./shared";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/** One height for the map, shared by the live tiles and the sketch, so the
    panel does not resize under you when the tiles arrive. Mirrored by
    .tripmap in globals.css — change both. */
const MAP_H = 360;

/** Which screen this component is being asked for. Review is the fall-through
    at the bottom, so it needs no constant of its own. */
const DETAILS = 2, PAYMENT = 4;

export type PayPhase = "review" | "creating" | "payment" | "paying";

interface Step3Props {
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
  /** the total + primary action, rendered flat under the step's own column */
  foot: React.ReactNode;
}

export default function Step3Details({
  pricing, problem, registerValidator, phase, setPhase, onConfirmed,
  error, setError, needsAuth, setNeedsAuth, registerConfirm, foot,
}: Step3Props) {
  const { state, setField, goTo } = useBooking();
  const { account } = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const stripeRef = useRef<Stripe | null>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const payMountRef = useRef<HTMLDivElement | null>(null);
  const rideRef = useRef<{ id: string; bookingRef: string | null } | null>(null);
  const kickedRef = useRef(false);
  const [, force] = useState(0);
  void force;

  // What the profile already knows, so nobody retypes their own name at an
  // arrivals gate. Blanks only — a value on screen is something they chose,
  // and this must never overwrite it.
  useEffect(() => {
    if (!account) return;
    const name = fullNameOf(account);
    const phone = phoneOf(account);
    if (name && !state.contactName) setField("contactName", name);
    if (account.email && !state.contactEmail) setField("contactEmail", account.email);
    if (phone && !state.contactPhone) setField("contactPhone", phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account]);

  const vehicle = VEHICLES.find((v) => v.id === state.vehicle) ?? VEHICLES[0];
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  const airportTrip = fromAirport || toAirport;
  const time = effectivePickupTime(state);

  const q = state.from && state.to
    ? quote({ from: state.from, to: state.to, vehicle, isReturn: state.journey === "return", pricing, pickupTime: time })
    : null;
  const totalUsd = q?.totalUsd ?? 0;

  // Only the details screen can be blocked. Review has nothing to fill in,
  // and payment is gated by Stripe's own element, not by us.
  const validate = useMemo(() => () => {
    if (state.step !== DETAILS) return null;
    if (state.contactName.trim().length < 2)
      return { field: "name", message: airportTrip ? "A name lets the driver hold the right sign." : "A name lets the driver greet you.", focus: () => nameRef.current?.focus() };
    if (!isValidEmail(state.contactEmail))
      return { field: "email", message: "We need an email to send your confirmation.", focus: () => emailRef.current?.focus() };
    if (!isValidPhone(state.contactPhone))
      return { field: "phone", message: "A WhatsApp number lets your driver reach you on the day.", focus: () => phoneRef.current?.focus() };
    return null;
  }, [state.step, state.contactName, state.contactEmail, state.contactPhone, airportTrip]);
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

  /** Put the card field on screen. Stepping back to review unmounts the node
      it was attached to, so re-entering re-mounts the SAME element rather
      than building a second one against the same client secret. */
  function mountPayment() {
    requestAnimationFrame(() => {
      const els = elementsRef.current;
      if (!payMountRef.current || !els) return;
      const el = els.getElement("payment") ?? els.create("payment", { layout: "tabs" });
      el.mount(payMountRef.current);
    });
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
        theme: "night",
        variables: {
          colorPrimary: "#B9C6D4",
          colorBackground: "#121D2B",
          colorText: "#F2F5F8",
          colorTextPlaceholder: "#7C93AC",
          colorDanger: "#CF6A5F",
          fontFamily: "Inter, system-ui, sans-serif",
          borderRadius: "12px",
        },
      },
    });
    setPhase("payment");
    mountPayment();
    return true;
  }

  /** Reserve the ride and put a card field on screen. This is the work the
      old flow did when you pressed "Continue to payment" at the bottom of
      the form — the same calls, one screen later. Leaving kickedRef false on
      failure is what makes the button below a retry rather than a wall. */
  async function preparePayment() {
    if (kickedRef.current) return;
    kickedRef.current = true;
    setError(null);
    setNeedsAuth(false);
    setPhase("creating");
    try {
      const ok = await ensureRide();
      if (!ok) { setPhase("review"); kickedRef.current = false; return; }
      const mounted = await startCardFlow();
      // Stripe unreachable? Take the reservation rather than dead-end.
      if (!mounted) onConfirmed?.(confirmedPayload(false));
    } catch {
      if (rideRef.current) onConfirmed?.(confirmedPayload(false));
      else { setError("Something went wrong. Please try again."); setPhase("review"); kickedRef.current = false; }
    }
  }

  // Arriving at the step starts that work, so the card field is there by the
  // time the step has finished animating in — nothing to press first.
  useEffect(() => {
    if (state.step !== PAYMENT) return;
    if (elementsRef.current) { setPhase("payment"); mountPayment(); return; }
    void preparePayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // The step foot's primary action, on the step that ends the flow: paying
  // on step 4, or — with no Stripe key configured — reserving from review.
  useEffect(() => {
    registerConfirm(async () => {
      if (state.step === PAYMENT) {
        // The reservation or the card field never arrived — the button in
        // front of them is the retry, not a dead control.
        if (!stripeRef.current || !elementsRef.current) { await preparePayment(); return; }
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
      // review, no card on file to take: the fare is settled with the driver
      setError(null);
      setNeedsAuth(false);
      setPhase("creating");
      try {
        const ok = await ensureRide();
        if (!ok) { setPhase("review"); return; }
        onConfirmed?.(confirmedPayload(false));
      } catch {
        if (rideRef.current) onConfirmed?.(confirmedPayload(false));
        else { setError("Something went wrong. Please try again."); setPhase("review"); }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step, phase, state, pricing, totalUsd]);

  const partyLabel = `${state.pax} guest${state.pax === 1 ? "" : "s"} · ${state.bags} bag${state.bags === 1 ? "" : "s"}${state.seats ? ` · ${state.seats} child seat${state.seats > 1 ? "s" : ""}` : ""}`;
  // never a bare 07/08 — the weekday and month name travel with every date
  const whenLabel = [
    formatDateTime(state.date, time),
    state.journey === "return"
      ? `returns ${formatDateTime(state.returnDate, state.returnTime)}`
      : "",
  ].filter(Boolean).join(" · ");

  /** Review's edit links land on the screen that owns the line, and leave a
      history entry so the back gesture returns to review. */
  function jumpTo(step: 1 | 2) {
    history.pushState({ cb: step }, "", `#step-${step}`);
    goTo(step);
  }

  const errorBlock = error && (
    <div className="pay-error" role="alert">
      {error}
      {needsAuth && <div style={{ marginTop: 12 }}>Sign in from the top of the page, then try again — or message us on WhatsApp and we'll book it by hand.</div>}
    </div>
  );

  /** The journey, told in the parts a map cannot draw. Shared by review and
      payment so the total never leaves the screen while money is on it. */
  const facts = (full: boolean) => (
    <dl className="tm-facts">
      <div><dt>When</dt><dd>{whenLabel} <span className="rv-zone">{ARUBA_TZ_LABEL}</span></dd></div>
      {state.journey === "return" && <div><dt>Journey</dt><dd>Return</dd></div>}
      {state.flightNumber && <div><dt>Flight</dt><dd>{formatFlightNumber(state.flightNumber)} — tracked</dd></div>}
      <div><dt>Party</dt><dd>{partyLabel}</dd></div>
      <div><dt>Car</dt><dd>{vehicle.name}</dd></div>
      {full && state.contactName && <div><dt>{airportTrip ? "Sign reads" : "Driver asks for"}</dt><dd>{state.contactName}</dd></div>}
      {full && state.contactPhone && <div><dt>WhatsApp</dt><dd>{state.contactPhone}</dd></div>}
      {/* on the details step the running total is already in the foot, a
          finger's width below — saying it twice reads as two numbers */}
      {full && <div className="tm-total"><dt>Total, all in</dt><dd>{usd(totalUsd)}</dd></div>}
    </dl>
  );

  // ── step 2 · your details ──────────────────────────────────────────────
  if (state.step === DETAILS) {
    return (
      <div className="panel">
        <div className="phead">
          <h2>Who are we <em>meeting?</em></h2>
          <p className="psub">Three lines, and your driver knows exactly who to look for.</p>
        </div>

        <div className="pcols pcols-map">
        <div className="pcol pcol-form">
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

          <div className="fld">
            <label htmlFor="b-notes">Anything we should know? <span className="soft">— optional</span></label>
            <textarea id="b-notes" rows={2} placeholder="A stroller, a surfboard, a stop on the way…"
              value={state.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>

          {errorBlock}
          {foot}
        </div>

        <aside className="pcol pcol-map">
          <div className="tripmap">
            <LiveMap from={state.from} to={state.to} minutes={q?.minutes ?? null} fallbackHeight={MAP_H} ends />
          </div>
          {facts(false)}
        </aside>
        </div>
      </div>
    );
  }

  // ── step 4 · payment ───────────────────────────────────────────────────
  if (state.step === PAYMENT) {
    return (
      <div className="panel">
        <div className="phead">
          <h2>Last thing — <em>the card.</em></h2>
          <p className="psub">Charged in US dollars. Free cancellation up to 24 hours before pickup.</p>
        </div>

        <div className="pcols pcols-map">
        <div className="pcol pcol-form">
          {/* Reserving the room the card field will need keeps the Pay
              button still instead of shunting it down the page when Stripe's
              iframe lands. An empty box is only worth that when something is
              still coming — a failed reservation shows its reason instead. */}
          {phase !== "review" && (
            <div className="fld">
              <label>Payment</label>
              <div ref={payMountRef} className="pay-mount" />
              {phase === "creating" && <p className="pay-wait" role="status">Holding your car…</p>}
            </div>
          )}

          {errorBlock}
          {foot}

          <div className="secure">Secured by Stripe · charged in US dollars · free cancellation up to 24h before pickup</div>
        </div>

        <aside className="pcol pcol-map">
          {facts(true)}
          <button type="button" className="tm-change" onClick={() => history.back()}>← Change something</button>
        </aside>
        </div>
      </div>
    );
  }

  // ── step 3 · review ────────────────────────────────────────────────────
  return (
    <div className="panel">
      <div className="phead">
        <h2>Does this look <em>right?</em></h2>
        <p className="psub">Nothing is charged until you say so — and every line here can still change.</p>
      </div>

      <div className="pcols pcols-map pcols-review">
      <div className="pcol pcol-form">
        <div className="tripmap">
          <LiveMap from={state.from} to={state.to} minutes={q?.minutes ?? null} fallbackHeight={MAP_H} ends />
        </div>

        {errorBlock}
        {foot}

        <div className="secure">
          {STRIPE_KEY
            ? "Secured by Stripe · charged in US dollars · free cancellation up to 24h before pickup"
            : "No charge today — the fixed fare is settled with your driver, in US dollars. Free cancellation up to 24h before pickup."}
        </div>
      </div>

      <aside className="pcol pcol-map">
        {facts(true)}
        {/* Straight back to the screen that owns each line, not a blind
            step backwards through all of them. */}
        <div className="rv-edit">
          <button type="button" onClick={() => jumpTo(1)}>Change the trip or the car</button>
          <button type="button" onClick={() => jumpTo(2)}>Change your details</button>
        </div>
      </aside>
      </div>
    </div>
  );
}
