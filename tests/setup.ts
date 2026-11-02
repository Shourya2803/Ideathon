import "@testing-library/jest-dom/vitest";

// jsdom has no IntersectionObserver; motion's whileInView and React Bits' CountUp need one.
if (typeof window !== "undefined" && !("IntersectionObserver" in window)) {
  class IO {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.assign(window, { IntersectionObserver: IO });
  Object.assign(globalThis, { IntersectionObserver: IO });
}
