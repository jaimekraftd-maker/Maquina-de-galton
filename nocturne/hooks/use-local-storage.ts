"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Small per-viewer preference stored in localStorage (falls back to `initial` when unavailable). */
export function useLocalStorage<T extends string>(key: string, initial: T): [T, (value: T) => void] {
  const value = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      window.addEventListener("storage", cb);
      return () => {
        listeners.delete(cb);
        window.removeEventListener("storage", cb);
      };
    },
    () => (read(key) as T | null) ?? initial,
    () => initial,
  );
  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // storage unavailable (private mode); preference just won't persist
      }
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
