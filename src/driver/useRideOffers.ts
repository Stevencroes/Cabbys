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

export interface OfferState {
  offer: OpenJob | null;
  busy: boolean;
  refused: string | null;
  accept: () => Promise<string | null>;
  dismiss: () => void;
}

export function useRideOffers(online: boolean): OfferState {
  const [offer, setOffer] = useState<OpenJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  /** every ride id already seen, offered, or passed on */
  const known = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!online) { setOffer(null); known.current = null; return; }

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

  const dismiss = useCallback(() => { setOffer(null); setRefused(null); }, []);

  /** Resolves to the claimed ride id, or null when it didn't go through. */
  const accept = useCallback(async (): Promise<string | null> => {
    if (!offer) return null;
    setBusy(true);
    setRefused(null);
    const res = await claimRide(offer.id);
    setBusy(false);

    if (res.ok) { setOffer(null); return res.rideId; }
    if (res.error === "already_taken") { setOffer(null); return null; }
    setRefused(
      res.error === "not_approved"
        ? "Your account isn't approved to take jobs yet."
        : res.detail ?? "The claim was refused.",
    );
    return null;
  }, [offer]);

  return { offer, busy, refused, accept, dismiss };
}
