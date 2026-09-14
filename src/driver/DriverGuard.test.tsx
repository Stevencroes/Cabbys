import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: {
  user: unknown; driver: unknown; error: string | null;
  documents: unknown[]; documentsError: string | null;
} = { user: null, driver: null, error: null, documents: [], documentsError: null };
let lookups = 0;
const signOut = vi.fn();

vi.mock("./lib/driver", () => ({
  getAuthedUser: () => Promise.resolve(state.user),
  loadDriverById: () => {
    lookups++;
    return Promise.resolve({ driver: state.driver, error: state.error });
  },
  // The gate now carries the document checklist — a waiting driver never
  // reaches the shell, so the gate is the only place they can send us
  // anything. Mocked here so these tests keep asking about the gate.
  loadDriverDocuments: () => Promise.resolve({ documents: state.documents, error: state.documentsError }),
  uploadDriverDocument: () => Promise.resolve({ ok: true }),
}));
vi.mock("../booking/useAuth", () => ({
  useAuth: () => ({ signOut }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import DriverGuard from "./DriverGuard";

const PORTAL = "the portal itself";
const renderGate = () =>
  render(<DriverGuard>{(d) => <div>{PORTAL} — {d.fullName}</div>}</DriverGuard>);

beforeEach(() => {
  state.user = null;
  state.driver = null;
  state.error = null;
  state.documents = [];
  state.documentsError = null;
  lookups = 0;
  signOut.mockClear();
});

const signedInWith = (status: string) => {
  state.user = { id: "d1", email: "ana@example.com" };
  state.driver = { id: "d1", fullName: "Ana Croes", status, tripsCount: 0, isOnline: false };
};

describe("approval gate", () => {
  it("offers a real sign-in form when nobody is signed in", async () => {
    renderGate();
    expect(await screen.findByText(/this is the driver portal/i)).toBeInTheDocument();
    // not just a message — an actual way in
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  // Driver accounts are made by Cabby's — the screen says so a line above
  // the form. A driver who took the offer to create one landed straight in
  // "No driver profile for this account": a support ticket manufactured by
  // the button that caused it.
  it("does not offer to create an account it would then turn away", async () => {
    renderGate();
    await screen.findByText(/this is the driver portal/i);
    expect(screen.queryByRole("button", { name: /create an account/i })).toBeNull();
    // signing in and recovering a password are untouched
    expect(screen.getByRole("button", { name: /forgot your password/i })).toBeInTheDocument();
  });

  // A guest who lands here by accident: the back button is where they came from.
  it("gives a passenger a way back to the site", async () => {
    renderGate();
    expect(await screen.findByRole("link", { name: /book a ride/i })).toHaveAttribute("href", "/");
  });

  it("tells a signed-in account with no driver row exactly why, so the mismatch can be found", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    state.driver = null;
    renderGate();
    expect(await screen.findByText(/no driver profile for this account/i)).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    expect(screen.getByText("uid-123")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  it("keeps a pending driver out of the portal entirely", async () => {
    signedInWith("pending");
    renderGate();
    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
    expect(screen.getByText(/we check your licence/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  // The gate is a route guard, so a waiting driver never reaches the
  // shell and never reaches Profile. For as long as the checklist lived
  // only on Profile, this screen promised a check on documents the
  // portal gave them no way at all to send — the whole process was a
  // WhatsApp thread, and the sentence above was about nothing.
  it("lets a waiting driver actually send the documents it asks them for", async () => {
    signedInWith("pending");
    renderGate();
    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
    expect(await screen.findByText("Driver's licence")).toBeInTheDocument();
    expect(screen.getByText("Public-transport permit")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /send pdf/i }).length).toBeGreaterThan(0);
  });

  it("keeps a suspended driver out, and says who to talk to", async () => {
    signedInWith("suspended");
    renderGate();
    expect(await screen.findByText(/on hold/i)).toBeInTheDocument();
    expect(screen.getByText(/message us/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  // A lapsed insurance certificate is one of the likeliest reasons to be
  // put on hold, and replacing it is the way back. A gate that only
  // offered "Message Cabby's" made that a conversation instead of an
  // upload.
  it("lets a suspended driver replace what was sent back", async () => {
    signedInWith("suspended");
    state.documents = [{
      slug: "vehicle-insurance", path: "d1/vehicle-insurance.pdf", status: "rejected",
      reason: "This one expired in June — we need the current certificate.",
      uploadedAt: null, reviewedAt: null,
    }];
    renderGate();
    expect(await screen.findByText(/this one expired in june/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /send a new one/i }).length).toBeGreaterThan(0);
  });

  it("lets an approved driver through", async () => {
    signedInWith("approved");
    renderGate();
    await waitFor(() => expect(screen.getByText(/the portal itself — Ana Croes/)).toBeInTheDocument());
  });

  it("says nothing about status while it is still loading", () => {
    signedInWith("approved");
    renderGate();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
    expect(screen.getByText(/one moment/i)).toBeInTheDocument();
  });

  // The fault this gate was built around, and the last screen in the
  // portal still committing it. A table that cannot be read and an
  // account with no row both arrived as null, so a driver on bad wifi was
  // told their account does not exist — and would then spend a morning
  // proving an account that was never in question.
  it("does not tell a driver their account is missing when it simply couldn't read it", async () => {
    state.user = { id: "d1", email: "ana@example.com" };
    state.driver = null;
    state.error = "permission denied for table drivers";
    renderGate();
    expect(await screen.findByText(/can't reach cabby's/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied for table drivers/)).toBeInTheDocument();
    expect(screen.queryByText(/no driver profile/i)).toBeNull();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  // Approval lands on Cabby's side while this screen is open. The only
  // way to see it was to sign out and back in.
  it("can re-check from the gate, and goes through the moment it lands", async () => {
    signedInWith("pending");
    renderGate();
    fireEvent.click(await screen.findByRole("button", { name: /check if i'm approved/i }));
    await waitFor(() => expect(lookups).toBe(2));

    signedInWith("approved");
    fireEvent.click(screen.getByRole("button", { name: /check if i'm approved/i }));
    await waitFor(() => expect(screen.getByText(/the portal itself — Ana Croes/)).toBeInTheDocument());
  });

  // A driver with two accounts, waiting on the wrong one, cannot see that
  // from a screen that names neither.
  it("names whose application is being waited on", async () => {
    signedInWith("pending");
    renderGate();
    expect(await screen.findByText("Ana Croes")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });

  // Signing out is still there, but it is no longer the only thing on
  // offer — so it stops looking like the suggested move.
  it("keeps sign-out available without making it the way forward", async () => {
    signedInWith("pending");
    renderGate();
    const out = await screen.findByRole("button", { name: /sign out/i });
    expect(out).toHaveClass("drv-quiet");
    fireEvent.click(out);
    expect(signOut).toHaveBeenCalled();
  });
});
