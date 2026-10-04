# Fleet photography

One cut-out WebP per car, keyed by the vehicle id in `src/data/vehicles.ts`.
The same files feed the landing page's vehicle cards (`.fshot`) and the
booking flow's car step (`.vthumb`).

| file            | tier            | the car in the shot          |
| --------------- | --------------- | ---------------------------- |
| `sedan.webp`    | Executive Sedan | Mercedes S-Class type saloon |
| `suv.webp`      | Luxury SUV      | full-size luxury SUV         |
| `transit.webp`  | Premium Van     | Mercedes V-Class type MPV    |
| `sprinter.webp` | Luxury Sprinter | Mercedes Sprinter            |

A tier is a category, not a car — drivers arrive in their own vehicles, so the
shot shows a representative one, and each carries a "Cabby's" plate.

Filenames are lower case and the code asks for them exactly. `SUV.png` worked
on a Mac and 404'd everywhere else; Linux and the deploy host are both
case-sensitive.

## Preparing a new one

- **Transparent background, delivered that way.** The current four arrived as
  1536×1024 renders with real alpha, so nothing was cut out by hand. The
  previous set came as JPGs with a transparency checkerboard baked into the
  pixels and had to be flood-filled back out — if a replacement ever arrives
  like that, ask for the transparent original instead.
- **Check the edge both ways before shipping:** on magenta, where a hole in
  the glass is unmissable, and on the card's dark navy, where a pale rim from
  a white-background cut is.
- **Crop to the car**: its bounding box (alpha > 12) plus a margin of 2% of
  the car's width on every side. The cards do the framing — `.fshot`'s
  content box is 1.67:1 with `object-fit:contain`, bottom-aligned, so every
  car spans the card's inner width and stands on one ground line. A car
  taller than 1.67:1 is height-bound and comes out a little narrower; the
  Sprinter, at 1.65, is the only one and the difference is a few pixels.
  The old convention ("car at 80% of the frame") put a margin in every file
  that stacked on the card's padding, and the cars rendered at 64% of the
  card's width.
- **1100px wide, WebP at quality 88 with lossless alpha.** The cards render
  up to ~290 CSS px wide on a phone, so 3× wants ~870px; 1100 covers it. As
  PNG the four were 430–620KB each, which is ~2MB of cars on the landing
  page; as WebP they are 77–99KB.

A missing or renamed file is not fatal: `VehiclePhoto` collapses the slot and
the row falls back to its text-only layout.
