import Diamond from "./Diamond";

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-row">
          <div className="foot-brand">
            <div className="name">Cabby's</div>
            <div className="tg"><Diamond />&nbsp;Arrive in silence</div>
            <p>Private, fixed-price transfers across Aruba. Booked from anywhere, settled before you land.</p>
          </div>
          <div className="foot-cols">
            <div className="foot-col">
              <h4>Service</h4>
              <a href="#">Book a transfer</a>
              <a href="#fleet">The fleet</a>
              <a href="#ethos">How it works</a>
              <a href="/trips">My trips</a>
            </div>
            <div className="foot-col">
              <h4>Island</h4>
              <a href="#">Queen Beatrix Airport</a>
              <a href="#">Resort partners</a>
              <a href="#">Dining &amp; sunset runs</a>
              <a href="#">Contact</a>
            </div>
          </div>
        </div>
        <div className="foot-base">
          <span>© 2026 Cabby's Aruba. Fares shown in US dollars.</span>
          <span>Privacy · Terms · A 6% government &amp; facility tax applies to every fare.</span>
        </div>
      </div>
    </footer>
  );
}
