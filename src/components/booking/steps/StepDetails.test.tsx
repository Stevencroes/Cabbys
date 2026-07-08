import { useEffect } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("../../../booking/useAuth", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signInWithProvider: vi.fn(),
    signInWithPassword: vi.fn(),
    signUpWithPassword: vi.fn(),
  }),
}));

import { BookingProvider, useBooking } from "../../../booking/BookingContext";
import StepDetails from "./StepDetails";

function Harness({ from, to }: { from: string; to: string }) {
  const { setField, canContinue, goTo } = useBooking();
  useEffect(() => { goTo(2); }, [goTo]);
  return (
    <>
      <button onClick={() => { setField("from", from); setField("to", to); }}>seed</button>
      <div data-testid="gate">{canContinue ? "yes" : "no"}</div>
    </>
  );
}

function renderStep(from = "Queen Beatrix International Airport", to = "Palm Beach") {
  return render(
    <BookingProvider>
      <Harness from={from} to={to} />
      <StepDetails />
    </BookingProvider>,
  );
}

describe("StepDetails", () => {
  it("unlocks once name + phone are filled — no account required", () => {
    renderStep();
    fireEvent.click(screen.getByText("seed"));
    expect(screen.getByTestId("gate").textContent).toBe("no");
    fireEvent.change(screen.getByLabelText(/lead passenger/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/whatsapp number/i), { target: { value: "+1 555 123 4567" } });
    expect(screen.getByTestId("gate").textContent).toBe("yes");
  });

  it("shows the flight field only for airport transfers", () => {
    renderStep();
    fireEvent.click(screen.getByText("seed"));
    expect(screen.getByLabelText(/flight number/i)).toBeInTheDocument();
  });

  it("hides the flight field for island-only trips", () => {
    renderStep("Eagle Beach", "Palm Beach");
    fireEvent.click(screen.getByText("seed"));
    expect(screen.queryByLabelText(/flight number/i)).not.toBeInTheDocument();
  });
});
