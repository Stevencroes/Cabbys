// One guest: who they are, what they have booked, and what is coming.
//
// The brief asks this page for six things — customer information,
// booking history, upcoming rides, cancellations, refunds and internal
// notes. Four of them are here and are real. The other two are not, and
// are said rather than faked:
//
//   REFUNDS. There is no refund anywhere in this project. Stripe is
//   wired for authorize-then-capture (api/create-payment-intent.ts,
//   api/stripe-webhook.ts) and nothing voids or refunds, because that
//   needs the secret key and a browser will never hold one. What CAN be
//   shown is the thing an operator actually needs: which of this
//   guest's cancelled bookings still has money held or taken against
//   it, so somebody can go and settle it in Stripe. That is below, by
//   name, rather than a "Refunds: 0" line that would be a permanent lie.
//
//   INTERNAL NOTES. There is nowhere to put one. rides.notes is the
//   guest's own booking detail and is read by the DRIVER on their phone
//   — writing "difficult customer" into it would put that sentence in
//   front of the driver and, through My Trips, one column away from the
//   guest. A notes table is about fifteen lines of SQL and is proposed
//   in the report this work came with; until it exists, this screen has
//   no notes field, because a notes field that silently drops what you
//   type is worse than none.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { jobDate, jobDateShort, jobTime, shortAirport } from "../../driver/JobCard";
import { usd } from "../../lib/quote";
import { useBoard } from "../BoardContext";
import { isClosed, loadRideHistory, mergeRides, moneyStillOutstanding, type AdminRide } from "../lib/admin";
import { customerByKey, customersFrom } from "../lib/customers";
import { Back, Chip, Empty, Fact, Figures, Head, Section, Skeleton, Unreadable, rideState } from "../ui";

export default function CustomerView() {
  const { key = "" } = useParams();
  const board = useBoard();
  const [past, setPast] = useState<AdminRide[] | null>(null);
  const [pastError, setPastError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void loadRideHistory().then(({ rides, error }) => {
      if (!live) return;
      setPastError(error);
      setPast(error ? null : rides);
    });
    return () => { live = false; };
  }, []);

  const people = useMemo(
    () => customersFrom(mergeRides(board.rides, past ?? [])),
    [board.rides, past],
  );
  const c = customerByKey(people, decodeURIComponent(key));
  const failed = board.ridesError ?? pastError;

  if (failed) {
    return (
      <Frame>
        <Back to="/admin/customers">All customers</Back>
        <Unreadable
          what="rides"
          detail={failed}
          reassure="This guest is fine — their bookings are what this page is made of, and the board can't read them."
          onRetry={() => void board.refresh()}
        />
      </Frame>
    );
  }

  if (board.loading || past === null) return <Frame><Skeleton rows={4} /></Frame>;

  if (!c) {
    return (
      <Frame>
        <Back to="/admin/customers">All customers</Back>
        <Head kick="Customer" title={<>Nobody at <em>this link.</em></>}
          lead="This page is built from bookings, so a guest exists here only while they have one in the window the board reads. Theirs may have fallen out of it." />
      </Frame>
    );
  }

  const ahead = c.rides.filter((r) => !isClosed(r));
  const done = c.rides.filter((r) => r.status === "completed");
  const off = c.rides.filter((r) => r.status === "cancelled");
  const owed = off.filter((r) => moneyStillOutstanding(r.paymentStatus) !== null);

  return (
    <Frame>
      <Back to="/admin/customers">All customers</Back>
      <Head
        kick="Customer"
        title={<>{c.name || <em>No name given</em>}</>}
        lead={[c.phone, c.email].filter(Boolean).join(" · ") || "No contact details on any of their bookings."}
      />

      <Figures
        items={[
          { label: "Rides taken", value: String(c.completed) },
          { label: "Booked", value: String(c.bookings), note: "including cancellations" },
          { label: "Cancelled", value: String(c.cancelled), alarm: c.cancelled > 0 },
          { label: "Paid Cabby's", value: usd(c.spendUsd), note: "completed rides only" },
        ]}
      />

      <div className="adm-detail">
        <div>
          <Section title="Coming up" aside={<span>{ahead.length} booked</span>}>
            {ahead.length === 0 ? (
              <Empty line="Nothing booked." hint="They have no ride ahead of them right now." />
            ) : (
              <div className="adm-list">{ahead.map((r) => <RideLine key={r.id} r={r} />)}</div>
            )}
          </Section>

          <Section title="Booking history" aside={<span>{done.length} travelled · {off.length} cancelled</span>}>
            {c.rides.filter(isClosed).length === 0 ? (
              <Empty line="Nothing behind them yet." hint="This will be their first ride with Cabby's." />
            ) : (
              <div className="adm-list">
                {c.rides.filter(isClosed).map((r) => <RideLine key={r.id} r={r} />)}
              </div>
            )}
          </Section>
        </div>

        <div className="adm-aside">
          <Section title="Who they are">
            <Fact k="Name">{c.name || <span className="q">Never given one</span>}</Fact>
            <Fact k="Phone">{c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : <span className="q">No number</span>}</Fact>
            <Fact k="Email">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="q">No address</span>}</Fact>
            <Fact k="Held together by">
              {c.keyKind === "account" ? "Their signed-in account — the only key here that can't be a typo."
                : c.keyKind === "email" ? "Their email address. Bookings made with a different address would be a second row."
                : c.keyKind === "phone" ? "Their phone number. Bookings made with a different number would be a second row."
                : "Their name alone, which is the weakest match this board makes. Treat it as a guess."}
            </Fact>
          </Section>

          {/* Only rendered when there is money to chase. A permanent
              "Refunds: 0" would be a measurement this project cannot
              make; a named booking with a hold still on it is a job. */}
          {owed.length > 0 && (
            <Section title="Money still open">
              <div className="adm-list">
                {owed.map((r) => (
                  <Link key={r.id} className="adm-row" to={`/admin/rides/${r.id}`}>
                    <span className="adm-rtime">{jobTime(r.scheduledAt)}<small>{jobDateShort(r.scheduledAt)}</small></span>
                    <span className="adm-rmain">
                      <span className="a">{shortAirport(r.pickup)} → {shortAirport(r.dropoff)}</span>
                      <span className="b">{moneyStillOutstanding(r.paymentStatus)}</span>
                    </span>
                    <span className="adm-rmain adm-rsub adm-drop" />
                    <span className="adm-rmain adm-rsub adm-drop" />
                    <span className="adm-rend"><Chip tone="alert">Cancelled</Chip></span>
                  </Link>
                ))}
              </div>
              <p className="adm-fine">
                Settled in Stripe, not here. Nothing on this board can refund a charge or release a hold.
              </p>
            </Section>
          )}

          <Section title="Notes">
            <p className="adm-fine">
              There is nowhere to keep an internal note about a guest in this system, so this board
              does not offer a box that would throw one away. The one free-text column a booking has
              is read by the driver on their phone and by the guest in My Trips, which is the wrong
              place for anything internal.
            </p>
          </Section>
        </div>
      </div>
    </Frame>
  );
}

function RideLine({ r }: { r: AdminRide }) {
  const st = rideState(r);
  return (
    <Link className={`adm-row${isClosed(r) ? " past" : ""}`} to={`/admin/rides/${r.id}`}>
      <span className="adm-rtime">
        {r.scheduledAt ? jobTime(r.scheduledAt) : "—"}
        <small>{jobDateShort(r.scheduledAt) || "no date"}</small>
      </span>
      <span className="adm-rmain">
        <span className="a">{shortAirport(r.pickup)} → {shortAirport(r.dropoff)}</span>
        <span className="b">{r.scheduledAt ? jobDate(r.scheduledAt) : "No date set"}</span>
      </span>
      <span className="adm-rmain adm-rsub">
        <span className="a">{r.driverName || (r.driverId ? "Assigned" : "Nobody driving it")}</span>
        <span className="b">{r.vehicle || "—"}</span>
      </span>
      <span className="adm-rmain adm-rsub adm-drop">
        <span className="b">{r.bookingRef || ""}</span>
      </span>
      <span className="adm-rend"><Chip tone={st.tone}>{st.label}</Chip></span>
    </Link>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <div className="adm-view"><div className="adm-pad">{children}</div></div>;
}
