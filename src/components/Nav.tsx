import { useBookingOptional } from "../booking/BookingContext";

const LINKS = [
  { label: "How it works", href: "/#how" },
  { label: "Fleet", href: "/#fleet" },
  { label: "FAQ", href: "/#faq" },
  { label: "My trips", href: "/trips" },
];

export default function Nav({ onSignIn }: { onSignIn: () => void }) {
  const booking = useBookingOptional();
  return (
    <nav className="nav">
      <div className="wrap">
        <div className="navbar-inner">
          <a href="/" className="brand" aria-label="Cabby's — Home">Cabby<span className="ap">'</span>s</a>
          <div className="nlinks">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </div>
          <div className="nright">
            <button type="button" className="nsign" onClick={onSignIn}>Sign in</button>
            <button type="button" className="nbtn" onClick={() => booking?.open()}>
              Book a transfer
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
