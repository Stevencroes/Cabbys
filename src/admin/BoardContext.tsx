// The board's working set, read once.
//
// Eight screens ask the same two questions — what is booked, and who can
// drive — and before this they each asked them separately. That was two
// round trips per navigation, an operator watching four screens load the
// same rides four times, and, worse, four independent copies of "did that
// read fail": a write that landed on the Drivers screen left the Schedule
// showing yesterday's answer until somebody reloaded the page.
//
// So the working set is loaded here, held here, and refreshed here. A
// screen that changes something calls refresh() and every other screen is
// right, because there is only one copy.
//
// What this does NOT hold is history. loadRideHistory reaches back four
// months and is wanted by exactly two screens (Earnings, Customers);
// hanging it off every navigation would have put six hundred finished
// rides behind a dispatch board that only ever needed today's.
//
// The three errors are kept apart, and kept as errors. rides, drivers and
// documents are three reads that can fail independently — a project with
// admin-schema.sql run but not onboarding-schema.sql has two working
// tables and one that refuses — and every screen here is built on the
// house rule that an unreadable table is never reported as an empty one.
// `rides: []` with `ridesError: null` means a quiet day. `rides: []` with
// an error means bookings are arriving that this board cannot see.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from "react";
import {
  loadAllDrivers, loadAllDriverDocuments, loadUpcomingRides,
  needsDriver, type AdminRide,
} from "./lib/admin";
import { attentionItems, type AttentionItem } from "./lib/attention";
import { flightKeysFor, flightsByRide } from "./lib/flightWatch";
import { arrivalsFor, type FlightStatus } from "../lib/flightStatus";
import type { DriverProfile } from "../driver/lib/driver";
import type { DocumentRecord } from "../driver/lib/documents";

export interface Board {
  /** today and everything ahead, soonest first. Empty and error-free
      means a quiet day; empty with an error means we couldn't look. */
  rides: AdminRide[];
  ridesError: string | null;
  drivers: DriverProfile[];
  driversError: string | null;
  /** driver auth id → their paperwork, from one query rather than one
      per row */
  docs: Map<string, DocumentRecord[]>;
  docsError: string | null;
  /** false once the first read has come back, however it went */
  loading: boolean;
  /** everything wanting a person, worst first — derived, not stored */
  attention: AttentionItem[];
  /** rides with nobody driving them: the count the sidebar carries */
  unassigned: number;
  refresh: () => Promise<void>;
}

const BoardCtx = createContext<Board | null>(null);

export function useBoard(): Board {
  const ctx = useContext(BoardCtx);
  // A screen rendered outside the provider would get empty arrays and
  // silently show "nothing booked" — the failure this whole portal is
  // written against. Better to fall over in development.
  if (!ctx) throw new Error("useBoard() outside <BoardProvider>");
  return ctx;
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const [rides, setRides] = useState<AdminRide[]>([]);
  const [ridesError, setRidesError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<DriverProfile[]>([]);
  const [driversError, setDriversError] = useState<string | null>(null);
  const [docs, setDocs] = useState<Map<string, DocumentRecord[]>>(new Map());
  const [docsError, setDocsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // ride id → what the flight table says about its arrival. Empty is the
  // ordinary state and means silence, not failure — see attentionItems.
  const [flights, setFlights] = useState<Map<string, FlightStatus>>(new Map());

  const refresh = useCallback(async () => {
    // Together, not in sequence. Three reads at a desk should cost one
    // wait, and a screen that shows drivers half a second before rides
    // reflows under the operator's pointer.
    const [r, d, p] = await Promise.all([
      loadUpcomingRides(),
      loadAllDrivers(),
      loadAllDriverDocuments(),
    ]);
    setRidesError(r.error);
    setRides(r.rides);
    setDriversError(d.error);
    setDrivers(d.drivers);
    setDocsError(p.error);
    setDocs(p.byDriver);
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── the flights, in ONE read per board load ──────────────────────────
  //
  // Deliberately not inside refresh(): flight status is a different
  // table, filled by a different process, and a board that would not
  // render its rides until a flight read came back would be a board held
  // hostage by a feature that is switched off in most deployments. The
  // rides land first; the flight items appear a beat later, or never.
  //
  // Keyed on the rides array rather than on a derived signature, which
  // is the cheap-looking shortcut that would have cost more: rides only
  // changes when refresh() has produced a new list, and arrivalsFor()
  // answers a repeat inside its ten-minute TTL from cache without asking
  // anyone. So a refresh after a write costs nothing, and the one thing
  // this must never become — a query per ride per render — cannot happen
  // from here.
  useEffect(() => {
    const keys = flightKeysFor(rides);
    if (!keys.length) {
      setFlights((prev) => (prev.size ? new Map() : prev));
      return;
    }
    let live = true;
    void arrivalsFor(keys).then((known) => {
      if (live) setFlights(flightsByRide(rides, known));
    });
    return () => { live = false; };
  }, [rides]);

  const value = useMemo<Board>(() => ({
    rides, ridesError, drivers, driversError, docs, docsError, loading,
    // The drivers list is passed as null when it could not be read, so
    // the three driver-derived items are withheld rather than answered
    // "none" over a table nobody could see.
    attention: attentionItems(rides, driversError ? null : drivers, Date.now(), flights),
    unassigned: rides.filter(needsDriver).length,
    refresh,
  }), [rides, ridesError, drivers, driversError, docs, docsError, loading, flights, refresh]);

  return <BoardCtx.Provider value={value}>{children}</BoardCtx.Provider>;
}
