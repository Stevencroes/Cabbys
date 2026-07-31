import { SplitHeading } from "./motion";
import SunGraphic from "./SunGraphic";
import { useBookingOptional } from "../booking/BookingContext";

export default function Closer() {
  const booking = useBookingOptional();
  return (
    <section className="closer">
      <div className="wrap">
        <SplitHeading parts={[{ text: "Your car is " }, { text: "already waiting.", em: true }]} />
        <div className="ctag rise">Cabby's · Sent for you · Aruba</div>
        <button type="button" className="cbtn rise" onClick={() => booking?.open()}>
          Book your transfer
        </button>
      </div>
      <div className="csun par" data-speed="-.04" aria-hidden="true">
        <div className="sun-rise"><div className="sun-float">
          <SunGraphic variant="closer" />
        </div></div>
      </div>
    </section>
  );
}
