# Fleet photography

One cut-out WebP per car, keyed by the vehicle id in `src/data/vehicles.ts`.
The same files feed the landing page's vehicle cards (`.fshot`) and the
booking flow's car step (`.vthumb`).

| file            | tier            | the car in the shot          |
| --------------- | --------------- | ---------------------------- |
| `sedan.webp`    | Executive Sedan | Mercedes S-Class type saloon |
| `suv.webp`      | Luxury SUV      | Mercedes GLS type SUV        |
| `transit.webp`  | Premium Van     | Mercedes V-Class type MPV    |
| `sprinter.webp` | Luxury Sprinter | Mercedes Sprinter            |

A tier is a category, not a car — drivers arrive in their own vehicles, so the
shot shows a representative one, and each carries a "Cabbys" plate.

**All four face the same way: front three-quarter, nose to the LEFT.** The
landing cards crop the car on the right (see below), so a car facing right
would lose its face instead of its tail. A replacement that faces the other
way needs mirroring — and a mirrored plate reads backwards, so ask for a
render that faces left instead.

**Replacing a file? Bump `PHOTO_V` in `src/data/vehicles.ts`.** Browsers keep
an image by its URL, so a new photo under the old name is invisible to anyone
who has visited before — they get the new card layout around the old car.

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
  the car's width on every side. The cards do the framing. On the landing
  page `.fshot` is a 3:4 portrait box and the car is drawn at 118% of its
  width, 6% in from the left and bottom-anchored on one ground line — so
  every car is at one scale, the tail runs off the right edge, and the
  Sprinter is visibly the longest. Any margin left in the file shifts the
  car off that line. The booking step's `.vthumb` still fits the whole car
  (`object-fit:contain`).
- **1100px wide, WebP at quality 88.** The car is drawn up to ~350 CSS px
  wide (118% of a ~295px tablet card), so 3× wants ~1050px; 1100 covers it.
  As PNG a set like this is ~2MB of cars on the landing page; as WebP the
  four are 96–121KB.

A missing or renamed file is not fatal: `VehiclePhoto` collapses the slot and
the row falls back to its text-only layout.
