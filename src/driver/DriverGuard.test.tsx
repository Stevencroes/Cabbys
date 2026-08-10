import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { user: unknown; driver: unknown } = { user: null, driver: null };

vi.mock("./lib/driver", () => ({
  getAuthedUser: () => Promise.resolve(state.user),
  loadDriverById: () => Promise.resolve(state.driver),
}));
vi.mock("../booking/useAuth", () => ({
  useAuth: () => ({ signOut: vi.fn() }),
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

beforeEach(() => { state.user = null; state.driver = null; });

describe("approval gate", () => {
  it("offers a real sign-in form when nobody is signed in", async () => {
    renderGate();
    expect(await screen.findByText(/this is the driver portal/i)).toBeInTheDocument();
    // not just a message — an actual way in
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
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
    state.user = { id: "d1", email: "ana@example.com" };
    state.driver = { id: "d1", fullName: "Ana", status: "pending", tripsCount: 0, isOnline: false };
    renderGate();
    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
    expect(screen.getByText(/checking your licence and vehicle/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  it("keeps a suspended driver out, and says who to talk to", async () => {
    state.user = { id: "d1", email: "ana@example.com" };
    state.driver = { id: "d1", fullName: "Ana", status: "suspended", tripsCount: 0, isOnline: false };
    renderGate();
    expect(await screen.findByText(/on hold/i)).toBeInTheDocument();
    expect(screen.getByText(/contact Cabby's/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  it("lets an approved driver through", async () => {
    state.user = { id: "d1", email: "ana@example.com" };
    state.driver = { id: "d1", fullName: "Ana", status: "approved", tripsCount: 4, isOnline: false };
    renderGate();
    await waitFor(() => expect(screen.getByText(/the portal itself — Ana/)).toBeInTheDocument());
  });

  it("says nothing about status while it is still loading", () => {
    state.user = { id: "d1", email: "ana@example.com" };
    state.driver = { id: "d1", fullName: "Ana", status: "approved", tripsCount: 0, isOnline: false };
    renderGate();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
    expect(screen.getByText(/one moment/i)).toBeInTheDocument();
  });
});
