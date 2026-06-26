import Icon from "./Icon";

export default function Ethos() {
  return (
    <section className="ethos" id="ethos">
      <div className="wrap">
        <div className="section-label">Why a quiet arrival matters</div>
        <div className="ethos-grid">
          <div className="ecard">
            <div className="ico">
              <Icon name="spark" />
            </div>
            <h3>Settled in advance</h3>
            <p>Your fare is fixed and shown in full before you confirm — government tax included, nothing added at the door. No meters, no surge, no surprise.</p>
          </div>
          <div className="ecard">
            <div className="ico">
              <Icon name="map" />
            </div>
            <h3>Met at the gate</h3>
            <p>Arriving at Queen Beatrix, your driver is waiting as you clear the doors. Direct to the Renaissance, the Ritz-Carlton, or wherever the evening leads.</p>
          </div>
          <div className="ecard">
            <div className="ico">
              <Icon name="clock" />
            </div>
            <h3>On your hour</h3>
            <p>Booked to the minute and held for you. Sunset at Eagle Beach, a chef's table in Oranjestad, a flight at dawn — the car keeps your time, not the other way around.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
