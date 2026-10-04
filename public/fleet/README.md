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
- **Cropped to the car.** Trim the frame to the car's own bounding box
  plus a 2% margin (of the car's width) on every side, so the file holds the
  car and nothing else. Front three-quarter view facing left.

  This replaced a convention of "car at 80% of the frame width, wheels 14.5%
  off the bottom". That kept the four cars in proportion to each other, but
  the margin it built into every file stacked on top of the card's own
  padding, and on the landing page the cars came out at 64% of the card's
  width — black on navy, and small enough that the section read as four dark
  cards. The cards now do the framing (`.fshot` in globals.css): its content
  box is 1.67:1, the Sprinter's ratio and the tallest of the four, so with
  `object-fit:contain` every car spans the full inner width and the lower
  ones stand on the same ground line with sky above them. The booking step's
  `.vthumb` does the same at 88×52.

  A new file with a different ratio still works — `contain` never crops —
  but one taller than 1.67:1 will be height-bound and come out narrower than
  the other three. Check the row after adding one.
- Current sizes: sedan 577×245, suv 589×271, transit 438×253,
  sprinter 438×263. The cards render up to ~290 CSS px wide on a phone, so a
  3× screen wants ~870px of width: the two vans are under-resolved, and new
  source shots at 1280 wide are the only real fix.

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
