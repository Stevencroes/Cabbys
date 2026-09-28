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

**Email confirmation is ON** (28 Sep 2026), and a new signup was tested
end to end: "Account created. Confirm it from the mail we sent…", the
branded "Confirm your email" arrives, and its link signs the person in.

That is what makes claim-by-email sound. `claim_guest_rides()` in
`docs/guest-claim.sql` attaches guest bookings to an account by matching
the address given at checkout; with confirmation on, an account only
holds an address its owner has proved they receive mail at. Turn
confirmation off again and that stops being true — the header of that
file says so.

## Fixing it

All five steps are done (28 Sep 2026). Kept as the record of how.

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
