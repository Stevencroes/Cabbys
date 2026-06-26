import Nav from "../components/Nav";
import Hero from "../components/Hero";
import Ethos from "../components/Ethos";
import Fleet from "../components/Fleet";
import Footer from "../components/Footer";

export default function Landing({ onOpenBooking }: { onOpenBooking: (journeyKey?: string) => void }) {
  return (
    <>
      <Nav onSignIn={() => onOpenBooking()} />
      <Hero onBegin={(key) => onOpenBooking(key)} />
      <Ethos />
      <Fleet />
      <Footer />
    </>
  );
}
