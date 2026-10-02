// How it works — what happens after you book, in the order it happens.
//
// The page sold the benefits ("Why Cabby's", HowItWorks.tsx — misnamed,
// it holds the pillars) and never said what happens after a guest presses
// Book. Each step is one the product keeps: the fixed price with nothing
// taken up front (cash, src/lib/rides.ts books guest-first), the
// confirmation email (buildGuestEmail), the driver email (buildDriverEmail)
// and the arrivals-hall sign.
//
// One short line a step, at the owner's word ("keep it minimal — a lot of
// typing"). The first version spelled out the sender address, the
// short-notice WhatsApp window, both waiting times and the My trips phone
// number; those live in the FAQ, the emails and the booking flow, where a
// guest meets them when they matter. Landing.test pins this strip against
// the promises the page once made and the product never kept.
import { SplitHeading } from "./motion";

/** The section's anchor — the nav and the footer sitemap both point here. */
export const STEPS_ID = "how-it-works";

const STEPS: { title: string; body: string }[] = [
  { title: "Book", body: "Pick your route, car and time. See the fixed price, and pay nothing now." },
  { title: "Get confirmed", body: "Your confirmation email arrives straight away." },
  { title: "Meet your driver", body: "We email their name, car and plate. At the airport they wait in arrivals with your name on a sign." },
  { title: "Ride and pay", body: "Pay your driver in cash at the end, in US dollars or florins." },
];

export default function Steps() {
  return (
    <section className="band steps-band" id={STEPS_ID}>
      <div className="wrap">
        <div className="sec-head">
          <div className="eyebrow rise">How it works</div>
          <SplitHeading className="sec" parts={[{ text: "What happens " }, { text: "after you book.", em: true }]} />
        </div>

        {/* role="list" is not redundant. The markers are drawn, so the list
            has list-style:none, and Safari/VoiceOver drops the list role from
            a list styled that way — the "1 of 4" that makes this an ordered
            sequence would be gone for exactly the reader who cannot see the
            numerals. The numerals are aria-hidden for the same reason: the
            list already announces the position, and "1, Book in…" read out
            after "1 of 4" says it twice. */}
        <ol className="steps stagger" role="list">
          {STEPS.map((s, i) => (
            <li className="step" key={s.title}>
              <span className="snum" aria-hidden="true">{i + 1}</span>
              <div className="sbody">
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
