import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";
import { VEHICLES, type Vehicle } from "../data/vehicles";
import { fareForVehicle } from "../booking/useFare";
import { loadPricing, type Pricing } from "../lib/pricing";
import { formatMoney } from "../lib/currency";
import type { BookingState } from "../booking/BookingContext";
import { useCountUp } from "../hooks/useCountUp";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";

// Representative popular route used purely for an indicative "from" fare.
const SAMPLE: BookingState = {
  from: "Queen Beatrix International Airport",
  to: "Palm Beach",
  date: new Date().toISOString().slice(0, 10),
  time: "12:00",
  passengers: 2,
  luggage: 2,
  vehicle: null,
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  flightNumber: "",
  notes: "",
  step: 0,
  open: false,
  signedIn: false,
};

function FleetCard({ vehicle, fare, active }: { vehicle: Vehicle; fare: number | null; active: boolean }) {
  const amount = useCountUp(fare ?? 0, active && fare !== null, 800);
  return (
    <RevealItem className="fcard">
      <div className="fname">{vehicle.name}</div>
      <div className="cap">
        <span><b>{vehicle.pax}</b> passengers</span>
        <span><b>{vehicle.bags}</b> bags</span>
      </div>
      <div className="fprice">
        {fare !== null ? (
          <>
            <span className="fprice-from">from</span>
            <span className="fprice-amt">{formatMoney(amount, "USD")}</span>
            <span className="fprice-note">per transfer · incl. tax</span>
          </>
        ) : (
          <span className="fprice-from">Fixed fare on request</span>
        )}
      </div>
    </RevealItem>
  );
}

export default function Fleet() {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const inView = useInView(gridRef, { once: true, amount: 0.3 });

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => !cancelled && setPricing(p));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="fleet" id="fleet">
      <div className="wrap">
        <Reveal>
          <div className="section-label">The fleet</div>
        </Reveal>
        <div ref={gridRef}>
          <RevealGroup className="fleet-grid">
            {VEHICLES.map((v) => (
              <FleetCard
                key={v.id}
                vehicle={v}
                fare={pricing ? fareForVehicle(pricing, SAMPLE, v) : null}
                active={inView}
              />
            ))}
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}
