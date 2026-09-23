import { render, screen, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Reviews from "./Reviews";
import type { Review } from "../data/reviews";

const NOW = Date.parse("2026-09-23T12:00:00Z");

const review = (over: Partial<Review> = {}): Review => ({
  text: "On time, and the car was spotless.",
  author: "M. de V.",
  rating: 4,
  platform: "Google",
  sourceUrl: "https://maps.app.goo.gl/abc123",
  date: "2026-09-01",
  ...over,
});

describe("with nothing verified to show", () => {
  // The state the site ships in. Not an empty band, not a heading over
  // nothing — no element at all, so no gap can be left behind.
  it("renders nothing", () => {
    const { container } = render(<Reviews reviews={[]} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when every entry fails verification", () => {
    const { container } = render(
      <Reviews reviews={[review({ sourceUrl: "" }), review({ rating: 7 as Review["rating"] })]} now={NOW} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  // With the shipped (empty) list, none of the removed claims can render.
  it("shows none of the old invented claims by default", () => {
    const { container } = render(<Reviews now={NOW} />);
    expect(container.textContent ?? "").not.toMatch(/300\+|5\.0|Jessica|Trustpilot|Tripadvisor/);
  });
});

describe("a verified review", () => {
  it("shows the words, the author, the rating, where and when", () => {
    render(<Reviews reviews={[review()]} now={NOW} />);
    expect(screen.getByText(/On time, and the car was spotless\./)).toBeInTheDocument();
    expect(screen.getByText("M. de V.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Rated 4 out of 5" })).toBeInTheDocument();
    const when = screen.getByText("September 2026");
    expect(when.tagName).toBe("TIME");
    expect(when).toHaveAttribute("datetime", "2026-09-01");
  });

  // The link is the evidence, so it has to be safe to follow and say
  // plainly where it goes.
  it("links to the review safely, in a new tab, with a label that says so", () => {
    render(<Reviews reviews={[review()]} now={NOW} />);
    const link = screen.getByRole("link", { name: /read m\. de v\.'s review on google \(opens in a new tab\)/i });
    expect(link).toHaveAttribute("href", "https://maps.app.goo.gl/abc123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
    // label-in-name: the visible word is inside the accessible name
    expect(link).toHaveTextContent("Google");
  });

  // An average of hand-picked reviews would be a fabricated rating by
  // another route. The band states each review's own score and no total.
  it("never prints an aggregate score or a review count", () => {
    render(<Reviews reviews={[review({ rating: 5 }), review({ rating: 4, sourceUrl: "https://g.page/b" })]} now={NOW} />);
    const band = screen.getByRole("region", { name: "What guests say" });
    expect(band.textContent ?? "").not.toMatch(/\d\.\d|from \d+ reviews|average/i);
  });
});

describe("several", () => {
  it("lays one out as a single voice and several as a row", () => {
    const one = render(<Reviews reviews={[review()]} now={NOW} />);
    expect(one.container.querySelector(".proof-list")).not.toHaveClass("many");
    one.unmount();

    render(<Reviews reviews={[review(), review({ sourceUrl: "https://g.page/b" })]} now={NOW} />);
    expect(document.querySelector(".proof-list")).toHaveClass("many");
  });

  it("shows at most three, newest first", () => {
    render(
      <Reviews
        now={NOW}
        reviews={["2026-03-01", "2026-09-01", "2026-05-01", "2026-07-01"].map((date, i) =>
          review({ date, author: `Guest ${i}`, sourceUrl: `https://g.page/${i}` }))}
      />,
    );
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items.map((li) => li.querySelector("time")?.getAttribute("datetime")))
      .toEqual(["2026-09-01", "2026-07-01", "2026-05-01"]);
  });
});
