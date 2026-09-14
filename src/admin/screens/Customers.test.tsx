import { act, render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { Board } from "../BoardContext";
import { makeBoard, makeRide } from "../lib/fixtures";

const state: { board: Board; history: unknown } = {
  board: makeBoard(),
  history: { rides: [], error: null },
};

vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));
vi.mock("../lib/admin", async (orig) => ({
  ...(await orig<typeof import("../lib/admin")>()),
  loadRideHistory: () => Promise.resolve(state.history),
}));

import Customers from "./Customers";
import CustomerView from "./CustomerView";

async function renderList() {
  const r = render(<MemoryRouter><Customers /></MemoryRouter>);
  await act(async () => {});
  return r;
}

async function renderOne(key: string) {
  const r = render(
    <MemoryRouter initialEntries={[`/admin/customers/${encodeURIComponent(key)}`]}>
      <Routes><Route path="/admin/customers/:key" element={<CustomerView />} /></Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  return r;
}

beforeEach(() => {
  state.board = makeBoard();
  state.history = { rides: [], error: null };
});

describe("customers", () => {
  it("builds the list out of bookings, because there is no customers table", async () => {
    state.board = makeBoard({ rides: [makeRide({ passengerId: "u1" })] });
    await renderList();
    expect(screen.getByRole("link", { name: "Marta Vos" })).toBeInTheDocument();
    expect(screen.getByText("Has an account")).toBeInTheDocument();
  });

  // A row held together by a phone number rather than an account is a
  // guess, and the operator should know which kind of row they are
  // reading before they merge two people in their head.
  it("says how firmly each row is held together", async () => {
    state.board = makeBoard({ rides: [makeRide({ passengerId: null, guestEmail: null })] });
    await renderList();
    expect(screen.getByText("Matched by number")).toBeInTheDocument();
  });

  // Rides taken and bookings made are different numbers, and the one
  // that flatters is the wrong one to print alone.
  it("counts rides taken apart from bookings made", async () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "a", passengerId: "u1", status: "completed" }),
        makeRide({ id: "b", passengerId: "u1", status: "cancelled" }),
      ],
    });
    await renderList();
    expect(screen.getByText("1 cancelled")).toBeInTheDocument();
  });

  it("does not call an unreadable rides table an empty address book", async () => {
    state.board = makeBoard({ ridesError: "permission denied for table rides" });
    await renderList();
    expect(screen.getByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.queryByText(/nobody has booked yet/i)).toBeNull();
  });

  it("searches by name, address or number", async () => {
    state.board = makeBoard({
      rides: [
        makeRide({ id: "a", passengerId: "u1", guestName: "Marta Vos" }),
        makeRide({ id: "b", passengerId: "u2", guestName: "Luis Wever" }),
      ],
    });
    await renderList();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "luis" } });
    expect(screen.getByRole("link", { name: "Luis Wever" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Marta Vos" })).toBeNull();
  });
});

describe("one customer", () => {
  it("shows what they have booked and what is coming", async () => {
    state.board = makeBoard({ rides: [makeRide({ passengerId: "u1" })] });
    await renderOne("a:u1");
    expect(screen.getByText("Coming up")).toBeInTheDocument();
    expect(screen.getByText("Booking history")).toBeInTheDocument();
  });

  // There is nowhere to keep an internal note, so this screen does not
  // offer a box that would throw one away.
  it("offers no notes field, and says why", async () => {
    state.board = makeBoard({ rides: [makeRide({ passengerId: "u1" })] });
    await renderOne("a:u1");
    expect(screen.getByText("Notes")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/nowhere to keep an internal note/i)).toBeInTheDocument();
  });

  // There is no refund path in this project at all, so a "Refunds: 0"
  // line would be a permanent lie. A named booking with a hold still on
  // it is a job somebody can actually do.
  it("names the cancelled bookings still holding money instead of totalling refunds", async () => {
    state.board = makeBoard({
      rides: [makeRide({ passengerId: "u1", status: "cancelled", paymentStatus: "authorized" })],
    });
    await renderOne("a:u1");
    expect(screen.getByText("Money still open")).toBeInTheDocument();
    expect(screen.getByText(/void the authorisation/i)).toBeInTheDocument();
    expect(screen.queryByText(/refunds/i)).toBeNull();
  });

  it("says nothing about money when there is nothing outstanding", async () => {
    state.board = makeBoard({ rides: [makeRide({ passengerId: "u1", status: "cancelled" })] });
    await renderOne("a:u1");
    expect(screen.queryByText("Money still open")).toBeNull();
  });

  // This page is built from bookings, so a guest exists here only while
  // they have one in the window the board reads.
  it("explains an unknown key rather than showing a blank person", async () => {
    await renderOne("a:nobody");
    expect(screen.getByText(/nobody at/i)).toBeInTheDocument();
    expect(screen.getByText(/built from bookings/i)).toBeInTheDocument();
  });
});
