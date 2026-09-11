# Fleet photography

One cut-out PNG per car, keyed by the vehicle id in `src/data/vehicles.ts`:

| file           | tier            | the car in the shot |
| -------------- | --------------- | ------------------- |
| `sedan.png`    | Executive Sedan | Mercedes E-Class    |
| `suv.png`      | Luxury SUV      | Lincoln Nautilus    |
| `transit.png`  | Premium Van     | Ford Transit        |
| `sprinter.png` | Luxury Sprinter | Mercedes Sprinter   |

A tier is a category, not a car — drivers arrive in their own vehicles, so the
shot shows a representative one.

Filenames are lower case and the code asks for them exactly. `SUV.png` worked
on a Mac and 404'd everywhere else; Linux and the deploy host are both
case-sensitive.

Shoot/source them the same way:

- **Transparent background.** The cards are dark; the photo sits straight on
  them, with the drop shadow coming from CSS, not from the file.
- **The cut is automated, and it works by finding the CAR, not the floor.**
  Chasing the background needs a new exception every time: the floor is not
  reliably lighter than the car's chrome, the sunset put a tan cast on it that
  is not neutral, and the strip of it between the wheels is sealed off by the
  contact shadow so an edge fill can never reach it.
  Instead: these are black cars on a bright floor, so the car is the largest
  dark region in the frame. Windows and alloys are then not exceptions to be
  protected — they are HOLES inside it, and filling holes is one total
  operation. A hole is only treated as floor if it is flat, light AND low,
  which is true of a slice of ground under a sill and of nothing else.
  The silhouette is grown three pixels to recover chrome sitting on its edge,
  then the boundary is walked back in four times to drop the halo of bright
  floor that growing it drags along — that halo is invisible on white and
  glaring on a dark card, which is how it shipped once.
  Check any new cut BOTH ways before shipping: on magenta, where a breach in
  glass is unmissable, and on the card's own dark ground, where a pale rim is.
- **Car centred, at 80% of the frame width**, front three-quarter view facing
  left, with the wheels 14.5% of the frame height off the bottom — so the
  four rows read as one set. That fraction is the whole convention: it is
  what makes a Sprinter and an E-Class sit at a comparable size in the row
  whatever the source shot was framed like.

  This was written as "square canvas, car centred" and none of the four
  files were square — they were 700×395, and the car ran from 60.3% of the
  frame (transit, sprinter) to 81.0% (suv). The two largest vehicles filled
  the least frame, so the row read as though a Sprinter were smaller than a
  sedan. They were re-cropped, not rescaled: each frame was pulled in around
  its own car until the fraction matched, so the car pixels are untouched
  and only the window changed. Frames are therefore no longer all one size
  (528×298 to 709×400) — they do not need to be, because they share an
  aspect ratio and a content fraction, which is what the card renders on.
- The frame ratio is ~1.77. `.fshot` renders at ~1.40 with `object-fit:cover`,
  which trims about a pixel off each bumper — uniform across all four, and
  invisible. Change the ratio and check that again.
- They render into 291×208 CSS px on a phone, so a 3× screen wants ~873px of
  width. At 528px the two vans are already under-resolved: new source shots
  are the only real fix, and 1280 wide would be the target.

## How the current four were made

They arrived as JPGs with the transparency checkerboard baked into the
pixels — the grey-and-white squares were real image data, not a see-through
background, which is what happens when a transparent PNG is re-saved as JPG.
A JPG cannot be see-through at all, so on a dark card each car would have
carried a white box around it.

They were cut back out by flood-filling inwards from the borders: the cars
are black on a light ground, so the fill lifts the checkerboard and the
studio shadow off cleanly, and never reaches the windscreens or the wheel
rims because the black bodywork encloses them. The JPG originals are not
kept here — they are in the history of the commit that added them.

If you replace one, a transparent PNG straight from the source needs no such
treatment. Only re-save through something that flattens it and the problem
comes back.

A missing or renamed file is not fatal: `VehiclePhoto` collapses the slot and
the row falls back to its text-only layout.
