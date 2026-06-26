export default function EntryCard({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="entry">
      <div className="entry-head">
        <span className="h">Plan your transfer</span>
        <span className="availpill">
          <span className="pulse"></span>Drivers on the island
        </span>
      </div>
      <div className="chips">
        <span className="chip on">Airport transfer</span>
        <span className="chip">Hotel to hotel</span>
        <span className="chip">By the hour</span>
      </div>
      <div className="route">
        <div className="rfield">
          <span className="ring"></span>
          <div>
            <div className="lbl">From</div>
            <div className="val placeholder">Choose pickup</div>
          </div>
        </div>
        <div className="rconnector"></div>
        <div className="rfield">
          <span className="rdiamond"></span>
          <div>
            <div className="lbl">To</div>
            <div className="val placeholder">Choose destination</div>
          </div>
        </div>
      </div>
      <button className="entry-cta" onClick={onBegin}>
        Begin <span className="arr">→</span>
      </button>
    </div>
  );
}
