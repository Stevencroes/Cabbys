import { describe, it, expect } from "vitest";
import { displayNameOf, fullNameOf, initialsOf, nameFromEmail } from "./displayName";

const u = (email?: string, meta?: Record<string, unknown>) =>
  ({ email, user_metadata: meta } as Parameters<typeof displayNameOf>[0]);

describe("displayName", () => {
  it("prefers the name the account carries", () => {
    expect(displayNameOf(u("g@x.com", { full_name: "Greta Croes" }))).toBe("Greta Croes");
  });

  it("takes Google's `name` when there is no `full_name`", () => {
    expect(displayNameOf(u("g@x.com", { name: "Greta Croes" }))).toBe("Greta Croes");
  });

  it("tidies whatever was typed into the sign-up field", () => {
    expect(fullNameOf(u("g@x.com", { full_name: "  Greta   Croes " }))).toBe("Greta Croes");
  });

  it("reads a name out of the address when the account has none", () => {
    expect(nameFromEmail("jan.de-vries+trips@example.com")).toBe("Jan De Vries");
    expect(nameFromEmail("stiefcroes@hotmail.com")).toBe("Stiefcroes");
  });

  it("drops a trailing number but leaves letters alone", () => {
    expect(nameFromEmail("john123@x.com")).toBe("John");
    expect(nameFromEmail("m4rk@x.com")).toBe("M4rk");
  });

  it("never returns a blank, and never the whole address", () => {
    expect(displayNameOf(u(undefined))).toBe("Account");
    expect(displayNameOf(null)).toBe("Account");
    expect(displayNameOf(u("g@x.com"))).not.toContain("@");
  });

  it("initials one word once and two words twice", () => {
    expect(initialsOf(u("g@x.com", { full_name: "Greta Croes" }))).toBe("GC");
    expect(initialsOf(u("greta@x.com"))).toBe("G");
  });

  it("uses the last word, so a middle name does not take the second letter", () => {
    expect(initialsOf(u("g@x.com", { full_name: "Greta Maria Croes" }))).toBe("GC");
  });

  it("ignores a name that is not a string", () => {
    expect(fullNameOf(u("g@x.com", { full_name: 42 }))).toBe("");
  });
});
