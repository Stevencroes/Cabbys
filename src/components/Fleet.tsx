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

/** The width the carousel takes over at. The cards are portrait now, and two
    columns of them on a tablet were 460px of photograph each — the section
    ran two screens tall to show four cars. Below 900px it is the rail, as
    the reference draws its row: the next card cut off at the edge. */
const PHONE = "(max-width:899px)";

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

/** §07's line icons — a 20px grid, one weight — for the two numbers a car
    is chosen by. Two figures, not one: "guests" is a group. */
const GUESTS = <><circle cx="8" cy="6.8" r="2.8" /><path d="M2.6 16.5c.5-3 2.7-4.7 5.4-4.7s4.9 1.7 5.4 4.7" /><path d="M12.7 4.3a2.8 2.8 0 0 1 0 5.1M14.7 11.9c1.5.6 2.4 2.1 2.7 4.6" /></>;
const BAGS = <><rect x="4" y="6.6" width="12" height="10.4" rx="1.6" /><path d="M7.6 6.6V4.9c0-.7.5-1.2 1.2-1.2h2.4c.7 0 1.2.5 1.2 1.2v1.7M7.6 9.6v4.4M12.4 9.6v4.4" /></>;

function Spec({ icon, n, unit }: { icon: React.ReactNode; n: number; unit: string }) {
  return (
    <span className="fsp">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor"
        strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {icon}
      </svg>
      {n}
      {/* the icon is the unit for the eye; the button's name needs the word */}
      <span className="sr-only"> {unit}</span>
    </span>
  );
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
                    {/* What it holds on the left, what it costs on the right.
                        The reference puts the fare beside the name; four
                        across, "Luxury Sprinter" and "From $82" do not both
                        fit one line, and the name is the one that cannot be
                        cut. Guests AND bags: two people with four suitcases
                        do not fit the car that seats three. */}
                    <span className="fline">
                      <span className="fspec">
                        <Spec icon={GUESTS} n={v.pax} unit="guests" />
                        <Spec icon={BAGS} n={v.bags} unit="bags" />
                      </span>
                      {from && (
                        <span className="ffrom">
                          <span className="fl">From</span>
                          <span className="fv">{usd(from.totalUsd)}</span>
                        </span>
                      )}
                    </span>
                  </span>
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
