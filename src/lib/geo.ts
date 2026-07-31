// §3.8 — timezone first, GPS only on tap.
import { AREAS, type Area } from "../data/places";

/** Silent, permission-free hint: are they already on the island? */
export function isOnIsland(): boolean {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone === "America/Aruba";
  } catch {
    return false;
  }
}

/** Aruba bounding box. */
export const ARUBA_BOUNDS = { latMin: 12.38, latMax: 12.65, lonMin: -70.12, lonMax: -69.84 };

export function inAruba(lat: number, lon: number): boolean {
  const b = ARUBA_BOUNDS;
  return lat >= b.latMin && lat <= b.latMax && lon >= b.lonMin && lon <= b.lonMax;
}

/** Snap an on-island fix to the nearest of the ten area centres. */
export function nearestArea(lat: number, lon: number): Area {
  let best = AREAS[0];
  let bestD = Infinity;
  for (const a of AREAS) {
    const d = (a.lat - lat) ** 2 + (a.lon - lon) ** 2;
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

export interface LocateResult {
  ok: boolean;
  area?: Area;
  message: string;
}

/** GPS on tap only — never on load (denials are sticky per origin). */
export function locate(): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ ok: false, message: "Location isn't available on this device — pick your area below." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        if (!inAruba(lat, lon)) {
          resolve({ ok: false, message: "You don't seem to be on the island yet — we've set pickup to the airport." });
          return;
        }
        const area = nearestArea(lat, lon);
        resolve({ ok: true, area, message: `Set your pickup near ${area.name}. Change it if that's not right.` });
      },
      () => resolve({ ok: false, message: "We couldn't read your location — pick your area below." }),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}
