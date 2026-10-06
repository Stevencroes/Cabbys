// A tap, told apart from the start of a scroll.
//
// The place picker committed on pointerdown: the instant a finger touched
// a row, that row was chosen. pointerdown was picked because it fires
// ahead of the blur a click causes, so the list was still there to choose
// from — but it also fires for every scroll that happens to START on a
// row. On a phone, flicking through the suggestions chose whichever one
// the thumb landed on, and a scroll beginning on the field itself opened
// the search and emptied it. "I can't even scroll without interacting
// with something."
//
// So a press now counts only when it ends where it began: the pointer
// comes up on the same element, without having travelled further than a
// finger wobbles, and without the browser cancelling it — which it does,
// with pointercancel, the moment it takes the gesture over as a scroll.
// pointerdown still calls preventDefault where it did before, so the
// input keeps focus and the list is still there when the finger lifts.
import { useCallback, useRef, type MouseEvent, type PointerEvent } from "react";

/** How far, in CSS px, a press may wander and still be a tap. Ten is the
    common touch slop (Android's is 8dp, iOS's about 10pt); below it a
    steady thumb fails, above it a slow scroll starts to count. */
export const TAP_SLOP = 10;

type Press = { id: number | undefined; x: number; y: number; el: EventTarget };

/** True when a press that started at `from` and ended at `to` is a tap. */
export function isTap(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) <= TAP_SLOP;
}

/** The point of a pointer event. A test DOM may dispatch one with no
    coordinates at all; that is a press that did not move, not NaN. */
const at = (e: { clientX?: number; clientY?: number }) => ({ x: e.clientX ?? 0, y: e.clientY ?? 0 });

/**
 * Returns a factory: `tap(fn)` gives the handlers that run `fn` on a real
 * tap or click, and on keyboard activation of a button. One press is
 * tracked per component, which is all a single pointer can make.
 *
 * `keepFocus` (default true) cancels pointerdown, which is what stops the
 * input losing focus — and the list closing under the finger — before the
 * tap lands. The input itself passes false: it WANTS the browser's focus
 * and caret.
 */
export function useTap() {
  const press = useRef<Press | null>(null);
  return useCallback((fn: () => void, { keepFocus = true }: { keepFocus?: boolean } = {}) => ({
    onPointerDown(e: PointerEvent) {
      if (e.button > 0) return; // a right or middle press is not a choice
      if (keepFocus) e.preventDefault();
      press.current = { id: e.pointerId, ...at(e), el: e.currentTarget };
    },
    onPointerMove(e: PointerEvent) {
      const p = press.current;
      if (p && p.id === e.pointerId && !isTap(p, at(e))) press.current = null;
    },
    onPointerCancel() { press.current = null; },
    onPointerUp(e: PointerEvent) {
      const p = press.current;
      press.current = null;
      if (p && p.id === e.pointerId && p.el === e.currentTarget && isTap(p, at(e))) fn();
    },
    // Enter or Space on a button raises a click with no pointer behind it
    // (detail 0). The pointer path above has already handled every real
    // click, so only the keyboard one runs here — without this, the
    // "Use this address" and "Back" buttons never answered a keyboard.
    onClick(e: MouseEvent) { if (e.detail === 0) fn(); },
  }), []);
}
