import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { save: unknown; locate: unknown } = {
  save: { ok: true },
  locate: { ok: true, lat: 12.55, lng: -70.05, accuracy: 9 },
};
const saved: unknown[] = [];

vi.mock("../../lib/pickupPin", async (orig) => ({
  ...(await orig<typeof import("../../lib/pickupPin")>()),
  setPickupPin: (id: string, pin: unknown, note: string) => {
    saved.push({ id, pin, note });
    return Promise.resolve(state.save);
  },
  locateMe: () => Promise.resolve(state.locate),
}));

import PickupPin from "./PickupPin";

const onSaved = vi.fn();
const mount = (over: Partial<React.ComponentProps<typeof PickupPin>> = {}) =>
  render(
    <PickupPin
      rideId="r1"
      pickup="Villa Sunrise 14, Palm Beach"
      hasPin={false}
      note={null}
      onSaved={onSaved}
      {...over}
    />,
  );

beforeEach(() => {
  state.save = { ok: true };
  state.locate = { ok: true, lat: 12.55, lng: -70.05, accuracy: 9 };
  saved.length = 0;
  onSaved.mockClear();
});

describe("Setting a pickup spot", () => {
  // Most of these bookings are made weeks early from another continent,
  // where "share my location" is worse than useless. A sentence works
  // from anywhere, so it must be able to stand on its own.
  it("saves a landmark on its own, with no location at all", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /set your exact pickup/i }));
    fireEvent.change(screen.getByLabelText(/describe the spot/i), {
      target: { value: "Blue gate, past the second speed bump" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save for my driver/i }));
    await waitFor(() =>
      expect(saved).toEqual([{ id: "r1", pin: null, note: "Blue gate, past the second speed bump" }]));
    expect(await screen.findByText(/saved — your driver will see this/i)).toBeInTheDocument();
  });

  it("takes the phone's own answer when the guest is standing there", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /set your exact pickup/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    expect(await screen.findByRole("button", { name: /location shared/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save for my driver/i }));
    await waitFor(() => expect(saved[0]).toMatchObject({ pin: { lat: 12.55, lng: -70.05 } }));
  });

  // A blocked permission is not a dead end — the note does the same job,
  // and the message has to say so rather than leaving them stuck.
  it("points at the note when the browser blocks location", async () => {
    state.locate = { ok: false, why: "denied" };
    mount();
    fireEvent.click(screen.getByRole("button", { name: /set your exact pickup/i }));
    fireEvent.click(screen.getByRole("button", { name: /use my current location/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/describe the spot instead/i);
  });

  it("won't send an empty answer", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /set your exact pickup/i }));
    fireEvent.click(screen.getByRole("button", { name: /save for my driver/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/add a note or share your location/i);
    expect(saved).toEqual([]);
  });

  it("shows the database's refusal rather than claiming it saved", async () => {
    state.save = { ok: false, detail: "That location isn't in Aruba" };
    mount();
    fireEvent.click(screen.getByRole("button", { name: /set your exact pickup/i }));
    fireEvent.change(screen.getByLabelText(/describe the spot/i), { target: { value: "gate" } });
    fireEvent.click(screen.getByRole("button", { name: /save for my driver/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't in Aruba/i);
    expect(screen.queryByText(/saved — your driver/i)).toBeNull();
  });

  // A typed address is urged; a resort this app can already place is
  // offered quietly, because for that one the pin only helps at the margin.
  it("presses the case only where the pickup can't be placed", () => {
    const villa = mount();
    expect(screen.getByRole("button", { name: /set your exact pickup/i })).toHaveClass("urge");
    expect(screen.getByText(/tell your driver exactly where to stop/i)).toBeInTheDocument();
    villa.unmount();

    mount({ pickup: "Bucuti & Tara Beach Resort" });
    expect(screen.getByRole("button", { name: /set your exact pickup/i })).not.toHaveClass("urge");
  });

  it("says it is already set when the guest has answered before", () => {
    mount({ note: "Blue gate", hasPin: true });
    expect(screen.getByText(/pickup spot set/i)).toBeInTheDocument();
    expect(screen.getByText("Blue gate")).toBeInTheDocument();
  });
});
