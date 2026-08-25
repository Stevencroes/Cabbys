// §10 — the positioning section. Four pillars, thin borders, minimal marks,
// and a great deal of air: the premium reads as restraint, not decoration.
import { useEffect, useState } from "react";
import { SplitHeading } from "./motion";
import { useBookingOptional } from "../booking/BookingContext";

/** The mockup gives the pillars two forms: four columns on a desktop, and a
    list you open one at a time on a phone. That is a change of COMPONENT,
    not of layout — a collapsed panel has to be genuinely collapsed for a
    screen reader too — so the breakpoint is read here rather than faked in
    CSS with content that is visible but announced as hidden. */
function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width:560px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);
  return phone;
}

const PILLARS = [
  {
    title: "Always On Time",
    body: "We monitor your flight and adjust for delays. We're always there when you land.",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></>,
  },
  {
    title: "Comfort & Safety",
    body: "Modern vehicles, professional drivers and your safety as our top priority.",
    icon: <><path d="M12 3.2 4.6 6.2v5.3c0 4.2 3 8 7.4 9.3 4.4-1.3 7.4-5.1 7.4-9.3V6.2Z" /><path d="M9.2 12.2l2 2 3.6-3.8" /></>,
  },
  {
    title: "Fixed & Transparent Prices",
    body: "No surprises or hidden fees. The price you see is the price you pay.",
    icon: <><path d="M11.4 3.4 3.6 11.2a1.6 1.6 0 0 0 0 2.3l6.9 6.9a1.6 1.6 0 0 0 2.3 0l7.8-7.8V3.4Z" /><circle cx="16.4" cy="7.6" r="1.5" /></>,
  },
  {
    title: "24/7 Customer Support",
    body: "We're here for you anytime. Before, during and after your trip.",
    icon: <><path d="M4.8 13.4v-1.6a7.2 7.2 0 0 1 14.4 0v1.6" /><rect x="2.6" y="12.6" width="4.2" height="6" rx="1.7" /><rect x="17.2" y="12.6" width="4.2" height="6" rx="1.7" /></>,
  },
];

export default function HowItWorks() {
  const booking = useBookingOptional();
  const phone = useIsPhone();
  const [open, setOpen] = useState<string | null>(PILLARS[0].title);
  return (
    <section className="band" id="services">
      <div className="wrap">
        <div className="sec-head">
          <div>
            <div className="eyebrow rise">Why choose Cabby's</div>
            <SplitHeading className="sec" parts={[{ text: "Service that sets the standard." }]} />
          </div>
          <button type="button" className="lnk-ghost" onClick={() => booking?.open()}>
            See all services
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 10h13M11 5l5 5-5 5" />
            </svg>
          </button>
        </div>

        <div className={`pillars stagger${phone ? " pillars-list" : ""}`}>
          {PILLARS.map((p) => {
            const mark = (
              <span className="pmark" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
                  {p.icon}
                </svg>
              </span>
            );
            if (!phone) {
              return (
                <div className="pillar" key={p.title}>
                  {mark}
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              );
            }
            const isOpen = open === p.title;
            const id = `pillar-${p.title.replace(/\W+/g, "-").toLowerCase()}`;
            return (
              <div className={`pillar${isOpen ? " on" : ""}`} key={p.title}>
                <h3>
                  <button type="button" aria-expanded={isOpen} aria-controls={id}
                    onClick={() => setOpen(isOpen ? null : p.title)}>
                    {mark}
                    <span className="ptitle">{p.title}</span>
                    <svg className="pchev" width="18" height="18" viewBox="0 0 20 20" fill="none"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M6 8l4 4 4-4" />
                    </svg>
                  </button>
                </h3>
                {isOpen && <p id={id}>{p.body}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
