// TODO(Task 7): replace with import { VEHICLES } from "../data/vehicles"
const FLEET = [
  { id: "sedan",   name: "Executive Sedan",  cls: "Executive",  pax: 3, bags: 3 },
  { id: "premium", name: "Premium Sedan",    cls: "Premium",    pax: 3, bags: 3 },
  { id: "suv",     name: "Luxury SUV",       cls: "Luxury",     pax: 6, bags: 5 },
  { id: "van",     name: "Private Van",      cls: "Private",    pax: 7, bags: 8 },
];

export default function Fleet() {
  return (
    <section className="fleet" id="fleet">
      <div className="wrap">
        <div className="section-label">The fleet</div>
        <div className="fleet-grid">
          {FLEET.map((v) => (
            <div className="fcard" key={v.id}>
              <div className="cls">{v.cls}</div>
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
