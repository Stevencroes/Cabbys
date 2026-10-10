import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import DateField from "./DateField";

function setup(value: string, min: string) {
  const onChange = vi.fn();
  render(<DateField id="d" label="Date" value={value} min={min} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: /date/i }));
  return { onChange, grid: screen.getByRole("grid") };
}

const days = (grid: HTMLElement) => within(grid).getAllByRole("gridcell");

describe("DateField", () => {
  it("draws the month 1 to its last day and borrows nothing from its neighbours", () => {
    // January 2027 opens on a Friday and needs six rows
    const { grid } = setup("2027-01-15", "2027-01-01");
    const cells = days(grid);
    expect(cells).toHaveLength(31);
    expect(cells[0]).toHaveTextContent(/^1$/);
    expect(cells[30]).toHaveTextContent(/^31$/);
    // no 27 December leading in, no 6 February trailing out
    expect(cells.every((c) => / Jan 2027$/.test(c.getAttribute("aria-label") ?? ""))).toBe(true);
    expect(grid).toHaveAttribute("data-weeks", "6");
  });

  it("holds the weekdays with blanks a screen reader never meets", () => {
    const { grid } = setup("2027-01-15", "2027-01-01");
    const blanks = grid.querySelectorAll(".dtf-blank");
    // Sunday to Thursday before Friday the 1st
    expect(blanks).toHaveLength(5);
    blanks.forEach((b) => {
      expect(b).toHaveAttribute("aria-hidden", "true");
      expect(b.tagName).not.toBe("BUTTON");
    });
  });

  it("is a grid of rows of cells, so it can be walked by week", () => {
    const { grid } = setup("2027-01-15", "2027-01-01");
    const rows = within(grid).getAllByRole("row");
    expect(rows).toHaveLength(6);
    // the first week starts on Friday: two days; the last has only the 31st
    expect(within(rows[0]).getAllByRole("gridcell")).toHaveLength(2);
    expect(within(rows[5]).getAllByRole("gridcell")).toHaveLength(1);
  });

  it("draws only the rows a short month needs", () => {
    // February 2037 opens on a Sunday: exactly four weeks, no blanks
    const { grid } = setup("2037-02-10", "2037-02-01");
    expect(within(grid).getAllByRole("row")).toHaveLength(4);
    expect(days(grid)).toHaveLength(28);
    expect(grid.querySelectorAll(".dtf-blank")).toHaveLength(0);
    expect(grid).toHaveAttribute("data-weeks", "4");
  });

  it("steps past the last day into the next month under the arrow keys", () => {
    const { grid } = setup("2027-01-31", "2027-01-01");
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", "February 2027");
    expect(document.activeElement).toHaveAttribute("aria-label", "Mon 1 Feb 2027");
  });

  it("steps back before the 1st into the month before", () => {
    const { grid } = setup("2027-02-01", "2027-01-01");
    fireEvent.keyDown(grid, { key: "ArrowLeft" });
    expect(screen.getByRole("grid")).toHaveAttribute("aria-label", "January 2027");
    expect(document.activeElement).toHaveAttribute("aria-label", "Sun 31 Jan 2027");
  });

  it("still refuses the days before the earliest bookable one", () => {
    const { grid, onChange } = setup("2027-01-15", "2027-01-10");
    const cells = days(grid);
    // 1 to 9 January are drawn — they are the month's own — and disabled
    cells.slice(0, 9).forEach((c) => expect(c).toBeDisabled());
    expect(cells[9]).toBeEnabled();
    fireEvent.click(cells[3]);
    expect(onChange).not.toHaveBeenCalled();
    // and the arrows will not walk into them either
    fireEvent.keyDown(grid, { key: "ArrowUp" });   // 15 → 8 is before the floor
    expect(document.activeElement).toHaveAttribute("aria-label", "Fri 15 Jan 2027");
  });
});
