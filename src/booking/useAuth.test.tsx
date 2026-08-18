import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
  },
}));

import { PASSWORD_MIN, authMessage, isAlreadyRegistered, useAuth } from "./useAuth";
import { supabase } from "../lib/supabase";

describe("useAuth", () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({ data: { session: null } } as never);
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    } as never);
    vi.mocked(supabase.auth.signInWithOtp).mockResolvedValue({ data: {}, error: null } as never);
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({ data: {}, error: null } as never);
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({ data: {}, error: null } as never);
    vi.mocked(supabase.auth.signUp).mockResolvedValue({ data: {}, error: null } as never);
    vi.mocked(supabase.auth.resetPasswordForEmail).mockResolvedValue({ data: {}, error: null } as never);
  });

  it("starts with loading true and no user, then settles", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("calls signInWithOtp with email and emailRedirectTo", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.signInWithEmail("a@b.com");

    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: "a@b.com",
      options: { emailRedirectTo: expect.any(String) },
    });
  });

  it("calls signInWithOAuth with provider and redirectTo", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.signInWithProvider("google");

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: expect.any(String) },
    });
  });

  it("calls signInWithPassword with email and password", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.signInWithPassword("a@b.com", "secret123");

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "secret123",
    });
  });

  it("calls signUp with email, password and emailRedirectTo", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.signUpWithPassword("a@b.com", "secret123");

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: "a@b.com",
      password: "secret123",
      options: { emailRedirectTo: expect.any(String) },
    });
  });

  it("unsubscribes from auth state changes on unmount", async () => {
    const mockUnsubscribe = vi.fn();
    vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    } as never);

    const { result, unmount } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});

describe("useAuth — the account, and what it says when it can't", () => {
  it("does not mistake an anonymous guest session for an account", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "anon-1", is_anonymous: true } } },
    } as never);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).not.toBeNull();
    expect(result.current.account).toBeNull();
  });

  it("recognises a real account", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: { user: { id: "u1", email: "a@b.com" } } },
    } as never);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.account?.email).toBe("a@b.com"));
  });

  it("sends the reset mail back to /reset-password", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.resetPassword("a@b.com");
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "a@b.com",
      { redirectTo: expect.stringContaining("/reset-password") },
    );
  });

  it("reports a taken email as taken, however Supabase phrases it", async () => {
    // With confirmations ON there is no error at all — just a decoy user
    // carrying no identities. Both shapes have to mean the same thing.
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { user: { id: "decoy", identities: [] }, session: null }, error: null,
    } as never);
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const res = await result.current.signUpWithPassword("taken@example.com", "abcdefgh");
    expect(res.error).toBeTruthy();
    expect(isAlreadyRegistered(res.error!)).toBe(true);
  });

  it("never says which half of a sign-in was wrong", () => {
    // Naming the field would confirm to a stranger that the address is real.
    expect(authMessage({ message: "Invalid login credentials", code: "invalid_credentials" }))
      .toBe("Email or password is incorrect.");
  });

  it("translates the rest of Supabase into sentences", () => {
    expect(authMessage({ message: "User already registered" })).toMatch(/already has an account/i);
    expect(authMessage({ message: "Password should be at least 6 characters" }))
      .toContain(String(PASSWORD_MIN));
    expect(authMessage({ message: "whatever", status: 429 })).toMatch(/too many attempts/i);
    expect(authMessage({ message: "Failed to fetch" })).toMatch(/no connection/i);
    // and never leaks a raw one
    expect(authMessage({ message: "AuthApiError: 500 boom" })).toBe("Something went wrong. Try again.");
  });
});
