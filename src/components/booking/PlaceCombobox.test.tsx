import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import PlaceCombobox from "./PlaceCombobox";
import { AIRPORT, COMMON_PICKUPS, displayName, selFromPlace, type PlaceSel } from "../../data/places";

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

/** The island, stubbed. mapboxEnabled is read at import, so the module is
    mocked whole rather than the token being faked. */
const island = { results: [] as unknown[] };
vi.mock("../../lib/mapbox", () => ({
  mapboxEnabled: true,
  geocode: async () => island.results,
}));
afterEach(() => { island.results = []; });

/** <Marked> splits a row's name around the run that matched, so the name
    is not one text node. Read the line, not the fragments. */
const rowNamed = (name: string) =>
  screen.getAllByRole("option").find((li) => li.querySelector(".on")?.textContent === name);

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
    expect(box()).toHaveValue(displayName(selFromPlace(AIRPORT)));
    fireEvent.focus(box());
    expect(box()).toHaveValue("");
    // the place it held stays readable while you replace it
    expect(box()).toHaveAttribute("placeholder", displayName(selFromPlace(AIRPORT)));
    type("pal");
    expect(box()).toHaveValue("pal");
    for (const o of opts()) expect(o.textContent?.toLowerCase()).toContain("pal");
  });

  it("puts the held place back when the search is abandoned", () => {
    render(<Harness initial={selFromPlace(AIRPORT)} />);
    fireEvent.focus(box());
    type("pal");
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(box()).toHaveValue(displayName(selFromPlace(AIRPORT)));
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
    const name = row.querySelector(".on")!.textContent;
    fireEvent.pointerDown(row);
    // the real listener is on document and fires for the same event
    fireEvent.pointerDown(document);
    expect(onSelect).toHaveBeenCalledOnce();
    expect(box()).toHaveValue(name);
    expect(box()).not.toHaveValue(AIRPORT.name);
  });

  // A booking card cell is about twenty-six characters wide. The airport's
  // canonical name is thirty-five, and the eleven it loses are the ones that
  // say what it is — "Queen Beatrix Internati…" could be a hotel. The field
  // shows a name a person would say out loud; everything that has to match
  // the rate card, or reach a driver, still gets the full one.
  it("shows a name that fits the field, and keeps the one that matters", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.focus(box());
    type("Queen Beatrix");
    // the dropdown has room, so the dropdown says all of it
    expect(opts()[0].querySelector(".on")!.textContent).toBe(AIRPORT.name);
    fireEvent.pointerDown(opts()[0]);

    expect(box()).toHaveValue("Queen Beatrix Airport");
    // …and what was actually selected is unshortened, because quote.ts
    // matches pricing_locations on this string
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: AIRPORT.name }));
    // the whole thing is one hover away for anyone who wants it
    expect(box()).toHaveAttribute("title", AIRPORT.name);
  });

  // The sheet takes the whole screen; opening it on one line of hint text
  // wastes it. Five shortcuts is not the 62-row dump that started all this —
  // and CSS keeps them off the desktop dropdown, where blank IS right.
  it("offers a handful of shortcuts before anything is typed", () => {
    render(<Harness />);
    fireEvent.focus(box());
    const quick = document.querySelectorAll(".cquick button");
    expect(quick).toHaveLength(COMMON_PICKUPS.length);
    expect(quick.length).toBeLessThanOrEqual(6);
    // still not a listbox — nothing has been searched for
    expect(box()).toHaveAttribute("aria-expanded", "false");
  });

  it("takes a shortcut as the answer", () => {
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    fireEvent.focus(box());
    fireEvent.pointerDown(document.querySelectorAll(".cquick button")[0]);
    expect(onSelect).toHaveBeenCalledOnce();
    // the field's name, not the rate card's — same rule as any other row
    expect(box()).toHaveValue(displayName(selFromPlace(COMMON_PICKUPS[0])));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: COMMON_PICKUPS[0].name }));
  });

  it("drops the area chip when it only repeats the name", () => {
    render(<Harness />);
    fireEvent.focus(box());
    for (const btn of document.querySelectorAll(".cquick button")) {
      const area = btn.querySelector(".oarea")?.textContent;
      const name = btn.querySelector(".qn")?.textContent;
      if (area) expect(area).not.toEqual(name);
    }
    // Palm Beach is a place whose area is its own name — it must show none
    const palm = [...document.querySelectorAll(".cquick button")]
      .find((b) => b.querySelector(".qn")?.textContent === "Palm Beach");
    expect(palm?.querySelector(".oarea")).toBeNull();
  });

  it("wipes the search in one tap, back to the shortcuts", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("palm");
    expect(opts().length).toBeGreaterThan(0);
    fireEvent.pointerDown(screen.getByLabelText(/clear what you typed/i));
    expect(box()).toHaveValue("");
    expect(opts()).toHaveLength(0);
    expect(document.querySelectorAll(".cquick button")).toHaveLength(COMMON_PICKUPS.length);
  });

  it("offers the typed text as an address once there is enough of it", () => {
    render(<Harness />);
    fireEvent.focus(box());
    type("zzz");
    expect(screen.queryByText(/as an address/i)).toBeNull();
    type("zzzz");
    expect(screen.getByText(/as an address/i)).toBeTruthy();
  });

  // Sixty places is every place a ride usually starts or ends at, and it
  // always will be — nobody is typing every villa on the island into a
  // TypeScript file. So the rest of Aruba comes from the geocoder, and the
  // two have to read as one list.
  describe("every address in Aruba", () => {
    it("offers what the catalog does not have, priced from where it is", async () => {
      island.results = [{
        id: "mb-address.1", name: "Sasakiweg 34", address: "Oranjestad",
        kind: "address", lat: 12.513, lon: -70.026,
      }];
      const onSelect = vi.fn();
      render(<Harness onSelect={onSelect} />);
      fireEvent.focus(box());
      type("sasakiweg");

      await waitFor(() => expect(rowNamed("Sasakiweg 34")).toBeTruthy());
      const row = rowNamed("Sasakiweg 34")!;
      expect(row.querySelector(".oa")!.textContent).toBe("Oranjestad");
      fireEvent.pointerDown(row);

      // it commits like any other place, with an AREA — which is the fare
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
        name: "Sasakiweg 34", area: "Oranjestad", custom: true,
      }));
    });

    it("keeps our row for a place we already price", async () => {
      // The geocoder's copy of a catalog hotel would fall to the km model
      // instead of the rate card — the same place at a different price.
      island.results = [
        { id: "mb-poi.1", name: "Manchebo Beach Resort", address: "Eagle Beach",
          kind: "poi", lat: 12.552, lon: -70.049 },
        { id: "mb-poi.2", name: "Manchebo Apartments", address: "Eagle Beach",
          kind: "poi", lat: 12.553, lon: -70.048 },
      ];
      render(<Harness />);
      fireEvent.focus(box());
      type("manchebo");

      await waitFor(() => expect(rowNamed("Manchebo Apartments")).toBeTruthy());
      // one row for the resort, and it is the catalog's
      const rows = screen.getAllByRole("option")
        .filter((li) => li.querySelector(".on")?.textContent === "Manchebo Beach Resort");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).not.toContain("mb-");
    });

    it("stops offering the guess-your-own-area form once the island answers", async () => {
      // With real coordinates above it, "pick an area from this menu" is a
      // worse answer offered next to better ones.
      island.results = [{
        id: "mb-poi.9", name: "Villa Kunuku", address: "Paradera",
        kind: "poi", lat: 12.505, lon: -69.995,
      }];
      render(<Harness />);
      fireEvent.focus(box());
      type("villa kunuku");
      await waitFor(() => expect(rowNamed("Villa Kunuku")).toBeTruthy());
      expect(screen.queryByText(/use .* as an address/i)).toBeNull();
    });

    it("still offers it when the island cannot be searched at all", async () => {
      island.results = [];
      render(<Harness />);
      fireEvent.focus(box());
      type("villa kunuku");
      await waitFor(() => expect(screen.getByText(/use .* as an address/i)).toBeInTheDocument());
    });
  });
});
