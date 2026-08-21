// The car's portrait on a fleet card. Cut-out PNGs on a transparent ground,
// so they sit on the dark card without a plate of their own.
//
// The photos are the one part of a car row we don't control at build time —
// a file can be missing or renamed. If one fails to load the slot collapses
// and the row falls back to the text-only layout it had before, rather than
// leaving a broken-image box inside a radio button.
import { useState } from "react";
import type { Vehicle } from "../../data/vehicles";

export default function VehiclePhoto({ vehicle }: { vehicle: Vehicle }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <span className="vthumb" aria-hidden="true">
      <img src={vehicle.photo} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} />
    </span>
  );
}
