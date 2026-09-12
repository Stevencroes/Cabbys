import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { save: unknown } = { save: { ok: true } };
const saved: string[] = [];
const signOut = vi.fn();

vi.mock("../lib/driver", async (orig) => ({
  ...(await orig<typeof import("../lib/driver")>()),
  saveDriverPhone: (phone: string) => { saved.push(phone); return Promise.resolve(state.save); },
}));
vi.mock("../../booking/useAuth", () => ({ useAuth: () => ({ signOut }) }));

import Profile from "./Profile";

const driver = {
  id: "d1", fullName: "Steven Croes", phone: "+2975607336",
  vehicle: "Mercedes V-Class", plate: "A-42871",
  status: "approved" as const, rating: 4.9, tripsCount: 214, isOnline: true,
};

beforeEach(() => {
  state.save = { ok: true };
  saved.length = 0;
  signOut.mockClear();
});

describe("Profile", () => {
  // The screen told drivers to open a WhatsApp thread and wait for a
  // field the database has let them write all along — and a stale number
  // is a missed pickup.
  it("lets a driver change the number guests reach them on", async () => {
    render(<Profile driver={driver} />);
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+297 594 1122" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(saved).toEqual(["+2975941122"]));
    expect(await screen.findByText(/guests and dispatch will reach you on/i)).toBeInTheDocument();
  });

  it("won't send a number nobody could dial", async () => {
    render(<Profile driver={driver} />);
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "call me" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't look like a number/i);
    expect(saved).toEqual([]);
  });

  it("shows the database's refusal rather than pretending it saved", async () => {
    state.save = { ok: false, detail: "new row violates row-level security policy" };
    render(<Profile driver={driver} />);
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+2975941122" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument();
  });

  // Vehicle and plate are Cabby's to set, and the database agrees.
  it("offers no control over the things it cannot change", () => {
    render(<Profile driver={driver} />);
    expect(screen.getByText("Mercedes V-Class")).toBeInTheDocument();
    expect(screen.getByText(/vehicle and plate are set by cabby's/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /change|add/i })).toHaveLength(1);
  });

  // One tap from a tab bar used all shift, and the way back in is a
  // password nobody has at the airport at 6am.
  it("asks before signing out", () => {
    render(<Profile driver={driver} />);
    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByText(/you'll need your email and password/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /stay signed in/i }));
    expect(signOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /sign out/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^sign out$/i }).pop()!);
    expect(signOut).toHaveBeenCalled();
  });
});
