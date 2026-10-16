import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/**
 * An observer the test can drive. The setup file's stub never calls back,
 * which is right for the reveal system and useless for the rail, whose
 * whole state is what the observer says about the hero.
 */
type Fire = (isIntersecting: boolean) => void;
function driveObserver() {
  const seen: { target?: Element; rootMargin?: string; fire?: Fire; disconnected: boolean } = { disconnected: false };
  class Driven {
    constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
      seen.rootMargin = opts?.rootMargin;
      seen.fire = (isIntersecting) =>
        act(() => cb([{ isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver));
    }
    observe(t: Element) { seen.target = t; }
    unobserve() {}
    disconnect() { seen.disconnected = true; }
    takeRecords() { return []; }
  }
  vi.stubGlobal("IntersectionObserver", Driven);
  return seen;
}

/** The landing page's shape: the rail, then the hero it reads (#top). */
function renderOverHero() {
  return render(
    <MemoryRouter>
      <Nav onSignIn={vi.fn()} />
      <header id="top" data-testid="hero" />
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

  // The owner: the wordmark reloads home. A router <Link> cancels the click
  // and moves the URL itself, which on "/" did nothing at all; this must
  // leave the click to the browser, as a full page load. Read on window,
  // after React's own handlers have run, then cancelled there so jsdom
  // does not try to navigate.
  it("takes the wordmark home as a full page load, not a router hop", () => {
    renderNav();
    const wordmark = screen.getByRole("link", { name: /Cabby's — Home/i });
    expect(wordmark).toHaveAttribute("href", "/");
    let cancelledByApp: boolean | undefined;
    window.addEventListener("click", (e) => { cancelledByApp = e.defaultPrevented; e.preventDefault(); }, { once: true });
    fireEvent.click(wordmark);
    expect(cancelledByApp).toBe(false);
  });

  it("puts every destination behind one tap on a phone (Phase 2)", () => {
    renderNav();
    const burger = screen.getByRole("button", { name: /open menu/i });
    expect(burger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(burger);
    const sheet = screen.getByRole("dialog", { name: /menu/i });
    const items = within(sheet);
    // the route, the fleet, the FAQ and contact, and nothing promised that
    // isn't there — "Why Cabby's" went when the pillars merged into the route
    for (const label of [/how it works/i, /vehicles/i, /faq/i, /contact/i]) {
      expect(items.getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(items.queryByRole("link", { name: /why cabby/i })).toBeNull();
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

  describe("over the hero and past it", () => {
    // Restored one by one: restoreAllMocks would also strip the
    // implementations off the module-level signOut and useAuth mocks.
    let rect: { mockRestore(): void } | undefined;
    function heroBottomAt(bottom: number) {
      rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ bottom } as DOMRect);
    }
    afterEach(() => {
      vi.unstubAllGlobals();
      rect?.mockRestore();
      rect = undefined;
    });

    it("is a surface from the first frame on a page with no hero", () => {
      const seen = driveObserver();
      renderNav();
      expect(screen.getByRole("navigation")).not.toHaveClass("on-hero");
      // nothing to watch, so nothing watched — and nothing to clear it later
      expect(seen.target).toBeUndefined();
    });

    it("starts clear when it loads over the hero", () => {
      driveObserver();
      // the hero's bottom edge is well below the bar
      heroBottomAt(800);
      renderOverHero();
      expect(screen.getByRole("navigation")).toHaveClass("on-hero");
    });

    it("starts as a surface when it loads already past the hero", () => {
      driveObserver();
      // a reload halfway down the page: the hero ended above the screen
      heroBottomAt(-400);
      renderOverHero();
      expect(screen.getByRole("navigation")).not.toHaveClass("on-hero");
    });

    it("takes its ground back once the hero is behind it, and gives it up again", () => {
      const seen = driveObserver();
      renderOverHero();
      // it watches the hero, measured against the viewport less the bar
      expect(seen.target).toBe(screen.getByTestId("hero"));
      expect(seen.rootMargin).toMatch(/^-\d+px 0px 0px 0px$/);

      const nav = screen.getByRole("navigation");
      seen.fire!(true);
      expect(nav).toHaveClass("on-hero");
      seen.fire!(false);
      expect(nav).not.toHaveClass("on-hero");
      seen.fire!(true);
      expect(nav).toHaveClass("on-hero");
    });

    it("stops watching when it unmounts", () => {
      const seen = driveObserver();
      const { unmount } = renderOverHero();
      unmount();
      expect(seen.disconnected).toBe(true);
    });

    it("never goes clear where there is no observer to bring the ground back", () => {
      vi.stubGlobal("IntersectionObserver", undefined);
      heroBottomAt(800);
      renderOverHero();
      expect(screen.getByRole("navigation")).not.toHaveClass("on-hero");
    });
  });
});
