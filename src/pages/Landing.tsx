import Nav from "../components/Nav";
import Hero from "../components/Hero";
import HowItWorks from "../components/HowItWorks";
import Ethos from "../components/Ethos";
import Fleet from "../components/Fleet";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";

export default function Landing() {
  const { openAuth } = useAuthModal();
  return (
    <>
      <Nav onSignIn={openAuth} />
      <Hero />
      {/* section rhythm: Midnight hero → Steel → Ocean → Mist → Midnight */}
      <HowItWorks />
      <Fleet />
      <Ethos />
      <Footer />
    </>
  );
}
