// Settings — what Cabby's is currently configured to do, and which half
// of it can be changed without a deploy.
//
// THIS SCREEN IS READ-ONLY, AND THAT IS THE HONEST VERSION. The brief
// asks for five groups of controls — pricing, service, drivers,
// notifications, staff — and four of the five are not settings in this
// system at all. They are code:
//
//   · the vehicle tiers and their multipliers are src/data/vehicles.ts
//   · the ten areas and every place in them are src/data/places.ts
//   · the commission is COMMISSION_RATE in src/lib/quote.ts
//   · the cancellation window is FREE_CANCEL_HOURS in src/lib/policy.ts
//   · the five documents a driver must send are DRIVER_DOCUMENTS
//
// Making those editable from a screen means moving them into the
// database and changing how the booking flow prices a ride — a
// substantial change with a direct line to money, and not one to make
// because a settings page looked incomplete. A switch that does nothing
// is worse than no switch: it is a promise the next operator will act
// on.
//
// THE ONE GROUP THAT IS ALREADY DATA IS PRICING, and it is read live.
// pricing_zones / pricing_routes / pricing_config are Supabase tables —
// the rate card src/lib/pricing.ts prices against, and the authority
// over the km model whenever it has a matching row. This screen reads
// them so an operator can SEE the live card without opening the SQL
// editor, which is most of the value of a settings page and none of the
// risk of one. Editing it is still a decision the owner has to make.
//
// Each group says where its values live and what changing them would
// take. That paragraph is the deliverable here.
import { useEffect, useState } from "react";
import { AREAS, PLACES } from "../../data/places";
import { VEHICLES } from "../../data/vehicles";
import { DRIVER_DOCUMENTS } from "../../driver/lib/documents";
import { FREE_CANCEL_HOURS } from "../../lib/policy";
import { AWG_PER_USD, COMMISSION_RATE } from "../../lib/quote";
import { loadPricing, type Pricing } from "../../lib/pricing";
import { whatsappEnabled } from "../../lib/whatsapp";
import { Fact, Head } from "../ui";

export default function Settings() {
  /** the live rate card. null while reading; `loaded:false` means the
      tables answered but the two that matter came back empty or
      refused — which is the difference between "no rate card on this
      project" and "this project has one and it is these rows". */
  const [rates, setRates] = useState<Pricing | null>(null);

  useEffect(() => {
    let live = true;
    void loadPricing().then((p) => { if (live) setRates(p); });
    return () => { live = false; };
  }, []);

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <Head
          kick="Settings"
          title={<>How Cabby<em>'s</em> is set up.</>}
          lead="What the site is currently running on, where each number lives, and which of them can be changed without a deploy. Nothing on this screen writes anything."
        />

        <div className="adm-set">
          {/* ── PRICING ─────────────────────────────────────────────── */}
          <div className="adm-setg">
            <h3>Pricing</h3>
            <p className="where">
              The rate card is <b>live data</b> — pricing_routes, pricing_zones and pricing_config in
              Supabase — and it is the authority whenever it has a row for a journey. Everything
              below it falls through to the distance model in src/lib/quote.ts.
            </p>
            {rates === null ? (
              <p className="adm-fine">Reading the rate card.</p>
            ) : !rates.loaded ? (
              <p className="adm-fine warn">
                The pricing tables couldn't be read, so this project is quoting every journey from
                the distance model rather than from a rate card. That is not an error on its own —
                a deployment without the pricing_* tables works exactly this way — but if you
                expected a rate card, it is not reaching the site.
              </p>
            ) : (
              <>
                <Fact k="Routes priced">{rates.routes.length} fixed route{rates.routes.length === 1 ? "" : "s"}</Fact>
                <Fact k="Zones">{rates.zones.map((z) => z.zone_code).join(" · ") || <span className="q">None</span>}</Fact>
                <Fact k="Named places">{rates.locations.length} on the card</Fact>
                <Fact k="Add-ons">
                  {rates.addons.length
                    ? rates.addons.map((a) => a.label).join(" · ")
                    : <span className="q">None configured</span>}
                </Fact>
                {Object.keys(rates.config).length > 0 && (
                  <Fact k="Config">
                    {Object.entries(rates.config).map(([k, v]) => `${k} ${v}`).join(" · ")}
                  </Fact>
                )}
              </>
            )}
            <Fact k="Cabby's share">
              {Math.round(COMMISSION_RATE * 100)}% <span className="q">COMMISSION_RATE, in code</span>
            </Fact>
            <Fact k="Florin per dollar">
              {AWG_PER_USD} <span className="q">AWG_PER_USD, in code — the rate card is in florin, every screen is in dollars</span>
            </Fact>
            <p className="adm-fine">
              To change a fare: edit the rate card rows in Supabase, and the site picks them up
              within a minute. To change the commission or the exchange rate: those are constants in
              src/lib/quote.ts and need a deploy — deliberately, because every rate on the card was
              set backwards from what the driver is left with.
            </p>
          </div>

          {/* ── SERVICE ─────────────────────────────────────────────── */}
          <div className="adm-setg">
            <h3>Service</h3>
            <p className="where">
              Vehicle tiers, service areas and the cancellation rule are <b>code</b>, not settings —
              src/data/vehicles.ts, src/data/places.ts and src/lib/policy.ts. Changing one is a
              deploy.
            </p>
            {VEHICLES.map((v) => (
              <Fact key={v.id} k={v.name}>
                {v.pax} guests · {v.bags} bags · ×{v.mult} <span className="q">{v.desc}</span>
              </Fact>
            ))}
            <Fact k="Service areas">{AREAS.length} areas · {PLACES.length} named places</Fact>
            <Fact k="Free cancellation">
              Until {FREE_CANCEL_HOURS} hours before pickup <span className="q">FREE_CANCEL_HOURS</span>
            </Fact>
            <p className="adm-fine">
              The tiers are categories rather than cars — drivers arrive in their own vehicles, and
              each tier names a representative one. Adding a tier changes what the booking flow
              offers and what every fare multiplies by, so it is a code change on purpose.
            </p>
          </div>

          {/* ── DRIVERS ─────────────────────────────────────────────── */}
          <div className="adm-setg">
            <h3>Drivers</h3>
            <p className="where">
              What Cabby's asks a driver for is <b>code</b> (DRIVER_DOCUMENTS); whether a given
              driver is approved is <b>this board</b>, on their own page.
            </p>
            {DRIVER_DOCUMENTS.map((d) => (
              <Fact key={d.slug} k={d.label}>{d.why}</Fact>
            ))}
            <Fact k="Approval">
              By hand, one driver at a time <span className="q">there is no automatic approval, and there should not be</span>
            </Fact>
            <p className="adm-fine">
              Accepting all five documents approves nobody — the two are deliberately separate, so
              that a driver Cabby's already trusts can be put on the road before the paperwork is
              complete, and a full folder never approves somebody by itself.
            </p>
          </div>

          {/* ── NOTIFICATIONS ───────────────────────────────────────── */}
          <div className="adm-setg">
            <h3>Notifications</h3>
            <p className="where">
              <b>Not built.</b> Cabby's sends nothing automatically today — no booking email, no
              driver alert, no operator digest.
            </p>
            <Fact k="Email">
              <span className="q">Nothing is sent. Supabase's own auth mail is the only outbound message this project makes, and it needs a verified domain before it can carry anything else — see docs/email-delivery.md.</span>
            </Fact>
            <Fact k="WhatsApp">
              {whatsappEnabled
                ? "A number is configured, and the site's own chat links use it."
                : <span className="q">No number configured (VITE_WHATSAPP_NUMBER), so the chat links are hidden site-wide.</span>}
            </Fact>
            <Fact k="This board">
              <span className="q">Nothing is pushed. The Support screen is read, not delivered.</span>
            </Fact>
            <p className="adm-fine">
              Deliberately deferred until there is a domain to send from. A notification system with
              nowhere to send from is a queue of failures nobody sees.
            </p>
          </div>

          {/* ── ADMIN ───────────────────────────────────────────────── */}
          <div className="adm-setg">
            <h3>Admin accounts</h3>
            <p className="where">
              Who is an operator is a row in <b>public.admins</b>. That table has a read-own policy
              and <b>no insert policy at all</b>, on purpose — nothing in any browser can grant
              itself the board.
            </p>
            <Fact k="Adding an operator">
              One line in the Supabase SQL editor. The sign-in gate prints it with the account's own
              uid already in it, so it is copy-and-paste rather than fill-in-the-blank.
            </Fact>
            <Fact k="Permissions">
              <span className="q">There is one level. An operator can do everything on this board; there are no roles, and nothing here distinguishes the owner from anybody else in the admins table.</span>
            </Fact>
            <p className="adm-fine">
              Adding or removing an operator from this screen would need a new security definer
              function, the same shape as the three this portal already uses. That is a small change
              and a real decision — an app that can grant its own access is an app one compromised
              session can hand over.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
