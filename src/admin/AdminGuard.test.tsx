import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { user: unknown; isAdmin: boolean; error: string | null } =
  { user: null, isAdmin: false, error: null };
let checks = 0;
const signOut = vi.fn();

vi.mock("./lib/admin", () => ({
  checkIsAdmin: () => {
    checks++;
    return Promise.resolve({ isAdmin: state.isAdmin, error: state.error });
  },
}));
vi.mock("../driver/lib/driver", () => ({
  getAuthedUser: () => Promise.resolve(state.user),
}));
vi.mock("../booking/useAuth", () => ({
  useAuth: () => ({ signOut }),
}));
vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  },
}));

import AdminGuard from "./AdminGuard";

const BOARD = "the board itself";
const renderGate = () =>
  render(<AdminGuard>{(u) => <div>{BOARD} — {u.email}</div>}</AdminGuard>);

beforeEach(() => {
  state.user = null;
  state.isAdmin = false;
  state.error = null;
  checks = 0;
  signOut.mockClear();
});

describe("operator gate", () => {
  it("offers a real sign-in form when nobody is signed in", async () => {
    renderGate();
    expect(await screen.findByText(/this is the cabby's board/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(BOARD))).toBeNull();
  });

  // Admin accounts are granted in SQL by whoever runs Cabby's. A form
  // that offers to create one manufactures the support ticket it then
  // has to answer — the driver gate learned this and turned sign-up off.
  it("does not offer to create an account it would then turn away", async () => {
    renderGate();
    await screen.findByText(/this is the cabby's board/i);
    expect(screen.queryByRole("button", { name: /create an account/i })).toBeNull();
    expect(screen.getByRole("button", { name: /forgot your password/i })).toBeInTheDocument();
  });

  it("keeps a signed-in non-admin out of the board entirely", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    state.isAdmin = false;
    renderGate();
    expect(await screen.findByText(/this account isn't an admin/i)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(BOARD))).toBeNull();
  });

  // The whole portal exists so that nobody types SQL at production. The
  // bootstrap is the one statement that cannot be removed, so the least
  // this screen can do is hand it over complete rather than print a UUID
  // and leave somebody to assemble an insert against a table they have
  // never seen.
  it("hands a non-admin the exact statement that would grant them access", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    renderGate();
    await screen.findByText(/this account isn't an admin/i);
    expect(
      screen.getByText(/insert into public\.admins \(user_id\) values \('uid-123'\)/i),
    ).toBeInTheDocument();
    expect(screen.getByText("ana@example.com")).toBeInTheDocument();
  });

  it("lets an admin through", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    state.isAdmin = true;
    renderGate();
    await waitFor(() =>
      expect(screen.getByText(/the board itself — ana@example.com/)).toBeInTheDocument(),
    );
  });

  it("says nothing about access while it is still loading", () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    state.isAdmin = true;
    renderGate();
    expect(screen.queryByText(new RegExp(BOARD))).toBeNull();
    expect(screen.getByText(/one moment/i)).toBeInTheDocument();
  });

  // The fault this codebase is emphatic about, arriving at the most
  // expensive possible place. is_admin() does not exist until
  // docs/admin-schema.sql has been run, so on a fresh project the check
  // ERRORS — and reporting that as "you're not an admin" would tell the
  // owner of the company they have no access to their own dispatch
  // board, sending them hunting a permission problem instead of running
  // the migration that is actually missing.
  it("does not tell the owner they aren't an admin when it simply couldn't ask", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    state.error = 'function public.is_admin() does not exist';
    renderGate();
    expect(await screen.findByText(/can't check who you are/i)).toBeInTheDocument();
    expect(screen.getByText(/function public\.is_admin\(\) does not exist/)).toBeInTheDocument();
    // named twice on purpose — in the prose and in the line for whoever fixes it
    expect(screen.getAllByText(/docs\/admin-schema\.sql/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/this account isn't an admin/i)).toBeNull();
    expect(screen.queryByText(new RegExp(BOARD))).toBeNull();
  });

  // The grant lands on Cabby's side while this screen is open, exactly
  // the way driver approval does — and without a re-check the only way
  // to see it land is to sign out and back in.
  it("can re-check from the gate, and goes through the moment the grant lands", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    renderGate();
    fireEvent.click(await screen.findByRole("button", { name: /check again/i }));
    await waitFor(() => expect(checks).toBe(2));

    state.isAdmin = true;
    fireEvent.click(screen.getByRole("button", { name: /check again/i }));
    await waitFor(() =>
      expect(screen.getByText(/the board itself — ana@example.com/)).toBeInTheDocument(),
    );
  });

  it("keeps sign-out available without making it the way forward", async () => {
    state.user = { id: "uid-123", email: "ana@example.com" };
    renderGate();
    const out = await screen.findByRole("button", { name: /sign out/i });
    expect(out).toHaveClass("adm-quiet");
    fireEvent.click(out);
    expect(signOut).toHaveBeenCalled();
  });
});
