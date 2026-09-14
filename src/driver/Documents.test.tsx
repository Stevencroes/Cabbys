import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DRIVER_DOCUMENTS, type DocumentRecord } from "./lib/documents";

const state: {
  documents: DocumentRecord[];
  error: string | null;
  upload: { ok: true } | { ok: false; detail: string };
} = { documents: [], error: null, upload: { ok: true } };
const uploaded = vi.fn();
let reads = 0;

vi.mock("./lib/driver", () => ({
  loadDriverDocuments: () => {
    reads++;
    return Promise.resolve({ documents: state.documents, error: state.error });
  },
  uploadDriverDocument: (slug: string, file: File) => {
    uploaded(slug, file);
    return Promise.resolve(state.upload);
  },
}));

import Documents from "./Documents";

const rec = (over: Partial<DocumentRecord> & { slug: string }): DocumentRecord => ({
  path: `d1/${over.slug}.pdf`,
  status: "uploaded",
  reason: null,
  uploadedAt: "2026-09-01T12:00:00.000Z",
  reviewedAt: null,
  ...over,
});

const pdf = () => new File(["x"], "licence.pdf", { type: "application/pdf" });

beforeEach(() => {
  state.documents = [];
  state.error = null;
  state.upload = { ok: true };
  uploaded.mockClear();
  reads = 0;
});

describe("a driver's documents", () => {
  it("lists every document Cabby's asks for, whether or not it has been sent", async () => {
    render(<Documents uid="d1" />);
    for (const d of DRIVER_DOCUMENTS) {
      expect(await screen.findByText(d.label)).toBeInTheDocument();
    }
  });

  // Named pieces, not a count. "Three outstanding" is a number and
  // "your insurance and your permit" is an instruction — the same
  // difference missingIdentity() was rewritten to make.
  it("says what is still outstanding by name", async () => {
    state.documents = [rec({ slug: "drivers-licence", status: "accepted" })];
    render(<Documents uid="d1" />);
    const line = await screen.findByText(/still to send/i);
    expect(line).toHaveTextContent(/Public-transport permit/);
    expect(line).not.toHaveTextContent(/Driver's licence/);
  });

  // Nobody has looked at it yet and there is nothing the driver can do
  // about that — listing it would be nagging them about our own queue.
  it("tells a driver who has sent everything that there is nothing left to do", async () => {
    state.documents = DRIVER_DOCUMENTS.map((d) => rec({ slug: d.slug }));
    render(<Documents uid="d1" />);
    expect(await screen.findByText(/all sent/i)).toBeInTheDocument();
    expect(screen.queryByText(/still to send/i)).toBeNull();
  });

  // The requirement the whole feature turns on. A driver told "not
  // accepted" with no sentence attached is told to fix something and not
  // told what, and the only move left is a WhatsApp message.
  it("shows a rejected document's reason, and offers a way to replace it", async () => {
    state.documents = [rec({
      slug: "vehicle-insurance",
      status: "rejected",
      reason: "This expired in June — we need the current certificate.",
    })];
    render(<Documents uid="d1" />);
    expect(await screen.findByText(/this expired in june/i)).toBeInTheDocument();
    // and it still counts as outstanding: a file that exists but was
    // sent back has not, as far as the application is concerned, arrived
    expect(screen.getByText(/still to send/i)).toHaveTextContent(/Vehicle insurance/);
  });

  // Never a control the database would refuse. Re-sending an accepted
  // document resets it to unchecked and puts the driver back in the
  // queue for no reason they asked for.
  it("offers no upload on a document that has already been accepted", async () => {
    state.documents = DRIVER_DOCUMENTS.map((d) =>
      rec({ slug: d.slug, status: d.slug === "drivers-licence" ? "accepted" : "uploaded" }));
    render(<Documents uid="d1" />);
    await screen.findByText("Driver's licence");
    const rows = screen.getAllByRole("listitem");
    const licence = rows.find((r) => r.textContent?.includes("Driver's licence"))!;
    expect(licence.querySelector("button")).toBeNull();
  });

  it("sends the file under the slug of the row it was chosen on", async () => {
    const { container } = render(<Documents uid="d1" />);
    await screen.findByText("Vehicle insurance");
    const input = container.querySelector("#doc-vehicle-insurance") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });
    await waitFor(() => expect(uploaded).toHaveBeenCalled());
    expect(uploaded.mock.calls[0][0]).toBe("vehicle-insurance");
  });

  // The list the driver is reading is the thing the upload changes. A
  // panel that kept showing "Not sent" over a document that had just
  // landed would have them sending it twice.
  it("re-reads the list once a document lands", async () => {
    const { container } = render(<Documents uid="d1" />);
    await screen.findByText("Driver's licence");
    const before = reads;
    const input = container.querySelector("#doc-drivers-licence") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it("says why an upload was refused rather than looking like a dead button", async () => {
    state.upload = { ok: false, detail: "That file is over 8MB." };
    const { container } = render(<Documents uid="d1" />);
    await screen.findByText("Driver's licence");
    const input = container.querySelector("#doc-drivers-licence") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(await screen.findByText(/over 8MB/i)).toBeInTheDocument();
  });

  // The fault this codebase keeps catching. A driver shown five
  // outstanding documents over a table nobody could read uploads a
  // licence they already sent, is told nothing landed, and does it again.
  it("never draws a failed read as a driver who has sent nothing", async () => {
    state.error = "permission denied for table driver_documents";
    render(<Documents uid="d1" />);
    expect(await screen.findByText(/can't read your documents/i)).toBeInTheDocument();
    expect(screen.getByText(/don't send them again yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/still to send/i)).toBeNull();
    // the database's own words, for whoever fixes it
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  // The gate has room for a decision and not for five explanations; the
  // profile screen has room for both.
  it("drops the reasons on the gate and keeps them on the profile", async () => {
    const why = DRIVER_DOCUMENTS[0].why;
    const { unmount } = render(<Documents uid="d1" compact />);
    await screen.findByText(DRIVER_DOCUMENTS[0].label);
    expect(screen.queryByText(why)).toBeNull();
    unmount();

    render(<Documents uid="d1" />);
    expect(await screen.findByText(why)).toBeInTheDocument();
  });
});
