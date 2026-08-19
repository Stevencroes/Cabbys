import { useId, useState } from "react";
import { useAuth } from "../../booking/useAuth";
import { displayNameOf, fullNameOf, initialsOf } from "../../lib/displayName";

/**
 * What the modal shows once you are signed in. Its one job beyond signing
 * out is naming the account: sign-up only started asking recently, so every
 * account made before that has nothing but an address to be known by.
 */
export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const { account, updateName, signOut } = useAuth();
  const [name, setName] = useState(() => fullNameOf(account));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const nameId = useId();

  const current = fullNameOf(account);
  const dirty = name.trim() !== current;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSaved(false);
    if (name.trim().length < 2) {
      setError("Tell us what to call you.");
      return;
    }
    setBusy(true);
    const { error: err } = await updateName(name);
    setBusy(false);
    if (err) setError("That didn't save. Try again.");
    else setSaved(true);
  }

  return (
    <div className="acct-panel">
      <div className="acct-head">
        <span className="acct-av" aria-hidden="true">{initialsOf(account)}</span>
        <span className="acct-id">
          <span className="acct-name">{displayNameOf(account)}</span>
          <span className="acct-mail">{account?.email}</span>
        </span>
      </div>

      <form onSubmit={save} noValidate className="acct-form">
        <label className="acct-lbl" htmlFor={nameId}>
          {current ? "Your name" : "Add your name"}
        </label>
        <input
          id={nameId}
          className={`txt${error ? " invalid" : ""}`}
          type="text"
          autoComplete="name"
          placeholder="Your name"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${nameId}-err` : undefined}
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); setSaved(false); }}
        />
        {error && <p className="ferr" id={`${nameId}-err`} role="alert">{error}</p>}
        {saved && <p className="acct-note" role="status">Saved.</p>}
        <button className="btn-ghost" type="submit" disabled={busy || !dirty} aria-busy={busy || undefined}>
          {busy ? "Saving…" : "Save name"}
        </button>
      </form>

      <button
        className="acct-out"
        type="button"
        onClick={async () => { await signOut(); onClose(); }}
      >
        Sign out
      </button>
    </div>
  );
}
