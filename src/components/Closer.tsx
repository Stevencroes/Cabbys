import { SplitHeading } from "./motion";
import { useStartBooking } from "../booking/useStartBooking";

export default function Closer() {
  const startBooking = useStartBooking();
  return (
    <section className="closer">
      <div className="wrap">
        {/* The same step as the hero headline, on purpose. This is the
            second time the page asks for the booking and the first time it
            asked is the only thing it has to feel like. */}
        <SplitHeading
          step={0.045}
          parts={[{ text: "Your car is " }, { text: "already waiting.", em: true }]}
        />
        <div className="ctag rise">Cabby's · Sent for you · Aruba</div>
        <button type="button" className="cbtn rise" onClick={() => startBooking()}>
          Book your transfer
        </button>
      </div>
    </section>
  );
}
