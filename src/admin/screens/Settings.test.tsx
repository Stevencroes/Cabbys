import { act, render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pricing } from "../../lib/pricing";

const state: { rates: Pricing } = {
  rates: { zones: [], locations: [], routes: [], addons: [], config: {}, loaded: false },
};

vi.mock("../../lib/pricing", async (orig) => ({
  ...(await orig<typeof import("../../lib/pricing")>()),
  loadPricing: () => Promise.resolve(state.rates),
}));

import Settings from "./Settings";

async function renderSettings() {
  const r = render(<Settings />);
  await act(async () => {});
  return r;
}

beforeEach(() => {
  state.rates = { zones: [], locations: [], routes: [], addons: [], config: {}, loaded: false };
});

describe("settings", () => {
  // A switch that does nothing is worse than no switch: it is a promise
  // the next operator will act on. Four of the five groups here are code
  // rather than data, so nothing on this screen writes anything.
  it("offers no control that would silently do nothing", async () => {
    await renderSettings();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /save/i })).toBeNull();
  });

  // The value of this screen is knowing where each number actually
  // lives, so that changing one is a decision rather than a hunt.
  it("says where each group's values live", async () => {
    await renderSettings();
    expect(screen.getByText(/src\/data\/vehicles.ts/)).toBeInTheDocument();
    expect(screen.getByText(/pricing_routes, pricing_zones and pricing_config/)).toBeInTheDocument();
  });

  // Sourced from the constants themselves rather than retyped, so a
  // change to the commission cannot leave a stale number on screen.
  it("reads the live fleet and the real commission out of the code", async () => {
    await renderSettings();
    expect(screen.getByText("Executive Sedan")).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  // Not an error on its own — a deployment without the pricing_* tables
  // works exactly this way — but somebody who expected a rate card needs
  // to know it is not reaching the site.
  it("says when no rate card is reaching the site, without calling it a fault", async () => {
    await renderSettings();
    expect(screen.getByText(/quoting every journey from the distance model/i)).toBeInTheDocument();
  });

  it("shows the live rate card when there is one", async () => {
    state.rates = {
      zones: [{ zone_code: "A", island: "aruba", active: true }],
      locations: [{ name: "Palm Beach", zone_code: "A" }],
      routes: [{ from_name: "Airport", to_name: "Palm Beach", price: 72, bidirectional: true }],
      addons: [], config: { min_fare: 45 }, loaded: true,
    };
    await renderSettings();
    expect(screen.getByText("1 fixed route")).toBeInTheDocument();
    expect(screen.getByText("min_fare 45")).toBeInTheDocument();
  });

  // public.admins has a read-own policy and no insert policy at all, on
  // purpose. An app that can grant its own access is an app one
  // compromised session can hand over.
  it("says that operators are added in SQL and why", async () => {
    await renderSettings();
    expect(screen.getByText(/no insert policy at all/i)).toBeInTheDocument();
    expect(screen.getByText(/One line in the Supabase SQL editor/i)).toBeInTheDocument();
  });

  it("does not imply Cabby's sends notifications it cannot send", async () => {
    await renderSettings();
    expect(screen.getByText(/Not built\./)).toBeInTheDocument();
  });
});
