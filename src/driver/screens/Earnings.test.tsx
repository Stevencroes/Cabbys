import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { completed: unknown[] } = { completed: [] };

vi.mock("../lib/driver", async (orig) => ({
  ...(await orig<typeof import("../lib/driver")>()),
  loadCompleted: () => Promise.resolve({ jobs: state.completed, error: null }),
}));

import Earnings from "./Earnings";
import { driverPayoutUsd, usdToAwg } from "../../lib/quote";
import { todayInAruba } from "../../lib/datetime";

const driver = {
  id: "d1", fullName: "Ana Croes", phone: null, vehicle: null, plate: null,
  status: "approved", isOnline: true, rating: 4.9, tripsCount: 210,
} as unknown as import("../lib/driver").DriverProfile;

/** A completed ride, priced the way a real one is: a florin fare on the row,
    the driver's dollar cut derived from it. */
const ride = (id: string, isoDay: string, hhmm: string, retailUsd: number, to = "Eagle Beach") => {
  const awg = usdToAwg(retailUsd);
  return {
    id, status: "completed",
    scheduledAt: `${isoDay}T${hhmm}:00.000Z`,
    completedAt: `${isoDay}T${hhmm}:00.000Z`,
    pickup: "Queen Beatrix International Airport", dropoff: to,
    vehicle: "Executive Sedan", passengers: 2, luggage: 2, childSeats: 0,
    fareAwg: awg, payoutUsd: driverPayoutUsd(awg), bookingRef: "CB-" + id,
    contactName: null, contactPhone: null, flightNumber: null,
    pickupLat: null, pickupLng: null, pickupNote: null,
  };
};

/**
 * The fixtures are pinned to THIS week, whichever week the suite runs in.
 * A hard-coded date would pass until the calendar moved past it and then
 * fail for a reason that has nothing to do with earnings — the screen only
 * ever shows Monday to Sunday of the current Aruba week.
 *
 * 16:00Z is midday in Aruba (UTC−4), far enough from either midnight that
 * nothing slides into a neighbouring day.
 */
function thisWeek(offsetFromMonday: number): string {
  const today = todayInAruba();
  const noon = new Date(`${today}T12:00:00Z`);
  const dow = (noon.getUTCDay() + 6) % 7;
  const monday = noon.getTime() - dow * 86_400_000;
  return new Date(monday + offsetFromMonday * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(() => {
  state.completed = [
    ride("a", thisWeek(0), "16:00", 48),                  // Monday
    ride("b", thisWeek(2), "14:00", 48),                  // Wednesday
    ride("c", thisWeek(2), "18:00", 75, "Baby Beach"),    // Wednesday
  ];
});

/**
 * `<div className="ev">${expr}</div>` puts the dollar sign and the digits in
 * two separate text nodes, so getByText("$128") never matches. Read the
 * element instead — which is also closer to what a driver sees.
 */
function mount() {
  const view = render(<Earnings driver={driver} />);
  const text = (sel: string) => view.container.querySelector(sel)?.textContent?.trim() ?? "";
  return { ...view, total: () => text(".drv-etot .ev"), caption: () => text(".drv-etot .ed") };
}

describe("Earnings", () => {
  it("totals the driver's cut, never the guest's fare", async () => {
    const v = mount();
    // $48 + $48 + $75 of retail, 75% of each: 36 + 36 + 56.25 = $128.25
    await waitFor(() => expect(v.total()).toBe("$128"));
    // the guest pays $171 for the three, and the florin rows total ƒ306 —
    // neither number may ever reach a driver's screen as their earnings
    expect(v.total()).not.toBe("$171");
    expect(v.total()).not.toBe("$306");
  });

  /**
   * The reason the bars stopped being decoration. A week's total a driver
   * cannot take apart is a number they have to take on faith, and the
   * history screen exists mostly because this one could not answer
   * "which rides made that?".
   */
  it("opens a single day and shows the rides behind it", async () => {
    const v = mount();
    await waitFor(() => expect(v.total()).toBe("$128"));
    fireEvent.click(screen.getByRole("button", { name: /^Wednesday, \$92, 2 jobs$/ }));
    await waitFor(() => expect(v.total()).toBe("$92"));
    expect(v.caption()).toMatch(/2 jobs/);
    // both Wednesday rides are listed, Monday's is not
    expect(screen.getByText(/Baby Beach/)).toBeInTheDocument();
    expect(screen.getAllByText(/Eagle Beach/).length).toBe(1);
  });

  it("goes back to the week", async () => {
    const v = mount();
    await waitFor(() => expect(v.total()).toBe("$128"));
    fireEvent.click(screen.getByRole("button", { name: /^Monday, \$36, 1 jobs$/ }));
    await waitFor(() => expect(v.total()).toBe("$36"));
    fireEvent.click(screen.getByRole("button", { name: /whole week/i }));
    await waitFor(() => expect(v.total()).toBe("$128"));
  });

  it("labels every bar with its own money, so the chart is readable unseen", async () => {
    const v = mount();
    await waitFor(() => expect(v.total()).toBe("$128"));
    // a day with nothing on it still answers, rather than going silent
    expect(screen.getByRole("button", { name: /^Friday, \$0, 0 jobs$/ })).toBeInTheDocument();
  });

  /**
   * The screen used to promise "Next payout $340 · Monday". There is no
   * payouts table, no paid flag on a ride and no schedule agreed with the
   * client — and it summed the CURRENT week, which on a Wednesday is not
   * what Monday would pay even if the schedule were real. A driver told
   * the wrong payday once does not believe the next figure either.
   */
  it("does not invent a payday", async () => {
    const v = mount();
    await waitFor(() => expect(v.total()).toBe("$128"));
    expect(screen.queryByText(/next payout/i)).toBeNull();
    expect(screen.queryByText(/· Monday/)).toBeNull();
    expect(screen.getByText(/Earned this week/i)).toBeInTheDocument();
    expect(screen.getByText(/confirms your payout schedule/i)).toBeInTheDocument();
  });

  it("says what was taken out, on the figure itself", async () => {
    const v = mount();
    await waitFor(() => expect(v.total()).toBe("$128"));
    expect(v.caption()).toMatch(/after 25% Cabby's/);
  });

  it("has nothing to reconcile when nothing is earned", async () => {
    state.completed = [];
    const v = mount();
    expect(await screen.findByText(/Nothing earned yet/i)).toBeInTheDocument();
    expect(v.total()).toBe("$0");
  });
});
