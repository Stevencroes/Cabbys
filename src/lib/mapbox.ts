// ── Mapbox address autocomplete ──────────────────────────────────────
// Live geocoding against the Mapbox Geocoding API, constrained to Aruba.
// When VITE_MAPBOX_TOKEN is unset it degrades gracefully to the curated
// place list (callers merge `geocode()` results with PLACES).

export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
export const mapboxEnabled = Boolean(MAPBOX_TOKEN);

export interface GeoSuggestion {
  id: string;
  name: string;
  meta?: string;
}

// Aruba bounding box + centre (Oranjestad) to bias results to the island.
export const ARUBA_BBOX = "-70.10,12.40,-69.85,12.65";
const ARUBA_PROXIMITY = "-70.0086,12.5092";

interface MapboxFeature {
  id: string;
  text?: string;
  place_name?: string;
  place_type?: string[];
}

export async function geocode(query: string, signal?: AbortSignal): Promise<GeoSuggestion[]> {
  const q = query.trim();
  if (!mapboxEnabled || !q) return [];
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&country=aw&bbox=${ARUBA_BBOX}&proximity=${ARUBA_PROXIMITY}` +
    `&types=poi,address,place,locality,neighborhood&limit=5&autocomplete=true`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: MapboxFeature[] };
    return (data.features ?? []).map((f) => {
      const name = f.text ?? f.place_name ?? "";
      // strip the leading name from the full place string to use the rest as context
      const meta = f.place_name && f.text && f.place_name.startsWith(f.text)
        ? f.place_name.slice(f.text.length).replace(/^,\s*/, "").replace(/,?\s*Aruba$/i, "")
        : undefined;
      return { id: `mb-${f.id}`, name, meta: meta || undefined };
    }).filter((s) => s.name);
  } catch {
    return [];
  }
}
