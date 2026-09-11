import Closer from "./Closer";

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
  return (
    <footer id="contact" className={`site-foot${closing ? " closing" : ""}`}>
      {closing && <Closer />}
      <div className="wrap">
        <div className="ftop">
          <div>
            <div className="fbrand">Cabby<span className="ap">'</span>s</div>
            <p>Private fixed-price transfers across Aruba. Sent for you — door to door.</p>
          </div>
          <div className="fcols">
            <div className="fcol">
              <h4>Transfers</h4>
              <a href="/#how">Airport pickup</a>
              <a href="/#how">Resort to resort</a>
              <a href="/#how">Cruise terminal</a>
              <a href="/#faq">Hourly hire</a>
            </div>
            <div className="fcol">
              <h4>Company</h4>
              <a href="/#fleet">The fleet</a>
              <a href="/#faq">FAQ</a>
              <a href="/trips">My trips</a>
              <a href="/#faq">Terms &amp; privacy</a>
            </div>
            <div className="fcol">
              <h4>Reach us</h4>
              <a href="mailto:hello@cabbys.aw">hello@cabbys.aw</a>
              <a href="https://wa.me/" target="_blank" rel="noreferrer">WhatsApp</a>
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
