// Steps 2–4 — YOUR DETAILS · REVIEW · PAYMENT.
//
// One component, three screens. They share a ride draft, a Stripe elements
// instance and a confirm handler, and splitting them into three files would
// mean lifting all of that into the overlay — so what changes here is only
// what is RENDERED, chosen by state.step. The payment path itself is
// untouched: the same ensureRide → create-payment-intent → confirmPayment
// calls fire, just from step 4 instead of from the bottom of a long form.
import { useEffect, useMemo, useRef, useState } from "react";
import type { Stripe, StripeElements, StripeCardNumberElement } from "@stripe/stripe-js";
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
import TripSchedule, { validateTrip } from "../TripSchedule";
import { effectivePickupTime, type StepProblem } from "./shared";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

/** One height for the map, shared by the live tiles and the sketch, so the
    panel does not resize under you when the tiles arrive. Mirrored by
    .tripmap in globals.css — change both. */
const MAP_H = 360;

/** Which screen this component is being asked for. Review is the fall-through
    at the bottom, so it needs no constant of its own. */
const DETAILS = 2, PAYMENT = 4;

/** Whether a card can be taken at all. Without a key the payment step is
    still in the flow — it just says so rather than showing a dead field. */
const CARD_ENABLED = Boolean(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

/**
 * What Stripe's three iframes are told to look like.
 *
 * These are the site's own input values, restated because an iframe cannot
 * read a stylesheet: --ink, --placeholder and --signal-bad, at the 16px the
 * rest of the form uses (under 16px iOS zooms the page on focus). Keep them
 * in step with .qfld input by hand — the alternative is Stripe's own theme,
 * which is what this replaced.
 */
const CARD_STYLE = {
  base: {
    color: "#F2F5F8",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: "16px",
    fontWeight: "400",
    lineHeight: "24px",
    "::placeholder": { color: "#7C93AC" },
  },
  invalid: { color: "#CF6A5F", iconColor: "#CF6A5F" },
} as const;

/** The wordmarks a brand code stands for. Stripe returns "unknown" until
    the first digits identify one, and for cards we have no mark for. */
const BRANDS: Record<string, string> = {
  visa: "VISA", mastercard: "Mastercard", amex: "Amex",
  discover: "Discover", diners: "Diners", jcb: "JCB", unionpay: "UnionPay",
};

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
  /** the intent's secret, held here because the card fields are built
      without it — see startCardFlow */
  const secretRef = useRef<string | null>(null);
  const numberRef = useRef<HTMLDivElement | null>(null);
  const expiryRef = useRef<HTMLDivElement | null>(null);
  const cvcRef = useRef<HTMLDivElement | null>(null);
  const cardNumberElRef = useRef<StripeCardNumberElement | null>(null);
  /** what Stripe says about the number as it is typed: which card it is,
      and what is wrong with it. Ours to render, so it reads like the rest
      of the form rather than like an iframe's idea of an error. */
  const [brand, setBrand] = useState<string>("unknown");
  const [cardErr, setCardErr] = useState<Record<string, string>>({});
  const [cardName, setCardName] = useState("");
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
  const focusById = (id: string) => () => document.getElementById(id)?.focus();
  const validate = useMemo(() => () => {
    if (state.step !== DETAILS) return null;
    // The schedule reads above the contact fields, so it is checked first.
    const trip = validateTrip(state, { byId: focusById });
    if (trip) return trip;
    if (state.contactName.trim().length < 2)
      return { field: "name", message: airportTrip ? "A name lets the driver hold the right sign." : "A name lets the driver greet you.", focus: () => nameRef.current?.focus() };
    if (!isValidEmail(state.contactEmail))
      return { field: "email", message: "We need an email to send your confirmation.", focus: () => emailRef.current?.focus() };
    if (!isValidPhone(state.contactPhone))
      return { field: "phone", message: "A WhatsApp number lets your driver reach you on the day.", focus: () => phoneRef.current?.focus() };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, airportTrip]);
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
  /**
   * Three fields, not one box.
   *
   * This was a single PaymentElement in "tabs" layout — Stripe's own
   * card/wallet UI, themed as close to the site as its appearance API
   * allows, which is never all the way: its own labels, its own spacing,
   * its own idea of an error. Split elements put the number, expiry and
   * CVC each inside THIS form's field shell, so the card row looks like
   * the name row above it. The digits still never touch our code — each
   * field is Stripe's iframe, the same PCI boundary as before — we only
   * own the chrome around them and the words when something is wrong.
   */
  function mountPayment() {
    requestAnimationFrame(() => {
      const els = elementsRef.current;
      if (!els || !numberRef.current || !expiryRef.current || !cvcRef.current) return;

      const number = els.getElement("cardNumber") ??
        els.create("cardNumber", { style: CARD_STYLE, placeholder: "1234 1234 1234 1234", showIcon: false });
      const expiry = els.getElement("cardExpiry") ?? els.create("cardExpiry", { style: CARD_STYLE });
      const cvc = els.getElement("cardCvc") ?? els.create("cardCvc", { style: CARD_STYLE });

      cardNumberElRef.current = number;
      // Stripe names the brand as soon as it can; the mark beside the field
      // is the oldest signal in card forms that the number was understood.
      number.on("change", (e) => {
        setBrand(e.brand ?? "unknown");
        setCardErr((p) => ({ ...p, number: e.error?.message ?? "" }));
      });
      expiry.on("change", (e) => setCardErr((p) => ({ ...p, expiry: e.error?.message ?? "" })));
      cvc.on("change", (e) => setCardErr((p) => ({ ...p, cvc: e.error?.message ?? "" })));

      number.mount(numberRef.current);
      expiry.mount(expiryRef.current);
      cvc.mount(cvcRef.current);
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
    secretRef.current = clientSecret;
    // No clientSecret on the group: that mode is for the PaymentElement,
    // and split card fields confirm through confirmCardPayment with the
    // secret passed at the end instead. Each field carries its own style.
    elementsRef.current = stripe.elements();
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
    // No key: this step explains itself and waits. It must NOT reserve on
    // arrival — preparePayment's "Stripe unreachable, take the booking
    // anyway" path was correct when the step did not exist without a key,
    // and books the ride behind the traveller's back now that it does.
    if (!CARD_ENABLED) return;
    if (elementsRef.current) { setPhase("payment"); mountPayment(); return; }
    void preparePayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.step]);

  // The step foot's primary action, on the step that ends the flow: paying
  // on step 4, or — with no Stripe key configured — reserving from review.
  useEffect(() => {
    registerConfirm(async () => {
      // With no card to take, the payment step's action is the booking
      // itself — the same path review used to end on.
      if (state.step === PAYMENT && CARD_ENABLED) {
        // The reservation or the card field never arrived — the button in
        // front of them is the retry, not a dead control.
        if (!stripeRef.current || !secretRef.current || !cardNumberElRef.current) {
          await preparePayment(); return;
        }
        setPhase("paying");
        setError(null);
        // confirmCardPayment, not confirmPayment: the latter wants a
        // PaymentElement, and these are three card fields. The number
        // element is the handle for all three — Stripe pairs them itself.
        const { error: payErr } = await stripeRef.current.confirmCardPayment(secretRef.current, {
          payment_method: {
            card: cardNumberElRef.current,
            billing_details: {
              name: cardName.trim() || state.contactName.trim() || undefined,
              email: state.contactEmail.trim() || undefined,
            },
          },
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
          <p className="psub">{airportTrip
            ? "The flight, and the name on the sign."
            : "Three lines, and your driver knows exactly who to look for."}</p>
        </div>

        <div className="pcols pcols-map">
        <div className="pcol pcol-form">
          <TripSchedule problem={problem} lateNight={!!q?.lateNight} />

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
          {!CARD_ENABLED ? (
            /* No key, so no card — and saying so is better than a dead
               field or a step that quietly vanishes. The fare is still a
               fixed price; it is simply settled at the end of the ride. */
            <div className="pay-off">
              <h3>Card payment isn't switched on yet.</h3>
              <p>
                Reserve now and settle the fare with your driver — the price is fixed
                and won't change. Nothing is charged today.
              </p>
            </div>
          ) : phase !== "review" ? (
            <div className="cardform">
              <div className="fld">
                <label htmlFor="card-name">Name on card</label>
                <input
                  id="card-name"
                  type="text"
                  autoComplete="cc-name"
                  placeholder={state.contactName || "As printed on the card"}
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                />
              </div>

              {/* Stripe's iframe sits where an <input> would, inside this
                  form's own field shell — hence .fld wrapping .cardbox
                  rather than a bare mount point. */}
              <div className="fld">
                <label htmlFor="card-number">Card number</label>
                <div className={`cardbox${cardErr.number ? " bad" : ""}`}>
                  <div id="card-number" ref={numberRef} className="cardslot" />
                  <span className={`cardbrand${brand !== "unknown" ? " on" : ""}`} aria-hidden="true">
                    {BRANDS[brand] ?? ""}
                  </span>
                </div>
                {cardErr.number && <p className="fld-err" role="alert">{cardErr.number}</p>}
              </div>

              <div className="cardrow">
                <div className="fld">
                  <label htmlFor="card-expiry">Expiry</label>
                  <div className={`cardbox${cardErr.expiry ? " bad" : ""}`}>
                    <div id="card-expiry" ref={expiryRef} className="cardslot" />
                  </div>
                  {cardErr.expiry && <p className="fld-err" role="alert">{cardErr.expiry}</p>}
                </div>
                <div className="fld">
                  <label htmlFor="card-cvc">CVC</label>
                  <div className={`cardbox${cardErr.cvc ? " bad" : ""}`}>
                    <div id="card-cvc" ref={cvcRef} className="cardslot" />
                  </div>
                  {cardErr.cvc && <p className="fld-err" role="alert">{cardErr.cvc}</p>}
                </div>
              </div>

              {phase === "creating" && <p className="pay-wait" role="status">Holding your car…</p>}
            </div>
          ) : null}

          {errorBlock}
          {foot}

          <div className="secure">
            {CARD_ENABLED
              ? "Secured by Stripe · charged in US dollars · free cancellation up to 24h before pickup"
              : "Fixed price · settled with your driver · free cancellation up to 24h before pickup"}
          </div>
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
