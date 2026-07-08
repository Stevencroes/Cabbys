import { describe, it, expect } from "vitest";
import { buildIcs } from "./ics";

describe("ics generation", () => {
  it("builds a floating-local-time event with escaped text", () => {
    const ics = buildIcs({
      title: "Cabby's transfer — Airport → Palm Beach",
      description: "Booking CB-7KM4Q; meet at arrivals, name board",
      location: "Queen Beatrix International Airport",
      date: "2026-07-01",
      time: "14:30",
      durationMinutes: 45,
      uid: "ride-1@cabbys.aw",
    });
    expect(ics).toContain("DTSTART:20260701T143000");
    expect(ics).toContain("DTEND:20260701T151500");
    expect(ics).toContain("UID:ride-1@cabbys.aw");
    // semicolons/commas escaped per RFC 5545
    expect(ics).toContain("Booking CB-7KM4Q\\; meet at arrivals\\, name board");
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.trim().endsWith("END:VCALENDAR")).toBe(true);
  });

  it("rolls duration across midnight", () => {
    const ics = buildIcs({ title: "Late ride", date: "2026-07-01", time: "23:45", durationMinutes: 60 });
    expect(ics).toContain("DTEND:20260702T004500");
  });
});
