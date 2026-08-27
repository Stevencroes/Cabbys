import { SplitHeading } from "./motion";
import { useStartBooking } from "../booking/useStartBooking";

export default function Closer() {
  const startBooking = useStartBooking();
  return (
    <section className="closer">
      <div className="wrap">
        <SplitHeading parts={[{ text: "Your car is " }, { text: "already waiting.", em: true }]} />
        <div className="ctag rise">Cabby's · Sent for you · Aruba</div>
        <button type="button" className="cbtn rise" onClick={() => startBooking()}>
          Book your transfer
        </button>
      </div>
    </section>
  );
}
