import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Nav from "./Nav";

// Signed out unless a test says otherwise — the nav reads the session now.
const signOut = vi.fn().mockResolvedValue({ error: null });
vi.mock("../booking/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: null, account: null, loading: false })),
}));
import { useAuth } from "../booking/useAuth";

// The nav's links are router links; cross-route anchors depend on it.
function renderNav(onSignIn = vi.fn()) {
  return render(
    <MemoryRouter>
      <Nav onSignIn={onSignIn} />
    </MemoryRouter>,
  );
}

describe("Nav", () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, account: null, loading: false, signOut,
    } as unknown as ReturnType<typeof useAuth>);
  });

  /** Signs the tests in as someone, optionally carrying a name. */
  function asAccount(extra: Record<string, unknown> = {}) {
    const account = { id: "u1", email: "greta@example.com", ...extra };
    vi.mocked(useAuth).mockReturnValue({
      user: account, account, loading: false, signOut,
    } as unknown as ReturnType<typeof useAuth>);
  }

  it("renders wordmark and triggers sign-in", () => {
    const onSignIn = vi.fn();
    renderNav(onSignIn);
    const wordmark = screen.getByRole("link", { name: /Cabby's — Home/i });
    expect(wordmark).toHaveTextContent("Cabby's");
    fireEvent.click(screen.getAllByRole("button", { name: /sign in/i })[0]);
    expect(onSignIn).toHaveBeenCalledOnce();
  });

  it("puts every destination behind one tap on a phone (Phase 2)", () => {
    renderNav();
    const burger = screen.getByRole("button", { name: /open menu/i });
    expect(burger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(burger);
    const sheet = screen.getByRole("dialog", { name: /menu/i });
    const items = within(sheet);
    // §06's four, and nothing promised that isn't there
    for (const label of [/services/i, /vehicles/i, /about us/i, /contact/i]) {
      expect(items.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(items.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close menu/i })).toHaveAttribute("aria-expanded", "true");
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    renderNav();
    const burger = screen.getByRole("button", { name: /open menu/i });
    fireEvent.click(burger);
    expect(screen.getByRole("dialog", { name: /menu/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /menu/i })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /open menu/i }));
  });

  it("stops saying SIGN IN once there is a session", () => {
    asAccount({ user_metadata: { full_name: "Greta Croes" } });
    renderNav();

    expect(screen.queryByRole("button", { name: /^sign in$/i })).toBeNull();
    // the bar carries initials, never the address
    expect(screen.getByRole("button", { name: /account — greta croes/i })).toHaveTextContent("GC");
    expect(screen.queryByText(/greta@example\.com/)).toBeNull();
  });

  it("keeps the address in the account menu, where it belongs", () => {
    asAccount({ user_metadata: { full_name: "Greta Croes" } });
    renderNav();
    const avatar = screen.getByRole("button", { name: /account — greta croes/i });
    expect(avatar).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(avatar);
    expect(avatar).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Greta Croes")).toBeInTheDocument();
    expect(screen.getByText("greta@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
  });

  it("falls back to the address for a name when the account has none", () => {
    asAccount();
    renderNav();
    // greta@example.com reads back as Greta rather than as the whole address
    expect(screen.getByRole("button", { name: /account — greta/i })).toHaveTextContent("G");
  });

  it("puts the profile a click from the account menu", () => {
    asAccount();
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /account — greta/i }));
    expect(screen.getByRole("link", { name: /^profile$/i })).toHaveAttribute("href", "/profile");
  });

  it("closes the account menu on Escape", () => {
    asAccount();
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /account — greta/i }));
    expect(screen.getByText("greta@example.com")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("greta@example.com")).toBeNull();
  });

  it("signs out from the account menu", () => {
    asAccount();
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /account — greta/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("treats a guest's anonymous session as signed out", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "anon-1", is_anonymous: true },
      account: null,
      loading: false,
      signOut,
    } as unknown as ReturnType<typeof useAuth>);
    renderNav();
    expect(screen.getAllByRole("button", { name: /sign in/i }).length).toBeGreaterThan(0);
  });

  it("signing in from the sheet closes it", () => {
    const onSignIn = vi.fn();
    renderNav(onSignIn);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    const sheet = screen.getByRole("dialog", { name: /menu/i });
    fireEvent.click(within(sheet).getByRole("button", { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog", { name: /menu/i })).toBeNull();
  });
});
