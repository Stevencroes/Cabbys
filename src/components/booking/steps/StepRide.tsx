import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useAuth } from "../../../booking/useAuth";
import { useFare, fareForVehicle } from "../../../booking/useFare";
import { VEHICLES, fitsParty } from "../../../data/vehicles";
import { loadPricing, type Pricing } from "../../../lib/pricing";
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
}

interface StepRideProps {
  onConfirmed?: (booking: ConfirmedBooking) => void;
}

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export default function StepRide({ onConfirmed }: StepRideProps) {
  const { state, setField, goTo } = useBooking();
  const { user, loading: authLoading, signInWithProvider, signInWithEmail } = useAuth();
  const { loading, fare, tax, total } = useFare();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => {
      if (!cancelled) setPricing(p);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = VEHICLES.find((v) => v.id === state.vehicle);
  const isEstimate = fare.source === "min";
  const canRequest = !!user && !!state.vehicle && !loading && !busy;

  async function handleEmail() {
    if (!email.trim()) return;
    setSending(true);
    await signInWithEmail(email.trim());
    setSending(false);
    setSent(true);
  }

  async function handleRequest() {
    if (!user || !state.vehicle) return;
    setBusy(true);
    setError(null);
    const { base, total: payTotal } = { base: total - tax, total };
    const payloadState = {
      from: state.from,
      to: state.to,
      date: state.date,
      time: state.time,
      passengers: state.passengers,
      luggage: state.luggage,
      vehicle: state.vehicle,
      fareBase: base,
      fareTotal: payTotal,
      addonKeys: [] as string[],
    };
    const { withCoords, core } = buildRidePayload(payloadState, user.id);
    let { data, error: err } = await supabase.from("rides").insert(withCoords).select().single();
    if (err) ({ data, error: err } = await supabase.from("rides").insert(core).select().single());
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
    });
    setBusy(false);
  }

  return (
    <div className="ride-screen">
      <div className="step-eyebrow">Get a ride</div>
      <h2 className="step-title">Choose your car.</h2>
      <p className="step-desc">
        Fares are fixed and shown in US dollars, with the 6% government &amp; facility tax included.
      </p>

      <div className="ride-grid">
        {/* Left — trip inputs + account */}
        <aside className="ride-aside">
          <button type="button" className="ride-sumrow" onClick={() => goTo(0)}>
            <span className="k">Pickup</span>
            <span className="v">{state.from || "Choose pickup"}</span>
          </button>
          <button type="button" className="ride-sumrow" onClick={() => goTo(0)}>
            <span className="k">Destination</span>
            <span className="v">{state.to || "Choose destination"}</span>
          </button>
          <button type="button" className="ride-sumrow" onClick={() => goTo(0)}>
            <span className="k">When</span>
            <span className="v">{state.time ? state.time : "Now"}</span>
          </button>
          <button type="button" className="ride-sumrow" onClick={() => goTo(0)}>
            <span className="k">Guests</span>
            <span className="v">{state.passengers} · {state.luggage} bags</span>
          </button>

          <div className="ride-auth">
            {authLoading ? (
              <p className="acct-note" style={{ marginTop: 0 }}>Checking sign-in status…</p>
            ) : user ? (
              <p className="acct-note" style={{ marginTop: 0, textAlign: "left" }}>
                Signed in as <strong>{user.email}</strong>
              </p>
            ) : (
              <>
                <div className="ride-auth-h">Sign in to confirm</div>
                <div className="oauth">
                  <button className="oauth-btn google" type="button" onClick={() => signInWithProvider("google")}>
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z" />
                    </svg>
                    Google
                  </button>
                  <button className="oauth-btn apple" type="button" onClick={() => signInWithProvider("apple")}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="#fff">
                      <path d="M16.36 12.62c.03 2.9 2.55 3.86 2.58 3.87-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.64 2.33-2.96 2.35-1.3.03-1.72-.77-3.2-.77-1.5 0-1.95.75-3.18.8-1.27.05-2.24-1.27-3.05-2.43-1.65-2.4-2.92-6.77-1.22-9.73.84-1.47 2.35-2.4 3.99-2.43 1.25-.02 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.26 3.54 1.92-.09.06-2.11 1.24-2.08 3.7M14 5.4c.68-.82 1.13-1.96 1-3.1-.97.04-2.15.65-2.85 1.47-.63.72-1.18 1.88-1.03 2.99 1.08.08 2.19-.55 2.88-1.36" />
                    </svg>
                    Apple
                  </button>
                </div>
                {sent ? (
                  <p className="acct-note" style={{ textAlign: "left" }}>
                    Check your inbox — a link is on its way to <strong>{email}</strong>.
                  </p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "9px", marginTop: "10px" }}>
                    <input
                      className="txt"
                      type="email"
                      placeholder="Your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleEmail()}
                    />
                    <button className="btn-ghost" type="button" onClick={handleEmail} disabled={!email.trim() || sending}>
                      {sending ? "Sending…" : "Continue with email"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Center — vehicle list */}
        <div className="ride-cars">
          <div className="veh-list">
            {VEHICLES.map((v) => {
              const fits = fitsParty(v, state.passengers, state.luggage);
              const fareAwg = pricing ? fareForVehicle(pricing, state, v) : null;
              const cls = ["veh", state.vehicle === v.id ? "on" : "", !fits ? "disabled" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <button
                  key={v.id}
                  type="button"
                  className={cls}
                  disabled={!fits}
                  onClick={() => fits && setField("vehicle", v.id)}
                >
                  {v.note && <span className="veh-flag">{v.note}</span>}
                  <div className="veh-ico">
                    <svg width="34" height="20" viewBox="0 0 34 20" fill="none">
                      <rect x="2" y="8" width="30" height="10" rx="3" stroke="currentColor" strokeWidth="1.4" />
                      <path d="M7 8 L10 3 L24 3 L27 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                      <circle cx="8" cy="18" r="3" stroke="currentColor" strokeWidth="1.4" />
                      <circle cx="26" cy="18" r="3" stroke="currentColor" strokeWidth="1.4" />
                    </svg>
                  </div>
                  <div className="veh-info">
                    <div className="veh-name">{v.name}</div>
                    <div className="veh-spec">
                      {v.desc} · {v.pax} pax · {v.bags} bags
                      {!fits && <span className="veh-toosmall"> · Too small for your party</span>}
                    </div>
                  </div>
                  <div className="veh-price">
                    {fareAwg !== null ? (
                      <>
                        <div className="amt">{formatMoney(fareAwg, "USD")}</div>
                        <div className="cur">incl. tax</div>
                      </>
                    ) : (
                      <div className="amt">—</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <div className={`fare-tag${isEstimate ? " estimate" : ""}`}>
            <span className="dot" />
            {isEstimate ? "Estimate · confirmed by your driver" : "Fixed fare"}
          </div>
        </div>

        {/* Right — decorative route panel */}
        <aside className="ride-route">
          <div className="ride-route-grid" aria-hidden="true" />
          <div className="ride-route-body">
            <div className="rr-stop">
              <span className="ring" />
              <span>{state.from || "Pickup"}</span>
            </div>
            <div className="rr-line" />
            <div className="rr-stop">
              <span className="rdiamond" />
              <span>{state.to || "Destination"}</span>
            </div>
            {selected && !loading && (
              <div className="rr-total">{formatMoney(total, "USD")}</div>
            )}
          </div>
        </aside>
      </div>

      {error && (
        <div className="pay-error" role="alert" style={{ marginTop: "18px" }}>
          {error}
        </div>
      )}

      {/* Footer — payment + request */}
      <div className="ride-foot">
        <div className="ride-pay">
          {!STRIPE_KEY ? (
            <>
              <span className="pay-reserve-badge">Reserve now</span>
              No charge today — settled with your driver on the day.
            </>
          ) : (
            <span>Card on file</span>
          )}
        </div>
        <button
          className="btn-primary"
          type="button"
          onClick={handleRequest}
          disabled={!canRequest}
        >
          {busy
            ? "Requesting…"
            : !state.vehicle
            ? "Choose a car"
            : !user
            ? "Sign in to request"
            : (
              <>
                Request ride <span className="arr">→</span>
              </>
            )}
        </button>
      </div>
    </div>
  );
}
