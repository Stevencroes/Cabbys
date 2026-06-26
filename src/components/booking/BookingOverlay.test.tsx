import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { BookingProvider, useBooking } from "../../booking/BookingContext";
import BookingOverlay from "./BookingOverlay";

function Harness() {
  const { open } = useBooking();
  return <><button onClick={() => open()}>go</button><BookingOverlay /></>;
}

describe("BookingOverlay", () => {
  it("shows step 1 of 3 when opened", () => {
    render(<BookingProvider><Harness /></BookingProvider>);
    fireEvent.click(screen.getByText("go"));
    expect(screen.getByText(/Step 1 of 3/i)).toBeInTheDocument();
  });
});
