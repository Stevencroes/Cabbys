import { useBooking } from "../../booking/BookingContext";

export default function ProgressRail() {
  const { state, STEP_NAMES } = useBooking();

  return (
    <div className="steps">
      {STEP_NAMES.map((name, i) => {
        const isDone = i < state.step;
        const isActive = i === state.step;
        const cls = ["rstep", isDone ? "done" : "", isActive ? "active" : ""]
          .filter(Boolean)
          .join(" ");
        return (
          <div key={name} className={cls}>
            <div className="node" />
            <div className="line" />
            <span className="rlbl">{name}</span>
          </div>
        );
      })}
    </div>
  );
}
