// ── A receipt, or a summary — whichever is true ──────────────────────────
//
// Called a RECEIPT only when the card payment was recorded by the Stripe
// webhook. With card payment switched off the fare is settled with the
// driver and nothing online records it, so the same document is a TRIP
// SUMMARY and says why. A "receipt" asserting a payment this system never
// saw would be a fabricated financial record, which is worse than no
// document at all.
//
// A native <dialog>, for the focus trap, Escape and the inert background
// it gives for free. Printed by hiding everything except this panel
// (see .tp-receipt in globals.css), so "Save as PDF" in the print dialog
// is the download — no library, and nothing on the page that is not
// already on the card.
import { useEffect, useRef } from "react";

export default function TripReceipt({
  onClose, isReceipt, bookingRef, when, from, to, vehicle, driver, payment, totalLabel, total, issued,
}: {
  onClose: () => void;
  isReceipt: boolean;
  bookingRef: string;
  when: string | null;
  from: string;
  to: string;
  vehicle: string | null;
  driver: string | null;
  payment: string;
  totalLabel: string;
  total: string | null;
  issued: string;
}) {
  const dlg = useRef<HTMLDialogElement>(null);
  // The latest onClose, read at close time. The parent passes a fresh
  // arrow every render; depending on it would re-run the opening effect,
  // and showModal() on a dialog that is already open throws.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    // jsdom and some older browsers have no showModal; open it plainly
    // rather than not at all.
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    const closed = () => closeRef.current();
    d.addEventListener("close", closed);
    return () => d.removeEventListener("close", closed);
  }, []);

  function close() {
    const d = dlg.current;
    // close() fires the "close" event, which calls onClose once. Only
    // where it does not exist is onClose called directly.
    if (d && typeof d.close === "function" && d.open) d.close();
    else closeRef.current();
  }

  function print() {
    const root = document.documentElement;
    root.classList.add("printing-receipt");
    const done = () => { root.classList.remove("printing-receipt"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  const title = isReceipt ? "Receipt" : "Trip summary";

  return (
    <dialog ref={dlg} className="tp-receipt" aria-labelledby="tp-receipt-h">
      <p className="tp-receipt-brand">Cabby<span className="ap">'</span>s</p>
      <h2 id="tp-receipt-h" className="tp-receipt-h">{title}</h2>
      {!isReceipt && (
        <p className="tp-receipt-note">
          Payment for this trip was not taken online, so this is a summary of the trip rather than a payment receipt.
        </p>
      )}
      <dl className="tp-facts">
        <div className="tp-fact"><dt>Booking reference</dt><dd>{bookingRef}</dd></div>
        <div className="tp-fact"><dt>Pickup</dt><dd>{when ? `${when} (Aruba time)` : "Time not recorded"}</dd></div>
        <div className="tp-fact"><dt>From</dt><dd>{from}</dd></div>
        <div className="tp-fact"><dt>To</dt><dd>{to}</dd></div>
        {vehicle && <div className="tp-fact"><dt>Vehicle</dt><dd>{vehicle}</dd></div>}
        {driver && <div className="tp-fact"><dt>Driver</dt><dd>{driver}</dd></div>}
        <div className="tp-fact"><dt>Payment</dt><dd>{payment}</dd></div>
        {total && <div className="tp-fact tp-total"><dt>{totalLabel}</dt><dd>{total}</dd></div>}
        <div className="tp-fact"><dt>Issued</dt><dd>{issued} (Aruba time)</dd></div>
      </dl>
      <div className="tp-panel-row tp-receipt-actions">
        <button type="button" className="btn-ghost tp-primary" onClick={print}>Print or save as PDF</button>
        <button type="button" className="btn-ghost" onClick={close}>Close</button>
      </div>
    </dialog>
  );
}
