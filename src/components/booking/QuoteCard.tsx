// §08 — the hero booking card. One way or return, five answers in a row,
// and the way on. It no longer quotes: the mockup asks for availability
// first and shows money once the route is real, so the rate card is loaded
// by the flow that spends it rather than by the card that opens it.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import PlaceCombobox from "./PlaceCombobox";
import DateField from "./DateField";
import TimeField from "./TimeField";
import { todayInAruba } from "../../lib/datetime";
import { isOnIsland, locate } from "../../lib/geo";
import { AIRPORT, AIRPORT_ID, selFromCustom, selFromPlace } from "../../data/places";
import { MAX_PAX } from "../../data/vehicles";
import { CARD_ID } from "../../booking/useStartBooking";

export default function QuoteCard() {
  const { state, setField, open } = useBooking();
  const [hint, setHint] = useState("");
  const [locMsg, setLocMsg] = useState("");
  const onIsland = useMemo(() => isOnIsland(), []);
  const fromInput = useRef<HTMLInputElement | null>(null);
  const toInput = useRef<HTMLInputElement | null>(null);

  // ── the underline that slides between the two tabs ──────────────────
  // It was a ::after on whichever button was .on, which cannot move: the
  // mark vanished from one word and appeared under the other. One bar,
  // measured onto the active tab, is the same mark travelling.
  //
  // Geometry has to be read rather than assumed — the two labels are
  // different widths, and "One Way" is a different width again once
  // Inter has loaded and the fallback stops standing in for it. So this
  // re-measures on the tab change, on resize, and whenever the strip's
  // own box changes, which is what catches the font swap.
  const tabs = useRef<HTMLDivElement>(null);
  const [ink, setInk] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const strip = tabs.current;
    if (!strip) return;
    const measure = () => {
      const on = strip.querySelector<HTMLElement>("button.on");
      if (!on) return;
      // inset by the button's own padding so the bar is the width of the
      // words, not of the hit area — read from the element so the number
      // lives in one place, the stylesheet
      const box = getComputedStyle(on);
      const l = parseFloat(box.paddingLeft) || 0;
      const r = parseFloat(box.paddingRight) || 0;
      const w = on.offsetWidth - l - r;
      if (w > 0) setInk({ x: on.offsetLeft + l, w });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(strip);
    return () => ro.disconnect();
  }, [state.journey]);

  // ── the button's departure state ────────────────────────────────────
  // A short beat between the press and the overlay, so the press is
  // acknowledged by the control rather than only by the screen changing
  // underneath it. Not a spinner: nothing on this page loops. The label
  // dims and the arrow leaves to the right, which says "going" in the
  // same vocabulary the hover already uses.
  const [busy, setBusy] = useState(false);
  const leaving = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(leaving.current), []);

  // §3.8 — planning from abroad: pickup pre-fills to the airport; guests
  // already on the island get an empty form (they know where they are).
  useEffect(() => {
    if (!onIsland && !state.from) setField("from", selFromPlace(AIRPORT));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLocate() {
    const res = await locate();
    setLocMsg(res.message);
    if (res.ok && res.area) {
      setField("from", selFromCustom(`Near ${res.area.name}`, res.area));
    } else {
      // off-island or denied — fall back kindly to the airport
      setField("from", selFromPlace(AIRPORT));
    }
  }

  // The card asks the ONE time question the route actually has. An airport
  // pickup is timed off the landing, a departure off the take-off, and the
  // driver's moment is worked out from there — so asking for a "pickup time"
  // on an airport run collects a number nothing uses and then asks for the
  // flight anyway. The flow downstream never asks the hour twice.
  const fromAirport = state.from?.id === AIRPORT_ID;
  const toAirport = state.to?.id === AIRPORT_ID;
  const when = fromAirport
    ? { label: "Flight lands", ph: "Landing", key: "flightLanding" as const, value: state.flightLanding }
    : toAirport
    ? { label: "Flight departs", ph: "Departure", key: "depTime" as const, value: state.depTime }
    : { label: "Time", ph: "Pick up", key: "pickupTime" as const, value: state.pickupTime };

  // Continue is never disabled — an empty field gets focus and a reason.
  function handleContinue() {
    // The re-entry guard, rather than `disabled` on the button. Disabling a
    // control the moment it is pressed drops focus to the body, so a
    // keyboard user is left nowhere while the overlay mounts; aria-busy
    // says the same thing to a screen reader and costs nobody their place.
    if (busy) return;
    if (!state.from) {
      setHint("Tell us where to pick you up first.");
      fromInput.current?.focus();
      return;
    }
    if (!state.to) {
      setHint("And where you're headed.");
      toInput.current?.focus();
      return;
    }
    if (state.from.id === state.to.id) {
      setHint("Pickup and drop-off are the same place — change one of them.");
      toInput.current?.focus();
      return;
    }
    if (!when.value) {
      setHint(fromAirport ? "When does your flight land? Set the hour, minutes and AM/PM."
        : toAirport ? "When does your flight leave? Set the hour, minutes and AM/PM."
        : "What time should the car be there? Set the hour, minutes and AM/PM.");
      document.getElementById("q-time")?.focus();
      return;
    }
    setHint("");
    setBusy(true);
    leaving.current = window.setTimeout(() => {
      setBusy(false);
      open(); // everything already lives in context — nothing is asked twice
    }, 220);
  }

  const Pin = (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 18s6-6.5 6-10a6 6 0 1 0-12 0c0 3.5 6 10 6 10z" /><circle cx="10" cy="8" r="2" />
    </svg>
  );

  return (
    // Every "Book now" on the site lands here when it has no route to
    // open the flow with, so the card needs a name to be scrolled to.
    <div className="quote rise" id={CARD_ID}>
      {/* §08 — one way or return, then the five answers in a row, then the
          way on. The card carries no fare: the mockup asks for availability
          first and shows the money once the route is real. */}
      <div className="qtabs" role="tablist" aria-label="Trip type" ref={tabs}>
        <button type="button" role="tab" aria-selected={state.journey === "one"}
          className={state.journey === "one" ? "on" : ""}
          onClick={() => setField("journey", "one")}>One Way</button>
        <button type="button" role="tab" aria-selected={state.journey === "return"}
          className={state.journey === "return" ? "on" : ""}
          onClick={() => setField("journey", "return")}>Round Trip</button>
        {/* scaleX on a 1px bar, not a width — the slide stays on the
            compositor. Held at opacity 0 until it has been measured, or it
            flashes at x=0 on the first paint. */}
        <span className="qtab-ink" aria-hidden="true"
          style={ink ? { opacity: 1, transform: `translateX(${ink.x}px) scaleX(${ink.w})` } : undefined} />
      </div>

      <div className="qrow">
        <div className="qcell">
          <PlaceCombobox
            label="From"
            value={state.from}
            onSelect={(sel) => setField("from", sel)}
            placeholder={onIsland ? "Where are you now?" : "Airport, Hotel, Address"}
            inputRef={fromInput}
            icon={Pin}
          />
        </div>

        <div className="qcell">
          <PlaceCombobox
            label="To"
            value={state.to}
            onSelect={(sel) => setField("to", sel)}
            placeholder="Hotel, Address, Destination"
            inputRef={toInput}
            icon={Pin}
          />
        </div>

        <div className="qcell qcell-date">
          <DateField
            id="q-date"
            label="Date"
            value={state.date}
            min={todayInAruba()}
            onChange={(iso) => setField("date", iso)}
            compact
          />
        </div>

        {/* The hour, asked once, in the terms the route puts it in. */}
        <div className="qcell qcell-time">
          <TimeField
            id="q-time"
            label={when.label}
            value={when.value}
            onChange={(t) => setField(when.key, t)}
            placeholder={when.ph}
            hideZone
          />
        </div>

        <div className="qcell qcell-pax">
          <label className="qpax" htmlFor="q-pax">
            <span className="qpax-l">Passengers</span>
            <select id="q-pax" value={state.pax} onChange={(e) => setField("pax", +e.target.value)}>
              {Array.from({ length: MAX_PAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} Passenger{n > 1 ? "s" : ""}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {onIsland && (
        <button type="button" className="qloc" onClick={handleLocate}>Use my location</button>
      )}
      {locMsg && <div className="qhint" role="status">{locMsg}</div>}
      {hint && <div className="qhint" role="alert">{hint}</div>}

      <div className="qgo">
        <button type="button" className={`qbtn${busy ? " busy" : ""}`}
          aria-busy={busy} onClick={handleContinue}>
          <span className="qbtn-l">Get your fixed price</span>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 10h13M11 5l5 5-5 5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
