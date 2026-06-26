import { VEHICLES } from "../data/vehicles";

export default function Fleet() {
  return (
    <section className="fleet" id="fleet">
      <div className="wrap">
        <div className="section-label">The fleet</div>
        <div className="fleet-grid">
          {VEHICLES.map((v) => (
            <div className="fcard" key={v.id}>
              <div className="fname">{v.name}</div>
              <div className="cap">
                <span><b>{v.pax}</b> passengers</span>
                <span><b>{v.bags}</b> bags</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
