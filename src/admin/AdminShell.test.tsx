import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "./BoardContext";
import { attentionItems } from "./lib/attention";
import { makeBoard, makeRide } from "./lib/fixtures";

const state: { board: Board } = { board: makeBoard() };
vi.mock("./BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("../booking/useAuth", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import AdminShell from "./AdminShell";

const NOW = Date.now();
const soon = () => new Date(NOW + 40 * 60_000).toISOString();

const renderShell = () =>
  render(
    <MemoryRouter>
      <AdminShell user={{ id: "u1", email: "owner@cabbys.test" }}>
        <p>the board</p>
      </AdminShell>
    </MemoryRouter>,
  );

beforeEach(() => { state.board = makeBoard(); });

describe("the shell", () => {
  it("carries the eight places to be, and no more", () => {
    renderShell();
    for (const label of [
      "Dashboard", "Ride requests", "Schedule", "Drivers", "Customers", "Earnings", "Support", "Settings",
    ]) {
      expect(screen.getByRole("link", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    // A vehicle in this database is six columns on a driver, so a
    // Vehicles screen would have been the Drivers screen with different
    // headings. The car lives inside the driver's profile.
    expect(screen.queryByRole("link", { name: /vehicles/i })).toBeNull();
  });

  // A count is a claim that something needs doing. One that is never
  // zero is furniture, and furniture is what an alert disappears into.
  it("shows no count when nothing needs doing", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /^Ride requests/ })).toHaveTextContent(/^Ride requests$/);
    expect(screen.getByRole("link", { name: /^Support/ })).toHaveTextContent(/^Support$/);
  });

  // An operator reading the Drivers list has to be able to see that a
  // ride just went unassigned, or the board only tells the truth about
  // whichever screen is open.
  it("carries the unassigned count where the operator can see it from any screen", () => {
    const rides = [makeRide({ scheduledAt: soon() })];
    state.board = makeBoard({ rides, unassigned: 1, attention: attentionItems(rides, [], NOW) });
    renderShell();
    expect(screen.getByRole("link", { name: /^Ride requests/ })).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: /^Support/ })).toHaveTextContent("1");
  });

  // Only the things happening NOW reach the Support badge. A badge that
  // counts everything worth knowing is a badge that is always lit.
  it("badges Support with what is urgent, not with everything", () => {
    const rides = [makeRide({ scheduledAt: new Date(NOW + 10 * 3_600_000).toISOString() })];
    state.board = makeBoard({ rides, unassigned: 1, attention: attentionItems(rides, [], NOW) });
    renderShell();
    // the ride is unassigned but hours away: it is "today", not "now"
    expect(screen.getByRole("link", { name: /^Support/ })).toHaveTextContent(/^Support$/);
  });

  // Cabby's has one Supabase project and one identity system, so the
  // same person can be a passenger in one tab and the operator here —
  // and "why is this board empty" has more than once turned out to be
  // "you're the other account".
  it("keeps the signed-in address visible rather than behind a menu", () => {
    renderShell();
    expect(screen.getByText("owner@cabbys.test")).toBeInTheDocument();
  });

  it("gives the keyboard a way past eight links to the board itself", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /skip to the board/i })).toHaveAttribute("href", "#adm-main");
  });
});
