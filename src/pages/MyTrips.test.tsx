import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../booking/useAuth", () => ({
  useAuth: vi.fn(),
}));

// Mutable per test: which rows the read returns, whether it fails, and
// what the cancel write reports back.
const h = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  readError: null as null | { message: string },
  failNextRead: false,
  cancel: { data: [{ id: "x" }], error: null } as { data: unknown; error: null | { message: string } },
  reads: 0,
}));

vi.mock("../lib/supabase", () => {
  const order = vi.fn(() => {
    h.reads++;
    if (h.failNextRead) { h.failNextRead = false; return Promise.resolve({ data: null, error: { message: "boom" } }); }
    return Promise.resolve({ data: h.rows, error: h.readError });
  });
  return {
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ order }) }),
        update: () => ({ eq: () => ({ select: () => Promise.resolve(h.cancel) }) }),
      }),
      channel: undefined,
      rpc: vi.fn().mockResolvedValue({ data: 0, error: null }),
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
    },
  };
});

import MyTrips from "./MyTrips";
import { useAuth } from "../booking/useAuth";
import { BookingProvider } from "../booking/BookingContext";

const signedIn = {
  user: { id: "user-123", email: "test@example.com" },
  account: { id: "user-123", email: "test@example.com" },
  loading: false,
  signOut: vi.fn(),
};

const DAY = 86_400_000;
/** A row as the booking flow writes it: Aruba wall clock, no instant. */
function row(id: string, days: number, over: Record<string, unknown> = {}) {
  const at = new Date(Date.now() + days * DAY - 4 * 3_600_000);
  return {
    id, booking_ref: `CB-${id.toUpperCase()}`,
    pickup_location: "Palm Beach", dropoff_location: "Flying Fishbone",
    scheduled_date: at.toISOString().slice(0, 10), scheduled_time: at.toISOString().slice(11, 16),
    vehicle_class: "transit", vehicle_type: "transit",
    fare_total: 100, status: "confirmed",
    ...over,
  };
}

const standard = () => [
  row("far", 9),
  row("soon", 2, { status: "driver_assigned", driver_name: "Ana Croes", driver_phone: "+2975551234" }),
  row("canx", 5, { status: "cancelled" }),
  ...Array.from({ length: 7 }, (_, i) => row(`done${i}`, -(i + 1), { status: "completed" })),
];

function renderTrips(path = "/trips") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BookingProvider>
        <MyTrips />
      </BookingProvider>
    </MemoryRouter>,
  );
}

const refs = (root: ParentNode = document) =>
  [...root.querySelectorAll(".tp-reffact dd")].map((n) => n.textContent);
const panel = () => screen.getByRole("tabpanel");
/** The card carrying this booking reference, once it has rendered. */
const cardOf = async (ref: string) => (await screen.findByText(ref)).closest("article") as HTMLElement;

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(signedIn as unknown as ReturnType<typeof useAuth>);
  h.rows = standard();
  h.readError = null;
  h.failNextRead = false;
  h.cancel = { data: [{ id: "x" }], error: null };
  h.reads = 0;
});

describe("page copy", () => {
  it("keeps the heading and says what the page is for", async () => {
    renderTrips();
    expect(await screen.findByRole("heading", { level: 1, name: "Your trips" })).toBeInTheDocument();
    expect(screen.getByText("Every ride, kept in one place.")).toBeInTheDocument();
  });
});

describe("tabs", () => {
  it("offers Upcoming, Past and Cancelled, in that order, with accurate counts", async () => {
    renderTrips();
    const list = await screen.findByRole("tablist", { name: "Trips" });
    const tabs = within(list).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent?.replace(/,.*$/, ""))).toEqual(["Upcoming2", "Past7", "Cancelled1"]);
    expect(within(list).getByRole("tab", { name: /upcoming\s*,\s*2 trips/i })).toBeInTheDocument();
  });

  it("opens on Upcoming when there is anything ahead, soonest first", async () => {
    renderTrips();
    const up = await screen.findByRole("tab", { name: /^upcoming/i });
    expect(up).toHaveAttribute("aria-selected", "true");
    expect(refs(panel())).toEqual(["CB-SOON", "CB-FAR"]);
  });

  it("opens on Past when nothing is ahead", async () => {
    h.rows = [row("done", -3, { status: "completed" }), row("canx", -2, { status: "cancelled" })];
    renderTrips();
    expect(await screen.findByRole("tab", { name: /^past/i })).toHaveAttribute("aria-selected", "true");
  });

  it("never files a cancelled trip under Past", async () => {
    renderTrips();
    fireEvent.click(await screen.findByRole("tab", { name: /^past/i }));
    fireEvent.click(screen.getByRole("button", { name: /show 2 more/i }));
    expect(refs(panel())).toHaveLength(7);
    expect(refs(panel())).not.toContain("CB-CANX");
  });

  it("folds a long shelf, and re-folds it when another tab is chosen", async () => {
    renderTrips();
    fireEvent.click(await screen.findByRole("tab", { name: /^past/i }));
    expect(refs(panel())).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /show 2 more/i }));
    expect(refs(panel())).toHaveLength(7);
    fireEvent.click(screen.getByRole("tab", { name: /^cancelled/i }));
    fireEvent.click(screen.getByRole("tab", { name: /^past/i }));
    expect(refs(panel())).toHaveLength(5);
  });

  it("honours the tab named in the URL", async () => {
    renderTrips("/trips?show=cancelled");
    expect(await screen.findByRole("tab", { name: /^cancelled/i })).toHaveAttribute("aria-selected", "true");
    expect(refs(panel())).toEqual(["CB-CANX"]);
  });

  it("moves between tabs with the arrow keys, as a tablist should", async () => {
    renderTrips();
    const up = await screen.findByRole("tab", { name: /^upcoming/i });
    fireEvent.keyDown(up, { key: "ArrowRight" });
    const past = screen.getByRole("tab", { name: /^past/i });
    expect(past).toHaveAttribute("aria-selected", "true");
    expect(past).toHaveFocus();
    fireEvent.keyDown(past, { key: "End" });
    expect(screen.getByRole("tab", { name: /^cancelled/i })).toHaveAttribute("aria-selected", "true");
  });

  it("offers a way to book from an empty tab", async () => {
    h.rows = [row("far", 9)];
    renderTrips("/trips?show=cancelled");
    const empty = await screen.findByRole("tabpanel");
    expect(within(empty).getByText("No cancelled trips.")).toBeInTheDocument();
    expect(within(empty).getByRole("button", { name: /book a transfer/i })).toBeInTheDocument();
  });
});

// The contradiction the redesign exists to remove.
describe("a trip nobody closed off", () => {
  beforeEach(() => {
    h.rows = [...standard(), row("stale", -3, { status: "driver_assigned", driver_name: "Ana Croes" })];
  });

  it("is shown above the tabs as needing review, never inside Past", async () => {
    renderTrips();
    const review = await screen.findByRole("region", { name: /needs review/i });
    expect(refs(review)).toEqual(["CB-STALE"]);
    fireEvent.click(screen.getByRole("tab", { name: /^past/i }));
    fireEvent.click(screen.getByRole("button", { name: /show 2 more/i }));
    expect(refs(panel())).not.toContain("CB-STALE");
  });

  it("says 'Trip needs review', never 'Driver assigned'", async () => {
    renderTrips();
    const c = await cardOf("CB-STALE");
    expect(within(c).getByText("Trip needs review")).toBeInTheDocument();
    expect(within(c).queryByText("Driver assigned")).toBeNull();
  });

  it("offers Report an issue and Contact support, and nothing that pretends it's live", async () => {
    renderTrips();
    const c = await cardOf("CB-STALE");
    expect(within(c).getByRole("button", { name: "Report an issue" })).toBeInTheDocument();
    expect(within(c).getByRole("button", { name: "Contact support" })).toBeInTheDocument();
    expect(within(c).queryByRole("button", { name: /track status|contact driver|cancel/i })).toBeNull();
  });
});

describe("what a card says", () => {
  it("names the vehicle and labels the money", async () => {
    renderTrips();
    const c = await cardOf("CB-FAR");
    expect(within(c).getByText("Premium Van")).toBeInTheDocument();
    expect(within(c).queryByText(/transit · transit/i)).toBeNull();
    // 100 florin at 1.79 is US$56, labelled — never a lone "$56"
    expect(within(c).getByText("Total")).toBeInTheDocument();
    expect(within(c).getByText("US$56")).toBeInTheDocument();
    // no card payment recorded: settled with the driver, not "pending"
    expect(within(c).getByText("Pay your driver")).toBeInTheDocument();
  });

  it("labels a card payment as paid, with 'Total paid'", async () => {
    h.rows = [row("paid", 9, { payment_status: "paid" })];
    renderTrips();
    const c = await cardOf("CB-PAID");
    expect(within(c).getByText("Paid")).toBeInTheDocument();
    expect(within(c).getByText("Total paid")).toBeInTheDocument();
  });

  it("names the timezone beside the pickup time", async () => {
    renderTrips();
    const c = await cardOf("CB-FAR");
    expect(within(c).getByText("Aruba time")).toBeInTheDocument();
  });

  it("shows the assigned driver, but not their phone days ahead of the trip", async () => {
    renderTrips();
    const c = await cardOf("CB-SOON");
    expect(within(c).getByText("Ana Croes")).toBeInTheDocument();
    expect(within(c).queryByRole("button", { name: /contact driver/i })).toBeNull();
  });

  it("uses initials when there is no photo, never an image standing in for one", async () => {
    renderTrips();
    const c = await cardOf("CB-SOON");
    expect(within(c).getByText("AC")).toBeInTheDocument();
    expect(within(c).queryByRole("img", { name: /photo of/i })).toBeNull();
  });
});

describe("actions by status", () => {
  it("offers an upcoming trip details, a change request, support and cancel", async () => {
    renderTrips();
    const c = await cardOf("CB-FAR");
    for (const name of ["View details", "Request a change", "Contact support", "Cancel booking"]) {
      expect(within(c).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("offers a completed trip rebooking, a summary and a way to report a problem", async () => {
    renderTrips("/trips?show=past");
    const c = await cardOf("CB-DONE0");
    for (const name of ["Book this route again", "Trip summary", "Report an issue"]) {
      expect(within(c).getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("offers a cancelled trip its details and a way to book again", async () => {
    renderTrips("/trips?show=cancelled");
    const c = await cardOf("CB-CANX");
    expect(within(c).getByRole("button", { name: "Cancellation details" })).toBeInTheDocument();
    expect(within(c).getByRole("button", { name: "Book again" })).toBeInTheDocument();
    // nothing was charged, so there is no refund to ask about
    expect(within(c).queryByRole("button", { name: /refund/i })).toBeNull();
  });

  // Support is never WhatsApp-only.
  it("always offers email support, whatever else is configured", async () => {
    renderTrips();
    const c = await cardOf("CB-FAR");
    fireEvent.click(within(c).getByRole("button", { name: "Contact support" }));
    const email = within(c).getByRole("link", { name: /email .* about booking CB-FAR/i });
    expect(email.getAttribute("href")).toMatch(/^mailto:cabbystransfer@gmail\.com\?subject=/);
  });
});

describe("cancelling", () => {
  it("states what happens to the money before the guest commits", async () => {
    renderTrips();
    const c = await cardOf("CB-FAR");
    fireEvent.click(within(c).getByRole("button", { name: "Cancel booking" }));
    const dlg = within(c).getByRole("alertdialog", { name: /cancel this booking/i });
    expect(within(dlg).getByText(/cancelling is free/i)).toBeInTheDocument();
    expect(within(dlg).getByText(/nothing has been charged online/i)).toBeInTheDocument();
  });

  it("moves the trip to Cancelled only once the database confirms it", async () => {
    renderTrips();
    const c = await cardOf("CB-FAR");
    fireEvent.click(within(c).getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(within(c).getByRole("button", { name: "Yes, cancel booking" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: /^cancelled/i }).textContent).toMatch(/2/));
  });

  // The silent refusal: RLS matches zero rows and reports no error.
  it("keeps the trip live and says why when the database refuses", async () => {
    h.cancel = { data: [], error: null };
    renderTrips();
    const c = await cardOf("CB-FAR");
    fireEvent.click(within(c).getByRole("button", { name: "Cancel booking" }));
    fireEvent.click(within(c).getByRole("button", { name: "Yes, cancel booking" }));
    expect(await within(c).findByRole("alert")).toHaveTextContent(/can no longer be cancelled online/i);
    // the status badge still says what the database says
    expect(within(c).getByText("Confirmed", { selector: ".tp-status" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^cancelled/i }).textContent).toMatch(/1/);
  });
});

describe("loading and failure", () => {
  it("reports a failed read as a failure, never as 'no trips', and retries", async () => {
    h.failNextRead = true;
    renderTrips();
    expect(await screen.findByText(/couldn.t load your trips/i)).toBeInTheDocument();
    expect(screen.queryByText(/no trips yet/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("tablist")).toBeInTheDocument();
    expect(h.reads).toBe(2);
  });

  it("offers booking when there are genuinely no trips", async () => {
    h.rows = [];
    renderTrips();
    expect(await screen.findByText("No trips yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /book a transfer/i })).toBeInTheDocument();
  });
});

describe("who is allowed to see it", () => {
  const signedOut = { user: null, account: null, loading: false, signOut: vi.fn() };

  it("asks a stranger to sign in rather than showing a list", async () => {
    vi.mocked(useAuth).mockReturnValue(signedOut as unknown as ReturnType<typeof useAuth>);
    renderTrips();
    expect(await screen.findByText(/sign in to see your transfers/i)).toBeInTheDocument();
    expect(refs()).toHaveLength(0);
  });

  it("treats a guest's anonymous session the same way", async () => {
    // Supabase keeps the anonymous user in localStorage, so every guest
    // booking ever made from one browser shared one id — and this page
    // showed the lot, to nobody in particular.
    vi.mocked(useAuth).mockReturnValue({
      ...signedOut, user: { id: "anon-1", is_anonymous: true },
    } as unknown as ReturnType<typeof useAuth>);
    renderTrips();
    expect(await screen.findByText(/sign in to see your transfers/i)).toBeInTheDocument();
    expect(refs()).toHaveLength(0);
  });
});
