import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Steps from "../components/Steps";
import HowItWorks from "../components/HowItWorks";
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
          sign in arrivals — is what lets them press it. The reasons
          (HowItWorks, the pillars) follow, where they read as a summary
          of what the steps just showed rather than claims made ahead of
          any evidence. */}
      <Steps />
      <HowItWorks />
      <Fleet />
      <Reviews />
      <Faq />
      <Footer closing />
    </>
  );
}
