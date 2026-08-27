// §11 — the vehicle section. Premium automotive product cards: the car, its
// name, what it holds, and the fare it starts from. Names, capacities and
// "from" prices are bound to the app's own data (vehicles.ts + the quote
// engine), never written into the markup.
import { useEffect, useState } from "react";
import { SplitHeading } from "./motion";
import { VEHICLES } from "../data/vehicles";
import { loadPricing, type Pricing } from "../lib/pricing";
import { quote, usd } from "../lib/quote";
import { AIRPORT, placeById, selFromPlace } from "../data/places";
import { useStartBooking } from "../booking/useStartBooking";

// Representative popular route for the indicative "from" fare.
const SAMPLE_TO = "palm-beach";

export default function Fleet() {
  const startBooking = useStartBooking();
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
          <div className="sec-head">
            <div>
              <div className="eyebrow rise">Our vehicles</div>
              <SplitHeading className="sec" parts={[{ text: "Choose your perfect ride." }]} />
            </div>
            <button type="button" className="lnk-ghost" onClick={() => startBooking()}>
              View all vehicles
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
                strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 10h13M11 5l5 5-5 5" />
              </svg>
            </button>
          </div>

          <div className="fgrid stagger">
            {VEHICLES.map((v) => {
              const from = to
                ? quote({ from: selFromPlace(AIRPORT), to: selFromPlace(to), vehicle: v, isReturn: false, pricing })
                : null;
              return (
                <button type="button" className="fcard" key={v.id} onClick={() => startBooking({ vehicle: v.id })}>
                  <span className="fshot">
                    <img src={v.photo} alt="" loading="lazy" decoding="async" />
                  </span>
                  <span className="fmeta">
                    <span className="fname">{v.name}</span>
                    <span className="fpax">1&ndash;{v.pax} Passengers</span>
                  </span>
                  {from && (
                    <span className="ffrom">
                      <span className="fl">From</span>
                      <span className="fv">{usd(from.totalUsd)}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
