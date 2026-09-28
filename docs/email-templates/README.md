# Account emails

The emails Supabase sends for accounts: sign-in links, password resets,
confirmations. Booking emails (the guest's confirmation, the alerts to
Cabby's) are not here; they are written in `api/booking-alerts.ts`.

Each file is pasted into **Supabase → Authentication → Emails → Templates**,
one template per file, with the subject line from the table.

| File | Template in Supabase | Subject |
|---|---|---|
| `magic-link.html` | Magic link | Your Cabby's sign-in link |
| `reset-password.html` | Reset password | Reset your Cabby's password |
| `confirm-signup.html` | Confirm signup | Confirm your email for Cabby's |
| `change-email.html` | Change email address | Confirm your new email for Cabby's |
| `invite.html` | Invite user | You're invited to Cabby's |
| `reauthentication.html` | Reauthentication | Your Cabby's confirmation code |

## Why the links look the way they do

Every link goes to `{{ .SiteURL }}/auth/confirm?token_hash=…&type=…`, which
is `src/pages/AuthConfirm.tsx` on cabbystransfer.com, and not to
`{{ .ConfirmationURL }}`, Supabase's own verify address. That fixes two
things. The link's domain now matches the sender's, where before a
supabase.co link in a Cabby's email looked like phishing to spam filters.
And the token is only used when the page runs, not when the URL is merely
opened, so a mail scanner that checks links can't use it up first.

So:

- **Site URL** in Supabase (Authentication → URL Configuration) must be
  `https://cabbystransfer.com`. The links are built from it.
- **The page must be deployed before these are pasted.** A template that
  links to `/auth/confirm` on a site without that page is a broken link in
  every email.
- The `type=` in each link must be one `AuthConfirm` accepts.
  `src/pages/AuthConfirm.test.tsx` reads these files and fails if one
  isn't, or if any of them goes back to `ConfirmationURL`.

The layout matches the booking emails: navy header, white card, one
button, and the link written out underneath it for mail apps that strip
buttons.
