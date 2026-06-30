import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../booking/BookingContext";
import BookingOverlay from "./BookingOverlay";

function Harness() {
  const { open } = useBooking();
  return <><button onClick={() => open()}>go</button><BookingOverlay /></>;
}

describe("BookingOverlay", () => {
  it("marks the first step active when opened", () => {
    render(<BookingProvider><Harness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));
    const nav = screen.getByLabelText("Booking progress");
    const active = nav.querySelector(".pstep.active .plbl");
    expect(active).toHaveTextContent("Where to");
  });
});
