import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../booking/useAuth", () => ({ useAuth: () => ({ account: null, user: null, loading: false }) }));

import PolicyPage from "./PolicyPage";
import { BookingProvider } from "../booking/BookingContext";
import { parseDoc, LEGAL } from "../lib/legal";

const approved = (body: string) => parseDoc("terms",
  `---\ntitle: Terms of Service\nstatus: approved\nlastUpdated: 2026-10-01\napprovedBy: A. Lawyer\n---\n${body}`);
const LONG = approved("Intro.\n\n## Bookings\nOne.\n\n## Payment\nTwo.\n\n## Liability\nThree.");

function renderPage(doc = LONG) {
  return render(
    <MemoryRouter initialEntries={["/terms"]}>
      <BookingProvider><PolicyPage slug="terms" doc={doc} /></BookingProvider>
    </MemoryRouter>,
  );
}

describe("a published policy", () => {
  it("has one page heading, the date it was last updated, and its sections as headings", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeInTheDocument();
    const updated = screen.getByText("1 October 2026");
    expect(updated.tagName).toBe("TIME");
    expect(updated).toHaveAttribute("datetime", "2026-10-01");
    const article = screen.getByRole("article");
    expect(within(article).getAllByRole("heading", { level: 2 }).map((h) => h.textContent))
      .toEqual(["Bookings", "Payment", "Liability"]);
  });

  it("gives a long page a table of contents that jumps to each section", () => {
    renderPage();
    const toc = screen.getByRole("navigation", { name: "On this page" });
    const links = within(toc).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#bookings", "#payment", "#liability"]);
    // each target exists, and can take focus, so a keyboard user's next
    // Tab continues from the section rather than the top of the page
    for (const a of links) {
      const target = document.getElementById(a.getAttribute("href")!.slice(1))!;
      expect(target).toHaveAttribute("tabindex", "-1");
    }
  });

  it("skips the table of contents on a short page", () => {
    renderPage(approved("## Only\nOne."));
    expect(screen.queryByRole("navigation", { name: "On this page" })).toBeNull();
  });

  it("names itself in the tab title", () => {
    renderPage();
    expect(document.title).toBe("Terms of Service · Cabby's");
  });
});

// The rule that matters: nothing unapproved is ever published.
describe("a policy that is not approved yet", () => {
  const pending = parseDoc("terms", "---\ntitle: Terms of Service\nstatus: pending\n---\n## Draft\nDo not publish this.");

  it("says it is being finalised, and publishes none of the draft text", () => {
    renderPage(pending);
    expect(screen.getByText("This policy is being finalised.")).toBeInTheDocument();
    expect(screen.queryByText(/do not publish this/i)).toBeNull();
    expect(screen.queryByText(/last updated/i)).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("offers a way to ask, by email whether or not WhatsApp is set up", () => {
    renderPage(pending);
    const main = screen.getByRole("main");
    expect(within(main).getByRole("link", { name: "cabbystransfer@gmail.com" }))
      .toHaveAttribute("href", "mailto:cabbystransfer@gmail.com");
  });

  it("is the state every shipped policy is in until the client supplies it", () => {
    // If this fails, someone has published a policy — check its approvedBy.
    for (const d of Object.values(LEGAL)) {
      if (!d.published) expect(d.whyNot, d.slug).toBeTruthy();
    }
  });
});

describe("between policies", () => {
  it("links to the other two", () => {
    renderPage();
    const others = screen.getByRole("navigation", { name: "Other policies" });
    expect(within(others).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["/cancellation", "/privacy"]);
  });
});
