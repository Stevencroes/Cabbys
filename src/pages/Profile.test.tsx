import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const updateProfile = vi.fn();
const updatePassword = vi.fn();
const signOut = vi.fn();

// One object per render, or the effect keyed on `account` re-fires forever.
const NAMED = { id: "u1", email: "greta@example.com", user_metadata: { full_name: "Greta Croes", phone: "+2971234567" } };
const BARE = { id: "u1", email: "greta@example.com", user_metadata: {} };

let current: Record<string, unknown> | null = NAMED;
let authLoading = false;

vi.mock("../booking/useAuth", async () => {
  const actual = await vi.importActual<typeof import("../booking/useAuth")>("../booking/useAuth");
  return {
    ...actual,
    useAuth: () => ({
      account: current, user: current, loading: authLoading,
      updateProfile, updatePassword, signOut,
    }),
  };
});

import Profile from "./Profile";

const renderPage = () => render(<MemoryRouter><Profile /></MemoryRouter>);

describe("Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current = NAMED;
    authLoading = false;
    updateProfile.mockResolvedValue({ error: null });
    updatePassword.mockResolvedValue({ error: null });
  });

  it("shows what the account already knows", () => {
    renderPage();
    expect(screen.getByLabelText(/^name$/i)).toHaveValue("Greta Croes");
    expect(screen.getByLabelText(/whatsapp/i)).toHaveValue("+2971234567");
    expect(screen.getByRole("heading", { name: /your profile/i })).toBeInTheDocument();
  });

  it("keeps Save inert until something actually changed", () => {
    renderPage();
    const save = screen.getByRole("button", { name: /save details/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Greta C" } });
    expect(save).toBeEnabled();
  });

  it("saves a name and a number together", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Greta  Croes " } });
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "+297 123 45 67" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ full_name: "Greta Croes", phone: "+2971234567" }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
  });

  it("holds a half-typed number back, but accepts none at all", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "+297 12" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/missing some digits/i);
    expect(updateProfile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/whatsapp/i), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ full_name: "Greta Croes", phone: "" }));
  });

  it("will not change a password to one that was typed twice differently", () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText(/^again$/i), { target: { value: "longenough2" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/don't match/i);
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it("clears both password fields once the change lands", async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/new password/i), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText(/^again$/i), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() => expect(updatePassword).toHaveBeenCalledWith("longenough1"));
    expect(await screen.findByRole("status")).toHaveTextContent(/password changed/i);
    expect(screen.getByLabelText(/new password/i)).toHaveValue("");
    expect(screen.getByLabelText(/^again$/i)).toHaveValue("");
  });

  it("names an account that carries none, without pretending it has one", () => {
    current = BARE;
    renderPage();
    // the heading falls back to the address; the field stays honestly empty
    expect(screen.getByText("Greta")).toBeInTheDocument();
    expect(screen.getByLabelText(/^name$/i)).toHaveValue("");
  });

  it("is not readable signed out", () => {
    current = null;
    renderPage();
    expect(screen.queryByLabelText(/^name$/i)).toBeNull();
    expect(screen.getByText(/sign in to see your profile/i)).toBeInTheDocument();
  });

  it("says nothing either way while the session is still resolving", () => {
    current = null;
    authLoading = true;
    renderPage();
    expect(screen.queryByText(/sign in to see your profile/i)).toBeNull();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
