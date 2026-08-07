export default function Footer() {
  return (
    <footer className="site-foot">
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
          <span>Cormorant Garamond · Jost</span>
        </div>
      </div>
    </footer>
  );
}
