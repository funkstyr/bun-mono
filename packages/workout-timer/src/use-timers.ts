import { useSyncExternalStore } from "react";

import { defaultSetConfig, emptyStore, type SavedTimer, type SetConfig } from "./schemas";
import { loadAndMigrate, saveAll, STORAGE_KEY, subscribe } from "./storage";

const EMPTY_TIMERS: readonly SavedTimer[] = [];

let cachedRaw: string | null | undefined = undefined;
let cachedSnapshot: readonly SavedTimer[] = EMPTY_TIMERS;

function getSnapshot(): readonly SavedTimer[] {
  const raw = typeof window === "undefined" ? null : window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = loadAndMigrate().timers;
  return cachedSnapshot;
}

function getServerSnapshot(): readonly SavedTimer[] {
  return EMPTY_TIMERS;
}

function subscribeBoth(listener: () => void): () => void {
  const unsubLocal = subscribe(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    unsubLocal();
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useTimers(): readonly SavedTimer[] {
  return useSyncExternalStore(subscribeBoth, getSnapshot, getServerSnapshot);
}

function read(): { timers: SavedTimer[] } {
  const state = loadAndMigrate();
  return { timers: [...state.timers] };
}

function write(timers: SavedTimer[]): void {
  saveAll({ ...emptyStore(), timers });
}

function dedupeName(name: string, existing: readonly SavedTimer[]): string {
  const names = new Set(existing.map((t) => t.name));
  if (!names.has(name)) return name;
  let n = 2;
  while (names.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

export function createTimer(input?: { name?: string; set?: SetConfig }): SavedTimer {
  const { timers } = read();
  const now = Date.now();
  const timer: SavedTimer = {
    id: crypto.randomUUID(),
    name: dedupeName(input?.name ?? "New timer", timers),
    createdAt: now,
    updatedAt: now,
    sets: [input?.set ?? defaultSetConfig()],
  };
  timers.push(timer);
  write(timers);
  return timer;
}

export function updateTimer(
  id: string,
  patch: Partial<Pick<SavedTimer, "name">> & { set?: SetConfig },
): SavedTimer | null {
  const { timers } = read();
  const idx = timers.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const prev = timers[idx]!;
  const next: SavedTimer = {
    ...prev,
    name: patch.name ?? prev.name,
    sets: [patch.set ?? prev.sets[0]!],
    updatedAt: Date.now(),
  };
  timers[idx] = next;
  write(timers);
  return next;
}

function copySuffix(baseName: string, existing: readonly SavedTimer[]): string {
  const candidate = `${baseName} (copy)`;
  const names = new Set(existing.map((t) => t.name));
  if (!names.has(candidate)) return candidate;
  let n = 2;
  while (names.has(`${baseName} (copy ${n})`)) n++;
  return `${baseName} (copy ${n})`;
}

export function duplicateTimer(id: string): SavedTimer | null {
  const { timers } = read();
  const source = timers.find((t) => t.id === id);
  if (!source) return null;
  const now = Date.now();
  const copy: SavedTimer = {
    id: crypto.randomUUID(),
    name: copySuffix(source.name, timers),
    createdAt: now,
    updatedAt: now,
    sets: [{ ...source.sets[0]! }],
  };
  timers.push(copy);
  write(timers);
  return copy;
}

export function restoreTimer(snapshot: SavedTimer): SavedTimer {
  const { timers } = read();
  if (!timers.some((t) => t.id === snapshot.id)) {
    timers.push({ ...snapshot, sets: [{ ...snapshot.sets[0]! }] });
    write(timers);
  }
  return snapshot;
}

export function deleteTimer(id: string): SavedTimer | null {
  const { timers } = read();
  const idx = timers.findIndex((t) => t.id === id);
  if (idx === -1) return null;
  const [removed] = timers.splice(idx, 1);
  write(timers);
  return removed ?? null;
}
