import { render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HashScroll from "./HashScroll";

// jsdom has no layout, so scrollIntoView is the observable behaviour.
function section(id: string) {
  const el = document.createElement("section");
  el.id = id;
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

describe("HashScroll", () => {
  beforeEach(() => { document.body.innerHTML = ""; });

  it("scrolls to the section named in the hash", async () => {
    const fleet = section("fleet");
    render(
      <MemoryRouter initialEntries={["/#fleet"]}>
        <HashScroll />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fleet.scrollIntoView).toHaveBeenCalled());
  });

  it("waits for a section that mounts after the route lands", async () => {
    // The cross-route case: /trips → /#fleet renders the homepage a frame
    // or two later, which is exactly when the browser's own scroll gave up.
    render(
      <MemoryRouter initialEntries={["/#faq"]}>
        <HashScroll />
      </MemoryRouter>,
    );
    const faq = await new Promise<HTMLElement>((resolve) => {
      setTimeout(() => resolve(section("faq")), 30);
    });
    await waitFor(() => expect(faq.scrollIntoView).toHaveBeenCalled());
  });

  it("still lands /#about on the FAQ, which is #faq now", async () => {
    // The FAQ's id was "about"; links that carry it are already out there.
    const faq = section("faq");
    render(
      <MemoryRouter initialEntries={["/#about"]}>
        <HashScroll />
      </MemoryRouter>,
    );
    await waitFor(() => expect(faq.scrollIntoView).toHaveBeenCalled());
  });

  it("lands /#services on the route the pillars merged into", async () => {
    const route = section("how-it-works");
    render(
      <MemoryRouter initialEntries={["/#services"]}>
        <HashScroll />
      </MemoryRouter>,
    );
    await waitFor(() => expect(route.scrollIntoView).toHaveBeenCalled());
  });

  it("leaves the booking modal's own hashes alone", async () => {
    const step = section("step-1");
    render(
      <MemoryRouter initialEntries={["/#step-1"]}>
        <HashScroll />
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(step.scrollIntoView).not.toHaveBeenCalled();
  });
});
