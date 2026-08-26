# Fleet photography

One cut-out PNG per car, keyed by the vehicle id in `src/data/vehicles.ts`:

| file           | tier            | the car in the shot |
| -------------- | --------------- | ------------------- |
| `suv.png`      | Luxury SUV      | Lincoln Nautilus    |
| `vclass.png`   | Executive Van   | Mercedes V-Class    |
| `transit.png`  | Premium Van     | Ford Transit        |
| `sprinter.png` | Luxury Sprinter | Mercedes Sprinter   |

A tier is a category, not a car — drivers arrive in their own vehicles, so the
shot shows a representative one. `vclass.png` and `sprinter.png` are not here
yet; those two rows fall back to their text-only layout until they are.

Shoot/source them the same way:

- **Transparent background.** The cards are dark; the photo sits straight on
  them, with the drop shadow coming from CSS, not from the file.
- **Square canvas, car centred**, front three-quarter view facing left — so
  the four rows read as one set.
- ~1280×1280 is plenty. They render into a 78×46 box, so keep them light.

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
