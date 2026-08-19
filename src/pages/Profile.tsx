import { useEffect, useState } from "react";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { useAuthModal } from "../components/auth/AuthModal";
import { PASSWORD_MIN, useAuth } from "../booking/useAuth";
import { displayNameOf, fullNameOf, initialsOf, phoneOf } from "../lib/displayName";
import { isValidPhone, normalizePhone } from "../lib/contact";

type Saved = "details" | "password" | null;

/**
 * Everything the account knows about you, in one place. It is deliberately
 * short: a name and a number are all the booking form needs, and anything
 * we do not need we do not keep.
 *
 * Both fields live in user_metadata rather than a table of their own. The
 * account holder is the only writer and the only reader, nothing downstream
 * trusts them, and it means no migration to run before this page works.
 */
export default function Profile() {
  const { openAuth } = useAuthModal();
  const { account, loading, updateProfile, updatePassword, signOut } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [detailsErr, setDetailsErr] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [savingPw, setSavingPw] = useState(false);

  const [saved, setSaved] = useState<Saved>(null);

  // Fill the form once the session resolves, and again if the account
  // changes under us — signing out and back in as someone else.
  useEffect(() => {
    setName(fullNameOf(account));
    setPhone(phoneOf(account));
  }, [account]);

  useEffect(() => { document.title = "Your profile — Cabby's"; }, []);

  const detailsDirty =
    account !== null &&
    (name.trim() !== fullNameOf(account) || normalizePhone(phone) !== phoneOf(account));

  async function saveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (savingDetails) return;
    setDetailsErr(null);
    setSaved(null);
    if (name.trim().length < 2) {
      setDetailsErr("Tell us what to call you.");
      return;
    }
    // A blank number is a fair answer; a half-typed one is not.
    if (phone.trim() && !isValidPhone(phone)) {
      setDetailsErr("That number is missing some digits.");
      return;
    }
    setSavingDetails(true);
    const { error } = await updateProfile({
      full_name: name.trim().replace(/\s+/g, " "),
      phone: phone.trim() ? normalizePhone(phone) : "",
    });
    setSavingDetails(false);
    if (error) setDetailsErr("That didn't save. Try again.");
    else setSaved("details");
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (savingPw) return;
    setPwErr(null);
    setSaved(null);
    if (password.length < PASSWORD_MIN) {
      setPwErr(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirm) {
      setPwErr("Those two don't match.");
      return;
    }
    setSavingPw(true);
    const { error } = await updatePassword(password);
    setSavingPw(false);
    if (error) setPwErr("That didn't save. Try again.");
    else {
      setPassword("");
      setConfirm("");
      setSaved("password");
    }
  }

  return (
    <>
      <Nav onSignIn={openAuth} />
      <main className="tp-main">
        <div className="wrap pf-wrap">
          <h1 className="tp-title">Your profile</h1>
          <p className="tp-sub">What we know, and what we use it for.</p>

          {loading && <p className="tp-quiet">Loading…</p>}

          {!loading && !account && (
            <div className="tp-empty">
              <p>Sign in to see your profile.</p>
              <button type="button" className="tp-link" onClick={openAuth}>Sign in</button>
            </div>
          )}

          {!loading && account && (
            <>
              <div className="pf-id">
                <span className="pf-av" aria-hidden="true">{initialsOf(account)}</span>
                <span className="pf-idt">
                  <span className="pf-name">{displayNameOf(account)}</span>
                  <span className="pf-mail">{account.email}</span>
                </span>
              </div>

              <section className="pf-card">
                <h2 className="pf-h">Your details</h2>
                <p className="pf-note">
                  We fill these in when you book, so you are not typing them at an
                  arrivals gate. Your driver uses the number to say they have landed.
                </p>
                <form className="pf-form" onSubmit={saveDetails} noValidate>
                  <div className="fld">
                    <label htmlFor="pf-name">Name</label>
                    <input
                      id="pf-name"
                      type="text"
                      autoComplete="name"
                      placeholder="Who are we meeting?"
                      value={name}
                      onChange={(e) => { setName(e.target.value); setDetailsErr(null); setSaved(null); }}
                    />
                  </div>
                  <div className="fld">
                    <label htmlFor="pf-phone">WhatsApp / phone</label>
                    <input
                      id="pf-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="+297 000 0000"
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value); setDetailsErr(null); setSaved(null); }}
                    />
                  </div>
                  {detailsErr && <p className="ferr" role="alert">{detailsErr}</p>}
                  {saved === "details" && <p className="pf-saved" role="status">Saved.</p>}
                  <button
                    className="btn-ghost"
                    type="submit"
                    disabled={savingDetails || !detailsDirty}
                    aria-busy={savingDetails || undefined}
                  >
                    {savingDetails ? "Saving…" : "Save details"}
                  </button>
                </form>
              </section>

              <section className="pf-card">
                <h2 className="pf-h">Signing in</h2>
                <div className="pf-row">
                  <span className="pf-rl">Email</span>
                  <span className="pf-rv">{account.email}</span>
                </div>
                <p className="pf-note">
                  This is the address your account is filed under, and the one we
                  match guest bookings against. Message us if it needs to change.
                </p>
                <form className="pf-form" onSubmit={savePassword} noValidate>
                  <div className="fld">
                    <label htmlFor="pf-pw">New password</label>
                    <input
                      id="pf-pw"
                      type="password"
                      autoComplete="new-password"
                      placeholder={`${PASSWORD_MIN} characters or more`}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setPwErr(null); setSaved(null); }}
                    />
                  </div>
                  <div className="fld">
                    <label htmlFor="pf-pw2">Again</label>
                    <input
                      id="pf-pw2"
                      type="password"
                      autoComplete="new-password"
                      placeholder="The same one"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); setPwErr(null); setSaved(null); }}
                    />
                  </div>
                  {pwErr && <p className="ferr" role="alert">{pwErr}</p>}
                  {saved === "password" && <p className="pf-saved" role="status">Password changed.</p>}
                  <button
                    className="btn-ghost"
                    type="submit"
                    disabled={savingPw || !password}
                    aria-busy={savingPw || undefined}
                  >
                    {savingPw ? "Saving…" : "Change password"}
                  </button>
                </form>
              </section>

              <button className="pf-out" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
