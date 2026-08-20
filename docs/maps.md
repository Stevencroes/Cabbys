# The route map

`src/components/booking/RouteMap.tsx` has two branches and ships with the
second one live:

1. **With `VITE_MAPBOX_TOKEN`** — Mapbox static tiles in the `dark-v11`
   style, with the real driving line fetched from the Directions API.
2. **Without one** — a sketch of Aruba drawn from its coastline, both ends
   pinned, the line between them, captioned "Sketch — not to scale".

Branch 2 is not a placeholder. It is drawn from real coordinates and reads
honestly, so the flow is complete even when a request fails — which is
exactly what it does when Mapbox is unreachable.

## Turning on branch 1

`VITE_MAPBOX_TOKEN` is set in `.env.local`, which is gitignored and never
committed. **Production still shows the sketch until the same variable is
added to the Vercel project's environment variables**, because the token is
baked in at build time and Vercel builds with its own environment.

1. Vercel → the project → Settings → Environment Variables.
2. Add `VITE_MAPBOX_TOKEN` with the `pk.…` value, for every environment
   that should show maps.
3. Redeploy. Nothing else changes — the component switches branch on its
   own and falls back to the sketch again if a request fails.

**Restrict the token.** It ships in the client bundle, which is normal and
intended for Mapbox public tokens, but an unrestricted one can be lifted
and spent against your quota. In the Mapbox dashboard, set the token's URL
restrictions to your own domains. Rotate it if it has been pasted anywhere
it might be logged.

The free tier covers 50,000 static map loads and 100,000 Directions
requests a month. One booking draws at most one of each per route, because
`RouteMap` rounds its width to a 32px step — without that, a scrollbar
appearing bought a second map every time.

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
