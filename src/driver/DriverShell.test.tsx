import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const state: {
  online: boolean;
  assigned: unknown[];
  documents: unknown[];
  documentsError: string | null;
} = { online: true, assigned: [], documents: [], documentsError: null };
const calls: boolean[] = [];
const navigate = vi.fn();

vi.mock("./lib/driver", async (orig) => ({
  ...(await orig<typeof import("./lib/driver")>()),
  setOnline: (next: boolean) => { calls.push(next); return Promise.resolve(state.online); },
  loadAssigned: () => Promise.resolve({ jobs: state.assigned, error: null }),
  loadDriverDocuments: () =>
    Promise.resolve({ documents: state.documents, error: state.documentsError }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("./useRideOffers", () => ({
  useRideOffers: () => ({
    offer: null, missed: null, busy: false, refused: null,
    accept: () => Promise.resolve(null), dismiss: () => {}, clearMissed: () => {},
  }),
}));
vi.mock("./lib/chime", () => ({ primeAudio: () => {}, chime: () => Promise.resolve() }));

import DriverShell from "./DriverShell";
import { DRIVER_DOCUMENTS } from "./lib/documents";

const carless = (over: Record<string, unknown> = {}) =>
  ({ ...driver, plate: null, vehicle: null, make: null, model: null, colour: null, photoUrl: null, ...over });

const driver = {
  id: "d1", fullName: "Steven Croes", email: "ana@example.com", phone: null,
  // a car on record, which is the ordinary case — carless() below is the
  // exception, and it is the exception the shell has to speak up about
  vehicle: null, plate: "A-42871",
  make: "Mercedes", model: "V-Class", colour: "Black", year: 2023,
  seats: 7, bags: 6, photoUrl: "https://cdn.example/face.jpg",
  status: "approved" as const, rating: 4.9, tripsCount: 12, isOnline: false,
};

/** Every document accepted — the state that produces no band at all. */
const FULL_SET = DRIVER_DOCUMENTS.map((spec) => ({
  slug: spec.slug,
  path: `d1/${spec.slug}.pdf`,
  status: "accepted" as const,
  reason: null,
  uploadedAt: "2026-09-01T12:00:00.000Z",
  reviewedAt: "2026-09-02T12:00:00.000Z",
}));

const renderShell = () =>
  render(<MemoryRouter><DriverShell driver={driver}><p>screen</p></DriverShell></MemoryRouter>);

const job = (status: string) => ({
  id: "r9", status, scheduledAt: new Date().toISOString(),
  pickup: "Queen Beatrix International Airport", dropoff: "Bucuti & Tara Beach Resort",
  vehicle: "The Scout", passengers: 2, luggage: 1, childSeats: 0,
  fareAwg: 128, payoutUsd: 53, bookingRef: "CBY-1",
  contactName: null, contactPhone: null, flightNumber: null,
  pickupLat: null, pickupLng: null, pickupNote: null, bookingNotes: null,
  arrivedAt: null, startedAt: null,
});

beforeEach(() => {
  state.online = true;
  state.assigned = [];
  // An approved driver with the paperwork in is the ordinary case, so
  // the identity band's tests are not competing with a second one.
  state.documents = FULL_SET;
  state.documentsError = null;
  calls.length = 0;
  navigate.mockClear();
});

describe("The driver shell", () => {
  it("flips the switch before the write lands, because a switch that waits feels broken", async () => {
    renderShell();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(calls).toEqual([true]));
  });

  // The portal reading "Online" over a database row that says otherwise is
  // a driver sitting out a whole shift wondering where the work went.
  it("puts the switch back and says so when the write doesn't land", async () => {
    state.online = false;  // the update failed
    renderShell();
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach cabby's/i);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("names the first tab for what it now shows", () => {
    renderShell();
    expect(screen.getByRole("link", { name: /schedule/i })).toHaveAttribute("href", "/drive");
  });

  // A driver who checked their earnings mid-ride, or whose phone reloaded
  // at a red light, had no way back to the job except hunting the roster —
  // on the one screen where thirty seconds costs the most.
  it("keeps a job in flight one tap away from anywhere", async () => {
    state.assigned = [job("en_route")];
    renderShell();
    const bar = await screen.findByRole("button", { name: /on my way/i });
    fireEvent.click(bar);
    expect(navigate).toHaveBeenCalledWith("/drive/ride/r9");
  });

  // claim_ride writes what the drivers row holds, and if it holds nothing
  // the guest is back to watching an empty kerb — the exact fault the
  // stamp chain was built to fix, reproduced one driver at a time.
  it("tells a driver with no car on record that guests can't spot them", async () => {
    render(
      <MemoryRouter>
        <DriverShell driver={carless()}><p>screen</p></DriverShell>
      </MemoryRouter>,
    );
    const nag = await screen.findByRole("button", { name: /can't spot you/i });
    fireEvent.click(nag);
    expect(navigate).toHaveBeenCalledWith("/drive/profile");
  });

  it("says nothing to a driver whose car is on record", async () => {
    renderShell();
    await waitFor(() => expect(screen.queryByText(/can't spot you/i)).toBeNull());
  });

  // v8. The band said "no car on record" whichever of the four was
  // missing. A driver with a colour, a plate and a photo on file was sent
  // to a profile screen showing a complete car and told to add one — the
  // thing actually absent was their name, which no screen could set.
  it("names the piece that is actually missing", async () => {
    render(
      <MemoryRouter>
        <DriverShell driver={{ ...driver, fullName: "" }}><p>screen</p></DriverShell>
      </MemoryRouter>,
    );
    const nag = await screen.findByRole("button", { name: /can't spot you/i });
    expect(nag).toHaveTextContent(/missing your name/i);
    expect(nag).not.toHaveTextContent(/your car/i);
  });

  it("lists every missing piece in one sentence", async () => {
    render(
      <MemoryRouter>
        <DriverShell driver={carless({ fullName: "" })}><p>screen</p></DriverShell>
      </MemoryRouter>,
    );
    const nag = await screen.findByRole("button", { name: /can't spot you/i });
    expect(nag).toHaveTextContent(/your name, your car, your plate and a photo of yourself/i);
  });

  // ONE band, not two. The paperwork gap and the identity gap are the
  // same strip at the foot of the screen with a precedence rule between
  // them: a missing plate is a guest at a kerb this morning, a missing
  // permit is a conversation with an operator. Two bands stacked over
  // the nav would be the "second, different nag" this was built to avoid.
  it("shows the identity gap first when a driver has both", async () => {
    state.documents = [];
    render(
      <MemoryRouter>
        <DriverShell driver={carless()}><p>screen</p></DriverShell>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: /can't spot you/i })).toBeInTheDocument();
    expect(screen.queryByText(/still waiting on your paperwork/i)).toBeNull();
  });

  // The drivers already on the road were approved before any of this
  // existed, so none of them has a document on file. Named pieces, not a
  // count — "three outstanding" is a number and "your licence and your
  // permit" is an instruction.
  it("names the documents Cabby's is still waiting on", async () => {
    state.documents = [];
    renderShell();
    const nag = await screen.findByRole("button", { name: /still waiting on your paperwork/i });
    expect(nag).toHaveTextContent(/Driver's licence/);
    expect(nag).toHaveTextContent(/Public-transport permit/);
    fireEvent.click(nag);
    expect(navigate).toHaveBeenCalledWith("/drive/profile");
  });

  // A document sent back has, as far as the application is concerned,
  // not been sent — and it is the one the driver can actually do
  // something about today.
  it("counts a document that was sent back as still outstanding", async () => {
    state.documents = FULL_SET.map((d, i) =>
      i === 0 ? { ...d, status: "rejected", reason: "The expiry date is cut off." } : d);
    renderShell();
    const nag = await screen.findByRole("button", { name: /still waiting on your paperwork/i });
    expect(nag).toHaveTextContent(/Driver's licence/);
    expect(nag).not.toHaveTextContent(/Public-transport permit/);
  });

  // The fault this codebase keeps catching: an empty result reported as
  // "nothing here" when it means "I couldn't look". A band that nagged a
  // driver about five documents because the table was unreadable would
  // have them re-sending everything they already sent.
  it("says nothing about paperwork it could not read", async () => {
    state.documents = [];
    state.documentsError = "permission denied for table driver_documents";
    renderShell();
    await waitFor(() => expect(screen.getByText("screen")).toBeInTheDocument());
    expect(screen.queryByText(/still waiting on your paperwork/i)).toBeNull();
  });

  // A job in flight always outranks a thing to go and fix.
  it("yields to a running job", async () => {
    state.assigned = [job("en_route")];
    render(
      <MemoryRouter>
        <DriverShell driver={carless()}><p>screen</p></DriverShell>
      </MemoryRouter>,
    );
    await screen.findByRole("button", { name: /on my way/i });
    expect(screen.queryByText(/can't spot you/i)).toBeNull();
  });

  it("says nothing when the next job is still hours off", async () => {
    state.assigned = [job("driver_assigned")];
    renderShell();
    await waitFor(() => expect(screen.queryByText(/assigned/i)).toBeNull());
  });
});
