# Email delivery

**Status as of 28 Sep 2026: custom SMTP is ON, through Resend.**
Supabase → Authentication → Emails → SMTP Settings sends as
`no-reply@cabbystransfer.com` via `smtp.resend.com`. The domain is
verified in Resend and SPF, DKIM and DMARC all pass at Gmail. Sign-in
links and password resets were tested from the live site and arrive.

The account emails are branded and link to `/auth/confirm` on
cabbystransfer.com rather than to supabase.co; `docs/email-templates/`
has the templates and why. Booking emails (the guest's confirmation and
the alerts to Cabby's) are a separate path through the same Resend
account: `api/booking-alerts.ts` and `docs/alerts-schema.sql`.

## What is still open

**Email confirmation is still OFF.** It could not be turned on without a
working sender; now it can, and it is the last step below. Until it is
on, signing up with an address proves nothing about holding it, which
matters because of the next point.

**Claim-by-email rests on unproven ownership.** `claim_guest_rides()` in
`docs/guest-claim.sql` attaches guest bookings to an account by matching
the address given at checkout. Signing up with an address proves nothing
about holding it while confirmation is off. The full caveat is in the
header of that file.

## Fixing it

Steps 1 to 4 are done (28 Sep 2026). Step 5 is what remains.

1. Pick a sender. Resend is the least friction; Postmark and SES are
   equally fine.
2. Verify `cabbystransfer.com` there — SPF and DKIM records. Needs DNS access,
   and propagation is the slow part.
3. Paste host, port, user and password into SMTP Settings. Sender
   something like `no-reply@cabbystransfer.com`.
4. Send yourself a reset from the live site. Confirm it lands, and
   confirm it isn't in spam.
5. Then turn on Authentication → Providers → Email → Confirm email, and
   re-test signup end to end. `signUp` will stop returning a session, so
   walk the full flow before calling it done.
