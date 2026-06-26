import { useState, useEffect } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { VEHICLES, fitsParty } from "../../../data/vehicles";
import { loadPricing, Pricing } from "../../../lib/pricing";
import { fareForVehicle } from "../../../booking/useFare";
import { formatMoney } from "../../../lib/currency";

export default function StepVehicle() {
  const { state, setField } = useBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);

  useEffect(() => {
    loadPricing().then(setPricing);
  }, []);

  return (
    <div>
      <div className="step-eyebrow">The car</div>
      <h2 className="step-title">Choose your vehicle.</h2>
      <p className="step-desc">
        Each priced as a fixed fare for your route. Cars too small for your party are held back.
      </p>

      <div className="veh-list">
        {VEHICLES.map((v) => {
          const fits = fitsParty(v, state.passengers, state.luggage);
          const isSelected = state.vehicle === v.id;
          const fareAwg = pricing ? fareForVehicle(pricing, state, v) : null;

          const cls = [
            "veh",
            isSelected ? "on" : "",
            !fits ? "disabled" : "",
          ]
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
                  <rect x="2" y="8" width="30" height="10" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M7 8 L10 3 L24 3 L27 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  <circle cx="8" cy="18" r="3" stroke="currentColor" strokeWidth="1.4"/>
                  <circle cx="26" cy="18" r="3" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
              </div>

              <div className="veh-info">
                <div className="veh-name">{v.name}</div>
                <div className="veh-spec">
                  {v.desc} · {v.pax} pax · {v.bags} bags
                  {!fits && (
                    <span className="veh-toosmall"> · Too small for your party</span>
                  )}
                </div>
              </div>

              <div className="veh-price">
                {fareAwg !== null ? (
                  <>
                    <div className="amt">{formatMoney(fareAwg, state.currency)}</div>
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
    </div>
  );
}
