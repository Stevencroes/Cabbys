import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { save: unknown; car: unknown; photo: unknown; name: unknown } = {
  save: { ok: true },
  car: { ok: true },
  photo: { ok: true, url: "https://cdn.example/face.jpg" },
  name: { ok: true },
};
const saved: string[] = [];
const names: string[] = [];
const cars: unknown[] = [];
const signOut = vi.fn();

vi.mock("../lib/driver", async (orig) => ({
  ...(await orig<typeof import("../lib/driver")>()),
  saveDriverPhone: (phone: string) => { saved.push(phone); return Promise.resolve(state.save); },
  saveDriverName: (name: string) => { names.push(name); return Promise.resolve(state.name); },
  saveVehicle: (v: unknown) => { cars.push(v); return Promise.resolve(state.car); },
  uploadDriverPhoto: () => Promise.resolve(state.photo),
}));
vi.mock("../../booking/useAuth", () => ({ useAuth: () => ({ signOut }) }));

import Profile from "./Profile";

const driver = {
  id: "d1", fullName: "Steven Croes", email: "ana@example.com", phone: "+2975607336",
  vehicle: "Mercedes V-Class", plate: "A-42871", make: null, model: null, colour: null, year: null,
    seats: null, bags: null, photoUrl: "https://cdn.example/face.jpg",
  status: "approved" as const, rating: 4.9, tripsCount: 214, isOnline: true,
};

/** the car block's own Change/Add, told apart from the phone row's */
const carEdit = () =>
  within(document.querySelector(".drv-car")!).getByRole("button", { name: /change|add/i });

beforeEach(() => {
  state.save = { ok: true };
  state.car = { ok: true };
  state.photo = { ok: true, url: "https://cdn.example/face.jpg" };
  state.name = { ok: true };
  saved.length = 0;
  names.length = 0;
  cars.length = 0;
  signOut.mockClear();
});

describe("Profile", () => {
  // The screen told drivers to open a WhatsApp thread and wait for a
  // field the database has let them write all along — and a stale number
  // is a missed pickup.
  it("lets a driver change the number guests reach them on", async () => {
    render(<Profile driver={driver} />);
    fireEvent.click(within(screen.getByText("Phone").closest(".drv-r")!).getByRole("button"));
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+297 594 1122" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(saved).toEqual(["+2975941122"]));
    expect(await screen.findByText(/guests and dispatch will reach you on/i)).toBeInTheDocument();
  });

  it("won't send a number nobody could dial", async () => {
    render(<Profile driver={driver} />);
    fireEvent.click(within(screen.getByText("Phone").closest(".drv-r")!).getByRole("button"));
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "call me" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/doesn't look like a number/i);
    expect(saved).toEqual([]);
  });

  it("shows the database's refusal rather than pretending it saved", async () => {
    state.save = { ok: false, detail: "new row violates row-level security policy" };
    render(<Profile driver={driver} />);
    fireEvent.click(within(screen.getByText("Phone").closest(".drv-r")!).getByRole("button"));
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: "+2975941122" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument();
  });

  // The address lives in auth, not in the drivers row, so only the gate
  // can put the two together. Read-only and not for want of a form: the
  // address IS the account, so changing it is an auth operation with a
  // confirmation mail attached.
  it("names the account a driver is signed in on", () => {
    render(<Profile driver={driver} />);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
    // and offers no control over it: the address IS the account
    expect(screen.getByText("Email").closest(".drv-r")!.querySelector("button")).toBeNull();
  });

  // rides.driver_vehicle / driver_plate have existed since the first
  // schema and nothing ever wrote them, so My Trips drew an empty space
  // and a guest at arrivals had nothing to look for. claim_ride() stamps
  // them now, which only helps if the car is on record.
  it("shows the car the way a guest at the kerb will see it", () => {
    render(<Profile driver={driver} />);
    expect(screen.getByText("Mercedes V-Class")).toBeInTheDocument();
    expect(screen.getByText("A-42871")).toBeInTheDocument();
    // the car has its own control; the point is that nothing offers to
    // edit the plate or the make from this row
    expect(within(screen.getByText("Phone").closest(".drv-r")!).getAllByRole("button")).toHaveLength(1);
  });

  // The colour leads, because somebody scanning a kerb outside arrivals
  // sees a colour before they see a badge.
  it("saves the car a guest will be scanning for", async () => {
    render(<Profile driver={{ ...driver, vehicle: null, plate: null, photoUrl: null }} />);
    fireEvent.click(carEdit());
    fireEvent.change(document.querySelector<HTMLInputElement>("input[type=file]")!, {
      target: { files: [new File(["x"], "face.jpg", { type: "image/jpeg" })] },
    });
    await screen.findByRole("button", { name: /change your photo/i });
    fireEvent.change(screen.getByLabelText("Colour"), { target: { value: "Black" } });
    fireEvent.change(screen.getByLabelText("Make"), { target: { value: "Mercedes" } });
    fireEvent.change(screen.getByLabelText("Model"), { target: { value: "V-Class" } });
    fireEvent.change(screen.getByLabelText("Plate"), { target: { value: "A-42871" } });
    fireEvent.change(screen.getByLabelText("Seats"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(cars).toHaveLength(1));
    expect(cars[0]).toMatchObject({
      colour: "Black", make: "Mercedes", model: "V-Class", plate: "A-42871", seats: 7,
    });
    // and it tells the driver what the guest will now be looking for
    expect(await screen.findByText(/guests will be looking for black mercedes v-class/i)).toBeInTheDocument();
  });

  // Both, and named separately, because "fill in the car" is not an
  // instruction anybody can act on. The plate identifies the car; the
  // photo identifies the person holding the door.
  it("won't save a car with no plate", async () => {
    render(<Profile driver={{ ...driver, plate: null }} />);
    fireEvent.click(carEdit());
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/add your plate/i);
    expect(cars).toEqual([]);
  });

  it("won't save a car with no photo of the driver", async () => {
    render(<Profile driver={{ ...driver, photoUrl: null }} />);
    fireEvent.click(carEdit());
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/add a photo of yourself/i);
    expect(cars).toEqual([]);
  });

  it("shows the database's refusal rather than pretending the car saved", async () => {
    state.car = { ok: false, detail: "We can't find a driver record for this account." };
    render(<Profile driver={driver} />);
    fireEvent.click(carEdit());
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(await screen.findByText(/can't find a driver record/i)).toBeInTheDocument();
  });

  // The shell holds a copy of the drivers row from before the save, and
  // it is the thing showing "your guests can't spot you" — so without
  // this, a driver who had just fixed exactly that kept being told to.
  it("tells the portal to re-read the row after a save", async () => {
    const onSaved = vi.fn();
    render(<Profile driver={driver} onSaved={onSaved} />);
    fireEvent.click(carEdit());
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
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

  // v8. identifiable() has required a name since the stamp chain was
  // built and no screen could set one, so a driver whose row had a blank
  // full_name was told their guests couldn't spot them and handed a form
  // with no field for the thing that was missing.
  it("lets a driver without a name put one on record", async () => {
    const onSaved = vi.fn();
    const nameless = { ...driver, fullName: "" };
    render(<Profile driver={nameless} onSaved={onSaved} />);

    const row = within(document.querySelectorAll(".drv-r")[0] as HTMLElement);
    fireEvent.click(row.getByRole("button", { name: /add/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "  Steven Croes  " } });
    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0]);

    // trimmed, because " " satisfies the column and fails every reader
    await waitFor(() => expect(names).toEqual(["  Steven Croes  "]));
    // and the shell is holding the row from before the save
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Steven Croes"));
  });

  it("says so when the name doesn't save", async () => {
    state.name = { ok: false, detail: "The change didn't save." };
    render(<Profile driver={{ ...driver, fullName: "" }} />);

    const row = within(document.querySelectorAll(".drv-r")[0] as HTMLElement);
    fireEvent.click(row.getByRole("button", { name: /add/i }));
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: "Steven" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^save$/i })[0]);

    expect(await screen.findByText(/the change didn't save/i)).toBeInTheDocument();
    // still open, so the typing is not lost
    expect(screen.getByLabelText(/name/i)).toHaveValue("Steven");
  });
});
