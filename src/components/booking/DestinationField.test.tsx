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
