import Nav from "../components/Nav";
import Hero from "../components/Hero";
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
      <HowItWorks />
      <Fleet />
      <Reviews />
      <Faq />
      <Footer closing />
    </>
  );
}
