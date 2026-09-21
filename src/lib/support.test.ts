import { describe, it, expect } from "vitest";
import {
  SUPPORT_EMAIL, askAnything, askAboutBooking, askAboutTrip,
  askAboutFlight, askToBookByHand, askAboutShortNotice,
} from "./support";

const TRIP = {
  from: "Queen Beatrix International Airport",
  to: "Kamay 14-B, Noord",
  date: "2026-09-24",
  time: "14:35",
};

describe("what a guest's message already says", () => {
  it("opens the same way every time", () => {
    for (const m of [
      askAnything(),
      askAboutBooking("CB-1234"),
      askAboutTrip("CB-1234", TRIP),
      askAboutFlight("CB-1234", "KL765", true),
      askToBookByHand(TRIP),
      askAboutShortNotice(TRIP),
    ]) {
      expect(m.startsWith("Hi Cabby's —")).toBe(true);
    }
  });

  // The reason this module exists: a reply that has to begin "which
  // booking is this?" has already spent the goodwill a fast answer buys.
  it("names the booking whenever the screen knows one", () => {
    expect(askAboutBooking("CB-1234")).toContain("CB-1234");
    expect(askAboutTrip("CB-1234", TRIP)).toContain("CB-1234");
    expect(askAboutFlight("CB-1234", "KL765", true)).toContain("CB-1234");
  });

  it("names both ends and the moment when there is no reference yet", () => {
    const m = askToBookByHand(TRIP);
    expect(m).toContain("Queen Beatrix International Airport");
    expect(m).toContain("Kamay 14-B, Noord");
    expect(m).toContain("2:35 PM");
  });

  // A bare 2026-09-24 read by somebody who writes dates the other way
  // round is a car on the wrong day, and a human acts on this string by
  // hand. It must never carry the raw ISO date through.
  it("writes the date the unambiguous way, never the raw ISO one", () => {
    const m = askAboutTrip("CB-1234", TRIP);
    expect(m).not.toContain("2026-09-24");
    expect(m).not.toContain("14:35");
    expect(m).toContain("2:35 PM");
  });

  // The question a guest at an airport actually needs answered is not
  // "how is my booking" but "is a car still coming".
  it("asks the cancelled-flight question for them", () => {
    const m = askAboutFlight("CB-1234", "KL765", true);
    expect(m).toContain("KL765");
    expect(m).toContain("cancelled");
    expect(m).toContain("What happens with my pickup?");
    expect(askAboutFlight("CB-1234", "KL765", false)).toContain("diverted");
  });

  it("keeps the address in one place, and it is a real one", () => {
    expect(SUPPORT_EMAIL).toBe("cabbystransfer@gmail.com");
    // The address it replaced bounced, because nobody owns that domain.
    expect(SUPPORT_EMAIL).not.toContain("cabbys.aw");
  });
});
