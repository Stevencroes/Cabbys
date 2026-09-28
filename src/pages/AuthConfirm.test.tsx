import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("../booking/useAuth", () => ({ useAuth: () => ({ account: null, user: null, loading: false }) }));
const verifyOtp = vi.fn();
vi.mock("../lib/supabase", () => ({ supabase: { auth: { verifyOtp: (...a: unknown[]) => verifyOtp(...a) } } }));

import AuthConfirm, { safeNext } from "./AuthConfirm";
import { BookingProvider } from "../booking/BookingContext";

function open(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <BookingProvider>
        <Routes>
          <Route path="/auth/confirm" element={<AuthConfirm />} />
          <Route path="/reset-password" element={<p>RESET PAGE</p>} />
          <Route path="/profile" element={<p>PROFILE PAGE</p>} />
          <Route path="/" element={<p>HOME PAGE</p>} />
        </Routes>
      </BookingProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => verifyOtp.mockReset());

describe("a link from an account email", () => {
  it("spends the token in the page and takes a reset link to the reset form", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    open("/auth/confirm?token_hash=abc&type=recovery");
    expect(await screen.findByText("RESET PAGE")).toBeInTheDocument();
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "recovery" });
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });

  it("signs a sign-in link in and goes home", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    open("/auth/confirm?token_hash=abc&type=email");
    expect(await screen.findByText("HOME PAGE")).toBeInTheDocument();
  });

  it("takes an email change to the profile", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    open("/auth/confirm?token_hash=abc&type=email_change");
    expect(await screen.findByText("PROFILE PAGE")).toBeInTheDocument();
  });

  it("says a spent link is spent, and offers a new one", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "Email link is invalid or has expired" } });
    open("/auth/confirm?token_hash=old&type=recovery");
    expect(await screen.findByRole("alert")).toHaveTextContent(/expired or has already been used/);
    expect(screen.getByRole("button", { name: /ask for a new link/i })).toBeInTheDocument();
  });

  it("does not spend anything for a link with a missing or unknown part", async () => {
    open("/auth/confirm?type=recovery");
    expect(await screen.findByRole("alert")).toHaveTextContent(/incomplete/);
    open("/auth/confirm?token_hash=abc&type=sudo");
    await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(2));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("never sends anyone off the site", () => {
    expect(safeNext("/trips", "/")).toBe("/trips");
    expect(safeNext("//evil.example", "/")).toBe("/");
    expect(safeNext("https://evil.example", "/")).toBe("/");
    expect(safeNext("/\\evil.example", "/")).toBe("/");
    expect(safeNext(null, "/reset-password")).toBe("/reset-password");
  });
});

// The templates are pasted into Supabase by hand, so nothing else would
// notice one pointing somewhere this page does not handle.
describe("the account email templates", () => {
  const raw = import.meta.glob("../../docs/email-templates/*.html", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
  const byName = Object.fromEntries(Object.entries(raw).map(([path, html]) => [path.split("/").pop()!, html]));
  const files = Object.keys(byName);
  const want: Record<string, string | null> = {
    "magic-link.html": "email",
    "reset-password.html": "recovery",
    "confirm-signup.html": "signup",
    "change-email.html": "email_change",
    "invite.html": "invite",
    "reauthentication.html": null, // a code, not a link
  };

  it("are all here", () => {
    expect(files.sort()).toEqual(Object.keys(want).sort());
  });

  for (const [file, type] of Object.entries(want)) {
    it(`${file} ${type ? `links to /auth/confirm as ${type}` : "shows the code"}, and never to Supabase's own address`, () => {
      const html = byName[file] ?? "";
      expect(html).not.toContain("ConfirmationURL");
      expect(html).toContain("Cabby&#39;s");
      if (type) {
        const links = [...html.matchAll(/\{\{ \.SiteURL \}\}\/auth\/confirm\?token_hash=\{\{ \.TokenHash \}\}&type=([a-z_]+)/g)];
        expect(links.length).toBe(2); // the button, and the same link written out
        expect(new Set(links.map((m) => m[1]))).toEqual(new Set([type]));
      } else {
        expect(html).toContain("{{ .Token }}");
      }
    });
  }
});
