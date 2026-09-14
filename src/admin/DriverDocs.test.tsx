import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DRIVER_DOCUMENTS, type DocumentRecord } from "../driver/lib/documents";

const state: {
  review: unknown;
  link: unknown;
} = {
  review: { ok: true, acceptedCount: 1, driverStatus: "pending" },
  link: { ok: true, url: "https://example.test/signed?token=abc" },
};
const reviewed = vi.fn();
const signed = vi.fn();

vi.mock("./lib/admin", () => ({
  DOCUMENT_LINK_SECONDS: 60,
  signedDocumentUrl: (path: string) => {
    signed(path);
    return Promise.resolve(state.link);
  },
  reviewDocument: (
    uid: string, slug: string, status: string,
    reason: string | null, seenAt: string | null,
  ) => {
    reviewed(uid, slug, status, reason, seenAt);
    return Promise.resolve(state.review);
  },
}));

import DriverDocs from "./DriverDocs";

const rec = (over: Partial<DocumentRecord> & { slug: string }): DocumentRecord => ({
  path: `d1/${over.slug}.pdf`,
  status: "uploaded",
  reason: null,
  uploadedAt: "2026-09-10T14:00:00.000Z",
  reviewedAt: null,
  ...over,
});

const onReviewed = vi.fn();

const renderDocs = (records: DocumentRecord[], unreadable: string | null = null) =>
  render(
    <DriverDocs
      driverUserId="d1"
      driverName="Ana Croes"
      records={records}
      unreadable={unreadable}
      onReviewed={onReviewed}
    />,
  );

beforeEach(() => {
  state.review = { ok: true, acceptedCount: 1, driverStatus: "pending" };
  state.link = { ok: true, url: "https://example.test/signed?token=abc" };
  reviewed.mockClear();
  signed.mockClear();
  onReviewed.mockClear();
});

describe("reviewing a driver's documents", () => {
  it("shows every document Cabby's asks for, with what became of each", () => {
    renderDocs([rec({ slug: "drivers-licence", status: "accepted" })]);
    for (const d of DRIVER_DOCUMENTS) {
      expect(screen.getByText(d.label)).toBeInTheDocument();
    }
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getAllByText("Not sent").length).toBe(DRIVER_DOCUMENTS.length - 1);
  });

  // Never a control the database would refuse. A document that was never
  // sent has nothing to open and nothing to decide about — three buttons
  // that would all come back "no_document" teach an operator that the
  // buttons mean nothing.
  it("offers no decision on a document that was never sent", () => {
    renderDocs([]);
    expect(screen.queryByRole("button", { name: /^view$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
    expect(screen.getAllByText(/nothing sent yet/i).length).toBe(DRIVER_DOCUMENTS.length);
  });

  // The whole reason driver-docs is a private bucket. What View produces
  // is a signature with a clock on it, and the panel says so where the
  // link is — a permanent URL to somebody's passport is forwardable and
  // still working next year.
  it("mints a short-lived signature rather than linking the object", async () => {
    renderDocs([rec({ slug: "drivers-licence" })]);
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    await waitFor(() => expect(signed).toHaveBeenCalledWith("d1/drivers-licence.pdf"));
    const open = await screen.findByRole("link", { name: /open/i });
    expect(open).toHaveAttribute("href", "https://example.test/signed?token=abc");
    expect(screen.getByText(/only good for 60 seconds/i)).toBeInTheDocument();
  });

  it("says why a document could not be opened instead of doing nothing", async () => {
    state.link = { ok: false, detail: "Object not found" };
    renderDocs([rec({ slug: "drivers-licence" })]);
    fireEvent.click(screen.getByRole("button", { name: /^view$/i }));
    expect(await screen.findByText("Object not found")).toBeInTheDocument();
  });

  // Pinned to the copy that was actually read. The likeliest minute for
  // a driver to re-upload is the one right after a rejection told them
  // to, and an Accept that lands on a file nobody opened is the outcome
  // this panel exists to prevent.
  it("pins the decision to the copy the operator was shown", async () => {
    renderDocs([rec({ slug: "drivers-licence" })]);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => expect(reviewed).toHaveBeenCalled());
    expect(reviewed).toHaveBeenCalledWith("d1", "drivers-licence", "accepted", null, "2026-09-10T14:00:00.000Z");
  });

  // THE REQUIREMENT THE FEATURE TURNS ON. A document sent back with no
  // sentence leaves a driver told to fix something and not told what.
  // The database refuses one, so the button does too — and says why,
  // rather than being a dead control with no explanation beside it.
  it("will not send a document back without a reason the driver can act on", async () => {
    renderDocs([rec({ slug: "vehicle-insurance" })]);
    fireEvent.click(screen.getByRole("button", { name: /send back/i }));
    const confirm = await screen.findByRole("button", { name: /send it back/i });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/the database refuses one/i)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "This expired in June — we need the current certificate." },
    });
    expect(screen.getByRole("button", { name: /send it back/i })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /send it back/i }));
    await waitFor(() => expect(reviewed).toHaveBeenCalled());
    expect(reviewed.mock.calls[0][3]).toMatch(/expired in June/);
  });

  it("shows the operator the sentence a driver was already sent", () => {
    renderDocs([rec({
      slug: "vehicle-insurance", status: "rejected",
      reason: "The bottom of the page is cut off.",
    })]);
    expect(screen.getByText(/the bottom of the page is cut off/i)).toBeInTheDocument();
  });

  // Accepting documents is not approving a driver. Two ways to approve
  // somebody is two answers to "can this person claim a ride".
  it("says the driver still has to be approved once every document is in", () => {
    renderDocs(DRIVER_DOCUMENTS.map((d) => rec({ slug: d.slug, status: "accepted" })));
    expect(screen.getByText(/still has to be approved on the row above/i)).toBeInTheDocument();
  });

  it("counts against the list Cabby's asks for, not against what arrived", () => {
    renderDocs([
      rec({ slug: "drivers-licence", status: "accepted" }),
      rec({ slug: "medical-certificate", status: "accepted" }),
    ]);
    expect(screen.getByText(`1 of ${DRIVER_DOCUMENTS.length} accepted`)).toBeInTheDocument();
  });

  // "This driver has sent nothing" and "we couldn't look" are the same
  // empty array. An operator acting on the first when it is really the
  // second asks five drivers to re-send what they already sent.
  it("never draws an unreadable table as a driver who has sent nothing", () => {
    renderDocs([], "permission denied for table driver_documents");
    expect(screen.getByText(/can't be read/i)).toBeInTheDocument();
    expect(screen.getByText(/don't ask them to re-send anything yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/nothing sent yet/i)).toBeNull();
  });

  it("reloads rather than recording a decision about a document that has moved on", async () => {
    state.review = { ok: false, detail: "The driver uploaded a new copy while you had this open." };
    renderDocs([rec({ slug: "drivers-licence" })]);
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    expect(await screen.findByText(/uploaded a new copy/i)).toBeInTheDocument();
    expect(onReviewed).toHaveBeenCalled();
  });
});
