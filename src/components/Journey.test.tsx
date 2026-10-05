import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Journey, { JOURNEY_ID } from "./Journey";
import { AIRPORT_FREE_WAIT_MINUTES, FREE_CANCEL_HOURS } from "../lib/policy";

const mount = () => render(<MemoryRouter><Journey /></MemoryRouter>);
const text = () => (document.getElementById(JOURNEY_ID)!.textContent ?? "").replace(/\s+/g, " ");

describe("the route", () => {
  it("is four real tabs, one selected, each with its own panel", () => {
    mount();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Book", "Get confirmed", "Meet your driver", "Ride and pay"]);
    expect(tabs.filter((t) => t.getAttribute("aria-selected") === "true")).toHaveLength(1);
    // roving tabindex: one stop in the tab order, the arrows do the rest
    expect(tabs.filter((t) => t.tabIndex === 0)).toHaveLength(1);
    for (const t of tabs) {
      const panel = document.getElementById(t.getAttribute("aria-controls")!);
      expect(panel).toHaveAttribute("role", "tabpanel");
      expect(panel).toHaveAttribute("aria-labelledby", t.id);
    }
  });

  it("moves along the route with the arrow keys, Home and End", () => {
    mount();
    const tabs = screen.getAllByRole("tab");
    const selected = () => tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    expect(selected()).toBe(1);
    expect(document.activeElement).toBe(tabs[1]);
    fireEvent.keyDown(tabs[1], { key: "End" });
    expect(selected()).toBe(3);
    fireEvent.keyDown(tabs[3], { key: "ArrowRight" });
    expect(selected()).toBe(3);
    fireEvent.keyDown(tabs[3], { key: "ArrowUp" });
    expect(selected()).toBe(2);
    fireEvent.keyDown(tabs[2], { key: "Home" });
    expect(selected()).toBe(0);
  });

  it("asks to book only at the end of the route, and has no back button at its start", () => {
    mount();
    // scoped to the shown panel: jsdom loads no stylesheet, so the hidden
    // panels' visibility:hidden never applies here
    expect(document.querySelector(".jpanel.on .jprev")).toBeNull();
    expect(document.querySelector(".jpanel.on")!.textContent).not.toContain("Book your ride");
    fireEvent.click(screen.getByRole("tab", { name: "Ride and pay" }));
    const last = document.querySelector(".jpanel.on")!;
    expect(last.textContent).toContain("Book your ride");
    expect(last.querySelector('[aria-label="Back: Meet your driver"]')).not.toBeNull();
  });

  // Every panel stays in the DOM, so the whole sequence is there for a
  // crawler and a screen reader's browse mode — and the promises the step
  // strip and the pillars were pinned to are pinned here too.
  it("carries every step and every reason, from the constants that decide them", () => {
    mount();
    const t = text();
    expect(t).toMatch(/pay nothing now/i);
    expect(t).toMatch(/in cash at the end, in US dollars or florins/);
    expect(t).toMatch(/At the airport they wait in arrivals with your name on a sign/);
    expect(t).toMatch(/name, car and plate/);
    expect(t).toContain(`wait up to ${AIRPORT_FREE_WAIT_MINUTES} minutes after you land, free`);
    expect(t).toContain(`up to ${FREE_CANCEL_HOURS} hours before pickup`);
    expect(t).toMatch(/Just your group/);
    expect(t).not.toMatch(/\bcard\b|\bfee\b|photo|\bat the gate\b|\b(he|him|his)\b/i);
  });
});
