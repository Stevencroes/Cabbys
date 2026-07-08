import { describe, it, expect } from "vitest";
import { normalizePhone, isValidPhone, isValidEmail } from "./contact";

describe("contact validation", () => {
  it("normalizes traveler-typed numbers", () => {
    expect(normalizePhone("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("00297 593 1234")).toBe("+2975931234");
    expect(normalizePhone("555.123.4567")).toBe("5551234567");
  });

  it("accepts dialable numbers, rejects noise", () => {
    expect(isValidPhone("+15551234567")).toBe(true);
    expect(isValidPhone("+297 593 1234")).toBe(true);
    expect(isValidPhone("12345")).toBe(false);
    expect(isValidPhone("call me maybe")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("validates emails loosely but sanely", () => {
    expect(isValidEmail("ada@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b.c")).toBe(false);
  });
});
