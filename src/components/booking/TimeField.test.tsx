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
  it("asks once: one tap on the list is the whole answer", () => {
    const { onChange } = setup();
    openIt();
    fireEvent.click(screen.getByRole("option", { name: "9:30 AM" }));
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

  it("runs the whole day in clock order, midnight to midnight", () => {
    setup();
    openIt();
    const slots = screen.getAllByRole("option");
    expect(slots).toHaveLength(96);
    expect(slots[0]).toHaveTextContent("12:00 AM");
    expect(slots[slots.length - 1]).toHaveTextContent("11:45 PM");
  });

  it("opens on the current answer rather than at the top of the list", () => {
    setup("19:00");
    openIt();
    expect(screen.getByRole("option", { name: "7:00 PM" })).toHaveAttribute("tabindex", "0");
  });

  it("opens in daylight when there is no answer yet", () => {
    setup();
    openIt();
    // not 12:00 AM — nobody scrolls up from midnight by choice
    expect(screen.getByRole("option", { name: "8:00 AM" })).toHaveAttribute("tabindex", "0");
  });

  it("parks an exact time beside the quarter hour below it", () => {
    setup("14:35");
    openIt();
    expect(screen.getByRole("option", { name: "2:30 PM" })).toHaveAttribute("tabindex", "0");
  });

  it("holds one stop in the tab order, not ninety-six", () => {
    setup("09:30");
    openIt();
    const slots = screen.getAllByRole("option");
    expect(slots.filter((b) => b.getAttribute("tabindex") === "0")).toHaveLength(1);
  });

  it("marks itself invalid for the step validator", () => {
    render(<TimeField id="t" label="Pickup time" value="" onChange={vi.fn()} invalid />);
    expect(screen.getByRole("button", { name: /pickup time/i })).toHaveAttribute("aria-invalid", "true");
  });
});
