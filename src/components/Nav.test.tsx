import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import Nav from "./Nav";

describe("Nav", () => {
  it("renders wordmark and triggers sign-in", () => {
    const onSignIn = vi.fn();
    render(<Nav onSignIn={onSignIn} />);
    const wordmark = screen.getByRole("link", { name: /Cabby's — Home/i });
    expect(wordmark).toHaveTextContent("Cabby's");
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[0]);
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("puts every destination behind one tap on a phone (Phase 2)", () => {
    render(<Nav onSignIn={vi.fn()} />);
    const burger = screen.getByRole("button", { name: /open menu/i });
    expect(burger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(burger);
    const sheet = screen.getByRole("dialog", { name: /menu/i });
    const items = within(sheet);
    for (const label of [/how it works/i, /fleet/i, /faq/i, /my trips/i]) {
      expect(items.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(items.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    render(<Nav onSignIn={vi.fn()} />);
    const burger = screen.getByRole("button", { name: /open menu/i });
    fireEvent.click(burger);
    expect(screen.getByRole("dialog", { name: /menu/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /menu/i })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /open menu/i }));
  });

  it("signing in from the sheet closes it", () => {
    const onSignIn = vi.fn();
    render(<Nav onSignIn={onSignIn} />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const sheet = screen.getByRole("dialog", { name: /menu/i });
    fireEvent.click(within(sheet).getByRole("button", { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: /menu/i })).toBeNull();
  });
});
