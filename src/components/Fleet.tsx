// Fleet — full-bleed bone-2 band. Names, capacities and "from" fares are
// bound to the app's data (vehicles.ts + the quote engine), never hardcoded.
import { useEffect, useState } from "react";
import { SplitHeading } from "./motion";
import { VEHICLES } from "../data/vehicles";
import { loadPricing, type Pricing } from "../lib/pricing";
import { quote, usd } from "../lib/quote";
import { AIRPORT, placeById, selFromPlace } from "../data/places";
import { useBookingOptional } from "../booking/BookingContext";

// Representative popular route for the indicative "from" fare.
const SAMPLE_TO = "palm-beach";

export default function Fleet() {
  const booking = useBookingOptional();
  const [pricing, setPricing] = useState<Pricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((pr) => !cancelled && setPricing(pr));
    return () => { cancelled = true; };
  }, []);

  const to = placeById(SAMPLE_TO);

  return (
    <section id="fleet">
      <div className="fleet flow">
        <div className="inner">
          <div className="eyebrow rise" style={{ color: "var(--silver)" }}>02 — The fleet</div>
          <SplitHeading className="sec" parts={[{ text: `${VEHICLES.length === 3 ? "Three" : "Four"} cars. ` }, { text: "All spotless.", em: true }]} />
          <div className="fgrid stagger">
            {VEHICLES.map((v) => {
              const from = to
                ? quote({ from: selFromPlace(AIRPORT), to: selFromPlace(to), vehicle: v, isReturn: false, pricing })
                : null;
              return (
                <div className="fcard" key={v.id}>
                  <div className="fbar"><span className="fc">{v.classLabel}</span></div>
                  <div className="fbody">
                    <h3>{v.name}</h3>
                    <div className="fm">{v.desc}</div>
                    <div className="fspecs">
                      <div>Guests<b>{v.pax}</b></div>
                      <div>Bags<b>{v.bags}</b></div>
                    </div>
                    {from && <div className="fprice-line">from<b>{usd(from.totalUsd)}</b></div>}
                    <div className="ffoot">
                      <button type="button" onClick={() => booking?.open({ vehicle: v.id })}>
                        Select this car
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
