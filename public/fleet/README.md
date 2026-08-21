# Fleet photography

One cut-out PNG per car, keyed by the vehicle id in `src/data/vehicles.ts`:

| file          | car         | class           | the car in the shot |
| ------------- | ----------- | --------------- | ------------------- |
| `sedan.png`   | The Saloon  | Executive sedan | Ford Fusion         |
| `premium.png` | The Grand   | First class     | Mercedes S-Class    |
| `suv.png`     | The Scout   | Luxury SUV      | Lincoln Nautilus    |
| `van.png`     | The Voyager | Luxury van      | Ford Transit        |

The two sedans are the easy pair to cross: the Mercedes is **The Grand**
(`premium.png`), the Ford is **The Saloon** (`sedan.png`).

Shoot/source them the same way:

- **Transparent background.** The cards are dark; the photo sits straight on
  them, with the drop shadow coming from CSS, not from the file.
- **Square canvas, car centred**, front three-quarter view facing left — so
  the four rows read as one set.
- ~1280×1280 is plenty. They render into a 78×46 box, so keep them light.

## The files in here now are placeholders

They are generated silhouettes, not photography — enough to prove the slot,
not enough to ship. Replace all four with the real cut-outs; the filenames are
the only contract.

A missing or renamed file is not fatal: `VehiclePhoto` collapses the slot and
the row falls back to its text-only layout.
