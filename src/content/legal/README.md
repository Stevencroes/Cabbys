# Legal and policy content

These three files are the ONLY source of the text on /terms, /privacy and
/cancellation, and of the documents a customer accepts at checkout.

**Nothing here is written by a developer.** Each file starts empty and
`pending`. While a file is pending, its page says the policy is being
finalised and shows how to contact Cabby's — it publishes no policy text —
and checkout asks the customer to accept nothing, because a customer cannot
accept terms that do not exist yet.

## Publishing a policy

1. Paste the client-supplied, reviewed text below the header, in Markdown:

   ```
   ## 1. Bookings
   Paragraph text. **Bold** and *italic* work, as do [links](https://…).

   - a list item
   - another

   ### A sub-heading
   ```

   Every `##` heading becomes a section and an entry in the page's table of
   contents. Raw HTML is not rendered; it shows as text.

2. Fill in the header — all three are required, or the page stays pending:

   ```
   status: approved
   lastUpdated: 2026-10-01        # YYYY-MM-DD, shown as "Last updated"
   approvedBy: Name, role — how it was reviewed
   ```

   `approvedBy` is the record of who signed the text off. The page will not
   publish without it.

3. Deploy. Checkout starts asking for acceptance on its own once BOTH the
   Terms of Service and the Cancellation Policy are approved.

When a policy changes, change `lastUpdated` with it.
