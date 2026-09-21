import { useRef } from "react";
import Closer from "./Closer";
import { useRevealOnce } from "./motion";
import { whatsappLink } from "../lib/whatsapp";

// `closing` makes this the landing page's whole closing band: the CTA and
// the sitemap used to be two stacked sections in two different grounds,
// which put a seam right under the one button the page is asking you to
// press. Together they are one element — a single ground, with one hairline
// rather than a colour change separating the close from the small print.
//
// The proof row used to sit in here too, between the closer and the
// sitemap, which gave this band three hairlines of identical weight in
// ~500px and buried the reviews under the fold. It is its own section now,
// up between the fleet and the FAQ — see Reviews.tsx.
//
// The account pages (trips, profile, reset) take the plain footer: nothing
// there is asking for a booking, so nothing there closes.
export default function Footer({ closing = false }: { closing?: boolean }) {
  // The sitemap fades in once, the first time it is scrolled to. Only the
  // sitemap: the closing band above it stages itself word by word and does
  // not want a second opinion about its opacity.
  //
  // Its own observer, not a `.rise` and the page sweep, because this footer
  // also renders on /trips, /profile and /reset — none of which run the
  // page hook, all of which would have ended up with an invisible footer.
  const sitemap = useRef<HTMLDivElement>(null);
  useRevealOnce(sitemap);

  // Through whatsappLink like every other chat link in the app, rather
  // than a hand-written href. This one was hard-coded to "https://wa.me/"
  // with no number on the end — a live link, on every page, that opened
  // WhatsApp's own landing page instead of a chat with Cabby's. It also
  // ignored the switch: whatsappEnabled hides these links everywhere else
  // when no number is set, and this one advertised a channel that could
  // not work. Null when unset, so it disappears with the rest.
  const wa = whatsappLink("Hi Cabby's — I have a question.");
  return (
    <footer id="contact" className={`site-foot${closing ? " closing" : ""}`}>
      {closing && <Closer />}
      <div className="wrap frev" ref={sitemap}>
        <div className="ftop">
          <div>
            <div className="fbrand">Cabby<span className="ap">'</span>s</div>
            <p>Private fixed-price transfers across Aruba. Sent for you — door to door.</p>
          </div>
          <div className="fcols">
            <div className="fcol">
              <h3>Transfers</h3>
              <a href="/#services">Airport pickup</a>
              <a href="/#services">Resort to resort</a>
              <a href="/#services">Cruise terminal</a>
              <a href="/#about">Hourly hire</a>
            </div>
            <div className="fcol">
              <h3>Company</h3>
              <a href="/#fleet">The fleet</a>
              <a href="/#about">FAQ</a>
              <a href="/trips">My trips</a>
              <a href="/#about">Terms &amp; privacy</a>
            </div>
            <div className="fcol">
              <h3>Reach us</h3>
              {/* The address that actually receives mail. What stood here
                  was hello@cabbys.aw — a domain nobody owns yet, so every
                  message sent to it bounced. An address that silently
                  fails is worse than none: the guest believes they have
                  reached us and waits. */}
              <a href="mailto:cabbystransfer@gmail.com">cabbystransfer@gmail.com</a>
              {wa && <a href={wa} target="_blank" rel="noreferrer">WhatsApp</a>}
              <a href="/#top">Oranjestad, Aruba</a>
            </div>
          </div>
        </div>
        <div className="fbot">
          <span>© {new Date().getFullYear()} Cabby's · cabbys.aw · 12.5°N 69.9°W</span>
          <span>Cormorant Garamond · Inter</span>
        </div>
      </div>
    </footer>
  );
}
