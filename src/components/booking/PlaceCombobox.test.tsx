import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import PlaceCombobox from "./PlaceCombobox";
import { AIRPORT, selFromPlace, type PlaceSel } from "../../data/places";

/** The real thing is always driven by a parent that owns the selection, and
    the bugs this file guards live in that round trip — so the harness owns
    it too rather than pinning `value` to a constant. */
function Harness({ initial = null, onSelect }: { initial?: PlaceSel | null; onSelect?: (s: PlaceSel | null) => void }) {
  const [sel, setSel] = useState<PlaceSel | null>(initial);
  return (
    <PlaceCombobox
      label="Pick up"
      value={sel}
      onSelect={(s) => { setSel(s); onSelect?.(s); }}
    />
  );
}

const box = () => screen.getByRole("combobox");
const opts = () => screen.queryAllByRole("option");
const type = (s: string) => fireEvent.change(box(), { target: { value: s } });

describe("PlaceCombobox", () => {
  it("suggests nothing until something is typed", () => {
    render(<Harness />);
    fireEvent.focus(box());
    // 62 places on focus is a scroll, not a suggestion
    expect(opts()).toHaveLength(0);
    expect(box()).toHaveAttribute("aria-expanded", "false");
  });

  it("follows what is typed", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("pal");
    const names = opts().map((o) => o.textContent ?? "");
    expect(names.length).toBeGreaterThan(0);
    // every row earns its place — name, area or meta carries the letters
    for (const n of names) expect(n.toLowerCase()).toContain("pal");
    expect(box()).toHaveAttribute("aria-expanded", "true");
  });

  it("marks the run of the row that matched", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("hyat");
    const row = opts()[0];
    expect(within(row).getByText("Hyat", { selector: "mark" })).toBeTruthy();
  });

  // The bug this file exists for: the box used to render `query || value.name`,
  // so typing into a filled box inserted letters into the middle of the place
  // it was showing — "Queen Beatrix palInternational Airport" — and matched
  // nothing ever again.
  it("starts a fresh search instead of typing into the place it holds", () => {
    render(<Harness initial={selFromPlace(AIRPORT)} />);
    expect(box()).toHaveValue(AIRPORT.name);
    fireEvent.focus(box());
    expect(box()).toHaveValue("");
    // the place it held stays readable while you replace it
    expect(box()).toHaveAttribute("placeholder", AIRPORT.name);
    type("pal");
    expect(box()).toHaveValue("pal");
    for (const o of opts()) expect(o.textContent?.toLowerCase()).toContain("pal");
  });

  it("puts the held place back when the search is abandoned", () => {
    render(<Harness initial={selFromPlace(AIRPORT)} />);
    fireEvent.focus(box());
    type("pal");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box()).toHaveValue(AIRPORT.name);
    expect(opts()).toHaveLength(0);
  });

  // closeList runs from a document listener and restores the held place. Built
  // from a stale closure it restores the place held BEFORE the commit, undoing
  // the choice a moment after it is made — so it reads the current one.
  //
  // The other half of that fix cannot be tested here: committing runs on the
  // row's own pointerdown, and in a browser React has unmounted the row by the
  // time the document listener sees the same event, which is why that listener
  // ignores a detached target. jsdom flushes after the whole dispatch, so the
  // row is still attached and the race never happens. Verified in Chromium.
  it("does not undo the pick when a later outside press closes the list", () => {
    const onSelect = vi.fn();
    render(<Harness initial={selFromPlace(AIRPORT)} onSelect={onSelect} />);
    fireEvent.focus(box());
    type("ritz");
    const row = opts()[0];
    const name = within(row).getAllByText(/./)[0].textContent;
    fireEvent.pointerDown(row);
    // the real listener is on document and fires for the same event
    fireEvent.pointerDown(document);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(box()).toHaveValue(name);
    expect(box()).not.toHaveValue(AIRPORT.name);
  });

  it("offers the typed text as an address once there is enough of it", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("zzz");
    expect(screen.queryByText(/as an address/i)).toBeNull();
    type("zzzz");
    expect(screen.getByText(/as an address/i)).toBeTruthy();
  });
});
