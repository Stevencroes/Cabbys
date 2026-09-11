// §10 — the positioning section. Four pillars, thin borders, minimal marks,
// and a great deal of air: the premium reads as restraint, not decoration.
import { useEffect, useState } from "react";
import { SplitHeading } from "./motion";

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

/* The four the brand actually rests on — private, fixed, on time, known
   driver — in the order a traveller worries about them. What was here was
   "Always On Time / Comfort & Safety / Fixed & Transparent Prices / 24/7
   Customer Support": four claims any transfer company could make, and
   PRIVATE, the one thing that separates this from a taxi rank, was not
   among them. It appeared nowhere on the page.
   Every claim below is one the FAQ further down already stands behind. */
const PILLARS = [
  {
    title: "Private, start to finish",
    body: "Your group and your driver. No sharing, and no detour to drop someone else off.",
    icon: <><circle cx="9.2" cy="9.4" r="3.1" /><path d="M3.4 19c.6-3.4 2.9-5.2 5.8-5.2s5.2 1.8 5.8 5.2" /><path d="M15.8 7.4a3 3 0 0 1 0 5.5" /><path d="M17.6 19c-.25-1.6-.9-3-1.9-3.9" /></>,
  },
  {
    title: "The price is the price",
    body: "Quoted before you book, and it does not move — not for traffic, not for a late flight.",
    icon: <><path d="M11.4 3.4 3.6 11.2a1.6 1.6 0 0 0 0 2.3l6.9 6.9a1.6 1.6 0 0 0 2.3 0l7.8-7.8V3.4Z" /><circle cx="16.4" cy="7.6" r="1.5" /></>,
  },
  {
    title: "There before you are",
    body: "We track your flight from takeoff. Land three hours late and your driver is still waiting.",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 2" /></>,
  },
  {
    title: "You know who's coming",
    body: "Your driver's name, photo, plate and phone number, sent the morning you travel.",
    icon: <><path d="M12 3.2 4.6 6.2v5.3c0 4.2 3 8 7.4 9.3 4.4-1.3 7.4-5.1 7.4-9.3V6.2Z" /><path d="M9.2 12.2l2 2 3.6-3.8" /></>,
  },
];

export default function HowItWorks() {
  const phone = useIsPhone();
  const [open, setOpen] = useState<string | null>(PILLARS[0].title);
  return (
    <section className="band" id="services">
      <div className="wrap">
        <div className="sec-head">
          <div className="eyebrow rise">Why Cabby's</div>
          <SplitHeading className="sec" parts={[{ text: "Nothing about this " }, { text: "should be a surprise.", em: true }]} />
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
