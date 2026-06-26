import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useFare, fareForVehicle } from "../../../booking/useFare";
import { VEHICLES, fitsParty } from "../../../data/vehicles";
import { loadPricing, type Pricing } from "../../../lib/pricing";
import { formatMoney } from "../../../lib/currency";

export default function StepRide() {
  const { state, setField } = useBooking();
  const { loading, fare, tax, total, lineItems } = useFare();
  const [pricing, setPricing] = useState<Pricing | null>(null);

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

  return (
    <div>
      <div className="step-eyebrow">Your ride</div>
      <h2 className="step-title">Choose your car.</h2>
      <p className="step-desc">
        Each fare is the price you pay, in US dollars, with the 6% government &amp; facility tax included.
      </p>

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

      {selected && !loading && (
        <div className="quote" style={{ marginTop: "24px" }}>
          <div className="quote-head">
            <div className="quote-route">
              <div className="qr-text">
                {state.from || "Pickup"} → {state.to || "Destination"}
              </div>
            </div>
            <div className="quote-sub">
              {state.time && <span className="qs">{state.time}</span>}
              <span className="qs">{state.passengers} pax</span>
              <span className="qs">{selected.name}</span>
            </div>
          </div>
          <div className="quote-lines">
            {lineItems.map((item, i) => (
              <div key={i} className="qline">
                <span className="ql-l">{item.label}</span>
                <span className="ql-r">{formatMoney(item.amount * selected.mult, "USD")}</span>
              </div>
            ))}
            <div className="qline muted">
              <span className="ql-l">Government &amp; facility tax (6%)</span>
              <span className="ql-r">{formatMoney(tax, "USD")}</span>
            </div>
          </div>
          <div className="qtotal">
            <div className="qt-l">Total fare</div>
            <div className="qt-r">{formatMoney(total, "USD")}</div>
          </div>
        </div>
      )}

      <div className={`fare-tag${isEstimate ? " estimate" : ""}`}>
        <span className="dot" />
        {isEstimate ? "Estimate · confirmed by your driver" : "Fixed fare"}
      </div>
    </div>
  );
}
