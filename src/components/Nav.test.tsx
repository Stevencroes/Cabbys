import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Nav from "./Nav";

describe("Nav", () => {
  it("renders wordmark and triggers sign-in", () => {
    const onSignIn = vi.fn();
    render(<Nav onSignIn={onSignIn} />);
    // Wordmark renders with the apostrophe as its own accent span.
    const wordmark = screen.getByRole("link", { name: /Cabby's — Home/i });
    expect(wordmark).toHaveTextContent("Cabby's");
    // Sign in appears in both the desktop pill and the mobile dropdown.
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[0]);
    expect(onSignIn).toHaveBeenCalledOnce();
  });
});
