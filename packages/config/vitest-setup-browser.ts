import { beforeEach } from "vitest";

declare global {
  interface Window {
    localStorage: Storage;
  }
}

function makeLocalStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    get length() {
      return store.size;
    },
  } satisfies Storage;
}

beforeEach(() => {
  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      writable: true,
      value: makeLocalStorage(),
    });
  }
});
