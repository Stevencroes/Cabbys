import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Journey from "../components/Journey";
import Fleet from "../components/Fleet";
import Reviews from "../components/Reviews";
import Faq from "../components/Faq";
import Footer from "../components/Footer";
import { useRevealObserver } from "../components/motion";
import { useAuthModal } from "../components/auth/AuthModal";

export default function Landing() {
  const { openAuth } = useAuthModal();
  useRevealObserver();
  return (
    <>
      <Nav onSignIn={openAuth} />
      <Hero />
      {/* The process straight under the card that starts it: a guest
          hovering over "Book" is asking what happens if they press it,
          and the answer — nothing charged, an email, a named driver, a
          sign in arrivals — is what lets them press it. Each reason to
          book rides on the stop where it is true, so the steps and the
          "why" are one section, not a claim repeated twice. */}
      <Journey />
      <Fleet />
      <Reviews />
      <Faq />
      <Footer closing />
    </>
  );
}
