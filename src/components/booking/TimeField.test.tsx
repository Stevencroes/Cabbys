import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import TimeField from "./TimeField";

function setup(value = "") {
  const onChange = vi.fn();
  render(<TimeField id="t" label="Pickup time" value={value} onChange={onChange} />);
  return { onChange };
}

const openIt = () => fireEvent.click(screen.getByRole("button", { name: /pickup time/i }));

describe("TimeField", () => {
  it("asks once: one tap on the grid is the whole answer", () => {
    const { onChange } = setup();
    openIt();
    fireEvent.click(screen.getByRole("button", { name: "9:30 AM" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("09:30");
    // and it puts itself away
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("reads the time back the way a person says it", () => {
    setup("14:30");
    expect(screen.getByRole("button", { name: /pickup time/i })).toHaveTextContent("2:30 PM");
  });

  it("takes a flight time that is not on the quarter hour", () => {
    const { onChange } = setup();
    openIt();
    fireEvent.change(screen.getByLabelText(/exact time/i), { target: { value: "14:35" } });
    expect(onChange).toHaveBeenCalledWith("14:35");
  });

  it("says so when the answer is finer than the grid", () => {
    setup("14:35");
    expect(screen.getByText(/to the minute/i)).toBeInTheDocument();
  });

  it("never emits a partial answer", () => {
    const { onChange } = setup();
    openIt();
    // a half-typed native time reads back as "", which must not become a value
    fireEvent.change(screen.getByLabelText(/exact time/i), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens on the band holding the current answer", () => {
    setup("19:00");
    openIt();
    expect(screen.getByRole("tab", { name: /evening/i })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the small hours with the evening they belong to", () => {
    setup("01:15");
    openIt();
    expect(screen.getByRole("tab", { name: /overnight/i })).toHaveAttribute("aria-selected", "true");
    // and orders them after 22:00 rather than at the top of the day — the
    // trigger also reads back a time, so count only the grid's own cells
    const cells = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-t"));
    expect(cells[0]).toHaveTextContent("10:00 PM");
    expect(cells[cells.length - 1]).toHaveTextContent("4:45 AM");
  });

  it("holds one stop in the tab order, not ninety-six", () => {
    setup("09:30");
    openIt();
    const slots = screen.getAllByRole("button").filter((b) => b.hasAttribute("data-t"));
    expect(slots.filter((b) => b.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("marks itself invalid for the step validator", () => {
    render(<TimeField id="t" label="Pickup time" value="" onChange={vi.fn()} invalid />);
    expect(screen.getByRole("button", { name: /pickup time/i })).toHaveAttribute("aria-invalid", "true");
  });
});
