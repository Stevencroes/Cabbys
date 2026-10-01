import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Child seats as a paid add-on, through the real flow: the age each seat
// needs, the line that prices them, and the total on screen being the one
// that reaches the ride row. The supabase stub keeps every insert payload,
// because "the number shown is the number stored" is only provable at the
// insert.
//
// No VITE_STRIPE_PUBLISHABLE_KEY under test, so the booking is made from
// the payment step's "Reserve your car", as it is in production today.
const inserts = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("../../booking/useAuth", () => ({
  useAuth: () => ({ account: null, user: null, loading: false }),
}));

vi.mock("../../lib/supabase", () => {
  const make = () => {
    const b: {
      insert: (payload: Record<string, unknown>) => unknown;
      select: () => unknown; eq: () => unknown; order: () => unknown;
      then: (res: (v: unknown) => unknown) => Promise<unknown>;
    } = {
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: "ride-7", booking_ref: payload.booking_ref ?? "CB-SEAT7" }, error: null }),
          }),
        };
      },
      select() { return b; }, eq() { return b; }, order() { return b; },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res); },
    };
    return b;
  };
  return {
    supabase: {
      from: () => make(),
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInAnonymously: () => Promise.resolve({ data: { user: { id: "anon-1" } }, error: null }),
      },
    },
  };
});

import { BookingProvider, useBooking } from "../../booking/BookingContext";
import BookingOverlay from "./BookingOverlay";
import { placeById, selFromPlace, AIRPORT } from "../../data/places";
import { VEHICLES } from "../../data/vehicles";
import { quote, usd, usdToAwg, CHILD_SEAT_USD } from "../../lib/quote";

function Opener({ journey = "one" }: { journey?: "one" | "return" }) {
  const { open, setField } = useBooking();
  return (
    <button
      onClick={() => {
        setField("flightLanding", "14:05");
        if (journey === "return") {
          setField("journey", "return");
          setField("returnDate", "2026-09-08");
          setField("returnTime", "10:00");
        }
        open({ from: selFromPlace(AIRPORT), to: selFromPlace(placeById("ritz")!), date: "2026-09-01", pax: 2 });
      }}
    >
      launch
    </button>
  );
}

const next = (label: RegExp) => fireEvent.click(screen.getByRole("button", { name: label }));
const seatPlus = () =>
  within(screen.getByText("Child seats").closest(".stw") as HTMLElement).getByRole("button", { name: "+" });
const seatMinus = () =>
  within(screen.getByText("Child seats").closest(".stw") as HTMLElement).getByRole("button", { name: "−" });
/** The foot's running total, as the guest reads it. */
const footTotal = () => document.querySelector(".pfoot .tv")?.textContent ?? "";

function launch(journey: "one" | "return" = "one") {
  render(
    <BookingProvider>
      <Opener journey={journey} />
      <BookingOverlay onConfirmed={vi.fn()} />
    </BookingProvider>,
  );
  fireEvent.click(screen.getByText("launch"));
}

beforeEach(() => { inserts.length = 0; });

describe("child seats — the age is required, the price is shown", () => {
  it("asks for nothing when there are no seats", async () => {
    launch();
    expect(screen.queryByLabelText(/age/i)).toBeNull();
    next(/^your details$/i);
    expect(await screen.findByLabelText(/name for the driver's sign/i)).toBeInTheDocument();
  });

  it("will not go on until the seat's age is chosen, and says why, on the field", () => {
    launch();
    fireEvent.click(seatPlus());
    const age = screen.getByLabelText("Child's age");
    expect(age).toBeRequired();

    next(/^your details$/i);
    // still here, with the reason under the select and focus on it
    expect(screen.getByText(/Who's coming/)).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/choose your child's age, so we bring a seat that fits/i);
    expect(age).toHaveAttribute("aria-invalid", "true");
    expect(age).toHaveAttribute("aria-describedby", alert.id);
    expect(document.activeElement).toBe(age);

    // answering it clears the reason and opens the way
    fireEvent.change(age, { target: { value: "3" } });
    expect(screen.queryByRole("alert")).toBeNull();
    next(/^your details$/i);
    expect(screen.queryByText(/Who's coming/)).toBeNull();
  });

  it("asks one age per seat, and names which one is missing", () => {
    launch();
    fireEvent.click(seatPlus());
    fireEvent.click(seatPlus());
    fireEvent.change(screen.getByLabelText("First child's age"), { target: { value: "0" } });
    next(/^your details$/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/second child's age/i);
    expect(document.activeElement).toBe(screen.getByLabelText("Second child's age"));

    // dropping back to one seat drops the question with it
    fireEvent.click(seatMinus());
    expect(screen.queryByLabelText("Second child's age")).toBeNull();
    next(/^your details$/i);
    expect(screen.queryByText(/Who's coming/)).toBeNull();
  });

  it("prices the seat the moment it is added — every row, the foot and a line saying why", () => {
    launch();
    const sedan = VEHICLES.find((v) => v.id === "sedan")!;
    const bare = quote({ from: selFromPlace(AIRPORT), to: selFromPlace(placeById("ritz")!), vehicle: sedan, isReturn: false, pricing: null, pickupTime: "14:35" });
    expect(footTotal()).toBe(usd(bare.totalUsd));

    fireEvent.click(seatPlus());
    expect(footTotal()).toBe(usd(bare.totalUsd + CHILD_SEAT_USD));
    expect(screen.getByText(`Child seat ×1 · ${usd(CHILD_SEAT_USD)} each way`)).toBeInTheDocument();
    expect(screen.getByText(/\+\$10, already in every fare below/)).toBeInTheDocument();
    // the car's own row carries the same number as the foot
    expect(within(screen.getByRole("radio", { name: /Executive Sedan/ })).getByText(usd(bare.totalUsd + CHILD_SEAT_USD))).toBeInTheDocument();
  });

  it("charges both legs on a return, and says so", () => {
    launch("return");
    fireEvent.click(seatPlus());
    expect(screen.getByText(/\+\$20 for both ways, already in every fare below/)).toBeInTheDocument();
  });

  it("stores exactly the total the review showed, seats and ages included", async () => {
    launch("return");
    fireEvent.click(seatPlus());
    fireEvent.change(screen.getByLabelText("Child's age"), { target: { value: "2" } });
    next(/^your details$/i);
    fireEvent.change(await screen.findByLabelText(/name for the driver's sign/i), { target: { value: "Ada Lovelace" } });
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "ada@example.com" } });
    fireEvent.change(screen.getByLabelText(/whatsapp \/ phone/i), { target: { value: "+1 555 123 4567" } });
    next(/^review$/i);

    await screen.findByText(/Does this look/);
    // the seat is a line of its own beside the total, both legs
    const facts = document.querySelector(".tm-facts") as HTMLElement;
    expect(within(facts).getByText("Child seat ×1")).toBeInTheDocument();
    expect(within(facts).getByText(`${usd(CHILD_SEAT_USD)} per seat, each way`)).toBeInTheDocument();
    const shown = within(facts).getByText("Total, all in").nextElementSibling!.textContent!;

    next(/continue to payment/i);
    await screen.findByText(/you pay your driver in cash/i);
    next(/reserve your car/i);
    await waitFor(() => expect(inserts.length).toBeGreaterThan(0));

    const row = inserts[0];
    const shownUsd = Number(shown.replace("$", ""));
    expect(row.fare_total).toBe(usdToAwg(shownUsd));
    expect(row.child_seats).toBe(1);
    expect(String(row.notes)).toContain("Child seats: 1 (age 2)");
  });
});
