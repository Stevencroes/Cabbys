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
