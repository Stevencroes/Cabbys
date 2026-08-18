# Email delivery

**Status as of 18 Aug 2026: custom SMTP is OFF.** Confirmed from the
Supabase dashboard, Authentication → Emails → SMTP Settings.

Every auth email this project sends — password reset, and email
confirmation if it were switched on — goes through Supabase's built-in
sandbox sender. That sender is development-only: heavily rate-limited
(the project's exact number is on Authentication → Rate Limits) and
carrying no deliverability guarantee. Mail to a real customer will
usually not arrive.

## What this blocks

**Password reset does not work for customers.** `resetPasswordForEmail`
in `src/booking/useAuth.ts` returns success either way, and the forgot
screen in `src/components/auth/AuthForm.tsx` deliberately shows a neutral
"a reset link is on its way" so it can't be used to probe which addresses
have accounts. That message is currently untrue for most people. Treat
"Forgot password?" as decorative until step 4 below passes.

**Email confirmation cannot be turned on.** With no working sender,
confirmations-on means nobody completes a signup at all. Confirmations
being off is the only reason signup works today — it is why `signUp`
returns a session immediately and the user lands signed in.

**Claim-by-email rests on unproven ownership.** `claim_guest_rides()` in
`docs/guest-claim.sql` attaches guest bookings to an account by matching
the address given at checkout. Signing up with an address proves nothing
about holding it while confirmation is off. The full caveat is in the
header of that file.

## Fixing it

1. Pick a sender. Resend is the least friction; Postmark and SES are
   equally fine.
2. Verify `cabbys.aw` there — SPF and DKIM records. Needs DNS access,
   and propagation is the slow part.
3. Paste host, port, user and password into SMTP Settings. Sender
   something like `no-reply@cabbys.aw`.
4. Send yourself a reset from the live site. Confirm it lands, and
   confirm it isn't in spam.
5. Then turn on Authentication → Providers → Email → Confirm email, and
   re-test signup end to end. `signUp` will stop returning a session, so
   walk the full flow before calling it done.
