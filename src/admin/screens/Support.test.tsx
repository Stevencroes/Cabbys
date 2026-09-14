import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { Board } from "../BoardContext";
import { attentionItems } from "../lib/attention";
import { makeBoard, makeRide } from "../lib/fixtures";

const state: { board: Board } = { board: makeBoard() };
vi.mock("../BoardContext", () => ({ useBoard: () => state.board }));

import Support from "./Support";

const NOW = Date.now();
const at = (minutes: number) => new Date(NOW + minutes * 60_000).toISOString();

const withRides = (rides = [makeRide({ scheduledAt: at(40) })]) =>
  makeBoard({ rides, attention: attentionItems(rides, [], NOW) });

const renderSupport = () => render(<MemoryRouter><Support /></MemoryRouter>);

beforeEach(() => { state.board = makeBoard(); });

describe("support", () => {
  // The best screen in the portal, and it should look like it — not like
  // a feature that failed to load.
  it("says plainly that nothing needs a person", () => {
    renderSupport();
    expect(screen.getByText(/nothing needs you/i)).toBeInTheDocument();
    expect(screen.getByText(/fills itself back in the moment that stops being true/i)).toBeInTheDocument();
  });

  it("lists what needs a person, with a grade in words", () => {
    state.board = withRides();
    renderSupport();
    expect(screen.getAllByText("Now").length).toBeGreaterThan(0);
    expect(screen.getByText(/Nobody is driving/i)).toBeInTheDocument();
  });

  // Every item goes somewhere. A row that cannot be acted on is a
  // notification, and this board is not a feed.
  it("sends every item to the thing it is about", () => {
    state.board = withRides();
    renderSupport();
    expect(screen.getAllByRole("link")[0]).toHaveAttribute("href", "/admin/rides/r1");
  });

  it("filters by grade without pretending the list is empty", () => {
    state.board = withRides();
    renderSupport();
    fireEvent.click(screen.getByRole("button", { name: /^watch/i }));
    expect(screen.getByText(/nothing under "watch"/i)).toBeInTheDocument();
    expect(screen.getByText(/the list itself isn't empty/i)).toBeInTheDocument();
  });

  // An empty list here would mean "we couldn't look", not "all clear",
  // and an operator reading the second over the first would go back to
  // bed while a guest stood at arrivals.
  it("never reports an unreadable board as all clear", () => {
    state.board = makeBoard({ ridesError: "permission denied for table rides" });
    renderSupport();
    expect(screen.getByText(/can't read the rides/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing needs you/i)).toBeNull();
  });

  // Nothing here can be ticked off, and somebody looking for the button
  // deserves to be told why rather than to keep looking.
  it("says why there is nothing to close", () => {
    state.board = withRides();
    renderSupport();
    expect(screen.getByText(/nothing to archive/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /dismiss|resolve|close/i })).toBeNull();
  });
});
