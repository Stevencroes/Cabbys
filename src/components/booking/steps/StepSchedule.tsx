import { useBooking } from "../../../booking/BookingContext";

const QUICK_TIMES = [
  { label: "This morning", time: "09:00", desc: "09:00" },
  { label: "This afternoon", time: "14:00", desc: "14:00" },
  { label: "This evening", time: "18:00", desc: "18:00" },
  { label: "Tonight", time: "21:00", desc: "21:00" },
  { label: "Dawn", time: "05:00", desc: "05:00" },
];

export default function StepSchedule() {
  const { state, setField } = useBooking();

  function handleQuickTime(time: string) {
    setField("time", time);
  }

  return (
    <div>
      <div className="step-eyebrow">Scheduling</div>
      <h2 className="step-title">When shall the car arrive?</h2>
      <p className="step-desc">
        Booked to the minute and held for you. Late-evening journeys carry a quiet
        surcharge, shown in your fare.
      </p>

      <div className="field-pair" style={{ marginTop: "32px" }}>
        <div>
          <div className="loc-block" style={{ marginTop: "0" }}>
            <div className="field-label">Date</div>
            <input
              className="txt"
              type="date"
              value={state.date}
              onChange={(e) => setField("date", e.target.value)}
            />
          </div>
        </div>
        <div>
          <div className="loc-block" style={{ marginTop: "0" }}>
            <div className="field-label">Time</div>
            <input
              className="txt"
              type="time"
              value={state.time}
              onChange={(e) => setField("time", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="loc-block">
        <div className="field-label">Quick choice</div>
        <div className="opt-list">
          {QUICK_TIMES.map((qt) => {
            const isOn = state.time === qt.time;
            return (
              <button
                key={qt.time}
                type="button"
                className={["opt", isOn ? "on" : ""].filter(Boolean).join(" ")}
                onClick={() => handleQuickTime(qt.time)}
              >
                <span className="opt-l">
                  <span className="opt-ico">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <span>
                    <div className="opt-name">{qt.label}</div>
                    <div className="opt-meta">{qt.desc}</div>
                  </span>
                </span>
                <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
