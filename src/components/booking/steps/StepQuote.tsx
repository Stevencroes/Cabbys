import { useBooking } from "../../../booking/BookingContext";
import { useFare } from "../../../booking/useFare";
import { formatMoney, SYMBOL } from "../../../lib/currency";
import { VEHICLES } from "../../../data/vehicles";
import CurrencyToggle from "../../CurrencyToggle";

export default function StepQuote() {
  const { state } = useBooking();
  const { loading, lineItems, tax, total } = useFare();

  const selectedVehicle = VEHICLES.find((v) => v.id === state.vehicle);
  const vehicleMult = selectedVehicle?.mult ?? 1;

  const dateLabel = state.date
    ? new Date(state.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";

  return (
    <div>
      <div className="step-eyebrow">Your fare</div>
      <h2 className="step-title">Settled, in full.</h2>
      <p className="step-desc">
        The price below is the price you pay. Switch the currency to suit your wallet.
      </p>

      <CurrencyToggle />

      {loading ? (
        <div className="quote" style={{ padding: "32px 26px", color: "var(--silver-dim)" }}>
          Calculating fare…
        </div>
      ) : (
        <div className="quote">
          {/* Header */}
          <div className="quote-head">
            <div className="quote-route">
              <div className="qr-text">
                {state.from || "Pickup"} → {state.to || "Destination"}
              </div>
            </div>
            <div className="quote-sub">
              <span className="qs">{dateLabel}</span>
              {state.time && <span className="qs">{state.time}</span>}
              <span className="qs">{state.passengers} pax</span>
              {selectedVehicle && <span className="qs">{selectedVehicle.name}</span>}
            </div>
          </div>

          {/* Line items — each engine amount scaled by the vehicle multiplier */}
          <div className="quote-lines">
            {lineItems.map((item, i) => (
              <div key={i} className="qline">
                <span className="ql-l">{item.label}</span>
                <span className="ql-r">
                  {formatMoney(item.amount * vehicleMult, state.currency)}
                </span>
              </div>
            ))}

            {/* Tax line */}
            <div className="qline muted">
              <span className="ql-l">Government &amp; facility tax (6%)</span>
              <span className="ql-r">{formatMoney(tax, state.currency)}</span>
            </div>
          </div>

          {/* Total */}
          <div className="qtotal">
            <div className="qt-l">Total fare</div>
            <div className="qt-r">
              <span className="sym">{SYMBOL[state.currency]}</span>
              {/* Strip the leading symbol that formatMoney adds — we already render it in .sym */}
              {formatMoney(total, state.currency).slice(1)}
            </div>
          </div>
        </div>
      )}

      <div className="qnote">
        <span className="diamond" style={{ marginTop: "5px" }} />
        <span>
          Fares are fixed for the route and party shown. The 6% government &amp; facility tax is already included in your total.
        </span>
      </div>
    </div>
  );
}
