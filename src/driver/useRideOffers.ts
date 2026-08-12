// Watches the pool for work worth interrupting a driver over.
//
// Only while online — an offline driver is not asked. Only rides seen
// arriving *after* the watch starts: the pool's existing backlog is
// browsing material, not an interruption, so opening the app never
// chimes at a queue of old jobs.
//
// Polls rather than subscribing to Realtime, because Realtime needs the
// rides table added to a publication and this must work on a database
// nobody has configured for it.
import { useCallback, useEffect, useRef, useState } from "react";
import { claimRide, loadOpen, type OpenJob } from "./lib/driver";

const POLL_MS = 12_000;
/**
 * After the 20-second offer lapses, the job stays reachable in a slim bar
 * for another minute and a half. Twenty seconds is the right length for a
 * modal that covers the screen, and the wrong length for a driver in
 * traffic — this is the grace period, not a second chance to be nagged.
 * The ride is still in the pool the whole time; the bar just saves the
 * trip to go find it.
 */
export const GRACE_MS = 90_000;

export interface OfferState {
  offer: OpenJob | null;
  /** the offer that just lapsed, still claimable from the grace bar */
  missed: OpenJob | null;
  busy: boolean;
  refused: string | null;
  /** resolves to the claimed job, or null when it didn't go through */
  accept: (job?: OpenJob) => Promise<OpenJob | null>;
  dismiss: () => void;
  clearMissed: () => void;
}

export function useRideOffers(online: boolean): OfferState {
  const [offer, setOffer] = useState<OpenJob | null>(null);
  const [missed, setMissed] = useState<OpenJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /** every ride id already seen, offered, or passed on */
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!online) { setOffer(null); setMissed(null); known.current = null; return; }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      const { jobs } = await loadOpen();
      if (stopped) return;

      if (known.current === null) {
        // first sweep: adopt the backlog silently, offer nothing
        known.current = new Set(jobs.map((j) => j.id));
      } else {
        const fresh = jobs.find((j) => !known.current!.has(j.id));
        for (const j of jobs) known.current.add(j.id);
        // one at a time — two offers on screen is two decisions at once
        if (fresh) setOffer((cur) => cur ?? fresh);
      }
      timer = setTimeout(() => void tick(), POLL_MS);
    }

    void tick();
    return () => { stopped = true; clearTimeout(timer); };
  }, [online]);

  // Dismissing hands the job to the grace bar rather than dropping it.
  const dismiss = useCallback(() => {
    setOffer((cur) => { if (cur) setMissed(cur); return null; });
    setRefused(null);
  }, []);

  const clearMissed = useCallback(() => setMissed(null), []);

  // the grace bar retires itself
  useEffect(() => {
    if (!missed) return;
    const t = setTimeout(() => setMissed(null), GRACE_MS);
    return () => clearTimeout(t);
  }, [missed]);

  /** Claim the live offer, or a specific job from the grace bar. */
  const accept = useCallback(async (job?: OpenJob): Promise<OpenJob | null> => {
    const target = job ?? offer;
    if (!target) return null;
    setBusy(true);
    setRefused(null);
    const res = await claimRide(target.id);
    setBusy(false);

    if (res.ok) { setOffer(null); setMissed(null); return target; }
    if (res.error === "already_taken") { setOffer(null); setMissed(null); return null; }
    setRefused(
      res.error === "not_approved"
        ? "Your account isn't approved to take jobs yet."
        : res.detail ?? "The claim was refused.",
    );
    return null;
  }, [offer]);

  return { offer, missed, busy, refused, accept, dismiss, clearMissed };
}
