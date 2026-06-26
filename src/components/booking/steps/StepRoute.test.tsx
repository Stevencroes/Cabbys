import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepRoute from "./StepRoute";

function CanContinueHarness() {
  const { canContinue, open, goTo } = useBooking();
  return (
    <>
      <button onClick={() => { open("airport"); goTo(1); }}>go</button>
      <StepRoute />
      <span data-testid="can-continue">{canContinue ? "yes" : "no"}</span>
    </>
  );
}

describe("StepRoute", () => {
  it("enables canContinue after selecting from and to", () => {
    render(<BookingProvider><CanContinueHarness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));

    // Initially canContinue should be false (no from/to set)
    expect(screen.getByTestId("can-continue").textContent).toBe("no");

    // Select airport as pickup (first option button)
    const airportButtons = screen.getAllByRole("button", { name: /Queen Beatrix/i });
    fireEvent.click(airportButtons[0]);

    // Select a hotel as destination (there are two lists, find the one in Destination)
    // Hilton appears in the destination list too — click the second instance
    const hiltonButtons = screen.getAllByRole("button", { name: /Hilton Aruba/i });
    fireEvent.click(hiltonButtons[hiltonButtons.length - 1]);

    expect(screen.getByTestId("can-continue").textContent).toBe("yes");
  });
});
