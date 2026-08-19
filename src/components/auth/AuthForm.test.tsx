import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const signInWithPassword = vi.fn();
const signUpWithPassword = vi.fn();
const resetPassword = vi.fn();

vi.mock("../../booking/useAuth", async () => {
  const actual = await vi.importActual<typeof import("../../booking/useAuth")>("../../booking/useAuth");
  return {
    ...actual,
    useAuth: () => ({
      signInWithProvider: vi.fn(),
      signInWithPassword,
      signUpWithPassword,
      resetPassword,
    }),
  };
});

import AuthForm from "./AuthForm";
import { PASSWORD_MIN } from "../../booking/useAuth";

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("AuthForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInWithPassword.mockResolvedValue({ error: null });
    signUpWithPassword.mockResolvedValue({ data: { session: { user: {} } }, error: null });
    resetPassword.mockResolvedValue({ error: null });
  });

  it("says a sign-in failed instead of failing silently", async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    render(<AuthForm />);
    type(/^email$/i, "ada@example.com");
    type(/^password$/i, "hunter2222");
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
  });

  it("holds a short password back before it reaches Supabase", () => {
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    type(/^your name$/i, "Ada Lovelace");
    type(/^email$/i, "ada@example.com");
    type(/^password$/i, "short");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(`Use at least ${PASSWORD_MIN} characters.`);
    expect(signUpWithPassword).not.toHaveBeenCalled();
  });

  it("turns an already-registered email into the sign-in door, prefilled", async () => {
    signUpWithPassword.mockResolvedValue({
      data: {}, error: { message: "User already registered", code: "user_already_exists" },
    });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    type(/^your name$/i, "Ada Lovelace");
    type(/^email$/i, "ada@example.com");
    type(/^password$/i, "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(/already has an account/i);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toHaveValue("ada@example.com");
  });

  it("asks for a name on the way in, and hands it to Supabase", async () => {
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /create an account/i }));
    type(/^email$/i, "ada@example.com");
    type(/^password$/i, "longenough1");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    expect(screen.getByRole("alert")).toHaveTextContent(/what to call you/i);
    expect(signUpWithPassword).not.toHaveBeenCalled();

    type(/^your name$/i, "Ada Lovelace");
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));
    await waitFor(() =>
      expect(signUpWithPassword).toHaveBeenCalledWith("ada@example.com", "longenough1", "Ada Lovelace"),
    );
  });

  it("only asks for a name when creating an account", () => {
    render(<AuthForm />);
    expect(screen.queryByLabelText(/^your name$/i)).toBeNull();
  });

  it("cannot be double-fired while a request is in flight", async () => {
    let release: (v: unknown) => void = () => {};
    signInWithPassword.mockReturnValue(new Promise((r) => { release = r; }));
    render(<AuthForm />);
    type(/^email$/i, "ada@example.com");
    type(/^password$/i, "hunter2222");

    const submit = screen.getByRole("button", { name: /^sign in$/i });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole("button", { name: /please wait/i })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /please wait/i }));

    release({ error: null });
    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledTimes(1));
  });

  it("offers a way back from a forgotten password, and gives nothing away", async () => {
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: /forgot your password/i }));
    type(/^email$/i, "ada@example.com");
    fireEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /if ada@example\.com has an account, a reset link is on its way/i,
    );
    expect(resetPassword).toHaveBeenCalledWith("ada@example.com");
  });
});
