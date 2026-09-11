// §11 — the vehicle section. Premium automotive product cards: the car, its
// name, what it holds, and the fare it starts from. Names, capacities and
// "from" prices are bound to the app's own data (vehicles.ts + the quote
// engine), never written into the markup.
import { useCallback, useEffect, useRef, useState } from "react";
import { SplitHeading } from "./motion";
import { VEHICLES } from "../data/vehicles";
import { loadPricing, type Pricing } from "../lib/pricing";
import { quote, usd } from "../lib/quote";
import { AIRPORT, placeById, selFromPlace } from "../data/places";
import { useStartBooking } from "../booking/useStartBooking";

// Representative popular route for the indicative "from" fare.
const SAMPLE_TO = "palm-beach";

/** The width the carousel takes over at — the same 520px the grid already
    collapsed to one column at, so there is one breakpoint, not two. */
const PHONE = "(max-width:520px)";

/** Four full-width cards stacked down a phone is four screens of scrolling
    to compare four things, and the section stops being a row you can read
    at a glance. On a phone it becomes one swipeable rail instead — which is
    a change of COMPONENT, not just of layout: the dots below it have to
    exist in the markup or not, so the query is read here rather than faked
    in CSS with controls that are visible but announced either way. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(PHONE);
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return phone;
}

export default function Fleet() {
  const startBooking = useStartBooking();
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const phone = useIsPhone();
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  /** Which card is in front, read from the rail itself rather than from a
      counter we increment — a thumb can stop anywhere, and the dots have to
      follow the scroll, not the last button anyone pressed. */
  useEffect(() => {
    const rail = railRef.current;
    if (!phone || !rail) return;
    const cards = [...rail.querySelectorAll<HTMLElement>(".fcard")];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(cards.indexOf(e.target as HTMLElement));
        }
      },
      { root: rail, threshold: 0.6 },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [phone]);

  const show = useCallback((i: number) => {
    const rail = railRef.current;
    const card = rail?.querySelectorAll<HTMLElement>(".fcard")[i];
    if (!rail || !card) return;
    // scrollTo, not scrollIntoView: the latter scrolls the PAGE to the rail
    // as well, which on a phone jumps the section under the thumb
    rail.scrollTo({
      left: card.offsetLeft - rail.offsetLeft,
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches ? "auto" : "smooth",
    });
  }, []);

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
            <div className="eyebrow rise">Our vehicles</div>
            <SplitHeading className="sec" parts={[{ text: "Pick the one that " }, { text: "fits your group.", em: true }]} />
          </div>

          <div className={`fgrid stagger${phone ? " frail" : ""}`} ref={railRef}>
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
                    {/* Guests AND bags: two people with four suitcases do not
                        fit the car that seats three, and "1–3 Passengers"
                        never said so. The booking step already showed both. */}
                    <span className="fpax">{v.pax} guests &middot; {v.bags} bags</span>
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

          {/* Where you are in the rail, and a way to move it. Not decoration:
              they are the only thing on screen that says four cars exist
              when only one and a sliver of the next are visible. */}
          {phone && (
            <div className="fdots">
              {VEHICLES.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  className={`fdot${i === active ? " on" : ""}`}
                  aria-label={`Show ${v.name}`}
                  aria-current={i === active || undefined}
                  onClick={() => show(i)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
