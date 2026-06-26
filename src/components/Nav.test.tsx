import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Nav from "./Nav";

describe("Nav", () => {
  it("renders wordmark and triggers sign-in", () => {
    const onSignIn = vi.fn();
    render(<Nav onSignIn={onSignIn} />);
    expect(screen.getByText("Cabby's")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
