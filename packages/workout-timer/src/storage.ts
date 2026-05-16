import { type } from "arktype";

import {
  CURRENT_SCHEMA_VERSION,
  emptyStore,
  storedV2Schema,
  type SavedSet,
  type SavedTimerV1,
  type StoredV2,
} from "./schemas";

export const STORAGE_KEY = "workout-timer:v1";

function migrateV1ToV2(data: unknown): unknown {
  if (!data || typeof data !== "object") return emptyStore();
  const v1 = data as { schemaVersion: unknown; timers?: unknown };
  const timers = Array.isArray(v1.timers) ? (v1.timers as SavedTimerV1[]) : [];
  const sets: SavedSet[] = timers.map((timer) => ({
    id: timer.id,
    name: timer.name,
    createdAt: timer.createdAt,
    updatedAt: timer.updatedAt,
    config: timer.sets[0]!,
  }));
  return { schemaVersion: 2, sets, workouts: [] };
}

export const migrations: Record<number, (data: unknown) => unknown> = {
  1: migrateV1ToV2,
};

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

export function loadAndMigrate(): StoredV2 {
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

  const validated = storedV2Schema(current);
  if (validated instanceof type.errors) {
    return emptyStore();
  }
  return validated;
}

export function saveAll(state: StoredV2): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    return;
  }
  notify();
}
