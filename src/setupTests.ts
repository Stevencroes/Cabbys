import "@testing-library/jest-dom/vitest";

// jsdom has no IntersectionObserver; the reveal system needs it — both the
// page sweep (useRevealObserver) and the footer's own (useRevealOnce). Note
// observe() never fires, so nothing gains `.in` under test: a test that
// cares about a revealed state has to add the class itself.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;

// jsdom has no ResizeObserver either. The booking card's tab underline is
// placed from the active tab's measured box and re-measures when the strip
// resizes — which is how it survives the web font landing after first paint.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no matchMedia; the motion system uses it. Note `matches` is
// always false — a test that needs a phone must say so itself.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false; },
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no scrollIntoView; the place picker and the time scroller call it
// to keep the active row in view under arrow-key travel.
if (typeof Element !== "undefined" && typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

// jsdom has no PointerEvent, so fireEvent.pointerDown dispatched a bare
// Event and dropped clientX/clientY. The place picker tells a tap from a
// scroll by how far the pointer travelled (src/lib/tap.ts), and a test of
// that needs the coordinates to arrive. A MouseEvent carries them; this
// adds the pointer fields on top.
if (typeof window !== "undefined" && typeof window.PointerEvent !== "function") {
  class PointerEventStub extends MouseEvent {
    pointerId: number;
    pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  }
  window.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}
