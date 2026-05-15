import { type } from "arktype";

import { CURRENT_SCHEMA_VERSION, emptyStore, storedV1Schema, type StoredV1 } from "./schemas";

export const STORAGE_KEY = "workout-timer:v1";

export const migrations: Record<number, (data: unknown) => unknown> = {};

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function loadAndMigrate(): StoredV1 {
  const raw = readRaw();
  if (raw === null) return emptyStore();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyStore();
  }

  const versionGuess =
    parsed && typeof parsed === "object" && "schemaVersion" in parsed
      ? (parsed as { schemaVersion: unknown }).schemaVersion
      : undefined;

  if (typeof versionGuess !== "number" || versionGuess > CURRENT_SCHEMA_VERSION) {
    return emptyStore();
  }

  let current: unknown = parsed;
  for (let v = versionGuess; v < CURRENT_SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) return emptyStore();
    current = migrate(current);
  }

  const validated = storedV1Schema(current);
  if (validated instanceof type.errors) {
    return emptyStore();
  }
  return validated;
}

export function saveAll(state: StoredV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
  notify();
}
