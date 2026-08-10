import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { driver: unknown } = { driver: null };
vi.mock("./lib/driver", () => ({
  loadDriver: () => Promise.resolve(state.driver),
}));

import DriverGuard from "./DriverGuard";

const PORTAL = "the portal itself";
const renderGate = () =>
  render(<DriverGuard>{(d) => <div>{PORTAL} — {d.fullName}</div>}</DriverGuard>);

beforeEach(() => { state.driver = null; });

describe("approval gate", () => {
  it("keeps a pending driver out of the portal entirely", async () => {
    state.driver = { id: "d1", fullName: "Ana", status: "pending", tripsCount: 0, isOnline: false };
    renderGate();
    expect(await screen.findByText(/application received/i)).toBeInTheDocument();
    expect(screen.getByText(/checking your licence and vehicle/i)).toBeInTheDocument();
    // not hidden — never rendered
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  it("keeps a suspended driver out, and says who to talk to", async () => {
    state.driver = { id: "d1", fullName: "Ana", status: "suspended", tripsCount: 0, isOnline: false };
    renderGate();
    expect(await screen.findByText(/on hold/i)).toBeInTheDocument();
    expect(screen.getByText(/contact Cabby's/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  it("lets an approved driver through", async () => {
    state.driver = { id: "d1", fullName: "Ana", status: "approved", tripsCount: 4, isOnline: false };
    renderGate();
    await waitFor(() => expect(screen.getByText(/the portal itself — Ana/)).toBeInTheDocument());
  });

  it("does not show the portal to someone who isn't a driver at all", async () => {
    state.driver = null;
    renderGate();
    expect(await screen.findByText(/this is the driver portal/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
  });

  it("says nothing about status while it is still loading", () => {
    state.driver = { id: "d1", fullName: "Ana", status: "approved", tripsCount: 0, isOnline: false };
    renderGate();
    expect(screen.queryByText(new RegExp(PORTAL))).toBeNull();
    expect(screen.getByText(/one moment/i)).toBeInTheDocument();
  });
});
