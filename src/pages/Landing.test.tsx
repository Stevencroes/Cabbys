import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Landing from "./Landing";

describe("Landing", () => {
  it("renders hero tagline and ethos copy with no exclamation points", () => {
    const { container } = render(<Landing onOpenBooking={() => {}} />);
    expect(screen.getByText(/silence\./i)).toBeInTheDocument();
    expect(screen.getByText(/Settled in advance/i)).toBeInTheDocument();
    expect(container.textContent).not.toContain("!");
  });
});
