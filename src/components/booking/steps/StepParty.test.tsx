import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepParty from "./StepParty";

function Harness() {
  const { open } = useBooking();
  return <><button onClick={() => open("airport")}>go</button><StepParty /></>;
}

describe("StepParty", () => {
  it("increments passengers and clamps at the minimum", () => {
    render(<BookingProvider><Harness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));
    const plus = screen.getAllByRole("button", { name: "+" })[0];
    fireEvent.click(plus);
    expect(screen.getByTestId("pax-num").textContent).toBe("3");
  });

  it("does not decrement passengers below 1", () => {
    render(<BookingProvider><Harness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));
    // initial passengers is 2; go to 1
    const minus = screen.getAllByRole("button", { name: "−" })[0];
    fireEvent.click(minus);
    expect(screen.getByTestId("pax-num").textContent).toBe("1");
    // now the minus button should be disabled
    expect(minus).toBeDisabled();
  });
});
