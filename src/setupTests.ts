import "@testing-library/jest-dom/vitest";

// jsdom has no IntersectionObserver; Framer Motion's whileInView/useInView need it.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.IntersectionObserver = IntersectionObserverStub as unknown as typeof IntersectionObserver;

// jsdom has no matchMedia; the motion system and the mobile picker sheet use it.
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
