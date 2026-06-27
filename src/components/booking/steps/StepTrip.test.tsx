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
