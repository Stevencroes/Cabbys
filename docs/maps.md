# The route map

Two components, three branches.

`src/components/booking/LiveMap.tsx` is the interactive one — Mapbox GL JS,
pan and zoom, used on both booking steps. **GL JS is 523 KB gzipped**, roughly
three times the rest of the app, so it is imported dynamically and never
enters the main bundle: nothing downloads until a step showing a map mounts.
While it loads, and if it fails, `RouteMap` renders in its place.

The two steps size it differently and each mirrors its number in CSS —
`MAP_H` in `Step1Ride.tsx` against `.pcol-rail .tripmap .lmap`, and `MAP_H`
in `Step2Details.tsx` against `.tripmap .lmap`. Step 1's is the smaller of
the two because that step has to fit a 1280x800 laptop without scrolling,
and an airport pickup — which adds a flight field and a timing note — is
the worst case that floor is measured against.

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
3. **Redeploy.** This step is not optional and is the one people skip.
   Nothing else changes — the component switches branch on its own and
   falls back to the sketch again if a request fails.

### Why a redeploy is always needed

Vite inlines `VITE_*` values into the JavaScript when it builds. Grep a
built bundle and the token is there in plain text:

```
$ grep -o 'pk\.[A-Za-z0-9._-]*' dist/assets/index-*.js
```

So the deployed site is running whatever token existed at build time.
Editing the environment variable changes what the *next* build gets and has
no effect on the one already serving. Worse: rotating a token — creating a
new one and deleting the old — breaks the live site immediately, because
the bundle still asks for a token Mapbox no longer recognises.

Rotate in this order: create the new token, set it in Vercel, redeploy,
confirm real tiles, *then* delete the old one.

### Telling the three failures apart

All of them end at the same sketch, on purpose. The reason goes to the
browser console — open dev tools on the deployed page and look for `[map]`:

| What the console says | What to do |
|---|---|
| `…is not in this build` | The variable never reached the build. Set it and redeploy. |
| `…rejected the token (401)` | Wrong token, or the old one was deleted after this build. Redeploy. |
| `…refused the request (403)` | The token's URL restrictions do not list this domain. Add it. |
| `…could not be reached` | Network, ad blocker, or an offline device. |

`reportMapboxFailure()` in `src/lib/mapbox.ts` says each reason once per
page — a map that cannot load its style reports it many times over.

### When the console is not available

Add `?mapdebug=1` to the URL. The reason replaces the map's caption, on the
page, where whoever is fixing it is already looking:

```
https://your-site/?mapdebug=1
```

A phone has no dev tools, and on a desktop the site's own warning can sit
under a hundred lines from a browser extension. The flag is read from the
query string rather than baked in, so a live site can be asked without a
redeploy — and its absence answers a question too: **if `?mapdebug=1`
changes nothing, the deployed build predates this code.**

Nothing changes for a visitor. Without the flag the caption reads
"Sketch — not to scale" as before.

**Restrict the token.** It ships in the client bundle, which is normal and
intended for Mapbox public tokens, but an unrestricted one can be lifted
and spent against your quota. In the Mapbox dashboard, set the token's URL
restrictions to your own domains. Rotate it if it has been pasted anywhere
it might be logged.

**The "Default public token" cannot be restricted.** Mapbox creates it with
every account and it has no editable URL list — the dashboard shows N/A and
offers no edit control. Create a second token instead, restrict that one,
and point `VITE_MAPBOX_TOKEN` at it in both `.env.local` and Vercel. The
URL list needs every origin that renders a map: the production domain, the
`*.vercel.app` preview wildcard, and `http://localhost:5173` for `npm run
dev`. A missing origin does not error — the map silently falls back to the
sketch, which looks exactly like a missing token.

The free tier covers 50,000 static map loads and 100,000 Directions
requests a month, and separately 50,000 GL JS map loads. `LiveMap` builds
its map once and mutates the route source afterwards rather than tearing the
map down, so editing a field does not bill a second load. One booking draws at most one of each per route, because
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
