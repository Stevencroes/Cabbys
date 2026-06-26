import { describe, it, expect } from "vitest";
import { supabase } from "./supabase";

describe("supabase client", () => {
  it("exposes auth and from()", () => {
    expect(supabase).toBeTruthy();
    expect(typeof supabase.from).toBe("function");
    expect(typeof supabase.auth.getSession).toBe("function");
  });
});
