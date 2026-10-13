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
    ran two screens tall to show four cars. Below 1120px it is the rail, as
    the reference draws its row: the next card cut off at the edge.

    1120, not 900: four across between those widths left a card 159-191px
    of plate, and "12 guests · 12 bags" has to share one line with its
    fare (globals.css, the plate). Four columns start where four fit. */
const PHONE = "(max-width:1119px)";

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

/** "1 bag", "4 bags". The fleet has no car that takes one of anything
    today; the data is allowed to, and a card reading "1 bags" would be the
    one thing on it nobody could unsee. */
function unit(n: number, one: string): string {
  return n === 1 ? one : `${one}s`;
}

/**
 * What the car holds, in words: "6 guests · 4 bags".
 *
 * It was an 18px line icon and a bare number per figure, with the unit in
 * sr-only text — so the words were in the button's name and nowhere a
 * sighted guest could read them, and a silhouette of two heads beside a 3
 * asked them to decode which number was people. The owner asked for the
 * words, quietly: one line, no icons, no pills. The number keeps the
 * brighter step so it is still the thing the eye lands on; the unit and
 * the dot sit back. The dot is aria-hidden — the button's name reads
 * "6 guests 4 bags", not "6 guests middle dot 4 bags".
 */
function Holds({ pax, bags }: { pax: number; bags: number }) {
  return (
    <span className="fspec">
      <span className="fsp"><span className="n">{pax}</span> {unit(pax, "guest")}</span>
      <span className="fsep" aria-hidden="true">·</span>
      <span className="fsp"><span className="n">{bags}</span> {unit(bags, "bag")}</span>
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
      follow the scroll, not the last button anyone pressed.
      The leftmost card, not the last one seen: an observer marked whichever
      card crossed into view LAST, so with three cards showing (the rail
      runs to 1119px) the third dot lit while the first card sat at the
      left. At the end of the rail the last dot lights, since the last card
      can never reach the left edge. */
  useEffect(() => {
    const rail = railRef.current;
    if (!phone || !rail) return;
    const cards = [...rail.querySelectorAll<HTMLElement>(".fcard")];
    let frame = 0;
    const sync = () => {
      frame = 0;
      const left = rail.scrollLeft;
      const scrolls = rail.scrollWidth > rail.clientWidth + 2;
      if (scrolls && left + rail.clientWidth >= rail.scrollWidth - 2) {
        setActive(cards.length - 1);
        return;
      }
      const base = cards[0]?.offsetLeft ?? 0;
      // the first card whose middle is still right of the rail's left edge
      const i = cards.findIndex((c) => c.offsetLeft - base + c.offsetWidth / 2 > left);
      setActive(Math.max(0, i));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(sync); };
    sync();
    rail.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      rail.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
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
                      <Holds pax={v.pax} bags={v.bags} />
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
