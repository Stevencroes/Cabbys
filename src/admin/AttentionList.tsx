// The attention list, drawn once and used twice — on the dashboard,
// where it is the first thing on the screen, and on Support, where it is
// the whole screen.
//
// Two rules it exists to keep:
//
//  · Every item goes somewhere. A row that cannot be acted on is a
//    notification, and this board is not a feed — so each one links to
//    the ride or the driver it is about, and the item's own sentence
//    says what doing something about it looks like.
//  · The grade is a WORD before it is a colour. "Now" is written on the
//    row. The rule down its left edge is the second signal, never the
//    only one: this palette has exactly one colour for "wrong", and an
//    operator who cannot separate it from the teal still has to be able
//    to read the board at 5am.
import { Link } from "react-router-dom";
import { SEVERITY_LABEL, type AttentionItem } from "./lib/attention";

export default function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <div className="adm-att">
      {items.map((a) => {
        const to = a.rideId ? `/admin/rides/${a.rideId}` : `/admin/drivers/${a.driverId}`;
        return (
          <Link key={a.id} className={`adm-attrow ${a.severity}`} to={to}>
            <span className="adm-attgrade">{SEVERITY_LABEL[a.severity]}</span>
            <span>
              <span className="adm-atth">{a.headline}</span>
              <span className="adm-attd">{a.detail}</span>
            </span>
            <span className="adm-attgo" aria-hidden="true">→</span>
          </Link>
        );
      })}
    </div>
  );
}
