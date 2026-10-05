import { render, screen, within, fireEvent } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import Steps, { STEPS_ID } from "../Steps";
import HowItWorks from "../HowItWorks";
import { AIRPORT_FREE_WAIT_MINUTES } from "../../lib/policy";

// setupTests' matchMedia never matches, which is the list layout. The pinned
// journey is what a desktop gets, so it has to be asked for.
function desktop() {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({
    matches: query.includes("min-width:901px"),
    media: query, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
    dispatchEvent() { return false; },
  }) as unknown as MediaQueryList);
}
afterEach(() => vi.restoreAllMocks());

describe("the pinned journey", () => {
  it("is still the same ordered list of four, every line in the document", () => {
    desktop();
    render(<Steps />);
    const section = document.getElementById(STEPS_ID)!;
    expect(section.dataset.mode).toBe("pin");
    const list = section.querySelector(":scope ol")!;
    expect(list.getAttribute("role")).toBe("list");
    const steps = within(list as HTMLElement).getAllByRole("listitem");
    expect(steps).toHaveLength(4);
    // one line is shown at a time, but all four are there to be read
    expect(section.querySelectorAll(".step p")).toHaveLength(4);
    expect(steps[0]).toHaveAttribute("aria-current", "step");
    expect(steps[1]).not.toHaveAttribute("aria-current");
  });

  it("lets every step be reached without scrolling, by click or keyboard", () => {
    desktop();
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Steps />);
    const buttons = within(document.getElementById(STEPS_ID)!).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Book", "Get confirmed", "Meet your driver", "Ride and pay"]);
    fireEvent.click(buttons[2]);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  // The scenes are pictures of what the text says. A screen reader gets the
  // text; the pictures would only say it twice, in fragments.
  it("keeps the scenes out of the accessibility tree", () => {
    desktop();
    render(<Steps />);
    const scenes = document.querySelectorAll(`#${STEPS_ID} .scene`);
    expect(scenes).toHaveLength(4);
    for (const s of scenes) expect(s).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the step list (phone, short window, reduced motion)", () => {
  it("carries a scene under every step", () => {
    render(<Steps />);
    const section = document.getElementById(STEPS_ID)!;
    expect(section.dataset.mode).toBe("list");
    for (const li of section.querySelectorAll(":scope ol > li")) {
      expect(li.querySelector(".scene[aria-hidden='true']")).not.toBeNull();
    }
  });
});

describe("the pillar tiles", () => {
  it("are decoration over a heading and a line each", () => {
    render(<HowItWorks />);
    const pillars = document.querySelectorAll("#services .pillar");
    expect(pillars).toHaveLength(4);
    for (const p of pillars) {
      expect(p.querySelector(".pvis")).toHaveAttribute("aria-hidden", "true");
      expect(within(p as HTMLElement).getByRole("heading", { level: 3 })).toBeInTheDocument();
    }
  });

  // The wait clock and the sentence under it are one fact.
  it("draw the free wait from the constant the sentence uses", () => {
    render(<HowItWorks />);
    expect(document.querySelector("#services .pv-wait b")!.textContent).toBe(String(AIRPORT_FREE_WAIT_MINUTES));
  });

  // Cabby's is priced above the taxi tariff. A meter racing past the fixed
  // price would be a picture of a saving the fares do not offer.
  it("never draws a taxi meter", () => {
    render(<HowItWorks />);
    expect(screen.getByText("Price agreed")).toBeInTheDocument();
    expect(document.getElementById("services")!.textContent).not.toMatch(/meter|taxi|cheaper|save/i);
  });
});
