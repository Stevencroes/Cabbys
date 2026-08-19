import { Link } from "react-router-dom";
import { useAuth } from "../../booking/useAuth";
import { displayNameOf, initialsOf } from "../../lib/displayName";

/**
 * What the modal shows when it opens on someone already signed in. It says
 * who that is and offers the two ways out — the profile page owns editing,
 * so this stays a signpost rather than a second form.
 */
export default function AccountPanel({ onClose }: { onClose: () => void }) {
  const { account, signOut } = useAuth();

  return (
    <div className="acct-panel">
      <div className="acct-head">
        <span className="acct-av" aria-hidden="true">{initialsOf(account)}</span>
        <span className="acct-id">
          <span className="acct-name">{displayNameOf(account)}</span>
          <span className="acct-mail">{account?.email}</span>
        </span>
      </div>

      <Link className="btn-ghost acct-go" to="/profile" onClick={onClose}>
        Your profile
      </Link>

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
