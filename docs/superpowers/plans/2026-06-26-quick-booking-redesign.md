# Quick Booking Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-step booking wizard with a destination-first, Uber-style 3-screen flow (Trip → Ride → Confirm), with grouped place categories, free typing, USD-only fares, and honest fixed/estimate labeling.

**Architecture:** Reuse the existing booking infrastructure (pricing engine, `useFare`, `useAuth`, `buildRidePayload`, `rides` write, `Confirmation`). Add a curated places catalog and a destination picker; collapse the eight step components into three (`StepTrip`, `StepRide`, `StepConfirm`); reduce `BookingContext` to three steps. New screens are built additively first, then a single atomic cutover swaps the overlay over and deletes the obsolete steps.

**Tech Stack:** React 18, TypeScript, Vite, Vitest + React Testing Library, `@supabase/supabase-js`. No new dependencies.

## Global Constraints

- **Brand colors — ONLY:** midnight `#0A1628`, ocean `#142238`, steel `#2A4A72`, silver `#B4C3DC`, silver-dim `#7E94B4`, mist `#EEF2F8`, white `#FFFFFF`, plus rgba tints of these. **No gold `#C9A05A`, no other off-palette hex.**
- **Fonts:** Cormorant Garamond (display) via `var(--disp)`; Outfit (UI) via `var(--ui)`.
- **Voice:** quiet luxury. **No exclamation points.** No urgency/ride-share hype.
- **Currency:** fares display in **USD only** — `formatMoney(awg, "USD")`. No AWG/EUR toggle.
- **Pricing honesty:** label a fare **"Fixed fare"** when `fare.source` is `"route"` or `"zone"`, and **"Estimate · confirmed by your driver"** when `fare.source === "min"`.
- **Backend:** same Supabase project; **never** alter schema/RLS. Bookings → `public.rides`; the insert payload is unchanged.
- **Tests:** new logic/components get Vitest tests; keep the whole suite green and **pristine** (no `act()` warnings — `await` async settles). Commit after each task.

---

## File Structure

```
src/
  data/places.ts                                  # NEW — curated catalog + categories + search
  components/booking/DestinationField.tsx         # NEW — search + category picks + place list
  components/booking/steps/StepTrip.tsx           # NEW — Screen 1 (where/from/when/guests)
  components/booking/steps/StepRide.tsx           # NEW — Screen 2 (vehicles + USD fare summary)
  components/booking/steps/StepConfirm.tsx        # NEW — Screen 3 (account + reserve) + ConfirmedBooking
  booking/BookingContext.tsx                      # CHANGE — 3 steps; drop journey/currency
  components/booking/BookingOverlay.tsx           # CHANGE — render 3 steps; "of 3"
  components/EntryCard.tsx                         # CHANGE — chips become category quick-picks
  components/Confirmation.tsx                      # CHANGE — import ConfirmedBooking from StepConfirm; USD
  App.tsx                                          # CHANGE — import ConfirmedBooking from StepConfirm
  lib/bookingPayload.ts                            # CHANGE — make `journey` optional
  styles/globals.css                              # CHANGE — append a few new classes (recolored)
  # DELETED in cutover:
  components/booking/steps/StepJourney.tsx StepRoute.tsx StepSchedule.tsx StepParty.tsx
  components/booking/steps/StepVehicle.tsx StepQuote.tsx StepAccount.tsx StepPayment.tsx
  components/CurrencyToggle.tsx
  components/booking/steps/StepRoute.test.tsx StepParty.test.tsx StepVehicle.test.tsx StepPayment.test.tsx
```

---

### Task 1: Curated places catalog

**Files:**
- Create: `src/data/places.ts`
- Test: `src/data/places.test.ts`

**Interfaces:**
- Consumes: `IconName` from `src/components/Icon.tsx`.
- Produces:
  - `type Category = "airport" | "hotels" | "beaches" | "dining" | "sights"`
  - `interface Place { id: string; name: string; category: Category; zone: string; meta?: string }`
  - `interface CategoryDef { key: Category; label: string; icon: IconName }`
  - `CATEGORIES: CategoryDef[]`, `PLACES: Place[]`
  - `placesByCategory(cat: Category): Place[]`
  - `findPlaceByName(name: string): Place | undefined`
  - `searchPlaces(query: string): Place[]`

- [ ] **Step 1: Write the failing test `src/data/places.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { CATEGORIES, PLACES, placesByCategory, findPlaceByName, searchPlaces } from "./places";

describe("places catalog", () => {
  it("exposes the five categories in order", () => {
    expect(CATEGORIES.map((c) => c.key)).toEqual(["airport", "hotels", "beaches", "dining", "sights"]);
  });
  it("keeps hotel names matching the pricing data (exact strings)", () => {
    const hotels = placesByCategory("hotels").map((p) => p.name);
    expect(hotels).toContain("The Ritz-Carlton Aruba");
    expect(hotels).toContain("Aruba Marriott Resort");
    expect(hotels).toContain("Renaissance Aruba");
  });
  it("groups places by category", () => {
    expect(placesByCategory("airport").map((p) => p.name)).toEqual(["Queen Beatrix International Airport"]);
    expect(placesByCategory("beaches").length).toBeGreaterThanOrEqual(3);
  });
  it("finds a place by exact (case-insensitive) name", () => {
    expect(findPlaceByName("eagle beach")?.id).toBe("eagle-beach");
    expect(findPlaceByName("nowhere")).toBeUndefined();
  });
  it("search matches name and meta, empty query returns nothing", () => {
    expect(searchPlaces("").length).toBe(0);
    expect(searchPlaces("palm").map((p) => p.id)).toContain("palm-beach");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- places`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/data/places.ts`**

```ts
import type { IconName } from "../components/Icon";

export type Category = "airport" | "hotels" | "beaches" | "dining" | "sights";

export interface Place {
  id: string;
  name: string; // matches pricing_locations where a row exists, so the fare engine resolves a zone/route
  category: Category;
  zone: string;
  meta?: string;
}

export interface CategoryDef {
  key: Category;
  label: string;
  icon: IconName;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "airport", label: "Airport", icon: "plane" },
  { key: "hotels", label: "Hotels", icon: "bed" },
  { key: "beaches", label: "Beaches", icon: "sun" },
  { key: "dining", label: "Dining", icon: "plate" },
  { key: "sights", label: "Sights", icon: "pin" },
];

export const PLACES: Place[] = [
  { id: "airport", name: "Queen Beatrix International Airport", category: "airport", zone: "AIRPORT", meta: "AUA · Oranjestad" },

  { id: "renaissance", name: "Renaissance Aruba", category: "hotels", zone: "A", meta: "Oranjestad" },
  { id: "manchebo", name: "Manchebo Beach Resort", category: "hotels", zone: "A", meta: "Eagle Beach" },
  { id: "hilton", name: "Hilton Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "hyatt", name: "Hyatt Regency Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "marriott", name: "Aruba Marriott Resort", category: "hotels", zone: "A", meta: "Palm Beach" },
  { id: "ritz", name: "The Ritz-Carlton Aruba", category: "hotels", zone: "A", meta: "Palm Beach" },

  { id: "eagle-beach", name: "Eagle Beach", category: "beaches", zone: "A", meta: "Low-rise coast" },
  { id: "palm-beach", name: "Palm Beach", category: "beaches", zone: "A", meta: "High-rise coast" },
  { id: "baby-beach", name: "Baby Beach", category: "beaches", zone: "C", meta: "San Nicolas" },

  { id: "carte-blanche", name: "Carte Blanche", category: "dining", zone: "A", meta: "Chef's table · Noord" },
  { id: "papiamento", name: "Papiamento Restaurant", category: "dining", zone: "A", meta: "Garden dining · Noord" },

  { id: "california-lighthouse", name: "California Lighthouse", category: "sights", zone: "A", meta: "West coast" },
  { id: "oranjestad", name: "Oranjestad", category: "sights", zone: "A", meta: "Capital · shopping" },
];

export function placesByCategory(cat: Category): Place[] {
  return PLACES.filter((p) => p.category === cat);
}

export function findPlaceByName(name: string): Place | undefined {
  const n = name.trim().toLowerCase();
  return PLACES.find((p) => p.name.toLowerCase() === n);
}

export function searchPlaces(query: string): Place[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return PLACES.filter(
    (p) => p.name.toLowerCase().includes(q) || (p.meta?.toLowerCase().includes(q) ?? false),
  );
}
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- places` → PASS (5 tests). Then `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/data/places.ts src/data/places.test.ts && git commit -m "Add curated places catalog grouped by category"
```

---

### Task 2: DestinationField (search + category picks + place list)

**Files:**
- Create: `src/components/booking/DestinationField.tsx`
- Modify: `src/styles/globals.css` (append destination-picker classes)
- Test: `src/components/booking/DestinationField.test.tsx`

**Interfaces:**
- Consumes: `useBooking()` (`state`, `setField`), `places.ts` (`CATEGORIES`, `placesByCategory`, `searchPlaces`), `Icon`.
- Produces: `default function DestinationField({ target, onPicked }: { target: "from" | "to"; onPicked?: () => void })` — writes the picked/typed value to `state[target]` via `setField(target, value)`.

- [ ] **Step 1: Append CSS to `src/styles/globals.css`**

```css
/* ── destination picker ── */
.dfield{margin-top:14px;}
.dfield .txt{margin-bottom:12px;}
.cat-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;}
.cat-chip{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:400;color:var(--silver);padding:8px 13px;border-radius:11px;border:1px solid var(--border);background:rgba(255,255,255,0.025);transition:.25s var(--ease);}
.cat-chip:hover{color:#fff;border-color:var(--silver-dim);}
.cat-chip.on{color:#fff;background:var(--accent-soft);border-color:var(--border-hi);}
.cat-chip svg{width:15px;height:15px;}
.place-list{display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;}
```

- [ ] **Step 2: Write the failing test `src/components/booking/DestinationField.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../booking/BookingContext";
import DestinationField from "./DestinationField";

function Probe() {
  const { state } = useBooking();
  return <div data-testid="to">{state.to}</div>;
}

describe("DestinationField", () => {
  it("sets the target field when a category place is picked", () => {
    render(
      <BookingProvider>
        <DestinationField target="to" />
        <Probe />
      </BookingProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /beaches/i }));
    fireEvent.click(screen.getByRole("button", { name: /eagle beach/i }));
    expect(screen.getByTestId("to").textContent).toBe("Eagle Beach");
  });

  it("sets the target field from free-typed text on Enter", () => {
    render(
      <BookingProvider>
        <DestinationField target="to" />
        <Probe />
      </BookingProvider>,
    );
    const input = screen.getByPlaceholderText(/search a place/i);
    fireEvent.change(input, { target: { value: "Some Villa, Noord" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("to").textContent).toBe("Some Villa, Noord");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- DestinationField` → FAIL.

- [ ] **Step 4: Implement `src/components/booking/DestinationField.tsx`**

```tsx
import { useState } from "react";
import { useBooking } from "../../booking/BookingContext";
import { CATEGORIES, placesByCategory, searchPlaces, type Category, type Place } from "../../data/places";
import Icon from "../Icon";

export default function DestinationField({
  target,
  onPicked,
}: {
  target: "from" | "to";
  onPicked?: () => void;
}) {
  const { setField } = useBooking();
  const [query, setQuery] = useState("");
  const [activeCat, setActiveCat] = useState<Category | null>(null);

  const results: Place[] = query.trim() ? searchPlaces(query) : activeCat ? placesByCategory(activeCat) : [];

  function pick(name: string) {
    setField(target, name);
    setQuery("");
    onPicked?.();
  }

  return (
    <div className="dfield">
      <input
        className="txt"
        type="text"
        placeholder="Search a place or address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) pick(query.trim());
        }}
      />

      <div className="cat-row">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`cat-chip${activeCat === c.key ? " on" : ""}`}
            onClick={() => setActiveCat(activeCat === c.key ? null : c.key)}
          >
            <Icon name={c.icon} /> {c.label}
          </button>
        ))}
      </div>

      {results.length > 0 && (
        <div className="place-list">
          {results.map((p) => (
            <button key={p.id} type="button" className="opt" onClick={() => pick(p.name)}>
              <span className="opt-l">
                <span className="opt-name">{p.name}</span>
              </span>
              {p.meta && <span className="opt-meta">{p.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes** — `npm test -- DestinationField` → PASS. Then `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/components/booking/DestinationField.tsx src/components/booking/DestinationField.test.tsx src/styles/globals.css
git commit -m "Add DestinationField (search + category picks)"
```

---

### Task 3: StepTrip (Screen 1)

**Files:**
- Create: `src/components/booking/steps/StepTrip.tsx`
- Modify: `src/styles/globals.css` (append trip-screen classes)
- Test: `src/components/booking/steps/StepTrip.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`, `DestinationField`, `Stepper` (`src/components/Stepper.tsx`, props `{ value, min, max?, onChange }`).
- Produces: `default function StepTrip()` — writes `from`, `to`, `date`, `time`, `passengers`, `luggage`. Defaults `when` to **Now** (writes today's date + current time so the step-0 gate passes). Passengers `Stepper` value element has `data-testid="pax-num"`.

- [ ] **Step 1: Append CSS to `src/styles/globals.css`**

```css
/* ── trip screen ── */
.trip-fields{display:flex;flex-direction:column;gap:10px;margin-top:8px;}
.trip-row{display:flex;align-items:center;gap:14px;padding:15px 18px;border-radius:13px;border:1px solid var(--border);background:var(--card);width:100%;text-align:left;transition:.25s var(--ease);}
.trip-row:hover{border-color:var(--silver-dim);}
.trip-row.on{border-color:var(--border-hi);background:var(--card-hi);}
.trip-row .tr-lbl{font-size:9.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--silver-dim);font-weight:600;margin-bottom:3px;}
.trip-row .tr-val{font-size:15px;color:var(--mist);font-weight:300;}
.trip-row .tr-val.placeholder{color:var(--silver-dim);}
.seg{display:inline-flex;gap:3px;padding:4px;border-radius:12px;border:1px solid var(--border);background:rgba(10,22,40,0.5);margin-top:18px;}
.seg button{padding:8px 18px;border-radius:9px;font-size:12.5px;font-weight:500;color:var(--silver);transition:.25s;}
.seg button.on{background:var(--accent-soft);color:#fff;}
```

- [ ] **Step 2: Write the failing test `src/components/booking/steps/StepTrip.test.tsx`**

```tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepTrip from "./StepTrip";

function Gate() {
  const { canContinue } = useBooking();
  return <div data-testid="gate">{canContinue ? "yes" : "no"}</div>;
}

describe("StepTrip", () => {
  it("enables continue once from + to are chosen (when defaults to Now)", () => {
    render(
      <BookingProvider>
        <StepTrip />
        <Gate />
      </BookingProvider>,
    );
    // default active field is "to": pick a beach
    fireEvent.click(screen.getByRole("button", { name: /beaches/i }));
    fireEvent.click(screen.getByRole("button", { name: /palm beach/i }));
    // switch to pickup row, pick the airport
    fireEvent.click(screen.getByText(/^pickup$/i));
    fireEvent.click(screen.getByRole("button", { name: /airport/i }));
    fireEvent.click(screen.getByRole("button", { name: /queen beatrix/i }));
    expect(screen.getByTestId("gate").textContent).toBe("yes");
  });

  it("increments passengers", () => {
    render(<BookingProvider><StepTrip /></BookingProvider>);
    const plus = screen.getAllByRole("button", { name: "+" })[0];
    fireEvent.click(plus);
    expect(screen.getByTestId("pax-num").textContent).toBe("3");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- StepTrip` → FAIL.

- [ ] **Step 4: Implement `src/components/booking/steps/StepTrip.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import DestinationField from "../DestinationField";
import Stepper from "../../Stepper";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function StepTrip() {
  const { state, setField } = useBooking();
  const [active, setActive] = useState<"to" | "from">("to");
  const [mode, setMode] = useState<"now" | "schedule">(state.date && state.time ? "schedule" : "now");

  // "Now" → ensure date/time are populated so the step gate passes and the engine has a time.
  useEffect(() => {
    if (mode === "now") {
      setField("date", todayISO());
      setField("time", nowHHMM());
    }
  }, [mode, setField]);

  return (
    <div>
      <div className="step-eyebrow">Your trip</div>
      <h2 className="step-title">Where to?</h2>
      <p className="step-desc">Pick a place or type an address. Choose your pickup, when, and who is travelling.</p>

      <div className="trip-fields">
        <button type="button" className={`trip-row${active === "to" ? " on" : ""}`} onClick={() => setActive("to")}>
          <span className="rdiamond" />
          <span>
            <span className="tr-lbl" style={{ display: "block" }}>To</span>
            <span className={`tr-val${state.to ? "" : " placeholder"}`}>{state.to || "Choose destination"}</span>
          </span>
        </button>
        <button type="button" className={`trip-row${active === "from" ? " on" : ""}`} onClick={() => setActive("from")}>
          <span className="ring" />
          <span>
            <span className="tr-lbl" style={{ display: "block" }}>Pickup</span>
            <span className={`tr-val${state.from ? "" : " placeholder"}`}>{state.from || "Choose pickup"}</span>
          </span>
        </button>
      </div>

      <DestinationField target={active} onPicked={() => setActive(active === "to" ? "from" : "to")} />

      <div className="seg">
        <button type="button" className={mode === "now" ? "on" : ""} onClick={() => setMode("now")}>Now</button>
        <button type="button" className={mode === "schedule" ? "on" : ""} onClick={() => setMode("schedule")}>Schedule</button>
      </div>

      {mode === "schedule" && (
        <div className="field-pair" style={{ marginTop: "14px" }}>
          <input className="txt" type="date" value={state.date} onChange={(e) => setField("date", e.target.value)} />
          <input className="txt" type="time" value={state.time} onChange={(e) => setField("time", e.target.value)} />
        </div>
      )}

      <div className="count-row" style={{ marginTop: "18px" }}>
        <div className="cr-l">
          <div><div className="cr-t">Guests</div><div className="cr-d">Passengers travelling</div></div>
        </div>
        <Stepper value={state.passengers} min={1} onChange={(v) => setField("passengers", v)} testId="pax-num" />
      </div>
      <div className="count-row">
        <div className="cr-l">
          <div><div className="cr-t">Bags</div><div className="cr-d">Checked bags &amp; cases</div></div>
        </div>
        <Stepper value={state.luggage} min={0} onChange={(v) => setField("luggage", v)} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add an optional `testId` prop to `Stepper`**

In `src/components/Stepper.tsx`, extend the props to `{ value, min, max, onChange, testId }` and put `data-testid={testId}` on the value `<span className="num">`. (Keeps the passenger-count testable; luggage omits it.) Full updated component:

```tsx
export default function Stepper({
  value, min = 0, max = 99, onChange, testId,
}: {
  value: number; min?: number; max?: number; onChange: (v: number) => void; testId?: string;
}) {
  return (
    <div className="stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="−">−</button>
      <span className="num" data-testid={testId}>{value}</span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="+">+</button>
    </div>
  );
}
```

(If the current `Stepper` differs, preserve its existing markup/classes and only add the `testId` prop + `data-testid`.)

- [ ] **Step 6: Run to verify it passes** — `npm test -- "StepTrip|Stepper"` → PASS. Then `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add src/components/booking/steps/StepTrip.tsx src/components/booking/steps/StepTrip.test.tsx src/components/Stepper.tsx src/styles/globals.css
git commit -m "Add StepTrip screen (destination + pickup + when + guests)"
```

---

### Task 4: StepRide (Screen 2)

**Files:**
- Create: `src/components/booking/steps/StepRide.tsx`
- Modify: `src/styles/globals.css` (append `.fare-tag`)
- Test: `src/components/booking/steps/StepRide.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`, `useFare()` (returns `{ loading, fare, base, tax, total, lineItems }`; `fare.source` is `"route"|"zone"|"min"`), `fareForVehicle(pricing, state, vehicle)`, `loadPricing`/`Pricing`, `VEHICLES`/`fitsParty`, `formatMoney`.
- Produces: `default function StepRide()` — vehicle list (USD prices, capacity-gated) + fare summary with the 6% tax line and the source-based **Fixed fare / Estimate** label. Writes `vehicle` via `setField`.

- [ ] **Step 1: Append CSS to `src/styles/globals.css`**

```css
.fare-tag{display:inline-flex;align-items:center;gap:7px;font-size:11px;letter-spacing:.06em;color:var(--silver-dim);font-weight:500;margin-top:14px;}
.fare-tag .dot{width:6px;height:6px;border-radius:50%;background:var(--silver);}
.fare-tag.estimate .dot{background:var(--steel);}
```

- [ ] **Step 2: Write the failing test `src/components/booking/steps/StepRide.test.tsx`**

Reuse the pricing supabase mock fixture from `src/lib/pricing.test.ts` (the chained thenable `vi.mock("../../../lib/supabase", ...)`). Render `StepRide` in a `BookingProvider` harness with `from="Queen Beatrix International Airport"`, `to="Palm Beach"`, daytime `date`/`time`, then assert (a) a USD price appears for the Executive Sedan (`await screen.findByText(/\$\d/)`), (b) selecting a vehicle enables the gate, and (c) capacity: with `passengers=7,luggage=8`, the Executive Sedan row is `disabled`.

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
// paste the same vi.mock("../../../lib/supabase", () => ({...})) builder used in src/lib/pricing.test.ts
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepRide from "./StepRide";

function Setup({ pax = 2, bags = 2 }: { pax?: number; bags?: number }) {
  const { setField } = useBooking();
  // set on first render via effect-free direct calls in a button the test clicks, OR a small effect
  return (
    <button onClick={() => {
      setField("from", "Queen Beatrix International Airport");
      setField("to", "Palm Beach");
      setField("date", "2026-07-01");
      setField("time", "14:00");
      setField("passengers", pax);
      setField("luggage", bags);
    }}>seed</button>
  );
}

describe("StepRide", () => {
  it("shows USD fares and gates on vehicle selection", async () => {
    render(<BookingProvider><Setup /><StepRide /></BookingProvider>);
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => expect(screen.getByText(/\$\d/)).toBeInTheDocument());
  });
  it("disables vehicles too small for the party", async () => {
    render(<BookingProvider><Setup pax={7} bags={8} /><StepRide /></BookingProvider>);
    fireEvent.click(screen.getByText("seed"));
    await waitFor(() => {
      const sedan = screen.getByRole("button", { name: /Executive Sedan/i });
      expect(sedan).toBeDisabled();
    });
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- StepRide` → FAIL.

- [ ] **Step 4: Implement `src/components/booking/steps/StepRide.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useFare, fareForVehicle } from "../../../booking/useFare";
import { VEHICLES, fitsParty } from "../../../data/vehicles";
import { loadPricing, type Pricing } from "../../../lib/pricing";
import { formatMoney } from "../../../lib/currency";

export default function StepRide() {
  const { state, setField } = useBooking();
  const { loading, fare, tax, total, lineItems } = useFare();
  const [pricing, setPricing] = useState<Pricing | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPricing().then((p) => { if (!cancelled) setPricing(p); });
    return () => { cancelled = true; };
  }, []);

  const selected = VEHICLES.find((v) => v.id === state.vehicle);
  const isEstimate = fare.source === "min";

  return (
    <div>
      <div className="step-eyebrow">Your ride</div>
      <h2 className="step-title">Choose your car.</h2>
      <p className="step-desc">Each fare is the price you pay, in US dollars, with the 6% government &amp; facility tax included.</p>

      <div className="veh-list">
        {VEHICLES.map((v) => {
          const fits = fitsParty(v, state.passengers, state.luggage);
          const fareAwg = pricing ? fareForVehicle(pricing, state, v) : null;
          const cls = ["veh", state.vehicle === v.id ? "on" : "", !fits ? "disabled" : ""].filter(Boolean).join(" ");
          return (
            <button key={v.id} type="button" className={cls} disabled={!fits} onClick={() => fits && setField("vehicle", v.id)}>
              {v.note && <span className="veh-flag">{v.note}</span>}
              <div className="veh-ico">
                <svg width="34" height="20" viewBox="0 0 34 20" fill="none">
                  <rect x="2" y="8" width="30" height="10" rx="3" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M7 8 L10 3 L24 3 L27 8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                  <circle cx="8" cy="18" r="3" stroke="currentColor" strokeWidth="1.4"/>
                  <circle cx="26" cy="18" r="3" stroke="currentColor" strokeWidth="1.4"/>
                </svg>
              </div>
              <div className="veh-info">
                <div className="veh-name">{v.name}</div>
                <div className="veh-spec">
                  {v.desc} · {v.pax} pax · {v.bags} bags
                  {!fits && <span className="veh-toosmall"> · Too small for your party</span>}
                </div>
              </div>
              <div className="veh-price">
                {fareAwg !== null ? (<><div className="amt">{formatMoney(fareAwg, "USD")}</div><div className="cur">incl. tax</div></>) : (<div className="amt">—</div>)}
              </div>
            </button>
          );
        })}
      </div>

      {selected && !loading && (
        <div className="quote" style={{ marginTop: "24px" }}>
          <div className="quote-head">
            <div className="quote-route"><div className="qr-text">{state.from || "Pickup"} → {state.to || "Destination"}</div></div>
            <div className="quote-sub">
              {state.time && <span className="qs">{state.time}</span>}
              <span className="qs">{state.passengers} pax</span>
              <span className="qs">{selected.name}</span>
            </div>
          </div>
          <div className="quote-lines">
            {lineItems.map((item, i) => (
              <div key={i} className="qline">
                <span className="ql-l">{item.label}</span>
                <span className="ql-r">{formatMoney(item.amount * selected.mult, "USD")}</span>
              </div>
            ))}
            <div className="qline muted">
              <span className="ql-l">Government &amp; facility tax (6%)</span>
              <span className="ql-r">{formatMoney(tax, "USD")}</span>
            </div>
          </div>
          <div className="qtotal">
            <div className="qt-l">Total fare</div>
            <div className="qt-r">{formatMoney(total, "USD")}</div>
          </div>
        </div>
      )}

      <div className={`fare-tag${isEstimate ? " estimate" : ""}`}>
        <span className="dot" />
        {isEstimate ? "Estimate · confirmed by your driver" : "Fixed fare"}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes** — `npm test -- StepRide` → PASS (pristine). Then `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/components/booking/steps/StepRide.tsx src/components/booking/steps/StepRide.test.tsx src/styles/globals.css
git commit -m "Add StepRide screen (vehicles + USD fare summary + fixed/estimate label)"
```

---

### Task 5: StepConfirm (Screen 3) + ConfirmedBooking + payload tweak

**Files:**
- Create: `src/components/booking/steps/StepConfirm.tsx`
- Modify: `src/lib/bookingPayload.ts` (make `journey` optional)
- Test: `src/components/booking/steps/StepConfirm.test.tsx`

**Interfaces:**
- Consumes: `useBooking()`, `useAuth()` (`{ user, loading, signInWithProvider, signInWithEmail }`), `useFare()`, `buildRidePayload`, `supabase`, `formatMoney`.
- Produces:
  - `export interface ConfirmedBooking { rideId: string; from: string; to: string; date: string; time: string; vehicle: string | null; total: number }` (USD; **no** `currency` field).
  - `default function StepConfirm({ onConfirmed }: { onConfirmed?: (b: ConfirmedBooking) => void })` — when not signed in, shows the Google/Apple/email sign-in (salvaged from `StepAccount`); when signed in, shows the booking summary + reserve-now card + a Confirm button that inserts into `rides` (`withCoords → core` fallback) and calls `onConfirmed`.

- [ ] **Step 1: Make `journey` optional in `src/lib/bookingPayload.ts`**

Change the `BookingState` type's first field to: `journey?: string | null;` (everything else unchanged). This lets `StepConfirm` omit `journey`. The existing `bookingPayload.test.ts` still passes (it provides `journey`).

- [ ] **Step 2: Write the failing test `src/components/booking/steps/StepConfirm.test.tsx`**

Mock `useAuth` to return a signed-in `user` (`{ id: "u1", email: "a@b.com" }`), mock `useFare` to return fixed totals, and mock `supabase` so `from("rides").insert(...).select().single()` resolves `{ data: { id: "ride-1" }, error: null }`. Render `StepConfirm` with an `onConfirmed` spy in a `BookingProvider` (seed minimal state), click **Confirm**, `await waitFor`, assert `supabase.from` was called with `"rides"` and the spy received `{ rideId: "ride-1" }`.

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../booking/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "a@b.com" }, loading: false, signInWithProvider: vi.fn(), signInWithEmail: vi.fn() }) }));
vi.mock("../../../booking/useFare", () => ({ useFare: () => ({ loading: false, fare: { source: "route" }, base: 40, tax: 2.4, total: 42.4, lineItems: [] }), fareForVehicle: () => 42.4 }));
const insert = vi.fn(() => ({ select: () => ({ single: () => Promise.resolve({ data: { id: "ride-1" }, error: null }) }) }));
vi.mock("../../../lib/supabase", () => ({ supabase: { from: vi.fn(() => ({ insert })) } }));

import { supabase } from "../../../lib/supabase";
import { BookingProvider } from "../../../booking/BookingContext";
import StepConfirm from "./StepConfirm";

describe("StepConfirm", () => {
  it("writes a rides row and reports the id on confirm", async () => {
    const onConfirmed = vi.fn();
    render(<BookingProvider><StepConfirm onConfirmed={onConfirmed} /></BookingProvider>);
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith(expect.objectContaining({ rideId: "ride-1" })));
    expect(supabase.from).toHaveBeenCalledWith("rides");
  });
});
```

- [ ] **Step 3: Run to verify it fails** — `npm test -- StepConfirm` → FAIL.

- [ ] **Step 4: Implement `src/components/booking/steps/StepConfirm.tsx`**

Salvage the sign-in UI verbatim from the current `StepAccount.tsx` (Google/Apple buttons, email magic-link, `acct-note`) and the confirm/summary/reserve logic from the current `StepPayment.tsx`, merged into one component, USD-only, with the new `ConfirmedBooking` (no `currency`). Keep the reserve-now copy verbatim, no exclamation points. Structure:

```tsx
import { useState } from "react";
import { useBooking } from "../../../booking/BookingContext";
import { useAuth } from "../../../booking/useAuth";
import { useFare } from "../../../booking/useFare";
import { buildRidePayload } from "../../../lib/bookingPayload";
import { supabase } from "../../../lib/supabase";
import { formatMoney } from "../../../lib/currency";

export interface ConfirmedBooking {
  rideId: string; from: string; to: string; date: string; time: string; vehicle: string | null; total: number;
}

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

export default function StepConfirm({ onConfirmed }: { onConfirmed?: (b: ConfirmedBooking) => void }) {
  const { state } = useBooking();
  const { user, loading: authLoading, signInWithProvider, signInWithEmail } = useAuth();
  const { base, total, loading } = useFare();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEmail() {
    if (!email.trim()) return;
    setSending(true);
    await signInWithEmail(email.trim());
    setSending(false);
    setSent(true);
  }

  async function handleConfirm() {
    if (!user) return;
    setBusy(true);
    setError(null);
    const payloadState = {
      from: state.from, to: state.to, date: state.date, time: state.time,
      passengers: state.passengers, luggage: state.luggage, vehicle: state.vehicle,
      fareBase: base, fareTotal: total, addonKeys: [] as string[],
    };
    const { withCoords, core } = buildRidePayload(payloadState, user.id);
    let { data, error: err } = await supabase.from("rides").insert(withCoords).select().single();
    if (err) ({ data, error: err } = await supabase.from("rides").insert(core).select().single());
    if (err || !data) { setError(err?.message ?? "Something went wrong. Please try again."); setBusy(false); return; }
    onConfirmed?.({ rideId: data.id, from: state.from, to: state.to, date: state.date, time: state.time, vehicle: state.vehicle, total });
    setBusy(false);
  }

  if (authLoading) {
    return (<div><div className="step-eyebrow">Confirm</div><h2 className="step-title">Almost there.</h2><p className="step-desc" style={{ color: "var(--silver-dim)" }}>Checking sign-in status…</p></div>);
  }

  if (!user) {
    return (
      <div>
        <div className="step-eyebrow">Confirm</div>
        <h2 className="step-title">Hold this under your name.</h2>
        <p className="step-desc">Continue with Google or Apple to keep your trip, your receipt, and any changes in one place.</p>
        <div className="oauth">
          <button className="oauth-btn google" type="button" onClick={() => signInWithProvider("google")}>
            <svg width="19" height="19" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1H12v2.9h5.35c-.25 1.36-1.6 4-5.35 4a5.9 5.9 0 0 1 0-11.8c1.68 0 2.8.71 3.45 1.32l2.35-2.27C16.46 3.9 14.43 3 12 3a9 9 0 1 0 0 18c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.29-2.1Z"/></svg>
            Continue with Google
          </button>
          <button className="oauth-btn apple" type="button" onClick={() => signInWithProvider("apple")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M16.36 12.62c.03 2.9 2.55 3.86 2.58 3.87-.02.07-.4 1.38-1.33 2.73-.8 1.17-1.64 2.33-2.96 2.35-1.3.03-1.72-.77-3.2-.77-1.5 0-1.95.75-3.18.8-1.27.05-2.24-1.27-3.05-2.43-1.65-2.4-2.92-6.77-1.22-9.73.84-1.47 2.35-2.4 3.99-2.43 1.25-.02 2.43.84 3.2.84.76 0 2.2-1.04 3.7-.89.63.03 2.4.26 3.54 1.92-.09.06-2.11 1.24-2.08 3.7M14 5.4c.68-.82 1.13-1.96 1-3.1-.97.04-2.15.65-2.85 1.47-.63.72-1.18 1.88-1.03 2.99 1.08.08 2.19-.55 2.88-1.36"/></svg>
            Continue with Apple
          </button>
        </div>
        <div className="or-rule">or by email</div>
        {sent ? (
          <p className="step-desc" style={{ textAlign: "center", marginTop: 0 }}>Check your inbox — a sign-in link is on its way to <strong>{email}</strong>.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input className="txt" type="email" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleEmail()} />
            <button className="btn-primary" type="button" onClick={handleEmail} disabled={!email.trim() || sending}>{sending ? "Sending…" : "Continue with email"}</button>
          </div>
        )}
        <p className="acct-note">We use your account only to manage this booking and send your confirmation. No marketing, no noise.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="step-eyebrow">Confirm</div>
      <h2 className="step-title">Confirm your ride.</h2>
      <p className="step-desc">Signed in as <strong>{user.email}</strong>. Review and confirm — your card will not be charged today.</p>
      <div className="pay-summary">
        <div className="ps-row"><span className="ps-l">Route</span><span className="ps-r">{state.from || "—"} → {state.to || "—"}</span></div>
        <div className="ps-row"><span className="ps-l">When</span><span className="ps-r">{state.time || "—"}</span></div>
        <div className="ps-row"><span className="ps-l">Passengers</span><span className="ps-r">{state.passengers}</span></div>
        <div className="ps-row ps-total"><span className="ps-l">Total fare</span><span className="ps-r ps-amount">{loading ? "…" : formatMoney(total, "USD")}</span></div>
      </div>
      {!STRIPE_KEY && (
        <div className="pay-card">
          <div className="pay-reserve-badge">Reserve now, pay on the day</div>
          <p className="pay-secure">No charge today. Your driver will confirm your booking and collect payment on the day of your transfer. Fixed fare — the price you see is the price you pay.</p>
        </div>
      )}
      {error && <div className="pay-error" role="alert">{error}</div>}
      <button className="btn-primary pay-confirm" onClick={handleConfirm} disabled={busy || loading} style={{ marginTop: "28px", width: "100%", justifyContent: "center" }}>
        {busy ? "Confirming…" : <>Confirm <span className="arr">→</span></>}
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes** — `npm test -- "StepConfirm|bookingPayload"` → PASS (pristine). Then `npm run build`.

- [ ] **Step 6: Commit**

```bash
git add src/components/booking/steps/StepConfirm.tsx src/components/booking/steps/StepConfirm.test.tsx src/lib/bookingPayload.ts
git commit -m "Add StepConfirm screen (account + reserve) with USD ConfirmedBooking"
```

---

### Task 6: Cutover — 3-step context, overlay, app wiring; delete old steps

**Files:**
- Modify: `src/booking/BookingContext.tsx`, `src/booking/BookingContext.test.tsx`
- Modify: `src/components/booking/BookingOverlay.tsx`, `src/components/booking/BookingOverlay.test.tsx`
- Modify: `src/App.tsx`, `src/components/Confirmation.tsx`
- Delete: `StepJourney.tsx`, `StepRoute.tsx`, `StepSchedule.tsx`, `StepParty.tsx`, `StepVehicle.tsx`, `StepQuote.tsx`, `StepAccount.tsx`, `StepPayment.tsx`, `src/components/CurrencyToggle.tsx`, and the tests `StepRoute.test.tsx`, `StepParty.test.tsx`, `StepVehicle.test.tsx`, `StepPayment.test.tsx`

**Interfaces:**
- Produces: `STEP_NAMES = ['Trip','Ride','Confirm']`; `BookingState` without `journey`/`currency`; `canContinue` per the 3 steps; `BookingOverlay` rendering `StepTrip`/`StepRide`/`StepConfirm`.

- [ ] **Step 1: Rewrite `src/booking/BookingContext.tsx`**

Replace `STEP_NAMES` with `["Trip", "Ride", "Confirm"] as const`. Remove `journey` and `currency` from `BookingState`, `initialState`, and the `OPEN` reducer case (`OPEN` now just `{ ...state, open: true, step: 0 }`; drop the `journeyKey` param — `open()` takes no args). Replace `computeCanContinue` with:

```ts
function computeCanContinue(state: BookingState): boolean {
  switch (state.step) {
    case 0: // Trip
      return !!state.from && !!state.to && !!state.date && !!state.time && state.passengers >= 1;
    case 1: // Ride
      return !!state.vehicle;
    case 2: // Confirm
      return state.signedIn;
    default:
      return true;
  }
}
```

Update the `open` callback/type to `open: () => void` and the `OPEN` action to `{ type: "OPEN" }`. Keep everything else (memoized actions, `SET_FIELD` bail, `useMemo` value, `useBooking` guard) intact.

- [ ] **Step 2: Update `src/booking/BookingContext.test.tsx`** to the 3-step gates:

```tsx
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "./BookingContext";

const wrapper = ({ children }: { children: React.ReactNode }) => <BookingProvider>{children}</BookingProvider>;

describe("BookingContext", () => {
  it("gates Trip until from+to+when+passengers are set", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => result.current.open());
    expect(result.current.state.open).toBe(true);
    expect(result.current.canContinue).toBe(false);
    act(() => {
      result.current.setField("from", "Airport");
      result.current.setField("to", "Palm Beach");
      result.current.setField("date", "2026-07-01");
      result.current.setField("time", "14:00");
    });
    expect(result.current.canContinue).toBe(true);
  });
  it("gates Ride on vehicle and Confirm on signedIn", () => {
    const { result } = renderHook(() => useBooking(), { wrapper });
    act(() => { result.current.open(); result.current.goTo(1); });
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("vehicle", "sedan"));
    expect(result.current.canContinue).toBe(true);
    act(() => result.current.goTo(2));
    expect(result.current.canContinue).toBe(false);
    act(() => result.current.setField("signedIn", true));
    expect(result.current.canContinue).toBe(true);
  });
});
```

- [ ] **Step 3: Rewrite `src/components/booking/BookingOverlay.tsx`** — swap the step imports/switch to the 3 new steps and change the progress label to `of 3`:

Replace the eight step imports with:
```tsx
import StepTrip from "./steps/StepTrip";
import StepRide from "./steps/StepRide";
import StepConfirm from "./steps/StepConfirm";
import type { ConfirmedBooking } from "./steps/StepConfirm";
```
Replace `renderStep` with:
```tsx
function renderStep(step: number, onConfirmed?: (b: ConfirmedBooking) => void) {
  switch (step) {
    case 0: return <StepTrip />;
    case 1: return <StepRide />;
    case 2: return <StepConfirm onConfirmed={onConfirmed} />;
    default: return <StepTrip />;
  }
}
```
Change `const showFooter = state.step !== 7;` to `const showFooter = state.step !== 2;` (Confirm has its own button). Change the label `Step {state.step + 1} of 8` to `Step {state.step + 1} of 3`.

- [ ] **Step 4: Update `src/components/booking/BookingOverlay.test.tsx`** — change the expected text to `Step 1 of 3`.

- [ ] **Step 5: Update `src/App.tsx`** — change the import:
```tsx
import type { ConfirmedBooking } from "./components/booking/steps/StepConfirm";
```
(Everything else in `App.tsx` stays — `Landing onOpenBooking={open}` still works since `open()` now ignores args; the `signedIn` sync effect stays.)

- [ ] **Step 6: Update `src/components/Confirmation.tsx`** — change the import to `import type { ConfirmedBooking } from "./booking/steps/StepConfirm";` and change the total line from `formatMoney(booking.total, booking.currency)` to `formatMoney(booking.total, "USD")`. (`ConfirmedBooking` no longer has `currency`.)

- [ ] **Step 7: Delete obsolete files**

```bash
cd /Users/stevenmac/Documents/CABBYS/Cabbys-web
git rm src/components/booking/steps/StepJourney.tsx src/components/booking/steps/StepRoute.tsx \
  src/components/booking/steps/StepSchedule.tsx src/components/booking/steps/StepParty.tsx \
  src/components/booking/steps/StepVehicle.tsx src/components/booking/steps/StepQuote.tsx \
  src/components/booking/steps/StepAccount.tsx src/components/booking/steps/StepPayment.tsx \
  src/components/CurrencyToggle.tsx \
  src/components/booking/steps/StepRoute.test.tsx src/components/booking/steps/StepParty.test.tsx \
  src/components/booking/steps/StepVehicle.test.tsx src/components/booking/steps/StepPayment.test.tsx
```

- [ ] **Step 8: Verify** — `npm test` (whole suite, must be green + pristine) and `npm run build` (clean). Confirm no remaining import of a deleted file: `grep -rn "StepPayment\|StepQuote\|StepVehicle\|StepAccount\|StepRoute\|StepJourney\|StepSchedule\|StepParty\|CurrencyToggle" src/` returns nothing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Cut over booking to 3-screen flow; remove 8-step components"
```

---

### Task 7: EntryCard category quick-picks + final verification

**Files:**
- Modify: `src/components/EntryCard.tsx`
- Test: existing `src/pages/Landing.test.tsx` must still pass.

**Interfaces:**
- Consumes: `CATEGORIES` from `src/data/places.ts`; `onBegin` prop (already `() => void` via `open`).

- [ ] **Step 1: Update `src/components/EntryCard.tsx`** — replace the `JOURNEYS` import and chips with `CATEGORIES`; each chip opens the overlay:

```tsx
import { CATEGORIES } from "../data/places";

export default function EntryCard({ onBegin }: { onBegin: () => void }) {
  return (
    <div className="entry">
      <div className="entry-head">
        <span className="h">Plan your transfer</span>
        <span className="availpill"><span className="pulse"></span>Drivers on the island</span>
      </div>
      <div className="chips">
        {CATEGORIES.map((c) => (
          <button key={c.key} type="button" className="chip" onClick={onBegin}>{c.label}</button>
        ))}
      </div>
      <div className="route">
        <div className="rfield">
          <span className="ring"></span>
          <div><div className="lbl">From</div><div className="val placeholder">Choose pickup</div></div>
        </div>
        <div className="rconnector"></div>
        <div className="rfield">
          <span className="rdiamond"></span>
          <div><div className="lbl">To</div><div className="val placeholder">Choose destination</div></div>
        </div>
      </div>
      <button className="entry-cta" onClick={onBegin}>Begin <span className="arr">→</span></button>
    </div>
  );
}
```

If `Hero`/`Landing` pass `onBegin`/`onOpenBooking` expecting a `(journeyKey?: string) => void`, simplify those call sites to `() => void` (the value is `open`, which now takes no args). Update `Landing.tsx` / `Hero.tsx` prop types from `(journeyKey?: string) => void` to `() => void` as needed so the build stays strict-clean.

- [ ] **Step 2: Verify** — `npm test` (whole suite green + pristine; `Landing.test` still asserts hero/ethos copy and no `!`), `npm run build` clean, and `grep -rn "C9A05A\|var(--gold)\|5FB58A\|e87a7a" src/` returns nothing (palette intact).

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "EntryCard chips become category quick-picks"
```

- [ ] **Step 4: Pricing-data sanity check (manual, non-blocking)**

Run `npm run dev` and book Airport → Palm Beach (should show an exact **Fixed fare** in USD) and Airport → a hotel (note whether it resolves to a fixed fare or an estimate). If common airport→hotel routes show "Estimate", that is a Supabase **data** coverage gap (missing `pricing_routes`/zone-matrix rows), not a code bug — record it for a separate data task; the code labels honestly either way.

---

## Self-Review Notes

- **Spec coverage:** §2 three screens → Tasks 3,4,5 + cutover (6); §3 USD-only → StepRide/StepConfirm/Confirmation use `formatMoney(_, "USD")`, `CurrencyToggle` deleted, `currency` dropped from state (6) and `ConfirmedBooking` (5); §4 source-based labels → StepRide `fare.source` (4); §5 catalog → places.ts (1); §6 components new/changed/removed → Tasks 1–7; §7 brand/voice → recolored CSS + verification greps; §9 testing → each task's tests + final pristine suite.
- **Placeholder scan:** every code step has full code or an exact edit; deletions are explicit `git rm`; no "TBD".
- **Type consistency:** `ConfirmedBooking` (no `currency`) defined in StepConfirm (5), imported by BookingOverlay/App/Confirmation (6); `Category`/`Place`/`placesByCategory`/`searchPlaces` (1) used by DestinationField (2) and EntryCard (7); `Stepper` gains `testId` (3) used by StepTrip; `open()` becomes arg-less (6) and EntryCard/Landing call sites updated (7); `useFare` shape and `fare.source` (existing) consumed by StepRide (4).
