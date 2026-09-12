import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: { online: boolean } = { online: true };
const calls: boolean[] = [];

vi.mock("./lib/driver", async (orig) => ({
  ...(await orig<typeof import("./lib/driver")>()),
  setOnline: (next: boolean) => { calls.push(next); return Promise.resolve(state.online); },
}));
vi.mock("./useRideOffers", () => ({
  useRideOffers: () => ({
    offer: null, missed: null, busy: false, refused: null,
    accept: () => Promise.resolve(null), dismiss: () => {}, clearMissed: () => {},
  }),
}));
vi.mock("./lib/chime", () => ({ primeAudio: () => {}, chime: () => Promise.resolve() }));

import DriverShell from "./DriverShell";

const driver = {
  id: "d1", fullName: "Steven Croes", phone: null, vehicle: null, plate: null,
  status: "approved" as const, rating: 4.9, tripsCount: 12, isOnline: false,
};

const renderShell = () =>
  render(<MemoryRouter><DriverShell driver={driver}><p>screen</p></DriverShell></MemoryRouter>);

beforeEach(() => { state.online = true; calls.length = 0; });

describe("The driver shell", () => {
  it("flips the switch before the write lands, because a switch that waits feels broken", async () => {
    renderShell();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(calls).toEqual([true]));
  });

  // The portal reading "Online" over a database row that says otherwise is
  // a driver sitting out a whole shift wondering where the work went.
  it("puts the switch back and says so when the write doesn't land", async () => {
    state.online = false;  // the update failed
    renderShell();
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach cabby's/i);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("names the first tab for what it now shows", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/drive");
  });
});
