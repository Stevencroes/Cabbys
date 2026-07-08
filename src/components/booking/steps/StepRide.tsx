import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useFare, fareForVehicle } from "../../../booking/useFare";
import { VEHICLES, fitsParty } from "../../../data/vehicles";
import { loadPricing, type Pricing } from "../../../lib/pricing";
import { formatMoney } from "../../../lib/currency";
import VehicleGlyph from "../VehicleGlyph";

export default function StepRide() {
  const { state, setField, goTo } = useBooking();
  const { loading, fare, tax, total } = useFare();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

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
  // Vehicle-class premium over the base engine fare (shown in the breakdown)
  const vehicleUplift = selected && selected.mult !== 1 ? fare.total * (selected.mult - 1) : 0;

  // Party too big for everything? Point at the van rather than a dead end.
  const nothingFits = VEHICLES.every((v) => !fitsParty(v, state.passengers, state.luggage));

  return (
    <div className="ride-screen">
      <div className="step-eyebrow">Your ride</div>
      <h2 className="step-title">Choose your car.</h2>
      <p className="step-desc">
        Fares are fixed and shown in US dollars, with the 6% government &amp; facility tax included.
        No surge, no meter.
      </p>

      <div className="ride-grid">
        {/* Left — trip summary, each row jumps back to edit */}
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
            <span className="v">{state.date ? `${state.date} · ${state.time}` : "Now"}</span>
          </button>
          <button type="button" className="ride-sumrow" onClick={() => goTo(0)}>
            <span className="k">Guests</span>
            <span className="v">{state.passengers} · {state.luggage} bags</span>
          </button>

          <div className="ride-included">
            <div className="ri-h">Every ride includes</div>
            <ul>
              <li>Meet &amp; greet with name board</li>
              <li>60 min airport wait included</li>
              <li>Free cancellation to 24 h before</li>
            </ul>
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
                  aria-pressed={state.vehicle === v.id}
                  onClick={() => fits && setField("vehicle", v.id)}
                >
                  {v.note && <span className="veh-flag">{v.note}</span>}
                  <div className="veh-ico">
                    <VehicleGlyph id={v.id} />
                  </div>
                  <div className="veh-info">
                    <div className="veh-name">{v.name}</div>
                    <div className="veh-spec">
                      {v.desc} · {v.pax} pax · {v.bags} bags
                      {!fits && <span className="veh-toosmall"> · Too small for your party</span>}
                    </div>
                  </div>
                  <div className="veh-price">
                    {pricing === null ? (
                      <div className="amt skeleton-amt" aria-hidden="true" />
                    ) : fareAwg !== null ? (
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

          {nothingFits && (
            <div className="pay-error" role="alert" style={{ marginTop: "12px" }}>
              For parties this size we arrange multiple vehicles — continue with the van and
              add a note, or reduce the party per booking.
            </div>
          )}

          <div className={`fare-tag${isEstimate ? " estimate" : ""}`}>
            <span className="dot" />
            {isEstimate
              ? "Estimate — your fare is confirmed before you pay, never after"
              : "Fixed fare — locked in when you book"}
          </div>
        </div>

        {/* Right — route rail + live total + breakdown */}
        <aside className="ride-route">
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
              <>
                <div className="rr-total">{formatMoney(total, "USD")}</div>
                <button
                  type="button"
                  className="rr-breakdown-toggle"
                  aria-expanded={showBreakdown}
                  onClick={() => setShowBreakdown((s) => !s)}
                >
                  {showBreakdown ? "Hide fare breakdown" : "View fare breakdown"}
                </button>
                {showBreakdown && (
                  <div className="rr-breakdown">
                    {fare.lineItems.map((li, i) => (
                      <div className="rr-bd-row" key={`${li.label}-${i}`}>
                        <span>{li.note ? `${li.label} · ${li.note}` : li.label}</span>
                        <span>{formatMoney(li.amount, "USD")}</span>
                      </div>
                    ))}
                    {vehicleUplift > 0 && (
                      <div className="rr-bd-row">
                        <span>{selected.name}</span>
                        <span>+{formatMoney(vehicleUplift, "USD")}</span>
                      </div>
                    )}
                    <div className="rr-bd-row">
                      <span>Government &amp; facility tax (6%)</span>
                      <span>{formatMoney(tax, "USD")}</span>
                    </div>
                    <div className="rr-bd-row rr-bd-total">
                      <span>Total</span>
                      <span>{formatMoney(total, "USD")}</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
