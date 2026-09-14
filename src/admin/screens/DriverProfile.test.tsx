import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Board } from "../BoardContext";
import type { DocumentRecord } from "../../driver/lib/documents";
import { makeBoard, makeDriver, makeRide } from "../lib/fixtures";

// Approve and Put on hold were the Drivers table's. They are here now,
// unchanged in behaviour and in the rule they keep — a control the
// database would refuse is not shown disabled, it is absent — and every
// assertion that guarded them came with them.
const state: { board: Board; write: unknown; history: unknown } = {
  board: makeBoard(),
  write: { ok: true, heldRides: 0 },
  history: { rides: [], error: null },
};
const wrote = vi.fn();

vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadRideHistory: () => Promise.resolve(state.history),
  setDriverStatus: (uid: string, status: string) => { wrote(uid, status); return Promise.resolve(state.write); },
}));
// The document panel has its own tests; here it only has to mount.
vi.mock("../DriverDocs", () => ({ default: () => <div>documents panel</div> }));

import DriverProfile from "./DriverProfile";

/** Renders and lets the history read land. That read is the only async
    thing on the page, and a test that asserts before it settles is a
    test asserting against a screen no operator ever sees. */
async function renderProfile() {
  const r = render(
    <MemoryRouter initialEntries={["/admin/drivers/d1"]}>
      <Routes><Route path="/admin/drivers/:id" element={<DriverProfile />} /></Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  return r;
}

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  slug: "drivers-licence",
  path: "d1/drivers-licence.pdf",
  status: "accepted",
  uploadedAt: "2026-08-01T10:00:00.000Z",
  reviewedAt: null,
  reason: null,
  ...over,
});

beforeEach(() => {
  state.board = makeBoard({ drivers: [makeDriver()] });
  state.write = { ok: true, heldRides: 0 };
  state.history = { rides: [], error: null };
  wrote.mockClear();
});

describe("a driver's own page", () => {
  it("carries everything the directory was emptied of", async () => {
    state.board = makeBoard({ drivers: [makeDriver()], docs: new Map([["d1", [doc()]]]) });
    await renderProfile();
    expect(screen.getByText("The car they bring")).toBeInTheDocument();
    expect(screen.getByText("Paperwork")).toBeInTheDocument();
    expect(screen.getByText("Their work")).toBeInTheDocument();
    expect(screen.getByText("Availability")).toBeInTheDocument();
    expect(await screen.findByText("What they've earned")).toBeInTheDocument();
  });

  // Approving an approved driver is a no-op that still writes a row and
  // still reports success, which is worse than not offering it: it
  // teaches an operator that the button means nothing.
  it("does not offer to approve a driver who is already approved", async () => {
    await renderProfile();
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.getByRole("button", { name: /put on hold/i })).toBeInTheDocument();
  });

  it("does not offer to suspend a driver who is already on hold", async () => {
    state.board = makeBoard({ drivers: [makeDriver({ status: "suspended" })] });
    await renderProfile();
    expect(screen.queryByRole("button", { name: /put on hold/i })).toBeNull();
    expect(screen.getByRole("button", { name: /reinstate/i })).toBeInTheDocument();
  });

  // The confirmation's whole value is the sentence: it says what will
  // happen, not "are you sure".
  it("asks before a status change, and says what it will do", async () => {
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /put on hold/i }));
    expect(screen.getByText(/stop being offered work immediately/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /yes, put on hold/i }));
    await waitFor(() => expect(wrote).toHaveBeenCalledWith("d1", "suspended"));
  });

  // The fault this project spent a session fixing, caught one step
  // earlier: claim_ride stamps whatever the drivers row holds, and a
  // blank one leaves a guest watching an empty kerb.
  it("warns, before approving, that a driver with no car leaves guests nothing to look for", async () => {
    state.board = makeBoard({ drivers: [makeDriver({ status: "pending", plate: null, photoUrl: null })] });
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(screen.getByText(/nothing to look for at the kerb/i)).toBeInTheDocument();
    // a warning, not a block
    expect(screen.getByRole("button", { name: /yes, approve/i })).toBeEnabled();
  });

  // Suspending deliberately does not strip their work. But the
  // consequence has to be said, or it is invisible until a guest calls.
  it("says how many rides a suspended driver still holds", async () => {
    state.write = { ok: true, heldRides: 2 };
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /put on hold/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, put on hold/i }));
    expect(await screen.findByText(/still hold 2 rides/i)).toBeInTheDocument();
  });

  it("shows the database's own reason when a change is refused", async () => {
    state.write = { ok: false, detail: "The change was accepted but the driver's status didn't move." };
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /put on hold/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, put on hold/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/didn't move/i);
  });

  // admin_set_driver_status matches on user_id. A row without one is a
  // record of a person, and the board used to offer Approve on it anyway
  // — the tap came back "no driver record", which reads as a bug in the
  // button rather than a gap in the row.
  it("offers nothing at all on a row with no account behind it", async () => {
    state.board = makeBoard({ drivers: [makeDriver({ id: "" })] });
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/admin/drivers/"]}>
          <Routes><Route path="/admin/drivers/:id?" element={<DriverProfile />} /></Routes>
        </MemoryRouter>,
      );
    });
    expect(screen.queryByRole("button", { name: /^approve$/i })).toBeNull();
    expect(screen.getByText(/no auth account behind it/i)).toBeInTheDocument();
  });

  // The paperwork said at the moment of the decision — and not blocking
  // it: the operator may have seen the licence on WhatsApp last year.
  it("says what is outstanding at the moment of approval without blocking it", async () => {
    state.board = makeBoard({
      drivers: [makeDriver({ status: "pending" })],
      docs: new Map([["d1", [doc()]]]),
    });
    await renderProfile();
    fireEvent.click(screen.getByRole("button", { name: /^approve$/i }));
    expect(screen.getByText(/accepted 1 of their 5 documents/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /yes, approve/i })).toBeEnabled();
  });

  // The rule this whole codebase lives by, applied to the money: $0 is
  // an answer, and "I couldn't look" is a different one. A driver told
  // they earned nothing over an unreadable table would be owed money
  // this screen had just denied.
  it("does not show an unreadable earnings history as nothing earned", async () => {
    state.history = { rides: [], error: "permission denied for table rides" };
    await renderProfile();
    expect(screen.getByRole("alert")).toHaveTextContent(/would be wrong rather than zero/i);
    expect(screen.queryByText("$0")).toBeNull();
  });

  // is_online is the driver's own switch and this board has no write
  // path to it — so it is reported, never offered as a control.
  it("reports availability rather than offering to change it", async () => {
    await renderProfile();
    expect(screen.getByText(/Drivers set this themselves/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /on duty/i })).toBeNull();
  });

  it("shows the driver's live work from the board", async () => {
    state.board = makeBoard({
      drivers: [makeDriver()],
      rides: [makeRide({ driverId: "d1", status: "driver_assigned", driverPlate: "A-12345" })],
    });
    await renderProfile();
    expect(screen.getByText(/Airport → The Ritz-Carlton Aruba/)).toBeInTheDocument();
  });
});
