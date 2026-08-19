# The route map

`src/components/booking/RouteMap.tsx` has two branches and ships with the
second one live:

1. **With `VITE_MAPBOX_TOKEN`** — Mapbox static tiles in the `dark-v11`
   style, with the real driving line fetched from the Directions API.
2. **Without one** — a sketch of Aruba drawn from its coastline, both ends
   pinned, the line between them, captioned "Sketch — not to scale".

Branch 2 is what everyone sees today. It is not a placeholder: it is drawn
from real coordinates and reads honestly, so the booking flow is complete
without a maps bill.

## Turning on branch 1

1. Create a Mapbox account. The free tier covers 50,000 static map loads
   and 100,000 Directions requests a month — a transfer business will not
   approach either.
2. Copy the **default public token** (`pk.…`).
3. Add it to `.env.local` and to the Vercel project's environment
   variables, both as `VITE_MAPBOX_TOKEN`.
4. Redeploy. Nothing else changes — the component switches branch on its
   own, and falls back to the sketch again if a request fails.

**Restrict the token before it goes near production.** It ships in the
client bundle, which is normal for Mapbox public tokens, but an
unrestricted one can be lifted and spent. In the Mapbox dashboard, set the
token's URL restrictions to your own domains.

## What the pins actually mean

Coordinates come from the **area** a place belongs to, not the place
itself. Only the ten area centres in `src/data/places.ts` carry `lat`/`lon`,
so the Ritz-Carlton and the Hyatt share one point in Palm Beach.

That is fine for a route overview of a 30 km island and wrong for
navigation, which is why nothing in the UI claims to be navigation. The
distance and duration on screen come from the pricing engine, not from the
map, so those numbers are exact either way.

To put pins on actual buildings: add `lat`/`lon` to `Place`, fill them in
`places.ts` (geocode once with the Mapbox token and bake the results into
the file, so it costs nothing at runtime), and change `coordOf()` in
`src/lib/route.ts` to prefer the place's own coordinates over its area's.

## Attribution

`staticMapUrl()` passes `attribution=false&logo=false`, which Mapbox only
permits when the page displays attribution itself. `RouteMap` renders
"© Mapbox · © OpenStreetMap" under the image for exactly that reason.

**Do not remove that caption without also removing those two parameters.**
It is a term of the licence, not decoration.
