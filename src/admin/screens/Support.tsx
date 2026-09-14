// Support — what needs a person, and nothing else.
//
// THIS IS NOT A TICKETING SYSTEM AND IT DOES NOT PRETEND TO BE. There is
// no tickets table in this project. What there is, in abundance, is
// state that already says something is wrong: an unassigned 6am airport
// run, a driver who never tapped "on my way", one driver on two jobs at
// the same hour, a cancelled booking with a hold still on the card, a
// suspended driver still holding live work. Every row on this screen is
// one of those, derived at read time by src/admin/lib/attention.ts.
//
// The trade is deliberate and worth stating: NOTHING HERE CAN BE
// DISMISSED. An item goes away when the thing it is about is fixed, and
// not before. That is the right way round for an operations board — an
// alert you can wave away is one you will wave away at 5am — and it is
// also the only honest option, because a "seen" flag needs somewhere to
// live and there is nowhere. What such a table would cost is written
// down in the report this work came with; it is small, and it should be
// the owner's decision rather than an assumption.
//
// The grades are the three an operator can act on differently: now,
// today, and know about it. Each row says its own grade in a word — the
// accent rule beside it is a second signal and never the only one.
import { useMemo, useState } from "react";
import { useBoard } from "../BoardContext";
import { SEVERITY_LABEL, type Severity } from "../lib/attention";
import AttentionList from "../AttentionList";
import { Empty, Head, Section, Skeleton, Unreadable } from "../ui";

type Filter = Severity | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "now", label: SEVERITY_LABEL.now },
  { key: "soon", label: SEVERITY_LABEL.soon },
  { key: "watch", label: SEVERITY_LABEL.watch },
];

export default function Support() {
  const { attention, ridesError, loading, refresh } = useBoard();
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(
    () => FILTERS.reduce<Record<Filter, number>>((acc, f) => {
      acc[f.key] = f.key === "all" ? attention.length : attention.filter((a) => a.severity === f.key).length;
      return acc;
    }, { all: 0, now: 0, soon: 0, watch: 0 }),
    [attention],
  );

  const shown = filter === "all" ? attention : attention.filter((a) => a.severity === filter);
  const urgent = counts.now;

  return (
    <div className="adm-view">
      <div className="adm-pad">
        <Head
          kick="Support"
          title={<>What needs <em>you.</em></>}
          lead="Every line here is worked out from the board itself — a ride, a driver, a payment that is in a state somebody has to do something about. Nothing to tick off: an item goes when the thing it is about is fixed."
        />

        {ridesError ? (
          <Unreadable
            what="rides"
            detail={ridesError}
            reassure="Nothing is on fire that wasn't already — this list is worked out from the rides table, and the board can't read it. An empty list here would mean 'we couldn't look', not 'all clear'."
            onRetry={() => void refresh()}
          />
        ) : loading ? (
          <Skeleton rows={4} />
        ) : attention.length === 0 ? (
          // The best screen in the portal, and it should look like it —
          // not like a feature that failed to load.
          <Empty
            line="Nothing needs you."
            hint="Every ride on the board has a driver, nobody is late off the mark, no driver is double-booked, and no cancelled booking is holding money. This list fills itself back in the moment that stops being true."
          />
        ) : (
          <>
            <div className="adm-seg" role="group" aria-label="Filter by urgency">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? "on" : ""}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}<b>{counts[f.key]}</b>
                </button>
              ))}
            </div>

            <Section
              title={urgent > 0 ? `${urgent} happening now` : "Nothing urgent"}
              aside={<span>{attention.length} in total</span>}
            >
              {shown.length === 0 ? (
                <Empty
                  line={`Nothing under "${FILTERS.find((f) => f.key === filter)!.label}".`}
                  hint="Try another grade — the list itself isn't empty."
                />
              ) : (
                <AttentionList items={shown} />
              )}
            </Section>

            {/* Said once, at the bottom, so nobody goes looking for a
                close button that was never there. */}
            <p className="adm-fine">
              There is no inbox behind this and nothing to archive. Cabby's has no ticket table, so
              rather than a list somebody has to keep tidy, this is the board's own state read back
              as a list of jobs. If you want notes, assignment or a history of what was dealt with,
              that is a small table and a decision — not something this screen should invent.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
